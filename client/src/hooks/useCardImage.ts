import { useEffect, useState } from "react";
import { getCachedImage, cacheImage, revokeImageUrl } from "../services/imageCache.ts";
import { fetchCardImageUrl, fetchTokenImageUrl } from "../services/scryfall.ts";

interface UseCardImageOptions {
  size?: "small" | "normal" | "large" | "art_crop";
  faceIndex?: number;
  isToken?: boolean;
}

interface UseCardImageResult {
  src: string | null;
  isLoading: boolean;
}

export function useCardImage(
  cardName: string,
  options?: UseCardImageOptions,
): UseCardImageResult {
  const size = options?.size ?? "normal";
  const faceIndex = options?.faceIndex ?? 0;
  const isToken = options?.isToken ?? false;
  const [src, setSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!cardName) {
      setSrc(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    async function loadImage() {
      setIsLoading(true);
      setSrc(null);

      try {
        // Check IndexedDB cache first (tokens use a prefixed key to avoid collisions)
        const key = isToken ? `token:${cardName}` : cardName;
        const cached = await getCachedImage(key, size);
        if (cached) {
          if (!cancelled) {
            objectUrl = cached;
            setSrc(cached);
            setIsLoading(false);
          } else {
            revokeImageUrl(cached);
          }
          return;
        }

        // Cache miss — resolve image URL from Scryfall API, then fetch and cache the blob
        const imageUrl = isToken
          ? await fetchTokenImageUrl(cardName, size)
          : await fetchCardImageUrl(cardName, faceIndex, size);
        if (cancelled) return;

        const response = await fetch(imageUrl);
        if (cancelled) return;

        if (response.ok) {
          const blob = await response.blob();
          if (cancelled) return;
          await cacheImage(key, size, blob);
          objectUrl = URL.createObjectURL(blob);
          setSrc(objectUrl);
        } else {
          // Fallback to direct CDN URL if blob fetch fails
          setSrc(imageUrl);
        }
        setIsLoading(false);
      } catch {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadImage();

    return () => {
      cancelled = true;
      if (objectUrl) {
        revokeImageUrl(objectUrl);
      }
    };
  }, [cardName, size, faceIndex, isToken]);

  return { src, isLoading };
}
