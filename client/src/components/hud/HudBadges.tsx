interface StatusBadgeProps {
  label: string;
  value?: number | string;
  tone?: "neutral" | "amber";
}

export function StatusBadge({
  label,
  value,
  tone = "neutral",
}: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold tracking-[0.16em] uppercase ${
        tone === "amber"
          ? "bg-amber-400/16 text-amber-100 ring-1 ring-amber-300/30"
          : "bg-white/7 text-slate-200 ring-1 ring-white/10"
      }`}
    >
      <span>{label}</span>
      {value != null ? <span className="tabular-nums text-white">{value}</span> : null}
    </span>
  );
}

type CounterBadgeKind = "poison" | "speed";

interface CounterBadgeProps {
  kind: CounterBadgeKind;
  value: number;
}

export function CounterBadge({ kind, value }: CounterBadgeProps) {
  const isPoison = kind === "poison";
  const label = isPoison
    ? `${value} poison counter${value === 1 ? "" : "s"}`
    : `Speed ${value}`;
  const title = isPoison ? `Poison counters: ${value}` : `Speed: ${value}`;
  const urgent = isPoison && value >= 8;

  if (isPoison) {
    return (
      <span
        role="img"
        aria-label={label}
        title={title}
        className={`relative inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1 text-[11px] font-black leading-none tabular-nums text-lime-950 ring-1 ${
          urgent
            ? "bg-lime-300 ring-lime-100 shadow-[0_0_14px_rgba(190,242,100,0.48)]"
            : "bg-lime-400 ring-lime-200/70 shadow-[0_0_10px_rgba(163,230,53,0.22)]"
        }`}
      >
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_34%_28%,rgba(255,255,255,0.72),transparent_26%),radial-gradient(circle_at_64%_72%,rgba(22,101,52,0.34),transparent_28%)]"
        />
        <span className="relative">{value}</span>
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={label}
      title={title}
      className="relative inline-flex h-6 min-w-6 shrink-0 items-center justify-center overflow-hidden rounded-[7px] px-1 text-[11px] font-black leading-none tabular-nums text-white ring-1 ring-amber-200/55 shadow-[0_0_10px_rgba(251,191,36,0.22)]"
    >
      <span
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(45deg,#f8fafc_25%,#0f172a_25%,#0f172a_50%,#f8fafc_50%,#f8fafc_75%,#0f172a_75%,#0f172a_100%)] bg-[length:8px_8px]"
      />
      <span aria-hidden className="absolute inset-0 bg-amber-500/34" />
      <span className="relative rounded-sm bg-black/45 px-0.5">{value}</span>
    </span>
  );
}
