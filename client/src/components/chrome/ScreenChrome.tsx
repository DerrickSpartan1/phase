import { useState } from "react";
import { motion } from "framer-motion";

import { audioManager } from "../../audio/AudioManager";
import { usePreferencesStore } from "../../stores/preferencesStore";
import { menuButtonClass } from "../menu/buttonStyles";
import { PreferencesModal } from "../settings/PreferencesModal";

interface ScreenChromeProps {
  onBack?: () => void;
  settingsOpen?: boolean;
  onSettingsOpenChange?: (open: boolean) => void;
}

function BackIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-6 w-6"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M17 10a.75.75 0 0 1-.75.75H5.56l3.22 3.22a.75.75 0 1 1-1.06 1.06l-4.5-4.5a.75.75 0 0 1 0-1.06l4.5-4.5a.75.75 0 0 1 1.06 1.06L5.56 9.25h10.69A.75.75 0 0 1 17 10Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path d="M10.5 3.75a.75.75 0 0 0-1.264-.546L5.203 7H2.667a.75.75 0 0 0-.7.48A6.985 6.985 0 0 0 1.5 10c0 .887.165 1.737.468 2.52.111.29.39.48.7.48h2.535l4.033 3.796A.75.75 0 0 0 10.5 16.25V3.75ZM13.38 7.879a.75.75 0 0 1 1.06 0A4.983 4.983 0 0 1 15.75 11a4.983 4.983 0 0 1-1.31 3.121.75.75 0 1 1-1.06-1.06A3.483 3.483 0 0 0 14.25 11c0-.92-.355-1.758-.94-2.381a.75.75 0 0 1 .07-1.06Z" />
    </svg>
  );
}

function SpeakerMutedIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path d="M9.547 3.062A.75.75 0 0 1 10.5 3.75v12.5a.75.75 0 0 1-1.264.546L5.203 13H2.667a.75.75 0 0 1-.7-.48A6.985 6.985 0 0 1 1.5 10c0-.887.165-1.737.468-2.52a.75.75 0 0 1 .7-.48h2.535l4.033-3.796a.75.75 0 0 1 .811-.142ZM13.28 7.22a.75.75 0 1 0-1.06 1.06L13.94 10l-1.72 1.72a.75.75 0 0 0 1.06 1.06L15 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L16.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L15 8.94l-1.72-1.72Z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-6 h-6"
    >
      <path
        fillRule="evenodd"
        d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function MuteToggle() {
  const masterMuted = usePreferencesStore((s) => s.masterMuted);
  const setMasterMuted = usePreferencesStore((s) => s.setMasterMuted);

  const handleToggle = () => {
    const next = !masterMuted;
    setMasterMuted(next);
    if (!next) {
      audioManager.ensurePlayback();
    }
  };

  return (
    <motion.button
      className={menuButtonClass({
        tone: "neutral",
        size: "sm",
        className:
          "h-11 min-w-11 rounded-[16px] px-3 py-0 text-white/46 hover:text-white/72",
      })}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleToggle}
      aria-label={masterMuted ? "Unmute" : "Mute"}
      title={masterMuted ? "Unmute" : "Mute"}
    >
      {masterMuted ? <SpeakerMutedIcon /> : <SpeakerIcon />}
    </motion.button>
  );
}

export function ScreenChrome({
  onBack,
  settingsOpen,
  onSettingsOpenChange,
}: ScreenChromeProps) {
  const [internalShowSettings, setInternalShowSettings] = useState(false);
  const isSettingsControlled = settingsOpen !== undefined;
  const showSettings = isSettingsControlled ? settingsOpen : internalShowSettings;

  const setShowSettings = (open: boolean) => {
    if (!isSettingsControlled) {
      setInternalShowSettings(open);
    }
    onSettingsOpenChange?.(open);
  };

  return (
    <>
      {/* Back button — upper-left */}
      {onBack && (
        <div className="fixed left-4 top-[calc(env(safe-area-inset-top)+1rem)] z-30">
          <motion.button
            className={menuButtonClass({
              tone: "neutral",
              size: "sm",
              className:
                "h-11 min-w-11 rounded-[16px] px-3 py-0 text-white/68 hover:text-white",
            })}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            onClick={onBack}
            aria-label="Back"
            title="Back"
          >
            <BackIcon />
          </motion.button>
        </div>
      )}

      {/* Mute toggle + Settings cog — upper-right */}
      <div className="fixed right-4 top-[calc(env(safe-area-inset-top)+1rem)] z-30 flex gap-2">
        <MuteToggle />
        <motion.button
          className={menuButtonClass({
            tone: "neutral",
            size: "sm",
            className:
              "h-11 min-w-11 rounded-[16px] px-3 py-0 text-white/46 hover:text-white/72",
          })}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowSettings(true)}
          aria-label="Settings"
          title="Settings"
        >
          <SettingsIcon />
        </motion.button>
      </div>

      {/* Settings modal */}
      {showSettings && (
        <PreferencesModal onClose={() => setShowSettings(false)} />
      )}
    </>
  );
}
