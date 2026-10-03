import { requireAuth } from "@/src/server/auth";
import { handle } from "@/src/server/errors";
import { freeRegistrationReview } from "@/src/server/free-registration";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const principal = requireAuth(request, "manager");
    const review = await freeRegistrationReview((await context.params).id, principal);
    return Response.json(review, { headers: { "cache-control": "no-store" } });
  });
}
