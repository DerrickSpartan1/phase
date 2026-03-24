use crate::types::ability::{
    ContinuousModification, Duration, EffectError, EffectKind, ResolvedAbility, TargetFilter,
    TargetRef,
};
use crate::types::events::GameEvent;
use crate::types::game_state::GameState;
use crate::types::zones::Zone;

/// CR 701.12a: Exchange control of two permanents. Both targets come from ability.targets
/// as two TargetRef::Object entries. If the entire exchange can't be completed, no part
/// of the exchange occurs (all-or-nothing).
///
/// CR 701.12b: If both permanents are controlled by the same player, the exchange
/// effect does nothing.
pub fn resolve(
    state: &mut GameState,
    ability: &ResolvedAbility,
    events: &mut Vec<GameEvent>,
) -> Result<(), EffectError> {
    // Extract exactly two object targets.
    let obj_targets: Vec<_> = ability
        .targets
        .iter()
        .filter_map(|t| {
            if let TargetRef::Object(id) = t {
                Some(*id)
            } else {
                None
            }
        })
        .collect();

    if obj_targets.len() < 2 {
        // CR 701.12a: Can't complete exchange — do nothing.
        events.push(GameEvent::EffectResolved {
            kind: EffectKind::ExchangeControl,
            source_id: ability.source_id,
        });
        return Ok(());
    }

    let id_a = obj_targets[0];
    let id_b = obj_targets[1];

    // CR 701.12a: Both objects must exist on the battlefield.
    let (controller_a, controller_b) = {
        let Some(obj_a) = state.objects.get(&id_a) else {
            events.push(GameEvent::EffectResolved {
                kind: EffectKind::ExchangeControl,
                source_id: ability.source_id,
            });
            return Ok(());
        };
        let Some(obj_b) = state.objects.get(&id_b) else {
            events.push(GameEvent::EffectResolved {
                kind: EffectKind::ExchangeControl,
                source_id: ability.source_id,
            });
            return Ok(());
        };
        if obj_a.zone != Zone::Battlefield || obj_b.zone != Zone::Battlefield {
            events.push(GameEvent::EffectResolved {
                kind: EffectKind::ExchangeControl,
                source_id: ability.source_id,
            });
            return Ok(());
        }
        (obj_a.controller, obj_b.controller)
    };

    // CR 701.12b: Same controller → no effect.
    if controller_a == controller_b {
        events.push(GameEvent::EffectResolved {
            kind: EffectKind::ExchangeControl,
            source_id: ability.source_id,
        });
        return Ok(());
    }

    // CR 701.12a: Bidirectional control exchange via two transient continuous effects.
    // Object A gets controller_b, object B gets controller_a.
    state.add_transient_continuous_effect(
        ability.source_id,
        controller_b,
        Duration::Permanent,
        TargetFilter::SpecificObject { id: id_a },
        vec![ContinuousModification::ChangeController],
        None,
    );
    state.add_transient_continuous_effect(
        ability.source_id,
        controller_a,
        Duration::Permanent,
        TargetFilter::SpecificObject { id: id_b },
        vec![ContinuousModification::ChangeController],
        None,
    );

    events.push(GameEvent::EffectResolved {
        kind: EffectKind::ExchangeControl,
        source_id: ability.source_id,
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game::zones::create_object;
    use crate::types::ability::{Effect, TargetRef};
    use crate::types::identifiers::{CardId, ObjectId};
    use crate::types::player::PlayerId;

    fn make_exchange_ability(target_a: ObjectId, target_b: ObjectId) -> ResolvedAbility {
        ResolvedAbility::new(
            Effect::ExchangeControl,
            vec![TargetRef::Object(target_a), TargetRef::Object(target_b)],
            ObjectId(100),
            PlayerId(0),
        )
    }

    #[test]
    fn exchange_control_swaps_controllers() {
        let mut state = GameState::new_two_player(42);
        let obj_a = create_object(
            &mut state,
            CardId(1),
            PlayerId(0),
            "Bear".to_string(),
            Zone::Battlefield,
        );
        let obj_b = create_object(
            &mut state,
            CardId(2),
            PlayerId(1),
            "Wolf".to_string(),
            Zone::Battlefield,
        );

        let ability = make_exchange_ability(obj_a, obj_b);
        let mut events = Vec::new();

        resolve(&mut state, &ability, &mut events).unwrap();

        // Should create two transient continuous effects (bidirectional ChangeController)
        assert_eq!(state.transient_continuous_effects.len(), 2);

        // First effect: Object A gets controller_b (PlayerId(1))
        let tce_a = state
            .transient_continuous_effects
            .iter()
            .find(|e| e.affected == TargetFilter::SpecificObject { id: obj_a })
            .expect("Should have effect for obj_a");
        assert_eq!(tce_a.controller, PlayerId(1));
        assert_eq!(
            tce_a.modifications,
            vec![ContinuousModification::ChangeController]
        );

        // Second effect: Object B gets controller_a (PlayerId(0))
        let tce_b = state
            .transient_continuous_effects
            .iter()
            .find(|e| e.affected == TargetFilter::SpecificObject { id: obj_b })
            .expect("Should have effect for obj_b");
        assert_eq!(tce_b.controller, PlayerId(0));
    }

    #[test]
    fn exchange_control_same_controller_is_noop() {
        let mut state = GameState::new_two_player(42);
        let obj_a = create_object(
            &mut state,
            CardId(1),
            PlayerId(0),
            "Bear".to_string(),
            Zone::Battlefield,
        );
        let obj_b = create_object(
            &mut state,
            CardId(2),
            PlayerId(0),
            "Wolf".to_string(),
            Zone::Battlefield,
        );

        let ability = make_exchange_ability(obj_a, obj_b);
        let mut events = Vec::new();

        // CR 701.12b: Same controller → do nothing.
        resolve(&mut state, &ability, &mut events).unwrap();
        assert!(
            state.transient_continuous_effects.is_empty(),
            "Should create no transient effects for same-controller exchange"
        );
    }

    #[test]
    fn exchange_control_missing_target_is_noop() {
        let mut state = GameState::new_two_player(42);
        let obj_a = create_object(
            &mut state,
            CardId(1),
            PlayerId(0),
            "Bear".to_string(),
            Zone::Battlefield,
        );

        // CR 701.12a: One target missing → all-or-nothing, do nothing.
        let ability = make_exchange_ability(obj_a, ObjectId(999));
        let mut events = Vec::new();

        resolve(&mut state, &ability, &mut events).unwrap();
        assert!(state.transient_continuous_effects.is_empty());
    }

    #[test]
    fn exchange_control_fewer_than_two_targets() {
        let mut state = GameState::new_two_player(42);
        let obj_a = create_object(
            &mut state,
            CardId(1),
            PlayerId(0),
            "Bear".to_string(),
            Zone::Battlefield,
        );

        // Only one target — can't complete exchange.
        let ability = ResolvedAbility::new(
            Effect::ExchangeControl,
            vec![TargetRef::Object(obj_a)],
            ObjectId(100),
            PlayerId(0),
        );
        let mut events = Vec::new();
        resolve(&mut state, &ability, &mut events).unwrap();
        assert!(state.transient_continuous_effects.is_empty());
    }
}
