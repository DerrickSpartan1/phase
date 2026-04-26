/**
 * Composes the `alt` attribute for a card image. When the image fails to render
 * (Scryfall fetch failure, broken layout, screen reader, etc.) the user still
 * sees the card name and full oracle text.
 */
export function composeCardAlt(cardName: string, oracleText?: string | null): string {
  return [cardName, oracleText].filter(Boolean).join("\n\n");
}
