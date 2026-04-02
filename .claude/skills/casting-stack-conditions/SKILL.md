---
name: casting-stack-conditions
description: Use when modifying the casting flow, stack resolution, condition systems, WaitingFor/GameAction state machine, or adding optional costs, new casting steps, or conditional ability resolution.
---

# Casting, Stack & Condition Systems

> **Hard rules — casting, stack, and priority are the most rules-dense areas of MTG (see CLAUDE.md § Design Principles):**
> 1. **CR-correctness is non-negotiable.** Casting (CR 601), activated abilities (CR 602), triggered abilities (CR 603), static abilities (CR 604), mana abilities (CR 605), stack resolution (CR 608), and priority (CR 117) are precisely specified. Every implementation must be verified against the relevant CR section and annotated. If you cannot cite the CR that governs a behavior, you have not validated it.
> 2. **Build for the class, not the card.** Payment helpers (`pay_mana_cost`, `pay_ability_cost`), targeting, and condition checks are shared building blocks used by every spell and ability. Changes here must work for the entire class — never special-case a single card's casting behavior.
> 3. **Test the exact rules behavior.** Every new WaitingFor state, casting step, or condition check needs tests that verify the CR-specified behavior, including edge cases (e.g., fizzle on illegal targets, intervening-if re-check at resolution). Test the building block, not one card's interaction.

Reference for the spell casting pipeline, stack resolution, sub_ability chaining, and all condition systems. Use this to understand how spells go from hand → stack → resolution, and where to extend for new casting features.

**Before you start:** Trace `Ward` for a casting-time interaction, or `TriggerCondition::LifeGainedThisTurn` for a condition that's checked at both trigger and resolution time.

---

## Casting Flow — `crates/engine/src/game/casting.rs`

Entry point: `handle_cast_spell(state, player, card_id, events)`

```
CastSpell action
  │
  ▼
1. Find card in hand (or command zone for Commander)
  │
  ▼
2. Get ability: obj.abilities[0].clone()
   (vanilla permanents get placeholder Unimplemented)
   NOTE: Modal spells (obj.modal.is_some()) skip to step 2b
  │
  ▼
2b. Modal detection → WaitingFor::ModeChoice
   Player selects modes → handle_select_modes() builds chained ResolvedAbility
   → proceeds to targeting (walks sub_ability chain for first target filter)
  │
  ▼
3. Casting prohibition checks (prepare_spell_cast)
   ├─ Zone castability (hand, command, exile w/ permission, graveyard w/ escape/permission)
   ├─ CantCastFrom statics (Grafdigger's Cage) — is_blocked_from_casting_from_zone()
   ├─ CantCastDuring statics (Teferi) — is_blocked_by_cant_cast_during()
   ├─ PerTurnCastLimit statics (Rule of Law) — is_blocked_by_per_turn_cast_limit()
   │  └─ Uses CastingProhibitionScope (Controller/Opponents/AllPlayers) + optional spell_filter
   └─ Temporary zone restrictions — is_blocked_by_cast_only_from_zones()
  │
  ▼
4. Validate timing
   ├─ Instant / Flash → anytime
   └─ Sorcery-speed → main phase + empty stack + active player
  │
  ▼
5. Commander color identity check (Commander only)
  │
  ▼
6. Calculate mana cost (base + commander tax if from command zone)
  │
  ▼
7. Build ResolvedAbility from AbilityDefinition
   └─ Recursively converts sub_ability chain via build_resolved_from_def()
  │
  ▼
8. Handle targeting
   ├─ Auras: extract Enchant keyword filter
   └─ Others: extract_target_filter_from_effect()
       ├─ 0 legal targets → error
       ├─ 1 legal target → auto-assign, proceed
       └─ >1 → WaitingFor::TargetSelection
  │
  ▼
9. pay_and_push()
   ├─ X in cost → WaitingFor::ManaPayment
   ├─ pay_mana_cost() — shared mana payment building block (see below)
   ├─ Move card to Zone::Stack
   ├─ Record commander cast if applicable
   └─ stack::push_to_stack() creates StackEntry
  │
  ▼
10. Return WaitingFor::Priority
```

Key functions: `handle_cast_spell()`, `pay_and_push()`, `pay_mana_cost()`, `pay_ability_cost()`, `handle_activate_ability()`, `handle_select_targets()`, `handle_cancel_cast()`, `build_resolved_from_def()`

---

## Activated Ability Cost Payment — Building Blocks

Three composable helpers handle all ability cost payment:

### `pay_mana_cost(state, player, source_id, cost, events)`
Shared mana payment pipeline: `SpellMeta` → `auto_tap_lands()` → `can_pay_for_spell()` → `pay_cost_with_demand()`. Used by both `pay_and_push()` (spell casting) and `pay_ability_cost()` (activated abilities).

### `pay_ability_cost(state, player, source_id, cost, events)`
Dispatches over `AbilityCost` enum:
- `Tap` → validates untapped, taps, emits `PermanentTapped`
- `Mana { cost }` → delegates to `pay_mana_cost()`
- `Composite { costs }` → recursively pays each sub-cost (handles `{T}, {2}: ...` patterns)
- Other variants (Sacrifice, PayLife, etc.) → pass-through (interactive resolution not yet implemented)

### `requires_untapped(cost) -> bool`
Checks if a cost contains a `Tap` component (direct or within `Composite`). Used for pre-validation before presenting modal choices — fails fast before the player sees a mode selection dialog.

### Activated Ability Flow — `handle_activate_ability()`

```
ActivateAbility action
  │
  ▼
1. Validate: on battlefield, controller matches, ability_index valid
  │
  ▼
2. Modal? → pre-validate via requires_untapped() → WaitingFor::AbilityModeChoice
  │
  ▼
3. pay_ability_cost() — handles Tap, Mana, Composite
  │
  ▼
4. Build ResolvedAbility
  │
  ▼
5. Handle targeting (same as spell casting)
  │
  ▼
6. Push StackEntry(ActivatedAbility) → WaitingFor::Priority
```

### Mana Abilities During Priority — `engine/src/ai_support/candidates.rs`

Legal action generation (including priority actions) now lives in the engine crate at `engine::ai_support`. The entry point is `legal_actions(state)` → `candidate_actions()`. It generates both:
- `ActivateAbility` — for non-mana activated abilities
- `TapLandForMana` — for untapped lands with mana options (MTG CR 605)

This enables the frontend choice modal when a permanent has both mana and non-mana abilities (e.g., Soulstone Sanctuary: `{T}: Add {C}` vs `{4}: animate`).

---

## Stack Model

### PendingCast — `crates/engine/src/types/game_state.rs`

```rust
pub struct PendingCast {
    pub object_id: ObjectId,
    pub card_id: CardId,
    pub ability: ResolvedAbility,
    pub cost: ManaCost,
}
```

Holds state between targeting and payment steps during casting.

### StackEntry — `crates/engine/src/types/game_state.rs`

```rust
pub struct StackEntry {
    pub id: ObjectId,
    pub source_id: ObjectId,
    pub controller: PlayerId,
    pub kind: StackEntryKind,
}

pub enum StackEntryKind {
    Spell { card_id: CardId, ability: ResolvedAbility },
    ActivatedAbility { source_id: ObjectId, ability: ResolvedAbility },
    TriggeredAbility {
        source_id: ObjectId,
        ability: ResolvedAbility,
        condition: Option<TriggerCondition>,  // intervening-if
    },
}
```

**Note:** Only `TriggeredAbility` carries a `condition` today. Spells and activated abilities have no condition field.

### Stack Resolution — `crates/engine/src/game/stack.rs::resolve_top()`

1. Pop top entry from stack
2. **Intervening-if:** If `TriggeredAbility` with `condition`, call `check_trigger_condition()` — if fails, fizzle
3. Extract `ResolvedAbility` from entry kind
4. **Fizzle check:** If targets exist, validate them; all illegal → fizzle (move to graveyard)
5. Execute: `effects::resolve_ability_chain(state, ability, events, 0)`
6. Post-resolution: move spell to graveyard (or battlefield for permanents)

---

## Sub-Ability Chain Resolution — `crates/engine/src/game/effects/mod.rs`

`resolve_ability_chain(state, ability, events, depth)`:

1. **Safety:** `depth > 20` → `ChainTooDeep` error
2. **Resolve current:** `resolve_effect(state, ability, events)` unless `Unimplemented`
3. **Process sub_ability (if present):**
   - If state entered interactive `WaitingFor` (Scry/Dig/Surveil/Reveal/Search) → save sub_ability as `state.pending_continuation`, return
   - Otherwise → propagate parent targets to sub if sub has none → recurse

**Target propagation:** Parent targets flow to sub_abilities automatically. "Exile target creature. Its controller gains life" → sub_ability receives creature target from parent `ChangeZone`.

**Continuation pattern:** For interactive effects, `state.pending_continuation` holds the remaining chain. When player responds, `engine.rs::apply()` picks up the continuation.

---

## Condition Systems

Three existing condition types, each for a different ability category:

| System | Enum | Used by | Check location |
|--------|------|---------|---------------|
| **TriggerCondition** (`types/ability.rs`) | `LifeGainedThisTurn { minimum }` | `StackEntryKind::TriggeredAbility { condition }` | Trigger discovery AND resolution (intervening-if) |
| **ReplacementCondition** | `UnlessControlsSubtype { subtypes }` | Replacement effects | Replacement applicability check |
| **StaticCondition** | `DevotionGE`, `IsPresent`, `DuringYourTurn`, etc. | Static abilities | Layers system evaluation |

### ReplacementMode (optional replacements)

```rust
pub enum ReplacementMode {
    Mandatory,
    Optional { decline: Option<Box<AbilityDefinition>> },
}
```

Used for "you may" on replacement effects.

---

## WaitingFor / GameAction State Machine

Casting-relevant states:

| WaitingFor | Triggered by | Responded with |
|------------|-------------|---------------|
| `Priority { player }` | Normal priority | `CastSpell`, `ActivateAbility`, `TapLandForMana`, `PassPriority` |
| `TargetSelection { player, pending_cast, legal_targets }` | Multiple legal targets during cast | `SelectTargets { targets }` |
| `ModeChoice { player, modal, pending_cast }` | Modal spell ("Choose one —") detected via `obj.modal` | `SelectModes { indices }` |
| `ManaPayment { player }` | X in mana cost | Mana declaration |

The public reducer entry point remains `engine.rs::apply()`, but casting/stack state-machine ownership is now split across helper families:

- `engine.rs` — top-level `(WaitingFor, GameAction)` routing facade
- `engine_casting.rs` — cast/target/continuation reducer helpers
- `engine_stack.rs` — trigger-target and stack-entry continuation helpers
- `engine_modes.rs` — `AbilityModeChoice` routing for activated and triggered modal abilities
- `engine_payment_choices.rs` — optional-effect, opponent-may, unless-payment, and ward-payment reducer helpers
- `engine_replacement.rs` — replacement-choice execution, post-replacement side effects, and copy-target follow-up
- `engine_resolution_choices.rs` — resolution-time interactive choice handlers that resume continuations or yield replacement choices
- `engine_priority.rs` — priority-pass and post-resolution resume helpers

### Adding a new WaitingFor state requires:

1. `types/game_state.rs` — `WaitingFor` variant + `GameAction` variant
2. `engine.rs::apply()` — Match arm for `(WaitingFor::New, GameAction::NewResponse)` pair, delegating into the appropriate helper family if the flow is extracted
3. `engine/src/ai_support/candidates.rs` — Generate legal responses for AI
4. `client/adapter/types.ts` — TypeScript discriminated union variant
5. Frontend component (if interactive choice needed)

---

## Modal System — Cast-Time vs Resolution-Time

### Cast-time modals (currently supported)

The existing modal system is **tightly coupled to spell casting**. The data flow:

```
CardFace.modal (parsed from "Choose one —" Oracle text)
  → GameObject.modal (copied at deck load)
  → casting::handle_cast_spell() detects obj.modal.is_some()
  → WaitingFor::ModeChoice { modal, pending_cast: Box<PendingCast> }
  → GameAction::SelectModes { indices }
  → casting::handle_select_modes() builds chained ResolvedAbility
  → build_chained_resolved(card.abilities, indices) — indexes card's abilities array
  → ResolvedAbility with nested sub_abilities pushed to stack
  → resolve_ability_chain() walks the chain at resolution
```

**Key coupling points:**
1. `ModalChoice` only lives on `CardFace` / `GameObject` — no per-ability modal metadata
2. `WaitingFor::ModeChoice` requires `Box<PendingCast>` — casting-specific state
3. `build_chained_resolved()` directly indexes `card.abilities[]` — modes = card abilities
4. `handle_select_modes()` routes back into the casting pipeline (`check_additional_cost_or_pay`)
5. Parser only generates `ModalChoice` for spell lines (oracle.rs:107), not triggered/activated abilities

**ModalChoice struct** (`types/ability.rs:1214`):
```rust
pub struct ModalChoice {
    pub min_choices: usize,
    pub max_choices: usize,
    pub mode_count: usize,
    pub mode_descriptions: Vec<String>,
}
```

**Mode selection algorithm** (`casting.rs:474`): `build_chained_resolved()` takes an `abilities: &[AbilityDefinition]` slice and `indices: &[usize]`. Builds from last to first, nesting each as `sub_ability` of the previous. The chaining logic itself is reusable — the coupling is in how the abilities slice is sourced (from `card.abilities`).

**AI mode handling** (`ai_support/candidates.rs`): Generates all valid combinations of k modes where `k ∈ [min_choices, max_choices]` using `index_combinations()`.

**Frontend** (`ModeChoiceModal.tsx`): Renders `mode_descriptions` as clickable buttons, tracks selected indices, enforces min/max constraints. Single-choice modals auto-submit on click.

### Resolution-time modals (now supported via `AbilityModeChoice`)

Activated and triggered modal abilities are no longer forced through `PendingCast`. The current path is:

```rust
AbilityDefinition.modal
  -> WaitingFor::AbilityModeChoice {
       player,
       modal,
       source_id,
       mode_abilities,
       is_activated,
       ability_index,
       ability_cost,
     }
  -> GameAction::SelectModes { indices }
  -> engine_modes::handle_ability_mode_choice() validates indices + target constraints
  -> build_chained_resolved(mode_abilities, indices)
  -> push to stack (activated) or replace pending trigger ability (triggered)
```

This is the correct extension point for permanent-based "Choose one/Choose one or more" abilities. Do not try to squeeze them through `WaitingFor::ModeChoice`.

### Target constraints on modal choices

Modal abilities can now carry cross-target rules such as `DifferentTargetPlayers`.

- `game/ability_utils.rs::target_constraints_from_modal()` derives them from `ModalChoice`
- `generate_modal_index_sequences()` is used to enumerate valid mode combinations
- `validate_selected_targets()` / `choose_target()` enforce them during selection
- Triggered modal abilities carry the same constraints through `TriggerTargetSelection`

---

## "You May" in Parser

Currently in `oracle_effect/mod.rs`, "you may" is stripped naively (pre-nom legacy):

```rust
if let Some((_, rest)) = nom_on_lower(text, lower, tag("you may ")) {
    return parse_effect(rest);
}
```

`ImperativeFamilyAst::YouMay` still reparses the inner text directly. Optionality is therefore still lost for generic "you may ..." imperative clauses unless another system models it explicitly (for example, replacement `Optional` mode or trigger `optional` handling). Do not assume bare `"you may"` effect text is semantically optional end-to-end.

---

## Common Pitfalls

| Pitfall | Consequence |
|---------|-------------|
| Data on `PendingCast` not propagated to `StackEntry` | Data lost after casting completes |
| New `WaitingFor` without an `engine.rs::apply()` routing arm | Game hangs — response never processed |
| New `WaitingFor` without AI candidate generation in `ai_support/` | AI hangs on the choice |
| New field on `StackEntry` without `#[serde(default)]` | Deserialization breaks for in-progress games |
| Condition check only at resolution, not at trigger time | Violates MTG intervening-if rules (triggers only) |
| New interactive state without `pending_continuation` support | Sub_ability chain breaks when player choice interrupts resolution |
| Modifying `abilities[0]` selection in casting.rs | Changes which ability goes on stack for ALL spells |
| Modal spell/ability targeting ignores modal target constraints | Illegal same-player or same-object selections slip through | Derive constraints with `target_constraints_from_modal()` and validate them during selection |

---

## Verification

```bash
rg -q "fn handle_cast_spell" crates/engine/src/game/casting.rs && \
rg -q "fn pay_and_push" crates/engine/src/game/casting.rs && \
rg -q "fn pay_mana_cost" crates/engine/src/game/casting.rs && \
rg -q "fn pay_ability_cost" crates/engine/src/game/casting.rs && \
rg -q "fn requires_untapped" crates/engine/src/game/casting.rs && \
rg -q "fn handle_ability_mode_choice" crates/engine/src/game/engine_modes.rs && \
test -f crates/engine/src/game/engine_casting.rs && \
test -f crates/engine/src/game/engine_resolution_choices.rs && \
test -f crates/engine/src/game/engine_payment_choices.rs && \
test -f crates/engine/src/game/engine_replacement.rs && \
test -f crates/engine/src/game/engine_stack.rs && \
rg -q "fn resolve_top" crates/engine/src/game/stack.rs && \
rg -q "fn resolve_ability_chain" crates/engine/src/game/effects/mod.rs && \
rg -q "struct PendingCast" crates/engine/src/types/game_state.rs && \
rg -q "struct StackEntry" crates/engine/src/types/game_state.rs && \
rg -q "enum StackEntryKind" crates/engine/src/types/game_state.rs && \
rg -q "enum TriggerCondition" crates/engine/src/types/ability.rs && \
rg -q "enum WaitingFor" crates/engine/src/types/game_state.rs && \
echo "✓ casting-stack-conditions skill references valid" || \
echo "✗ STALE — update skill references"
```
