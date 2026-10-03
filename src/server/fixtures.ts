import { randomUUID } from "node:crypto";
import type { Evidence, Lane, MissionInput, Option } from "../shared/contracts";

export function fixtureResearch(taskId: string, lane: Lane, input: MissionInput): { options: Option[]; evidence: Evidence[] } {
  const source = lane === "amazon" ? "https://www.amazon.com/" : lane === "fiverr" ? "https://www.fiverr.com/" : lane === "food" ? "https://www.doordash.com/" : input.requirements.event_tickets!.event_url;
  const templates: Record<Lane, Array<{ title: string; description: string; amount: number }>> = {
    amazon: [
      { title: "Complete booth supply kit", description: "Display stand, table cover, badge holders and print sleeves.", amount: 21800 },
      { title: "Essential booth supplies", description: "Table cover, badge holders and print sleeves. Reuse an existing display stand.", amount: 9800 },
    ],
    fiverr: [
      { title: "Flyer design + two revisions", description: "Print-ready A5 flyer, editable source and two revision rounds.", amount: 18000 },
      { title: "Flyer essentials", description: "One print-ready flyer and one revision, using an existing brand kit.", amount: 10000 },
    ],
    event_tickets: [
      { title: `${input.headcount} general admission passes`, description: "Keep the whole team together. Fixed event and ticket type.", amount: input.headcount * 6500 },
    ],
    food: [
      { title: "A quick team lunch", description: "Illustrative pickup meal; menu availability, tax and final fees have not been checked.", amount: 1200 * (input.requirements.food?.quantity ?? 1) },
      { title: "A simple snack break", description: "Illustrative lower-cost pickup option; no cart or food order exists.", amount: 900 * (input.requirements.food?.quantity ?? 1) },
    ],
  };
  const evidence: Evidence[] = [{ id: randomUUID(), task_id: taskId, source_url: source, observed_at: new Date().toISOString(), title: "Illustrative scenario data", detail: "Fixture only. Prices, availability and checkout totals have not been observed at a merchant.", mode: "fixture" }];
  const options = templates[lane].map((item, index): Option => ({ id: `${taskId}:fixture:${index}`, title: item.title, description: item.description, source_url: source, merchant: lane === "amazon" ? "Amazon" : lane === "fiverr" ? "Fiverr" : lane === "food" ? "DoorDash" : "Event organizer", amount_minor: item.amount, currency: "USD", quantity: lane === "event_tickets" ? input.headcount : lane === "food" ? input.requirements.food?.quantity ?? 1 : 1, delivery_date: input.deadline, recommended: index === 0, reason: index === 0 ? "Illustrative full-scope option." : "Illustrative lower-cost option for the revised budget.", evidence_ids: evidence.map(x => x.id) }));
  return { options, evidence };
}
