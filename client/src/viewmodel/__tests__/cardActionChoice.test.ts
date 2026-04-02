import { describe, expect, it } from "vitest";

import type { GameAction, GameObject } from "../../adapter/types.ts";
import { collectObjectActions } from "../cardActionChoice.ts";
import { abilityChoiceLabel } from "../costLabel.ts";

function makeGameObject(overrides: Partial<GameObject> = {}): GameObject {
  return {
    id: 1,
    card_id: 100,
    owner: 0,
    controller: 0,
    zone: "Hand",
    tapped: false,
    face_down: false,
    flipped: false,
    transformed: false,
    damage_marked: 0,
    dealt_deathtouch_damage: false,
    attached_to: null,
    attachments: [],
    counters: {},
    name: "Bala Ged Recovery",
    power: null,
    toughness: null,
    loyalty: null,
    card_types: { supertypes: [], core_types: ["Sorcery"], subtypes: [] },
    mana_cost: { type: "Cost", shards: ["Green"], generic: 2 },
    keywords: [],
    abilities: [],
    trigger_definitions: [],
    replacement_definitions: [],
    static_definitions: [],
    color: ["Green"],
    base_power: null,
    base_toughness: null,
    base_keywords: [],
    base_color: ["Green"],
    timestamp: 1,
    entered_battlefield_turn: null,
    back_face: {
      name: "Bala Ged Sanctuary",
      power: null,
      toughness: null,
      card_types: { supertypes: [], core_types: ["Land"], subtypes: [] },
      mana_cost: { type: "NoCost" },
      keywords: [],
      abilities: [],
      color: [],
    },
    ...overrides,
  };
}

describe("collectObjectActions", () => {
  it("keeps both play-land and cast-spell actions for the same object", () => {
    const actions: GameAction[] = [
      { type: "PlayLand", data: { object_id: 1, card_id: 100 } },
      { type: "CastSpell", data: { object_id: 1, card_id: 100, targets: [] } },
      { type: "ActivateAbility", data: { source_id: 1, ability_index: 0 } },
      { type: "CastSpell", data: { object_id: 2, card_id: 200, targets: [] } },
    ];

    expect(collectObjectActions(actions, 1)).toEqual(actions.slice(0, 3));
  });
});

describe("abilityChoiceLabel", () => {
  it("labels the spell face cast action with the front-face name", () => {
    const object = makeGameObject();

    expect(
      abilityChoiceLabel(
        { type: "CastSpell", data: { object_id: 1, card_id: 100, targets: [] } },
        object,
      ),
    ).toEqual({ label: "Cast Bala Ged Recovery" });
  });

  it("labels the land play action with the land face name for spell-land MDFCs", () => {
    const object = makeGameObject();

    expect(
      abilityChoiceLabel(
        { type: "PlayLand", data: { object_id: 1, card_id: 100 } },
        object,
      ),
    ).toEqual({
      label: "Play Bala Ged Sanctuary",
      description: "Play this card as a land",
    });
  });
});
