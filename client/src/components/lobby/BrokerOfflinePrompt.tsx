import { motion } from "framer-motion";

import { menuButtonClass } from "../menu/buttonStyles";

interface BrokerOfflinePromptProps {
  /** User accepts hosting a pure-PeerJS room with no public lobby listing. */
  onContinueWithoutLobby: () => void;
  /** User backs out; stay on the host-setup screen and try again later. */
  onCancel: () => void;
  /** Broker URL the client couldn't reach — shown verbatim so a
   * self-hosted operator can spot a misconfiguration at a glance. */
  serverAddress?: string;
}

/**
 * Shown on the host path when the broker (`LobbyOnly` `phase-server`) is
 * unreachable at click-time. Distinct from `ServerOfflinePrompt`, which
 * fires on a `Full`-mode connection drop: the affordances and wording are
 * different because "public listing is unavailable but P2P still works"
 * is a materially different tradeoff than "game server is down."
 */
export function BrokerOfflinePrompt({
  onContinueWithoutLobby,
  onCancel,
  serverAddress,
}: BrokerOfflinePromptProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18 }}
        className="relative z-10 w-full max-w-md rounded-[22px] border border-white/10 bg-[#0b1020]/96 p-6 shadow-2xl backdrop-blur-md"
      >
        <h2 className="text-base font-semibold text-white">
          Lobby server unreachable
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Your game won&apos;t be publicly listed. You can still host over
          P2P — just share the room code directly with your opponent.
        </p>
        {serverAddress && (
          <p className="mt-2 font-mono text-[10px] text-slate-500 break-all">
            {serverAddress}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className={menuButtonClass({ tone: "neutral", size: "sm" })}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onContinueWithoutLobby}
            className={menuButtonClass({ tone: "cyan", size: "sm" })}
          >
            Continue without lobby
          </button>
        </div>
      </motion.div>
    </div>
  );
}
