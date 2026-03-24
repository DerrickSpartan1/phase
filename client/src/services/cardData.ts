import init, { load_card_database } from "@wasm/engine";

let initPromise: Promise<void> | null = null;
let cardDbPromise: Promise<number> | null = null;

/** Ensure the WASM module is initialized (singleton). */
export function ensureWasmInit(): Promise<void> {
  if (!initPromise) {
    initPromise = init().then(() => {});
  }
  return initPromise;
}

/** Ensure the card database is loaded into WASM memory (singleton). */
export async function ensureCardDatabase(): Promise<number> {
  if (!cardDbPromise) {
    cardDbPromise = (async () => {
      await ensureWasmInit();
      const resp = await fetch(__CARD_DATA_URL__);
      if (!resp.ok) throw new Error(`Failed to load card-data.json (${resp.status})`);
      const text = await resp.text();
      return load_card_database(text);
    })();
  }
  return cardDbPromise;
}
