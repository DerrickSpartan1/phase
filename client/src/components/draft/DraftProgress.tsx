import { useDraftStore } from "../../stores/draftStore";

// ── Component ───────────────────────────────────────────────────────────

/** Displays current pack number, pick number, and pass direction. Per D-06: no timer. */
export function DraftProgress() {
  const view = useDraftStore((s) => s.view);

  if (!view) return null;

  const packDisplay = view.current_pack_number + 1;
  const pickDisplay = view.pick_number + 1;
  const directionArrow = view.pass_direction === "Left" ? "←" : "→";
  const directionLabel = view.pass_direction === "Left" ? "Pass Left" : "Pass Right";

  return (
    <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-gray-800/80 border border-gray-700">
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-400">
          Pack{" "}
          <span className="text-white font-semibold">{packDisplay}</span>
          {" "}of{" "}
          <span className="text-white">{view.pack_count}</span>
        </span>
        <span className="text-gray-600">|</span>
        <span className="text-gray-400">
          Pick{" "}
          <span className="text-white font-semibold">{pickDisplay}</span>
          {" "}of{" "}
          <span className="text-white">{view.cards_per_pack}</span>
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-sm text-gray-400">
        <span className="text-lg">{directionArrow}</span>
        <span>{directionLabel}</span>
      </div>
    </div>
  );
}
