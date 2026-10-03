export interface ApiResponseMetadata {
  missionId?: string;
  dashboardUrl?: string;
  resultUrl?: string;
}

// Only keep known application links. Never retain payment challenge headers.
function metadata(response: Response, payload: unknown): ApiResponseMetadata {
  const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const mission = body.mission && typeof body.mission === "object" ? body.mission as Record<string, unknown> : {};
  const id = response.headers.get("x-cue-mission-id") ?? mission.mission_id;
  const localLink = (value: unknown) => {
    if (typeof value !== "string") return undefined;
    try {
      const origin = new URL(response.url || window.location.href).origin;
      const url = new URL(value, origin);
      return url.origin === origin && !url.username && !url.password ? url.href : undefined;
    } catch { return undefined; }
  };
  return {
    missionId: typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id) ? id : undefined,
    dashboardUrl: localLink(response.headers.get("x-cue-dashboard-url") ?? mission.dashboard_url),
    resultUrl: localLink(response.headers.get("x-cue-result-url") ?? mission.result_url),
  };
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public payload: unknown = null, public metadata: ApiResponseMetadata = {}) { super(message); }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, typeof payload?.error?.code === "string" ? payload.error.code : "request_failed", typeof payload?.error?.message === "string" ? payload.error.message : `Request could not complete (${response.status}).`, payload, metadata(response, payload));
  }
  return payload as T;
}
