import { z } from "zod";

export const voiceDraftSchema = z.object({
  transcript: z.string().trim().min(1).max(3000),
  objective: z.string().trim().min(8).max(2000),
  purchase_budget_minor: z.number().int().min(1).max(10000000).nullable(),
  food: z.object({
    query: z.string().trim().min(1).max(200),
    fulfillment: z.enum(["pickup", "delivery"]),
    location: z.string().trim().min(1).max(300),
    quantity: z.number().int().min(1).max(25),
  }).strict().nullable(),
  notes: z.array(z.string().trim().min(1).max(300)).max(5),
}).strict();

export type VoiceDraft = z.infer<typeof voiceDraftSchema> & {
  model: "gemini-3.8-flash";
  draft_only: true;
};
