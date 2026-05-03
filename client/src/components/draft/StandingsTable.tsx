import { useMultiplayerDraftStore } from "../../stores/multiplayerDraftStore";

// ── Component ───────────────────────────────────────────────────────────

/** Swiss tournament standings sorted by match wins, with current round pairings. */
export function StandingsTable() {
  const standings = useMultiplayerDraftStore((s) => s.standings);
  const currentRound = useMultiplayerDraftStore((s) => s.currentRound);
  const localSeat = useMultiplayerDraftStore((s) => s.seatIndex);
  const pairings = useMultiplayerDraftStore((s) => s.pairings);

  if (standings.length === 0) return null;

  // Sort by match_wins desc, then fewer losses (display-only, never mutate store)
  const sorted = [...standings].sort(
    (a, b) => b.match_wins - a.match_wins || a.match_losses - b.match_losses,
  );

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
      <h3 className="text-lg font-medium text-white mb-3">
        Standings — Round {currentRound + 1}
      </h3>
      <table className="w-full text-sm text-white/80">
        <thead>
          <tr className="border-b border-white/10 text-left text-white/50">
            <th className="pb-2 pr-4">#</th>
            <th className="pb-2 pr-4">Player</th>
            <th className="pb-2 pr-4">Record</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry, i) => (
            <tr
              key={entry.seat_index}
              className={
                entry.seat_index === localSeat ? "text-emerald-300" : ""
              }
            >
              <td className="py-1 pr-4 text-white/40">{i + 1}</td>
              <td className="py-1 pr-4">{entry.display_name}</td>
              <td className="py-1 pr-4 tabular-nums">
                {entry.match_wins}-{entry.match_losses}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Current round pairings */}
      {pairings.length > 0 && (
        <div className="mt-4 border-t border-white/10 pt-3">
          <h4 className="text-sm font-medium text-white/60 mb-2">
            Current Pairings
          </h4>
          {pairings.map((p) => (
            <div
              key={p.match_id}
              className="flex items-center gap-2 text-sm py-1"
            >
              <span className="text-white/80">{p.name_a}</span>
              <span className="text-white/30">vs</span>
              <span className="text-white/80">{p.name_b}</span>
              <span className="ml-auto text-white/40 text-xs">{p.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
