import type { Evidence, Lane, MissionView, TaskLinks } from "../shared/contracts";

const hosts: Record<Lane, string[]> = {
  amazon: ["amazon.com", "www.amazon.com"],
  fiverr: ["fiverr.com", "www.fiverr.com"],
  food: ["doordash.com", "www.doordash.com", "boba-guys.square.site"],
  event_tickets: ["eventbrite.com", "www.eventbrite.com", "luma.com", "www.luma.com", "lu.ma", "www.lu.ma"],
};

/** Return an observed, navigable provider URL. Never expose browser-session links. */
function providerLink(value: string | undefined, lane: Lane): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !hosts[lane].includes(url.hostname)) return null;
    // Unknown query parameters may carry private login/session credentials. Do
    // not strip them and invent a different, potentially unusable receipt URL.
    const keys = new Set(["k", "query", "orderID", "order_id", "id", "invoice_id", "ticket_id"]);
    if (lane === "food" && ["true", "false"].includes(url.searchParams.get("pickup") || "")) keys.add("pickup");
    if ([...url.searchParams.keys()].some(key => !keys.has(key)) || url.hash) return null;
    return url.href;
  } catch { return null; }
}

function appOrigin(requestOrigin?: string): string {
  const deployment = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const value = process.env.OCT3_APP_URL || requestOrigin || (deployment ? `https://${deployment}` : "http://127.0.0.1:3003");
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new Error("OCT3_APP_URL must be an HTTPS origin, or localhost for development.");
  }
  return url.origin;
}

/** Read-time links stay current after deployment and never change stored state. */
export function presentMission(view: MissionView, requestOrigin?: string): MissionView {
  const origin = appOrigin(requestOrigin);
  const dashboard = new URL("/", origin);
  dashboard.searchParams.set("mission", view.mission_id);
  return {
    ...view,
    dashboard_url: dashboard.href,
    result_url: new URL(`/api/missions/${encodeURIComponent(view.mission_id)}`, origin).href,
    tasks: view.tasks.map(task => {
      const review = new URL(dashboard);
      review.searchParams.set("task", task.id);
      review.searchParams.set("revision", String(view.revision));
      const bound = (evidence: Evidence) => evidence.task_id === task.id &&
        evidence.mode === "live" && view.mode === "live" && !!task.proposal &&
        evidence.proposal_id === task.proposal.id && evidence.revision === task.proposal.revision;
      const observed = (kind: Evidence["kind"], confirmed = false) => [...task.evidence].reverse().find(evidence =>
        evidence.kind === kind && bound(evidence) && providerLink(evidence.source_url, task.lane) &&
        (!confirmed || (task.status === "confirmed" && !!task.confirmation_ref && evidence.confirmation_ref === task.confirmation_ref)));
      const checkout = observed("checkout_preview");
      const confirmation = observed("merchant_confirmation", true);
      const receipt = observed("merchant_receipt", true);
      const selected = task.options.find(option => option.id === task.proposal?.option_id) ?? task.options.find(option => option.recommended) ?? task.options[0];
      const previewUrl = providerLink(checkout?.source_url ?? task.proposal?.source_url ?? selected?.source_url, task.lane);
      const links: TaskLinks = {
        review_url: review.href,
        preview_url: previewUrl,
        preview_kind: previewUrl ? checkout ? "checkout_preview" : "provider_page" : "unavailable",
        confirmation_url: providerLink(confirmation?.source_url, task.lane),
        receipt_url: providerLink(receipt?.source_url, task.lane),
        receipt_state: view.mode !== "live" ? "example" : task.status !== "confirmed" ? "not_ready" : receipt ? "available" : "not_captured",
      };
      return { ...task, links };
    }),
  };
}
