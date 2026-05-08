import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GameState, WaitingFor } from "../../../adapter/types.ts";
import { useGameStore } from "../../../stores/gameStore.ts";
import { useMultiplayerStore } from "../../../stores/multiplayerStore.ts";
import { CardChoiceModal } from "../CardChoiceModal.tsx";

const dispatchMock = vi.fn();

vi.mock("../../../hooks/useGameDispatch.ts", () => ({
  useGameDispatch: () => dispatchMock,
}));

function makeState(waitingFor: WaitingFor): GameState {
  return {
    turn_number: 1,
    active_player: 0,
    phase: "PreCombatMain",
    players: [
      { id: 0, life: 20, poison_counters: 0, mana_pool: { mana: [] }, library: [], hand: [], graveyard: [], has_drawn_this_turn: false, lands_played_this_turn: 0, turns_taken: 0 },
      { id: 1, life: 20, poison_counters: 0, mana_pool: { mana: [] }, library: [], hand: [], graveyard: [], has_drawn_this_turn: false, lands_played_this_turn: 0, turns_taken: 0 },
    ],
    priority_player: 0,
    objects: {},
    next_object_id: 100,
    battlefield: [],
    stack: [],
    exile: [],
    rng_seed: 1,
    combat: null,
    waiting_for: waitingFor,
    has_pending_cast: true,
    lands_played_this_turn: 0,
    max_lands_per_turn: 1,
    priority_pass_count: 0,
    pending_replacement: null,
    layers_dirty: false,
    next_timestamp: 2,
    eliminated_players: [],
  } as unknown as GameState;
}

function setWaitingFor(waitingFor: WaitingFor) {
  const state = makeState(waitingFor);
  useGameStore.setState({
    gameMode: "online",
    gameState: state,
    waitingFor,
  });
}

describe("Discard cost modal", () => {
  beforeEach(() => {
    dispatchMock.mockClear();
    useMultiplayerStore.setState({ activePlayerId: 0 });
  });

  afterEach(() => {
    cleanup();
  });

  it("allows cancelling discard costs", () => {
    setWaitingFor({
      type: "DiscardForCost",
      data: {
        player: 0,
        count: 1,
        cards: [],
        pending_cast: {},
      },
    } as unknown as WaitingFor);

    render(<CardChoiceModal />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(dispatchMock).toHaveBeenCalledWith({ type: "CancelCast" });
  });

  it.each([
    [
      "SacrificeForCost",
      {
        player: 0,
        count: 1,
        permanents: [],
        pending_cast: {},
      },
    ],
    [
      "ReturnToHandForCost",
      {
        player: 0,
        count: 1,
        permanents: [],
        pending_cast: {},
      },
    ],
    [
      "BlightChoice",
      {
        player: 0,
        count: 1,
        creatures: [],
        pending_cast: {},
      },
    ],
    [
      "ExileForCost",
      {
        player: 0,
        zone: "Graveyard",
        count: 1,
        cards: [],
        pending_cast: {},
      },
    ],
    [
      "CollectEvidenceChoice",
      {
        player: 0,
        minimum_mana_value: 1,
        cards: [],
        resume: {},
      },
    ],
    [
      "HarmonizeTapChoice",
      {
        player: 0,
        eligible_creatures: [],
        pending_cast: {},
      },
    ],
  ])("allows cancelling %s", (type, data) => {
    setWaitingFor({ type, data } as unknown as WaitingFor);

    render(<CardChoiceModal />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(dispatchMock).toHaveBeenCalledWith({ type: "CancelCast" });
  });
});
