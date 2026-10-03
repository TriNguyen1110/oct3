import { authenticate, login, logoutCookie } from "@/src/server/auth";
import { handle } from "@/src/server/errors";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const principal = authenticate(request);
  return Response.json({ authenticated: !!principal, role: principal?.role || null });
}
export async function POST(request: Request) {
  return handle(async () => {
    const body = await request.json();
    const cookie = login(request, typeof body.token === "string" ? body.token : "");
    return Response.json({ authenticated: true, role: "manager" }, { headers: { "set-cookie": cookie } });
  });
}
export async function DELETE() { return Response.json({ authenticated: false }, { headers: { "set-cookie": logoutCookie } }); }
