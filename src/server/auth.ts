import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "./errors";

export interface Principal { id: string; workspace_id: string; role: "manager" | "agent" }
const workspace = "oct3-demo";
const cookieName = "oct3_session";
const equal = (a: string, b: string) => a.length > 0 && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function cookiePrincipal(request: Request): Principal | null {
  const token = request.headers.get("cookie")?.split(";").map(x => x.trim()).find(x => x.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  const key = process.env.OCT3_MANAGER_TOKEN;
  if (!token || !key) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !equal(signature, createHmac("sha256", key).update(payload).digest("base64url"))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.expires < Date.now() || data.role !== "manager") return null;
    return { id: "demo-manager", workspace_id: workspace, role: "manager" };
  } catch { return null; }
}

export function authenticate(request: Request): Principal | null {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (token && process.env.OCT3_MANAGER_TOKEN && equal(token, process.env.OCT3_MANAGER_TOKEN)) return { id: "demo-manager", workspace_id: workspace, role: "manager" };
  if (token && process.env.OCT3_AGENT_TOKEN && equal(token, process.env.OCT3_AGENT_TOKEN)) return { id: "demo-agent", workspace_id: workspace, role: "agent" };
  return cookiePrincipal(request);
}

export function requireAuth(request: Request, role?: "manager"): Principal {
  const principal = authenticate(request);
  if (!principal) throw new AppError(401, "unauthorized", "Sign in with your manager access token or send an agent bearer credential.");
  if (role && principal.role !== role) throw new AppError(403, "manager_required", "A manager must approve this action.");
  if (!["GET", "HEAD"].includes(request.method) && !request.headers.has("authorization")) {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new AppError(403, "invalid_origin", "This action must come from the mission board.");
  }
  return principal;
}

export function login(request: Request, token: string): string {
  if (!process.env.OCT3_MANAGER_TOKEN) throw new AppError(503, "auth_not_configured", "Set OCT3_MANAGER_TOKEN before signing in.");
  if (!equal(token, process.env.OCT3_MANAGER_TOKEN)) throw new AppError(401, "unauthorized", "The access token is not valid.");
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new AppError(403, "invalid_origin", "Sign in from the mission board.");
  const payload = Buffer.from(JSON.stringify({ role: "manager", expires: Date.now() + 12 * 60 * 60 * 1000 })).toString("base64url");
  const signature = createHmac("sha256", process.env.OCT3_MANAGER_TOKEN).update(payload).digest("base64url");
  return `${cookieName}=${payload}.${signature}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}

export const logoutCookie = `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
