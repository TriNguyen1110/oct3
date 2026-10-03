import Link, { getDuplicateSpendRequest, type CreateSpendRequestParams, type SpendRequest, type PaymentMethod } from "@stripe/link-sdk";
import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import type { Principal } from "./auth";
import type { MissionRecord } from "./model";
import { AppError } from "./errors";
import { activity, refresh, walletAction } from "./missions";
import { findTask, mutateRecord } from "./store";

export const linkConfigured = () => Boolean(process.env.LINK_ACCESS_TOKEN || (!process.env.VERCEL && process.env.LINK_AUTH_FILE));
export const linkTestMode = () => process.env.OCT3_LINK_MODE !== "live";

async function accessToken() {
  if (process.env.LINK_ACCESS_TOKEN) return process.env.LINK_ACCESS_TOKEN;
  const path = !process.env.VERCEL && process.env.LINK_AUTH_FILE;
  if (!path) throw new AppError(503, "link_not_connected", "Connect Cue to Link before requesting merchant payment.");
  try {
    const file = await lstat(path);
    if (!file.isFile() || file.isSymbolicLink() || (file.mode & 0o077) || file.size > 65536 || (process.getuid && file.uid !== process.getuid())) throw new Error();
    const { auth } = JSON.parse(await readFile(path, "utf8"));
    if (typeof auth?.access_token !== "string" || !auth.access_token || !Number.isFinite(auth.expires_at) || auth.expires_at <= Date.now() + 30000 || !String(auth.scope || "").split(" ").includes("payment_methods.agentic")) throw new Error();
    return auth.access_token as string;
  } catch { throw new AppError(503, "link_not_connected", "Finish Link sign-in or refresh the expired connection locally."); }
}

async function client() {
  const token = await accessToken();
  return new Link({ accessToken: token, fetch: (url: Parameters<typeof fetch>[0], init?: RequestInit) => fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(15000) }) });
}

export function safeLinkUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try { const url = new URL(value); if (url.protocol === "https:" && !url.username && !url.password && ["app.link.com", "link.com"].includes(url.hostname)) return url.href; } catch { /* Fail closed. */ }
}

export function buildLinkRequest(record: MissionRecord, taskId: string, exact: { proposal_id: string; revision: number }, test: boolean, reconcileExisting = false): CreateSpendRequestParams {
  const { task, proposal: p, action_hash } = walletAction(record, taskId, exact, reconcileExisting);
  const url = new URL(p.source_url);
  const allowed: Record<string, string[]> = { amazon: ["www.amazon.com", "amazon.com"], fiverr: ["www.fiverr.com", "fiverr.com"], food: ["order.bobaguys.com", "www.bobaguys.com", "bobaguys.square.site"], event_tickets: ["luma.com", "www.eventbrite.com"] };
  if (url.protocol !== "https:" || url.username || url.password || !allowed[task.lane]?.includes(url.hostname) || url.search || url.hash || !Number.isSafeInteger(p.total_minor) || p.total_minor < 1 || p.total_minor > 50000) throw new AppError(409, "wallet_action_invalid", "Use a supported public merchant URL and a verified total between $0.01 and $500.");
  const binding = createHash("sha256").update(`${record.workspace_id}:${taskId}:${action_hash}:${test}`).digest("hex");
  return {
    idempotency_key: `cue-wallet-${binding}`, credential_type: "card", test, request_approval: false,
    merchant_name: p.merchant, merchant_url: p.source_url, amount: p.total_minor, currency: "usd",
    context: `Cue is preparing the exact ${test ? "TEST payment" : "purchase"} reviewed by its manager: ${p.quantity} × ${p.title} from ${p.merchant}. The approved total is USD ${(p.total_minor / 100).toFixed(2)}, including the reviewed tax, shipping and fees. This wallet request is not evidence that an order was placed.`,
    line_items: [{ name: p.title, quantity: p.quantity, product_url: p.source_url }],
    totals: [{ type: "subtotal", display_text: "Subtotal", amount: p.subtotal_minor }, { type: "tax", display_text: "Tax", amount: p.tax_minor }, { type: "shipping", display_text: "Shipping", amount: p.shipping_minor }, { type: "fee", display_text: "Fees", amount: p.fees_minor }, { type: "total", display_text: "Total", amount: p.total_minor }],
    metadata: { cue_task: taskId, cue_proposal: p.id, cue_revision: String(p.revision), cue_action_hash: action_hash, cue_test: String(test) },
  };
}

export function verifyLinkRequest(remote: SpendRequest | null, expected: CreateSpendRequestParams, requestId?: string): asserts remote is SpendRequest {
  const items = remote?.line_items;
  const expectedItem = expected.line_items![0];
  const sameItems = items?.length === 1 && items[0].name === expectedItem.name && items[0].quantity === expectedItem.quantity && items[0].product_url === expectedItem.product_url;
  const sameTotals = remote?.totals?.length === expected.totals!.length && expected.totals!.every(total => remote!.totals!.filter(found => found.type === total.type && found.amount === total.amount).length === 1);
  if (!remote || !/^[A-Za-z0-9_-]{5,160}$/.test(remote.id) || (requestId && remote.id !== requestId) || remote.amount !== expected.amount || remote.currency?.toLowerCase() !== expected.currency || remote.merchant_name !== expected.merchant_name || remote.merchant_url !== expected.merchant_url || remote.credential_type !== "card" || remote.recurring || !Object.entries(expected.metadata!).every(([k, v]) => remote.metadata?.[k] === v) || !sameItems || !sameTotals) throw new AppError(409, "link_binding_mismatch", "Link did not verify the exact approved merchant, items and total. Reconcile before continuing.");
}

export async function walletStatus() {
  if (!linkConfigured()) return { connected: false, test_mode: linkTestMode(), payment_methods: [] };
  try {
    const methods = await (await client()).paymentMethods.list();
    return { connected: true, test_mode: linkTestMode(), payment_method_count: methods.length, payment_methods: methods.map((method: PaymentMethod) => ({ id: method.id, type: method.type })) };
  } catch { return { connected: false, test_mode: linkTestMode(), payment_methods: [], detail: "Link connection needs sign-in or renewal." }; }
}

export async function cancelLinkWallet(taskId: string, principal: Principal, exact: { proposal_id: string; revision: number }) {
  if (principal.role !== "manager") throw new AppError(403, "manager_required", "A manager must cancel the wallet request.");
  const initial = await findTask(taskId, principal.workspace_id);
  const saved = initial.wallet_spends?.[taskId];
  if (!saved?.request_id || saved.proposal_id !== exact.proposal_id || saved.revision !== exact.revision) throw new AppError(409, "wallet_request_missing", "No matching Link request can be canceled. Reconcile any uncertain creation first.");
  if (saved.state === "creating") throw new AppError(409, "wallet_busy", "Wait for the active wallet check before canceling.");
  let remote: SpendRequest;
  try { remote = await (await client()).spendRequests.cancel(saved.request_id); }
  catch { throw new AppError(503, "link_reconciliation_required", "Link cancellation could not be verified. Keep the budget reserved and check again."); }
  if (remote.id !== saved.request_id || remote.status !== "canceled") throw new AppError(409, "link_reconciliation_required", "Link did not confirm cancellation. Keep the budget reserved.");
  return mutateRecord(initial.id, principal.workspace_id, current => {
    const active = current.wallet_spends?.[taskId];
    if (!active || active.request_id !== saved.request_id || active.claim_id !== saved.claim_id || active.state === "creating") throw new AppError(409, "wallet_busy", "The wallet request changed; check its status again.");
    active.state = "canceled"; active.checked_at = new Date().toISOString();
    const task = current.view.tasks.find(t => t.id === taskId)!;
    if (task.approval) { task.approval.link_state = "canceled"; delete task.approval.link_approval_url; }
    task.blocker = "Link payment request canceled. No merchant order was placed; you can decline or revise the plan.";
    activity(current, `${task.lane}: Link confirmed cancellation.`, "info", task.lane); refresh(current);
  });
}

/** Creates/reconciles an exact spend request. Deliberately never retrieves a card or executes checkout. */
export async function resumeLinkWallet(taskId: string, principal: Principal, exact: { proposal_id: string; revision: number }) {
  const initial = await findTask(taskId, principal.workspace_id);
  const existing = initial.wallet_spends?.[taskId];
  const test = existing?.test_mode ?? linkTestMode();
  const expected = buildLinkRequest(initial, taskId, exact, test, Boolean(existing?.request_id));
  const provider = await client();
  const claim = randomUUID();
  let record = await mutateRecord(initial.id, principal.workspace_id, current => {
    const checked = buildLinkRequest(current, taskId, exact, test, Boolean(existing?.request_id));
    if (checked.idempotency_key !== expected.idempotency_key) throw new AppError(409, "approved_action_changed", "The approved action changed.");
    current.wallet_spends ||= {};
    const saved = current.wallet_spends[taskId];
    if (saved && (saved.action_hash !== expected.metadata!.cue_action_hash || saved.idempotency_key !== expected.idempotency_key)) throw new AppError(409, "wallet_reconciliation_required", "Reconcile the previous wallet request first.");
    if (saved?.state === "creating" && !Number.isFinite(Date.parse(saved.checked_at))) throw new AppError(409, "wallet_reconciliation_required", "The wallet claim timestamp is invalid; reconcile the saved request.");
    if (saved?.state === "creating" && Date.parse(saved.checked_at) > Date.now() - 90000) throw new AppError(409, "wallet_busy", "The wallet request is in progress; check again shortly.");
    current.wallet_spends[taskId] = { ...saved, proposal_id: exact.proposal_id, revision: exact.revision, action_hash: expected.metadata!.cue_action_hash, idempotency_key: expected.idempotency_key!, test_mode: test, state: "creating", claim_id: claim, checked_at: new Date().toISOString() };
  });
  const previousId = record.wallet_spends![taskId].request_id;
  try {
    let remote: SpendRequest | null;
    if (previousId) remote = await provider.spendRequests.retrieve(previousId);
    else {
      try { remote = await provider.spendRequests.create(expected); }
      catch (error) { remote = getDuplicateSpendRequest(error); if (!remote) throw error; }
    }
    verifyLinkRequest(remote, expected, previousId);
    const id = remote.id;
    record = await mutateRecord(initial.id, principal.workspace_id, current => {
      buildLinkRequest(current, taskId, exact, test, Boolean(previousId));
      const saved = current.wallet_spends![taskId];
      if (saved.claim_id !== claim) throw new AppError(409, "wallet_busy", "Another wallet check is active.");
      saved.request_id = id;
    });
    let approvalUrl = safeLinkUrl(remote.approval_url);
    if (remote.status === "created" && Date.parse(initial.view.tasks.find(t => t.id === taskId)!.proposal!.expires_at) > Date.now()) {
      const approval = await provider.spendRequests.requestApproval(id);
      if (approval.id !== id || !safeLinkUrl(approval.approval_url)) throw new AppError(409, "link_binding_mismatch", "Link returned an invalid approval reference.");
      approvalUrl = safeLinkUrl(approval.approval_url);
      remote = await provider.spendRequests.retrieve(id);
      verifyLinkRequest(remote, expected, id);
    }
    const state = ["created", "pending_approval", "approved", "denied", "expired", "canceled", "requires_action", "submitted", "succeeded", "failed"].includes(remote.status) ? remote.status : "unknown";
    return await mutateRecord(initial.id, principal.workspace_id, current => {
      const { task } = walletAction(current, taskId, exact, true);
      const saved = current.wallet_spends![taskId];
      if (saved.claim_id !== claim || saved.request_id !== id) throw new AppError(409, "wallet_busy", "The wallet check changed.");
      saved.state = state; saved.checked_at = new Date().toISOString();
      task.approval!.link_state = `${test ? "test_" : ""}${state}`;
      task.approval!.link_approval_url = ["created", "pending_approval"].includes(state) ? approvalUrl : undefined;
      task.status = "needs_human";
      task.progress = state === "approved" ? "Link authorization verified; no merchant order placed" : "Link wallet request checked";
      task.blocker = state === "approved" ? `${test ? "Test wallet" : "Wallet"} approval is verified. Merchant checkout execution is not connected; no order was placed.` : `Link ${test ? "test " : ""}payment state: ${state}. No merchant order has been placed.`;
      activity(current, `${task.lane}: Link ${test ? "test " : ""}request ${state}; merchant fulfillment remains unconfirmed.`, "info", task.lane); refresh(current);
    });
  } catch {
    await mutateRecord(initial.id, principal.workspace_id, current => {
      const saved = current.wallet_spends?.[taskId];
      if (saved?.claim_id === claim) { saved.state = "uncertain"; saved.checked_at = new Date().toISOString(); }
    });
    throw new AppError(503, "link_reconciliation_required", "Link could not verify this request. Its budget remains held; retry checks the same request without exposing payment credentials.");
  }
}
