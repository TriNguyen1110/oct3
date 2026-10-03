import { randomUUID } from "node:crypto";
import { requireAuth } from "@/src/server/auth";
import { AppError, handle } from "@/src/server/errors";
import { acquireLane, releaseLane } from "@/src/server/store";
import { draftVoice, MAX_AUDIO_BYTES } from "@/src/server/voice";

export const runtime = "nodejs";
export const maxDuration = 45;

async function boundedForm(request: Request): Promise<FormData> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data;")) throw new AppError(415, "audio_required", "Send a microphone recording to draft a brief.");
  const max = MAX_AUDIO_BYTES + 8192;
  if (Number(request.headers.get("content-length") || 0) > max) throw new AppError(413, "audio_too_large", "Keep the recording under 20 seconds.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "audio_required", "A recording is required.");
  const chunks: Uint8Array[] = []; let size = 0;
  const timeout = setTimeout(() => { void reader.cancel().catch(() => {}); }, 5000);
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > max) throw new AppError(413, "audio_too_large", "Keep the recording under 20 seconds.");
      chunks.push(value);
    }
  } finally { clearTimeout(timeout); await reader.cancel().catch(() => {}); }
  try { return await new Response(Buffer.concat(chunks), { headers: { "content-type": contentType } }).formData(); }
  catch { throw new AppError(400, "invalid_audio", "The recording upload was incomplete. Try again."); }
}

export async function POST(request: Request) {
  return handle(async () => {
    const principal = requireAuth(request, "manager");
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new AppError(403, "invalid_origin", "Record your brief from the Cue dashboard.");
    const form = await boundedForm(request);
    if ([...form.keys()].some(key => key !== "audio") || form.getAll("audio").length !== 1) throw new AppError(400, "invalid_audio", "Send one recording at a time.");
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.type !== "audio/wav" || audio.size > MAX_AUDIO_BYTES) throw new AppError(400, "invalid_audio", "Use the dashboard microphone to record a short brief.");
    const owner = randomUUID();
    if (!await acquireLane(principal.workspace_id, "voice_draft", owner)) throw new AppError(429, "voice_busy", "Another brief is being drafted. Wait a moment and try again.");
    try {
      const draft = await draftVoice(new Uint8Array(await audio.arrayBuffer()), request.signal);
      return Response.json(draft, { headers: { "cache-control": "no-store" } });
    } finally { await releaseLane(principal.workspace_id, "voice_draft", owner); }
  });
}
