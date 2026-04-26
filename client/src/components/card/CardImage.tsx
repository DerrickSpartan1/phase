import { useCardImage } from "../../hooks/useCardImage.ts";
import { useEngineCardData } from "../../hooks/useEngineCardData.ts";
import type { TokenSearchFilters } from "../../services/scryfall.ts";
import { composeCardAlt } from "../../utils/cardAlt.ts";
import { getBevelBorderStyle } from "./cardFrame.ts";

interface CardImageProps {
  cardName: string;
  size?: "small" | "normal" | "large";
  faceIndex?: number;
  className?: string;
  tapped?: boolean;
  unimplementedMechanics?: string[];
  colors?: string[];
  isToken?: boolean;
  tokenFilters?: TokenSearchFilters;
  /**
   * Defensive alt-text for screen readers and broken-image fallbacks.
   * If omitted, the component looks the oracle text up via the engine card
   * database so a broken image still conveys the card's content.
   */
  oracleText?: string;
}

export function CardImage({
  cardName,
  size = "normal",
  faceIndex,
  className = "",
  tapped = false,
  unimplementedMechanics,
  colors,
  isToken = false,
  tokenFilters,
  oracleText,
}: CardImageProps) {
  const { src, isLoading } = useCardImage(cardName, { size, faceIndex, isToken, tokenFilters });
  const fallbackData = useEngineCardData(oracleText === undefined ? cardName : null);
  const resolvedOracleText = oracleText ?? fallbackData?.oracle_text ?? undefined;
  const altText = composeCardAlt(cardName, resolvedOracleText);

  const tappedStyle = tapped ? "rotate-[90deg] origin-center" : "";
  const baseClasses = `w-[var(--card-w)] h-[var(--card-h)] rounded-lg transition-transform duration-200 ${tappedStyle} ${className}`;

  const borderStyle = colors
    ? getBevelBorderStyle(colors)
    : undefined;

  if (isLoading || !src) {
    return (
      <div
        className={`${baseClasses} bg-gray-700 shadow-md animate-pulse`}
        style={borderStyle ?? { border: "1px solid #4b5563" }}
        aria-label={`Loading ${cardName}`}
      />
    );
  }

  return (
    <div className="relative inline-block w-fit select-none">
      <img
        src={src}
        alt={altText}
        draggable={false}
        className={`${baseClasses} shadow-lg object-cover`}
        style={borderStyle ?? { border: "1px solid #4b5563" }}
      />
      {unimplementedMechanics && unimplementedMechanics.length > 0 && (
        <span
          className="absolute top-0.5 left-0.5 bg-amber-500 text-black text-[8px] font-bold rounded-sm px-0.5 leading-tight"
          title={`Unimplemented: ${unimplementedMechanics.join(", ")}`}
        >
          !
        </span>
      )}
    </div>
  );
}
