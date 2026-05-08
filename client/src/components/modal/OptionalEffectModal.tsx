import { useEffect, useState } from "react";

import type { GameAction, GameState, WaitingFor } from "../../adapter/types.ts";
import { ChoiceModal } from "./ChoiceModal.tsx";

type OptionalEffectWaitingFor = Extract<
  WaitingFor,
  { type: "OptionalEffectChoice" | "OpponentMayChoice" }
>;

interface OptionalEffectModalProps {
  waitingFor: OptionalEffectWaitingFor;
  objects?: GameState["objects"];
  dispatch: (action: GameAction) => void | Promise<void>;
}

export function OptionalEffectModalContent({
  waitingFor,
  objects,
  dispatch,
}: OptionalEffectModalProps) {
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    setRemember(false);
  }, [waitingFor]);

  const sourceObj = objects?.[waitingFor.data.source_id];
  const sourceName = sourceObj?.name ?? "Effect";
  const description = waitingFor.data.description as string | undefined;
  const canRemember =
    waitingFor.type === "OptionalEffectChoice" && waitingFor.data.may_trigger_key != null;

  return (
    <ChoiceModal
      title={`${sourceName} - Optional Effect`}
      subtitle={description}
      options={[
        { id: "accept", label: "Yes" },
        { id: "decline", label: "No" },
      ]}
      onChoose={(id) => {
        const accept = id === "accept";
        if (remember && canRemember) {
          dispatch({
            type: "DecideOptionalEffectAndRemember",
            data: { choice: { type: accept ? "Accept" : "Decline" } },
          });
          return;
        }
        dispatch({ type: "DecideOptionalEffect", data: { accept } });
      }}
      footer={
        canRemember ? (
          <label className="flex items-center gap-2 rounded-[10px] border border-white/8 bg-black/20 px-3 py-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.currentTarget.checked)}
              className="h-4 w-4 accent-cyan-400"
            />
            <span>Don't ask again this game</span>
          </label>
        ) : undefined
      }
    />
  );
}
