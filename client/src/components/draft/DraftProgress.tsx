import { useDraftStore } from "../../stores/draftStore";

// ── Component ───────────────────────────────────────────────────────────

export function DraftProgress() {
  const view = useDraftStore((s) => s.view);

  if (!view) return null;

  const packDisplay = view.current_pack_number + 1;
  const pickDisplay = view.pick_number + 1;
  const directionArrow = view.pass_direction === "Left" ? "←" : "→";
  const directionLabel = view.pass_direction === "Left" ? "Pass Left" : "Pass Right";

  return (
    <div className="flex items-center justify-between rounded-[16px] border border-white/10 bg-black/18 px-4 py-2 backdrop-blur-md">
      <div className="flex items-center gap-4 text-sm">
        <span className="text-white/50">
          Pack{" "}
          <span className="font-semibold text-white">{packDisplay}</span>
          {" "}of{" "}
          <span className="text-white">{view.pack_count}</span>
        </span>
        <span className="text-white/15">|</span>
        <span className="text-white/50">
          Pick{" "}
          <span className="font-semibold text-white">{pickDisplay}</span>
          {" "}of{" "}
          <span className="text-white">{view.cards_per_pack}</span>
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-sm text-white/50">
        <span className="text-lg">{directionArrow}</span>
        <span>{directionLabel}</span>
      </div>
    </div>
  );
}
