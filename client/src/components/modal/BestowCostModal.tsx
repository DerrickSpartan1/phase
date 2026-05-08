import type { GameAction, ManaCost, WaitingFor } from "../../adapter/types.ts";
import { useCanActForWaitingState } from "../../hooks/usePlayerId.ts";
import { useGameStore } from "../../stores/gameStore.ts";
import { ManaCostSymbols } from "../mana/ManaCostSymbols.tsx";
import { CardTextboxPreview } from "./CardTextboxPreview.tsx";
import { DialogShell } from "./DialogShell.tsx";

type BestowCostChoice = Extract<WaitingFor, { type: "BestowCostChoice" }>;

export function BestowCostModal() {
  const canActForWaitingState = useCanActForWaitingState();
  const waitingFor = useGameStore((s) => s.waitingFor);
  const dispatch = useGameStore((s) => s.dispatch);

  if (waitingFor?.type !== "BestowCostChoice") return null;
  if (!canActForWaitingState) return null;

  const data = waitingFor.data as BestowCostChoice["data"];

  return (
    <BestowCostContent
      objectId={data.object_id}
      normalCost={data.normal_cost}
      bestowCost={data.bestow_cost}
      dispatch={dispatch}
    />
  );
}

function BestowCostContent({
  objectId,
  normalCost,
  bestowCost,
  dispatch,
}: {
  objectId: number;
  normalCost: ManaCost;
  bestowCost: ManaCost;
  dispatch: (action: GameAction) => Promise<unknown>;
}) {
  const obj = useGameStore((s) => s.gameState?.objects[objectId]);

  if (!obj) return null;

  const cardName = obj.name;

  return (
    <DialogShell
      eyebrow="Bestow"
      title="Choose Casting Cost"
      subtitle={`Cast ${cardName} normally as a creature, or pay its Bestow cost to cast it as an Aura.`}
    >
      <div className="px-3 pt-3 lg:px-5 lg:pt-4">
        <CardTextboxPreview cardName={cardName} />
      </div>
      <div className="flex flex-col gap-2 px-3 py-3 lg:px-5 lg:py-5">
        <button
          onClick={() =>
            dispatch({ type: "ChooseBestowCost", data: { use_bestow: false } })
          }
          className="rounded-[16px] border border-white/8 bg-white/5 px-4 py-3 text-left transition hover:bg-white/8 hover:ring-1 hover:ring-cyan-400/30"
        >
          <span className="font-semibold text-white">Cast as Creature</span>
          <span className="ml-2"><ManaCostSymbols cost={normalCost} /></span>
        </button>
        <button
          onClick={() =>
            dispatch({ type: "ChooseBestowCost", data: { use_bestow: true } })
          }
          className="rounded-[16px] border border-white/8 bg-white/5 px-4 py-3 text-left transition hover:bg-white/8 hover:ring-1 hover:ring-emerald-400/30"
        >
          <span className="font-semibold text-white">Cast with Bestow</span>
          <span className="ml-2"><ManaCostSymbols cost={bestowCost} /></span>
        </button>
      </div>
    </DialogShell>
  );
}
