import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";

import { ScreenChrome } from "../components/chrome/ScreenChrome";
import {
  loadActiveQuickDraft,
  type ActiveQuickDraftMeta,
} from "../services/quickDraftPersistence";
import { usePreferencesStore } from "../stores/preferencesStore";

const SET_LABELS: Record<string, string> = {
  otj: "Outlaws of Thunder Junction",
  mkm: "Murders at Karlov Manor",
  lci: "The Lost Caverns of Ixalan",
  woe: "Wilds of Eldraine",
  mom: "March of the Machine",
  one: "Phyrexia: All Will Be One",
  bro: "The Brothers' War",
  dmu: "Dominaria United",
  snc: "Streets of New Capenna",
  dsk: "Duskmourn",
  blb: "Bloomburrow",
  fdn: "Foundations",
};

const DIFFICULTY_LABELS = [
  "Very Easy",
  "Easy",
  "Medium",
  "Hard",
  "Very Hard",
] as const;

function formatSetLabel(code: string): string {
  return SET_LABELS[code.toLowerCase()] ?? code.toUpperCase();
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function DraftLandingPage() {
  const navigate = useNavigate();
  const [activeDraft, setActiveDraft] = useState<ActiveQuickDraftMeta | null>(null);
  const experimentalFeatures = usePreferencesStore((s) => s.experimentalFeatures);

  useEffect(() => {
    setActiveDraft(loadActiveQuickDraft());
  }, []);

  return (
    <div className="menu-scene relative flex min-h-screen flex-col overflow-hidden">
      <ScreenChrome onBack={() => navigate("/")} />
      <div className="menu-scene__vignette" />
      <div className="menu-scene__haze" />

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col px-6 py-20">
        <h1 className="menu-display mb-10 text-4xl text-white">Draft</h1>

        {activeDraft && <ActiveDraftCard meta={activeDraft} />}

        <div className="flex flex-col gap-3">
          <h2 className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Start New
          </h2>

          <DraftModeCard
            title="Quick Draft"
            description="Draft 3 packs with 7 AI drafters, build a 40-card deck, then play a Bo1 match against one of them."
            icon={<BotIcon />}
            onClick={() => navigate("/draft/quick")}
          />

          {experimentalFeatures && (
            <DraftModeCard
              title="Pod Draft"
              description="Host or join a pod with up to 8 players, draft live together, then play a Swiss or elimination tournament."
              icon={<PodIcon />}
              onClick={() => navigate("/draft-pod")}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ActiveDraftCard({ meta }: { meta: ActiveQuickDraftMeta }) {
  const navigate = useNavigate();
  const [setIcon, setSetIcon] = useState<string | null>(null);

  useEffect(() => {
    fetch(__SCRYFALL_SETS_URL__)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Record<string, { icon_svg_uri?: string }> | null) => {
        const icon = data?.[meta.setCode.toLowerCase()]?.icon_svg_uri;
        if (icon) setSetIcon(icon);
      })
      .catch(() => {});
  }, [meta.setCode]);

  const phaseLabel = meta.phase === "deckbuilding" ? "Deck Building" : "Drafting";
  const difficultyLabel = DIFFICULTY_LABELS[meta.difficulty] ?? "Medium";

  return (
    <div className="mb-8">
      <h2 className="mb-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
        Draft in Progress
      </h2>
      <button
        type="button"
        onClick={() => navigate("/draft/quick?resume=1")}
        className="group flex w-full cursor-pointer items-center gap-5 rounded-[20px] border border-amber-400/20 bg-amber-500/[0.06] p-5 text-left transition-colors hover:border-amber-400/35 hover:bg-amber-500/[0.10]"
      >
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-black/24">
          {setIcon ? (
            <img
              src={setIcon}
              alt={`${meta.setCode} icon`}
              className="h-8 w-8 opacity-80 invert"
            />
          ) : (
            <span className="text-lg font-bold tracking-wider text-white/60">
              {meta.setCode.toUpperCase()}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold text-white">
            {formatSetLabel(meta.setCode)}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/45">
            <span className="rounded-md border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-xs font-medium text-amber-200">
              {phaseLabel}
            </span>
            <span>{difficultyLabel}</span>
            {meta.pickCount > 0 && (
              <span>{meta.pickCount} cards picked</span>
            )}
            <span>{formatRelativeTime(meta.updatedAt)}</span>
          </div>
        </div>

        <div className="flex items-center self-stretch pl-2">
          <div className="rounded-full border border-amber-400/15 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-200 transition-colors group-hover:border-amber-400/30 group-hover:bg-amber-500/18">
            Resume
          </div>
        </div>
      </button>
    </div>
  );
}

function DraftModeCard({
  title,
  description,
  icon,
  onClick,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full cursor-pointer items-center gap-4 rounded-[18px] border border-white/10 bg-white/[0.02] p-4 text-left transition-colors hover:border-white/18 hover:bg-white/[0.05]"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-black/18 text-white/50 group-hover:text-white/70">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-base font-semibold text-white">{title}</div>
        <p className="mt-1 text-sm text-white/40">{description}</p>
      </div>
      <div className="rounded-full border border-white/10 bg-black/18 px-3 py-2 text-white/40 transition-colors group-hover:text-white/70">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-current">
          <path d="m13.2 5.4 1.4-1.4 8 8-8 8-1.4-1.4 5.6-5.6H2v-2h16.8l-5.6-5.6Z" />
        </svg>
      </div>
    </button>
  );
}

function BotIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-current">
      <path d="M17.753 14a2.25 2.25 0 0 1 2.25 2.25v.904A3.75 3.75 0 0 1 18.696 20H5.304a3.75 3.75 0 0 1-1.307-2.846v-.904A2.25 2.25 0 0 1 6.247 14h11.506ZM11 15.5H8a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5Zm5 0h-1.5a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5H16a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5ZM12 2a4 4 0 0 1 4 4v4a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4Zm-1.5 5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm3 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
    </svg>
  );
}

function PodIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-current">
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3Zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3Zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5Zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5Z" />
    </svg>
  );
}
