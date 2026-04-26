import { memo } from "react";
import type { MouseEvent } from "react";

import type { ObjectId } from "../../adapter/types.ts";
import { dispatchAction } from "../../game/dispatch.ts";
import { useCardHover } from "../../hooks/useCardHover.ts";
import { useIsValidObjectTarget } from "../../hooks/useIsValidTarget.ts";
import { useGameStore } from "../../stores/gameStore.ts";
import { usePreferencesStore } from "../../stores/preferencesStore.ts";
import { useUiStore } from "../../stores/uiStore.ts";
import { formatCounterType } from "../../viewmodel/cardProps.ts";
import { ArtCropCard } from "../card/ArtCropCard.tsx";
import { CardImage } from "../card/CardImage.tsx";
import { cardImageLookup } from "../../services/cardImageLookup.ts";

interface AttachmentStackProps {
  objectIds: ObjectId[];
}

// Vertical reveal: each attachment peeks above the host by this fraction of
// its own height. 0.55 = ~55% of the attached card is visible above the host's
// top edge — enough for the title bar plus most of the art so the player can
// recognize the card without hovering. Each subsequent attachment in a stack
// reveals a further fraction beyond the previous one (see PEEK_STAGGER) so a
// creature with two Auras shows both names rather than fully occluding one.
const PEEK_REVEAL = 0.55;
const PEEK_STAGGER = 0.18;

/**
 * Staggered card stack rendered above the host PermanentCard. Each attached
 * Equipment/Aura/Fortification appears as a real card image (matching the
 * host's display preference — full-card or art-crop), tucked partially behind
 * the host so the host frame reads as "wearing" the attachments. Replaces the
 * earlier chip-pill design which proved too abstract — players want to see
 * the card.
 *
 * Click / hover / targeting behavior mirrors what the chips supported:
 * - Click a peek-card: dispatch ChooseTarget if the local player is being
 *   prompted to pick targets and this object is legal, else select it.
 * - Hover / long-press: surface the card preview (data-card-hover invariant
 *   preserved via useCardHover so usePreviewDismiss continues to work).
 * - Targeting glow: amber ring on legal-target peek-cards, same shape as
 *   StackEntry uses, so every targetable surface in the UI reads identically.
 */
export const AttachmentStack = memo(function AttachmentStack({ objectIds }: AttachmentStackProps) {
  if (objectIds.length === 0) return null;

  return (
    <>
      {objectIds.map((id, index) => (
        <AttachmentPeek
          key={id}
          id={id}
          // Index 0 sits closest to the host (least revealed); the last index
          // sits highest in the fan. Stagger each by PEEK_STAGGER so two
          // attachments don't fully overlap.
          revealRatio={PEEK_REVEAL + index * PEEK_STAGGER}
          // z-index: closer-to-host attachments sit BEHIND further ones so the
          // top card in the fan stays fully visible. PermanentCard's main
          // image is z-10; we use 1..N so all peeks sit behind the host face.
          zIndex={1 + index}
        />
      ))}
    </>
  );
});

interface AttachmentPeekProps {
  id: ObjectId;
  revealRatio: number;
  zIndex: number;
}

const AttachmentPeek = memo(function AttachmentPeek({ id, revealRatio, zIndex }: AttachmentPeekProps) {
  const obj = useGameStore((s) => s.gameState?.objects[id]);
  const selectObject = useUiStore((s) => s.selectObject);
  const battlefieldCardDisplay = usePreferencesStore((s) => s.battlefieldCardDisplay);
  const { handlers, firedRef } = useCardHover(id);
  const isValidTarget = useIsValidObjectTarget(id);

  if (!obj) return null;

  const useArtCrop = battlefieldCardDisplay === "art_crop";
  const { name: imgName, faceIndex: imgFace } = cardImageLookup(obj);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (firedRef.current) {
      firedRef.current = false;
      return;
    }
    if (isValidTarget) {
      dispatchAction({ type: "ChooseTarget", data: { target: { Object: id } } });
      return;
    }
    selectObject(id);
  };

  const targetingRing = isValidTarget
    ? "ring-2 ring-amber-400/70 shadow-[0_0_10px_2px_rgba(201,176,55,0.7)]"
    : "";

  const counter = predominantCounter(obj.counters);
  const counterLabel = counter ? `${formatCounterType(counter.type)} ×${counter.count}` : null;
  const tooltip = counterLabel ? `${obj.name} (${counterLabel})` : obj.name;

  // The card sits tucked behind the host: its bottom is `(1 - revealRatio) *
  // attachmentHeight` below the host's top edge, so `revealRatio` of the
  // attachment is visible above the host. We position via `bottom: 100%` (puts
  // the attachment's bottom at the host's top) plus a downward translate of
  // `(1 - revealRatio) * 100%` of the attachment's own height.
  const tuckOffset = `${Math.round((1 - revealRatio) * 100)}%`;

  return (
    <div
      // useCardHover's `handlers` already supplies the data-card-hover
      // invariant that usePreviewDismiss relies on; do not also set it
      // explicitly (would generate a TS "specified more than once" error).
      onClick={handleClick}
      title={tooltip}
      aria-label={tooltip}
      style={{
        position: "absolute",
        bottom: "100%",
        left: "50%",
        transform: `translate(-50%, ${tuckOffset}) scale(0.7)`,
        transformOrigin: "bottom center",
        zIndex,
        cursor: "pointer",
        // Slight rotation if tapped to mirror the host's tap convention,
        // applied here independently because the attachment may be tapped
        // even when the host isn't (e.g., Equipment with its own activated
        // ability that taps it without tapping the bearer).
      }}
      className={`rounded-lg ${targetingRing}`}
      {...handlers}
    >
      {useArtCrop ? (
        <ArtCropCard objectId={id} />
      ) : (
        <CardImage
          cardName={imgName}
          faceIndex={imgFace}
          size="small"
          unimplementedMechanics={obj.unimplemented_mechanics}
          colors={obj.color}
          isToken={obj.display_source === "Token"}
        />
      )}
      {counterLabel && (
        <span
          aria-label={counterLabel}
          className="absolute right-1 top-1 z-10 rounded bg-emerald-600/90 px-1 text-[10px] font-bold text-white shadow"
        >
          +{counter?.count}
        </span>
      )}
      {obj.tapped && (
        <span
          aria-label="tapped"
          className="absolute left-1 top-1 z-10 inline-block h-2 w-2 rounded-full bg-amber-400 shadow"
        />
      )}
    </div>
  );
});

interface CounterSummary {
  type: string;
  count: number;
}

function predominantCounter(counters: Record<string, number | undefined>): CounterSummary | null {
  let best: CounterSummary | null = null;
  for (const [type, value] of Object.entries(counters)) {
    if (typeof value !== "number" || value <= 0) continue;
    if (best === null || value > best.count) best = { type, count: value };
  }
  return best;
}
