// Kokoro TTS — lifelike neural speech running 100% in the browser.
// Model is ~100MB quantized (q8) and is cached by the browser after first load.

import type { Gender } from "./jobs";

type TTSInstance = any; // KokoroTTS — lazy imported to keep main bundle lean

let ttsPromise: Promise<TTSInstance> | null = null;
let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

// Shared AudioContext for gapless Web Audio playback (works correctly in
// Firefox where chained HTMLAudioElement playback crackles).
let audioCtx: AudioContext | null = null;
let scheduledSources: AudioBufferSourceNode[] = [];
let nextStartTime = 0;

function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function stopWebAudio() {
  for (const src of scheduledSources) {
    try { src.onended = null; src.stop(); src.disconnect(); } catch {}
  }
  scheduledSources = [];
  nextStartTime = 0;
}

// Map app gender → Kokoro voice IDs (American English, highest quality set)
const VOICE_BY_GENDER: Record<Gender, string> = {
  female: "af_heart",
  male: "am_michael",
};

export interface VoiceOption { id: string; label: string; gender: Gender; }

// Curated set of high-quality American English voices.
export const KOKORO_VOICES: VoiceOption[] = [
  { id: "af_heart",   label: "Heart (F)",   gender: "female" },
  { id: "af_bella",   label: "Bella (F)",   gender: "female" },
  { id: "af_nicole",  label: "Nicole (F)",  gender: "female" },
  { id: "af_sarah",   label: "Sarah (F)",   gender: "female" },
  { id: "af_sky",     label: "Sky (F)",     gender: "female" },
  { id: "af_nova",    label: "Nova (F)",    gender: "female" },
  { id: "am_michael", label: "Michael (M)", gender: "male" },
  { id: "am_adam",    label: "Adam (M)",    gender: "male" },
  { id: "am_eric",    label: "Eric (M)",    gender: "male" },
  { id: "am_liam",    label: "Liam (M)",    gender: "male" },
  { id: "am_onyx",    label: "Onyx (M)",    gender: "male" },
  { id: "am_puck",    label: "Puck (M)",    gender: "male" },
];

export function pickRandomVoice(gender?: Gender): string {
  const pool = gender ? KOKORO_VOICES.filter(v => v.gender === gender) : KOKORO_VOICES;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

export function voiceGender(voiceId: string): Gender {
  return KOKORO_VOICES.find(v => v.id === voiceId)?.gender || "male";
}

async function getTTS(): Promise<TTSInstance> {
  if (!ttsPromise) {
    ttsPromise = (async () => {
      const { KokoroTTS, env } = await import("kokoro-js");
      // Pin the ONNX runtime WASM assets to the jsDelivr CDN so loading
      // works regardless of base path (GitHub Pages subpath, etc.).
      try {
        const onnxEnv: any = (env as any)?.backends?.onnx;
        if (onnxEnv?.wasm) {
          onnxEnv.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";
          onnxEnv.wasm.numThreads = 1;
        }
      } catch {}
      // Try WebGPU first (much faster), fall back to WASM.
      const hasWebGPU = typeof navigator !== "undefined" && (navigator as any).gpu;
      return KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
        dtype: hasWebGPU ? "fp32" : "q8",
        device: hasWebGPU ? "webgpu" : "wasm",
      } as any);
    })();
    ttsPromise.catch(() => { ttsPromise = null; });
  }
  return ttsPromise;
}

/** Kick off the model download ahead of time (e.g. when the user opens the intro). */
export function preloadKokoro(): Promise<void> {
  return getTTS().then(() => {}).catch((e) => { console.warn("[Kokoro] preload failed", e); throw e; });
}

let _ready = false;
getTTS().then(() => { _ready = true; }).catch(() => {});

export function isKokoroReady(): boolean { return _ready; }

/** Resolves when the Kokoro model is fully loaded and ready to synthesize. */
export function kokoroReady(): Promise<void> {
  return getTTS().then(() => { _ready = true; });
}

export function stopKokoro(): void {
  if (currentAudio) {
    try { currentAudio.pause(); currentAudio.currentTime = 0; } catch {}
  }
  if (currentUrl) {
    try { URL.revokeObjectURL(currentUrl); } catch {}
    currentUrl = null;
  }
  currentAudio = null;
  stopWebAudio();
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    p.then(v => { clearTimeout(to); resolve(v); }).catch(e => { clearTimeout(to); reject(e); });
  });
}

function resolveVoice(opts: { voice?: string; gender?: Gender }): string {
  if (opts.voice && KOKORO_VOICES.some(v => v.id === opts.voice)) return opts.voice;
  if (opts.gender) return VOICE_BY_GENDER[opts.gender];
  return "am_michael";
}

export async function speakWithKokoro(
  text: string,
  opts: { voice?: string; gender?: Gender },
  onStart?: () => void,
  onEnd?: () => void,
): Promise<void> {
  stopKokoro();
  try {
    const tts = await withTimeout(getTTS(), 60_000, "Kokoro model load");
    const voice = resolveVoice(opts);
    const result: any = await withTimeout(tts.generate(text, { voice }), 30_000, "Kokoro generate");
    const samples: Float32Array = result.audio;
    const sampleRate: number = result.sampling_rate || 24000;
    const ctx = getAudioContext();
    const buffer = ctx.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    scheduledSources.push(src);
    onStart?.();
    src.onended = () => { stopKokoro(); onEnd?.(); };
    src.start();
  } catch (err) {
    console.error("[Kokoro] speak failed", err);
    stopKokoro();
    throw err;
  }
}

/**
 * Stream audio: feed text incrementally and start playback as soon as
 * the first sentence is synthesized. Cuts perceived latency dramatically
 * when wired up to a streaming LLM response.
 *
 * Returns a Promise that resolves when ALL audio has finished playing.
 */
export async function streamSpeakWithKokoro(
  textChunks: AsyncIterable<string>,
  opts: { voice?: string; gender?: Gender },
  callbacks?: { onFirstAudio?: () => void; onAllText?: (full: string) => void; onComplete?: () => void; shouldAbort?: () => boolean },
): Promise<string> {
  stopKokoro();
  let fullText = "";
  let aborted = false;
  const isAborted = () => aborted || (callbacks?.shouldAbort?.() ?? false);

  try {
    const tts = await withTimeout(getTTS(), 60_000, "Kokoro model load");
    const { TextSplitterStream } = await import("kokoro-js");
    const voice = resolveVoice(opts);
    const splitter = new TextSplitterStream();
    const audioStream = tts.stream(splitter, { voice });

    // Producer 1: pipe LLM tokens into the splitter
    const producer = (async () => {
      for await (const chunk of textChunks) {
        if (isAborted()) break;
        fullText += chunk;
        splitter.push(chunk);
      }
      splitter.close();
      callbacks?.onAllText?.(fullText);
    })();

    // Producer 2: collect raw PCM samples (Float32) from each kokoro chunk.
    // Avoid WAV blob -> decodeAudioData (Firefox is strict about headers).
    interface RawChunk { samples: Float32Array; sampleRate: number; }
    const audioQueue: RawChunk[] = [];
    let queueWaiter: { fn: (() => void) | null } = { fn: null };
    let producerDone = false;
    const collector = (async () => {
      try {
        for await (const item of audioStream as any) {
          if (isAborted()) break;
          const audio = item?.audio;
          if (!audio) continue;
          const samples: Float32Array | undefined = audio.audio;
          const sampleRate: number = audio.sampling_rate || 24000;
          if (!samples || !samples.length) continue;
          audioQueue.push({ samples, sampleRate });
          const w = queueWaiter.fn; queueWaiter.fn = null; w?.();
        }
      } catch (e) {
        console.error("[Kokoro] audio stream error", e);
      } finally {
        producerDone = true;
        const w = queueWaiter.fn; queueWaiter.fn = null; w?.();
      }
    })();

    // Consumer: decode each blob via Web Audio and schedule it back-to-back
    // for gapless playback. This replaces chained HTMLAudioElement playback
    // (which crackles in Firefox between chunks).
    const ctx = getAudioContext();
    nextStartTime = 0;
    let playedFirst = false;
    let lastEndPromise: Promise<void> = Promise.resolve();

    while (!isAborted()) {
      if (audioQueue.length === 0) {
        if (producerDone) break;
        await new Promise<void>(r => { queueWaiter.fn = r; });
        continue;
      }
      const chunk = audioQueue.shift()!;
      const buffer = ctx.createBuffer(1, chunk.samples.length, chunk.sampleRate);
      buffer.copyToChannel(chunk.samples, 0);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);

      const startAt = Math.max(ctx.currentTime + 0.02, nextStartTime);
      try { src.start(startAt); } catch { continue; }
      nextStartTime = startAt + buffer.duration;
      scheduledSources.push(src);

      if (!playedFirst) {
        playedFirst = true;
        // Fire onFirstAudio at the actual playback start time
        const delayMs = Math.max(0, (startAt - ctx.currentTime) * 1000);
        setTimeout(() => callbacks?.onFirstAudio?.(), delayMs);
      }

      lastEndPromise = new Promise<void>((res) => {
        src.onended = () => res();
      });
    }

    // Wait for the last scheduled chunk to finish playing
    await lastEndPromise;

    await producer.catch(() => {});
    await collector.catch(() => {});
    stopKokoro();
    callbacks?.onComplete?.();
    return fullText;
  } catch (err) {
    aborted = true;
    stopKokoro();
    console.error("[Kokoro] streamSpeak failed", err);
    throw err;
  }
}
