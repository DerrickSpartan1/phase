//! Single authority for iterating "ability definitions that function right now."
//!
//! Statics, triggers, and replacements each live on `GameObject`s, but they
//! are gated by different CR rules. Every read site that previously
//! iterated `obj.static_definitions` / `obj.trigger_definitions` /
//! `obj.replacement_definitions` directly has to apply these gates itself,
//! which has been a recurring source of bugs. This module centralizes the
//! gating so callers cannot silently drop:
//!
//! - **CR 702.26b** — phased-out permanents' abilities don't function.
//! - **CR 114.4** — objects in the command zone don't function unless they
//!   are emblems.
//! - **CR 604.1 / CR 613.1** — a static ability only applies while its
//!   `condition` evaluates true (continuous re-evaluation).
//!
//! # Zone scope asymmetry
//!
//! - **Statics / triggers**: gated to the battlefield by the caller's choice
//!   of iteration (`battlefield_active_*`). Command-zone emblems pass the
//!   phased-out/command-zone gate for per-object iteration.
//! - **Replacements**: NOT battlefield-scoped. CR 903.9 commander-zone
//!   replacement functions from graveyard / exile; Leyline-class
//!   replacements function from hand. Each `ReplacementDefinition`'s
//!   metadata governs its zone-of-function, so `active_replacements`
//!   scans every object and only applies the phased-out/command-zone
//!   gate shared with statics and triggers.
//!
//! # Condition filtering
//!
//! Only `active_static_definitions` filters by `condition`
//! (CR 604.1 / CR 613.1 — statics are evaluated continuously). Trigger
//! intervening-if (CR 603.4) is a two-point check at trigger placement and
//! resolution, and replacement-effect conditions (CR 616) are evaluated at
//! event time. Both of those checks stay at their existing pipeline
//! checkpoints, so these helpers deliberately do NOT filter triggers or
//! replacements by their own `condition` fields.

use crate::game::game_object::GameObject;
use crate::game::layers::evaluate_condition;
use crate::types::ability::{ReplacementDefinition, StaticDefinition, TriggerDefinition};
use crate::types::game_state::GameState;
use crate::types::statics::StaticMode;
use crate::types::zones::Zone;

/// CR 702.26b + CR 114.4: Shared "does this object function at all?" gate.
///
/// CR 702.26b: Phased-out permanents' abilities don't function.
/// CR 114.4: In the command zone, only emblems' abilities function.
fn object_functions(obj: &GameObject) -> bool {
    if obj.is_phased_out() {
        return false;
    }
    if obj.zone == Zone::Command && !obj.is_emblem {
        return false;
    }
    true
}

/// Iterate `StaticDefinition`s on `obj` that are currently functioning, with
/// the CR 702.26b / CR 114.4 gate and the per-static CR 604.1 / CR 613.1
/// `condition` gate applied.
///
/// This is the authoritative replacement for `obj.static_definitions.iter()`
/// at every read site in the engine.
pub fn active_static_definitions<'a>(
    state: &'a GameState,
    obj: &'a GameObject,
) -> Box<dyn Iterator<Item = &'a StaticDefinition> + 'a> {
    if !object_functions(obj) {
        return Box::new(std::iter::empty());
    }
    let source_id = obj.id;
    let controller = obj.controller;
    // CR 604.1 / CR 613.1: a static's `condition` must hold for the effect
    // to apply continuously — re-evaluated every time the layers pipeline
    // (or any reader of statics) runs.
    Box::new(obj.static_definitions.iter().filter(move |def| {
        def.condition
            .as_ref()
            .is_none_or(|cond| evaluate_condition(state, cond, controller, source_id))
    }))
}

/// Whole-battlefield iteration of `(source_obj, static_def)` pairs with the
/// full CR gate stack applied. Equivalent to flat-mapping
/// `active_static_definitions` over every battlefield object.
pub fn battlefield_active_statics(
    state: &GameState,
) -> impl Iterator<Item = (&GameObject, &StaticDefinition)> {
    state
        .battlefield
        .iter()
        .filter_map(move |id| state.objects.get(id))
        .flat_map(move |obj| active_static_definitions(state, obj).map(move |def| (obj, def)))
}

/// Battlefield iteration specialised to a particular `StaticMode` shape.
///
/// `extract` pulls the typed payload out of `StaticMode` (replacing the
/// `let StaticMode::X { .. } = &def.mode else { continue };` boilerplate at
/// call sites). Only definitions whose mode matches are yielded, and all CR
/// gating from `active_static_definitions` is applied.
pub fn battlefield_statics_matching<'a, T: 'a>(
    state: &'a GameState,
    extract: fn(&'a StaticMode) -> Option<&'a T>,
) -> impl Iterator<Item = (&'a GameObject, &'a StaticDefinition, &'a T)> {
    battlefield_active_statics(state)
        .filter_map(move |(obj, def)| extract(&def.mode).map(|payload| (obj, def, payload)))
}

/// Iterate `TriggerDefinition`s on `obj` with the CR 702.26b / CR 114.4
/// gate applied. Yields `(index, def)` pairs; the index is stable against
/// `obj.trigger_definitions` so callers that need to reference a specific
/// trigger (e.g. `TriggerId { object, index }`) can recover it.
///
/// CR 603.4 intervening-if is deliberately NOT filtered here — it is a
/// two-point check (at placement and at resolution) handled by the trigger
/// pipeline. Helper consumers still need that check at those checkpoints.
pub fn active_trigger_definitions<'a>(
    _state: &'a GameState,
    obj: &'a GameObject,
) -> Box<dyn Iterator<Item = (usize, &'a TriggerDefinition)> + 'a> {
    if !object_functions(obj) {
        return Box::new(std::iter::empty());
    }
    Box::new(obj.trigger_definitions.iter().enumerate())
}

/// Whole-battlefield iteration of `(index, source_obj, trigger_def)`
/// triples. The index is stable against the source object's
/// `trigger_definitions` so callers can round-trip to a `TriggerId`.
pub fn battlefield_active_triggers(
    state: &GameState,
) -> impl Iterator<Item = (usize, &GameObject, &TriggerDefinition)> {
    state
        .battlefield
        .iter()
        .filter_map(move |id| state.objects.get(id))
        .flat_map(move |obj| {
            active_trigger_definitions(state, obj).map(move |(idx, def)| (idx, obj, def))
        })
}

/// All-zones iteration of `(index, source_obj, replacement_def)` triples
/// with the CR 702.26b / CR 114.4 gate applied.
///
/// This is NOT battlefield-scoped on purpose:
/// - **CR 903.9**: commander-zone replacement functions while the
///   commander is in graveyard / exile.
/// - Leyline-class replacements function from the hand.
///
/// Each `ReplacementDefinition`'s own `destination_zone` / `valid_card`
/// metadata governs where it matches events; this helper only enforces
/// the shared phased-out / command-zone gate. CR 616 event-time
/// evaluation remains in the replacement pipeline itself.
pub fn active_replacements(
    state: &GameState,
) -> impl Iterator<Item = (usize, &GameObject, &ReplacementDefinition)> {
    state.objects.values().flat_map(move |obj| {
        // Phased-out / command-zone gate still applies even though
        // replacements are not battlefield-scoped.
        let functioning = object_functions(obj);
        obj.replacement_definitions
            .iter()
            .enumerate()
            .filter(move |_| functioning)
            .map(move |(idx, def)| (idx, obj, def))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ability::{
        ReplacementDefinition, StaticCondition, StaticDefinition, TriggerDefinition,
    };
    use crate::types::format::FormatConfig;
    use crate::types::game_state::GameState;
    use crate::types::identifiers::{CardId, ObjectId};
    use crate::types::player::PlayerId;
    use crate::types::replacements::ReplacementEvent;
    use crate::types::statics::StaticMode;
    use crate::types::triggers::TriggerMode;

    fn new_state() -> GameState {
        GameState::new(FormatConfig::standard(), 2, 0)
    }

    fn put_on_battlefield(state: &mut GameState, obj: GameObject) -> ObjectId {
        let id = obj.id;
        state.objects.insert(id, obj);
        state.battlefield.push(id);
        id
    }

    fn make_obj(id: u64, zone: Zone) -> GameObject {
        GameObject::new(
            ObjectId(id),
            CardId(id),
            PlayerId(0),
            format!("TestObj{id}"),
            zone,
        )
    }

    #[test]
    fn phased_out_object_returns_no_active_statics() {
        let state = new_state();
        let mut obj = make_obj(1, Zone::Battlefield);
        obj.static_definitions = vec![StaticDefinition::new(StaticMode::Continuous)];
        obj.phase_status = crate::game::game_object::PhaseStatus::PhasedOut {
            cause: crate::game::game_object::PhaseOutCause::Directly,
        };
        assert_eq!(active_static_definitions(&state, &obj).count(), 0);
    }

    #[test]
    fn phased_out_object_returns_no_active_triggers() {
        let state = new_state();
        let mut obj = make_obj(1, Zone::Battlefield);
        obj.trigger_definitions = vec![TriggerDefinition::new(TriggerMode::ChangesZone)];
        obj.phase_status = crate::game::game_object::PhaseStatus::PhasedOut {
            cause: crate::game::game_object::PhaseOutCause::Directly,
        };
        assert_eq!(active_trigger_definitions(&state, &obj).count(), 0);
    }

    #[test]
    fn phased_out_object_returns_no_active_replacements() {
        let mut state = new_state();
        let mut obj = make_obj(1, Zone::Battlefield);
        obj.replacement_definitions =
            vec![ReplacementDefinition::new(ReplacementEvent::DamageDone)];
        obj.phase_status = crate::game::game_object::PhaseStatus::PhasedOut {
            cause: crate::game::game_object::PhaseOutCause::Directly,
        };
        put_on_battlefield(&mut state, obj);
        assert_eq!(active_replacements(&state).count(), 0);
    }

    #[test]
    fn command_zone_non_emblem_returns_no_active_statics() {
        let state = new_state();
        let mut obj = make_obj(1, Zone::Command);
        obj.is_emblem = false;
        obj.static_definitions = vec![StaticDefinition::new(StaticMode::Continuous)];
        assert_eq!(active_static_definitions(&state, &obj).count(), 0);
    }

    #[test]
    fn command_zone_emblem_returns_active_statics() {
        let state = new_state();
        let mut obj = make_obj(1, Zone::Command);
        obj.is_emblem = true;
        obj.static_definitions = vec![StaticDefinition::new(StaticMode::Continuous)];
        assert_eq!(active_static_definitions(&state, &obj).count(), 1);
    }

    #[test]
    fn condition_false_static_is_filtered() {
        // IsMonarch evaluates false when state.monarch is None (default).
        let state = new_state();
        assert!(state.monarch.is_none());
        let mut obj = make_obj(1, Zone::Battlefield);
        obj.static_definitions = vec![
            StaticDefinition::new(StaticMode::Continuous).condition(StaticCondition::IsMonarch)
        ];
        assert_eq!(active_static_definitions(&state, &obj).count(), 0);
    }

    #[test]
    fn condition_true_static_is_yielded() {
        let mut state = new_state();
        state.monarch = Some(PlayerId(0));
        let mut obj = make_obj(1, Zone::Battlefield);
        obj.static_definitions = vec![
            StaticDefinition::new(StaticMode::Continuous).condition(StaticCondition::IsMonarch)
        ];
        assert_eq!(active_static_definitions(&state, &obj).count(), 1);
    }

    #[test]
    fn trigger_with_false_condition_is_not_filtered_by_helper() {
        // CR 603.4 intervening-if is checked at placement/resolution, NOT
        // at iteration. The helper must yield the trigger regardless of its
        // `condition` field so the pipeline can decide.
        let state = new_state();
        let mut obj = make_obj(1, Zone::Battlefield);
        let trig = TriggerDefinition {
            condition: Some(crate::types::ability::TriggerCondition::IsMonarch),
            ..TriggerDefinition::new(TriggerMode::ChangesZone)
        };
        obj.trigger_definitions = vec![trig];
        // Helper yields it despite controller not being monarch.
        assert_eq!(active_trigger_definitions(&state, &obj).count(), 1);
    }

    #[test]
    fn replacement_with_condition_is_not_filtered_by_helper() {
        // CR 616 event-time evaluation of replacement `condition` stays in
        // the replacement pipeline; this helper does not filter on it.
        let mut state = new_state();
        let mut obj = make_obj(1, Zone::Battlefield);
        let repl = ReplacementDefinition {
            condition: Some(crate::types::ability::ReplacementCondition::UnlessMultipleOpponents),
            ..ReplacementDefinition::new(ReplacementEvent::DamageDone)
        };
        obj.replacement_definitions = vec![repl];
        put_on_battlefield(&mut state, obj);
        assert_eq!(active_replacements(&state).count(), 1);
    }

    #[test]
    fn battlefield_active_statics_scans_all_battlefield_objects_with_gating() {
        let mut state = new_state();
        let mut a = make_obj(1, Zone::Battlefield);
        a.static_definitions = vec![StaticDefinition::new(StaticMode::Continuous)];
        let mut b = make_obj(2, Zone::Battlefield);
        b.static_definitions = vec![StaticDefinition::new(StaticMode::Continuous)];
        b.phase_status = crate::game::game_object::PhaseStatus::PhasedOut {
            cause: crate::game::game_object::PhaseOutCause::Directly,
        };
        let mut c = make_obj(3, Zone::Battlefield);
        c.static_definitions = vec![StaticDefinition::new(StaticMode::Continuous)];
        put_on_battlefield(&mut state, a);
        put_on_battlefield(&mut state, b);
        put_on_battlefield(&mut state, c);
        let pairs: Vec<_> = battlefield_active_statics(&state).collect();
        assert_eq!(pairs.len(), 2);
        let ids: Vec<u64> = pairs.iter().map(|(obj, _)| obj.id.0).collect();
        assert!(ids.contains(&1));
        assert!(ids.contains(&3));
        assert!(!ids.contains(&2));
    }

    #[test]
    fn active_replacements_includes_graveyard_and_exile_objects() {
        // CR 903.9: commander-zone / graveyard / exile replacements must be
        // visible to the iterator — replacements are not battlefield-scoped.
        let mut state = new_state();
        let mut gy = make_obj(1, Zone::Graveyard);
        gy.replacement_definitions = vec![ReplacementDefinition::new(ReplacementEvent::DamageDone)];
        let mut ex = make_obj(2, Zone::Exile);
        ex.replacement_definitions = vec![ReplacementDefinition::new(ReplacementEvent::DamageDone)];
        state.objects.insert(gy.id, gy);
        state.objects.insert(ex.id, ex);
        let ids: Vec<u64> = active_replacements(&state)
            .map(|(_, obj, _)| obj.id.0)
            .collect();
        assert!(ids.contains(&1));
        assert!(ids.contains(&2));
    }
}
