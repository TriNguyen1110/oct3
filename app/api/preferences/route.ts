import { requireAuth } from "@/src/server/auth";
import { handle } from "@/src/server/errors";
import { getPreferences, savePreferences } from "@/src/server/preferences";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handle(async () => Response.json(await getPreferences(requireAuth(request)), {
    headers: { "cache-control": "no-store" },
  }));
}

export async function PUT(request: Request) {
  return handle(async () => {
    const principal = requireAuth(request, "manager");
    return Response.json(await savePreferences(principal, await request.json()), {
      headers: { "cache-control": "no-store" },
    });
  });
}
