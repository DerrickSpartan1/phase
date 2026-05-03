import { useMultiplayerDraftStore } from "../../stores/multiplayerDraftStore";

// ── Component ───────────────────────────────────────────────────────────

/** Displays the pick timer countdown. Renders nothing in Casual mode or when no timer is active. */
export function PickTimer() {
  const timerRemainingMs = useMultiplayerDraftStore((s) => s.timerRemainingMs);
  const podPolicy = useMultiplayerDraftStore((s) => s.view?.pod_policy);

  // Don't render in Casual mode or when no timer
  if (timerRemainingMs === null || podPolicy !== "Competitive") return null;

  const seconds = Math.ceil(timerRemainingMs / 1000);
  const isWarning = timerRemainingMs <= 10_000; // D-03: visual warning at <=10s

  return (
    <div className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gray-800/80 border border-gray-700">
      <span className="text-xs text-white/50 uppercase tracking-wider">
        Pick Timer
      </span>
      <span
        className={`text-2xl font-bold tabular-nums ${isWarning ? "text-red-400 animate-pulse" : "text-white"}`}
      >
        {seconds}s
      </span>
    </div>
  );
}
