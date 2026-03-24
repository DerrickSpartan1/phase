import { audioManager, initAudioOnInteraction } from "../audio/AudioManager";
import { ensureWasmInit } from "../services/cardData";

export interface PreloadProgress {
  phase: "wasm" | "audio" | "complete";
  percent: number;
}

type ProgressListener = (progress: PreloadProgress) => void;

const listeners = new Set<ProgressListener>();
let preloadPromise: Promise<void> | null = null;

function emit(progress: PreloadProgress): void {
  for (const listener of listeners) {
    listener(progress);
  }
}

/** Subscribe to preload progress updates. Returns an unsubscribe function. */
export function subscribePreload(listener: ProgressListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Run the startup preload sequence:
 * 1. Initialize WASM module (0–50%)
 * 2. Preload SFX audio buffers (50–100%)
 *
 * Also registers audio interaction listeners for music playback.
 * Idempotent — safe to call multiple times.
 */
export function ensurePreload(): Promise<void> {
  if (preloadPromise) return preloadPromise;

  preloadPromise = (async () => {
    // Phase 1: WASM init (0–50%)
    emit({ phase: "wasm", percent: 5 });
    try {
      await ensureWasmInit();
    } catch {
      // WASM init failure — continue so splash still dismisses
    }
    emit({ phase: "wasm", percent: 50 });

    // Register audio interaction listeners (music starts on first click)
    initAudioOnInteraction();

    // Phase 2: SFX preload (50–100%)
    emit({ phase: "audio", percent: 55 });
    audioManager.warmUp();
    await audioManager.preloadSfx();
    emit({ phase: "complete", percent: 100 });
  })();

  return preloadPromise;
}
