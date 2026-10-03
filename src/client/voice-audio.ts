/** Browser-only conversion to the narrow server contract: PCM16 mono, 16 kHz. */
export async function recordingToWav(recording: Blob): Promise<Blob> {
  if (!recording.size || recording.size > 8_000_000) throw new Error("That recording could not be read. Try a short voice brief again.");
  const decoder = new AudioContext();
  let decoded: AudioBuffer;
  try { decoded = await decoder.decodeAudioData(await recording.arrayBuffer()); }
  finally { await decoder.close(); }
  const samples = Math.min(320_000, Math.floor(decoded.duration * 16_000));
  if (samples < 4_800) throw new Error("That was too short. Record at least a moment of speech, or type your brief.");
  const renderer = new OfflineAudioContext(1, samples, 16_000);
  const source = renderer.createBufferSource();
  source.buffer = decoded; source.connect(renderer.destination); source.start();
  const mono = (await renderer.startRendering()).getChannelData(0);
  const bytes = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(bytes);
  const text = (offset: number, value: string) => { for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index)); };
  text(0, "RIFF"); view.setUint32(4, 36 + samples * 2, true); text(8, "WAVE");
  text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, 16_000, true); view.setUint32(28, 32_000, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, samples * 2, true);
  for (let index = 0; index < samples; index++) {
    const sample = Math.max(-1, Math.min(1, mono[index]));
    view.setInt16(44 + index * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return new Blob([bytes], { type: "audio/wav" });
}
