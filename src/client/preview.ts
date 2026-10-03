import type { MissionInput, MissionView, Task } from "@/src/shared/contracts";

export const defaultInput: MissionInput & { requirements: Required<MissionInput["requirements"]> } = {
  objective: "Get our six-person team ready for the expo. Find booth supplies, a flyer designer, six event passes, and an inexpensive food pickup.",
  currency: "USD",
  purchase_budget_minor: 90000,
  deadline: "2026-10-10T09:00:00-07:00",
  headcount: 6,
  requirements: {
    amazon: { category: "Portable expo booth supplies", delivery_ref: "demo-office" },
    fiverr: { category: "Event flyer design", brief: "Design one print-ready A5 flyer for our six-person team at a startup expo. Supply editable source and print-ready PDF. One revision.", due_date: "2026-10-09T17:00:00-07:00" },
    event_tickets: { event_url: "", date: "2026-10-10T09:00:00-07:00", quantity: 6, attendee_ref: "demo-team" },
    food: { query: "boba milk tea", fulfillment: "pickup", location: "580 20th Street, San Francisco", quantity: 1 },
  },
};

const observed = "2026-10-03T11:02:00-07:00";
const taskSeed = [
  { lane: "amazon" as const, title: "Equip the booth", product: "The booth essentials", description: "Table cover, display stands & badge holders", merchant: "Amazon", amount: 18600, quantity: 1, url: "https://www.amazon.com/", reason: "A compact setup that covers the basics.", detail: "Illustrative supplies bundle. Price, stock, and delivery have not been checked." },
  { lane: "fiverr" as const, title: "Find the right designer", product: "A flyer with a point of view", description: "Print-ready A5 · source files · one revision", merchant: "Fiverr", amount: 14500, quantity: 1, url: "https://www.fiverr.com/", reason: "A focused deliverable with room for a revision.", detail: "Illustrative designer package. No seller has been contacted or hired." },
  { lane: "event_tickets" as const, title: "Get everyone through the door", product: "Six seats at the expo", description: "General admission · one pass per teammate", merchant: "Event provider", amount: 36000, quantity: 6, url: "https://www.eventbrite.com/", reason: "All six passes stay together in the plan.", detail: "Illustrative event passes. Select the actual event before starting a live mission." },
  { lane: "food" as const, title: "Take care of the food", product: "A little boba break", description: "One milk tea · pickup near the venue", merchant: "DoorDash", amount: 900, quantity: 1, url: "https://www.doordash.com/", reason: "A small pickup order keeps the plan practical.", detail: "Illustrative boba pickup. Menu, fees, availability and checkout have not been verified. No order has been placed." },
];

export function createPreview(budget = 90000, revision = 1): MissionView {
  const lean = budget < 70000;
  const tasks: Task[] = taskSeed.map((seed, index) => {
    const amount = lean ? [14300, 12500, 36000, 700][index] : seed.amount;
    const optionId = `preview-option-${seed.lane}-${revision}`;
    const evidenceId = `preview-evidence-${seed.lane}`;
    return {
      id: `preview-${seed.lane}`, lane: seed.lane, title: seed.title,
      status: "awaiting_approval", progress: "Example plan ready for review",
      options: [{ id: optionId, title: lean && index === 0 ? "A leaner booth setup" : seed.product, description: seed.description, source_url: seed.url, merchant: seed.merchant, amount_minor: amount, currency: "USD", quantity: seed.quantity, recommended: true, reason: seed.reason, evidence_ids: [evidenceId] }],
      proposal: { id: `preview-proposal-${seed.lane}-${revision}`, revision, task_id: `preview-${seed.lane}`, option_id: optionId, merchant: seed.merchant, title: lean && index === 0 ? "A leaner booth setup" : seed.product, source_url: seed.url, quantity: seed.quantity, recipient_ref: index === 2 ? "demo-team" : "demo-office", deadline: defaultInput.deadline, subtotal_minor: amount, tax_minor: 0, shipping_minor: 0, fees_minor: 0, total_minor: amount, currency: "USD", expires_at: "2026-10-03T17:00:00-07:00" },
      evidence: [{ id: evidenceId, task_id: `preview-${seed.lane}`, source_url: seed.url, observed_at: observed, title: "Preview example", detail: seed.detail, mode: "fixture" }],
    };
  });
  const total = tasks.reduce((sum, task) => sum + (task.proposal?.total_minor ?? 0), 0);
  return {
    mission_id: "preview-expo", revision, status: "awaiting_approval", objective: defaultInput.objective,
    deadline: defaultInput.deadline, headcount: 6, created_at: observed, updated_at: observed, mode: "fixture",
    budget: { limit_minor: budget, proposed_minor: total, reserved_minor: 0, committed_minor: 0, uncertain_minor: 0, available_minor: budget },
    service_payment: { status: "not_configured", amount_minor: 50, currency: "USD", mode: "test" },
    tasks, evidence: tasks.flatMap(task => task.evidence), blockers: [], next_actions: ["Connect manager access and choose an event to start a mission."],
    activity: [
      { id: "preview-1", at: observed, kind: "info", text: "Your agent brings the brief. Four workers take it from here." },
      { id: "preview-2", at: observed, kind: "decision", text: "One budget is shared across supplies, design, tickets, and food." },
      { id: "preview-3", at: observed, kind: "approval", text: "You review the exact cost before any commitment." },
    ],
  };
}
