import { z } from "zod";

const moment = z.string().datetime({ offset: true });
const reference = z.string().min(1).max(120);
export const missionSchema = z.object({
  objective: z.string().min(8).max(2000), currency: z.literal("USD"),
  purchase_budget_minor: z.number().int().min(1).max(10000000), deadline: moment,
  headcount: z.number().int().min(1).max(100),
  requirements: z.object({
    amazon: z.object({ category: z.string().min(1).max(200), delivery_ref: reference }).optional(),
    fiverr: z.object({ category: z.string().min(1).max(200), brief: z.string().min(1).max(4000), due_date: moment }).optional(),
    event_tickets: z.object({ event_url: z.string().url().max(1000), date: moment, quantity: z.number().int().min(1).max(100), attendee_ref: reference }).optional(),
    food: z.object({ query: z.string().trim().min(1).max(200), fulfillment: z.enum(["pickup", "delivery"]), location: z.string().trim().min(1).max(300), quantity: z.number().int().min(1).max(25) }).strict().optional(),
  }).refine(x => Object.values(x).some(Boolean), { message: "Choose at least one work lane" }),
  mode: z.enum(["fixture", "live"]).optional(),
}).refine(x => !x.requirements.event_tickets || x.requirements.event_tickets.quantity === x.headcount, { message: "Ticket quantity must match headcount" });

export const constraintsSchema = z.object({
  expected_revision: z.number().int().min(1),
  purchase_budget_minor: z.number().int().min(1).max(10000000),
  headcount: z.number().int().min(1).max(100).optional(),
  deadline: moment.optional(),
});
export const approvalSchema = z.object({ proposal_id: z.string().min(1), revision: z.number().int().min(1) });
