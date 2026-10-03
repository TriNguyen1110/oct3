export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  if (error && typeof error === "object" && "issues" in error) {
    return Response.json({ error: { code: "invalid_input", message: "Check the mission fields and try again." } }, { status: 400 });
  }
  console.error("oct3 request failed", error instanceof Error ? error.message : "unknown error");
  return Response.json({ error: { code: "internal_error", message: "The operation could not complete. Retry using the same idempotency key." } }, { status: 500 });
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try { return await fn(); } catch (error) { return errorResponse(error); }
}
