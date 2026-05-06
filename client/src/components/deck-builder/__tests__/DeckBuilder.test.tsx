import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { cleanup, render, screen } from "@testing-library/react";

import { DeckBuilder } from "../DeckBuilder";
import { loadPreconDeckMap } from "../../../hooks/useDecks";

const cacheCardsMock = vi.fn();

vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("../../../hooks/useDeckCardData", () => ({
  useDeckCardData: () => ({ cardDataCache: new Map(), cacheCards: cacheCardsMock }),
}));

vi.mock("../../../hooks/useDecks", () => ({
  loadPreconDeckMap: vi.fn(),
}));

vi.mock("../../../services/deckParser", async () => {
  const actual = await vi.importActual<typeof import("../../../services/deckParser")>("../../../services/deckParser");
  return {
    ...actual,
    resolveCommander: vi.fn(async (deck) => deck),
  };
});

vi.mock("../CardSearch", () => ({
  CardSearch: ({ onResults }: { onResults: (cards: unknown[], total: number) => void }) => {
    useEffect(() => {
      onResults([], 0);
    }, [onResults]);
    return <div>Card Search</div>;
  },
}));

vi.mock("../DeckStack", () => ({
  DeckStack: ({ deck, commanders }: { deck: { main: Array<{ name: string; count: number }> }; commanders: string[] }) => (
    <div>
      <div>Deck Stack</div>
      {commanders.map((name) => <div key={name}>{name}</div>)}
      {deck.main.map((entry) => <div key={entry.name}>{entry.count} {entry.name}</div>)}
    </div>
  ),
}));

vi.mock("../DeckList", () => ({
  DeckList: () => <div>Deck List</div>,
}));

vi.mock("../ManaCurve", () => ({
  ManaCurve: () => <div>Mana Curve</div>,
}));

vi.mock("../FormatFilter", () => ({
  FormatFilter: () => <div>Format Filter</div>,
}));

vi.mock("../CommanderPanel", () => ({
  CommanderPanel: () => <div>Commander Panel</div>,
}));

describe("DeckBuilder", () => {
  afterEach(() => {
    cleanup();
    cacheCardsMock.mockClear();
    vi.mocked(loadPreconDeckMap).mockReset();
  });

  it("loads virtual precons into the editor without requiring saved storage", async () => {
    vi.mocked(loadPreconDeckMap).mockResolvedValue({
      secrets: {
        code: "SOS",
        name: "Secrets of Strixhaven",
        type: "Commander",
        coveragePct: 100,
        mainBoard: [{ name: "Island", count: 99 }],
        sideBoard: [],
        commander: [{ name: "Zimone, Mystery Unraveler", count: 1 }],
      },
    });

    render(
      <DeckBuilder
        format="Commander"
        onFormatChange={vi.fn()}
        initialDeckName="[Pre-built] Secrets of Strixhaven (SOS)"
        searchFilters={{ text: "", colors: [], type: "", sets: [], browseFormat: "all" }}
        onSearchFiltersChange={vi.fn()}
        onResetSearch={vi.fn()}
      />,
    );

    expect(await screen.findByText("99 Island")).toBeInTheDocument();
    expect(screen.getByText("Zimone, Mystery Unraveler")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show Browser" })).toBeInTheDocument();
  });
});
