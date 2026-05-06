import { useEffect, useState } from "react";

import { loadPrintingsData } from "../services/scryfall.ts";

let resolved = false;

export function usePrintingsLoaded(): boolean {
  const [loaded, setLoaded] = useState(resolved);

  useEffect(() => {
    if (loaded) return;
    loadPrintingsData().then((data) => {
      if (data) {
        resolved = true;
        setLoaded(true);
      }
    });
  }, [loaded]);

  return loaded;
}
