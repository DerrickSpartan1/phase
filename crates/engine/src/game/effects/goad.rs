use crate::types::ability::{EffectError, EffectKind, ResolvedAbility, TargetRef};
use crate::types::events::GameEvent;
use crate::types::game_state::GameState;
use crate::types::zones::Zone;

/// CR 701.15a: Goad a creature — until the goading player's next turn, the creature
/// is goaded. It must attack each combat if able and must attack a player other than
/// the goading player if able (CR 701.15b).
///
/// CR 701.15c: A creature can be goaded by multiple players, creating additional
/// combat requirements.
///
/// CR 701.15d: The same player goading a creature again has no effect (HashSet
/// insert is idempotent).
pub fn resolve(
    state: &mut GameState,
    ability: &ResolvedAbility,
    events: &mut Vec<GameEvent>,
) -> Result<(), EffectError> {
    for target in &ability.targets {
        if let TargetRef::Object(obj_id) = target {
            let Some(obj) = state.objects.get_mut(obj_id) else {
                continue;
            };

            // CR 701.15a: Only goad creatures on the battlefield.
            if obj.zone != Zone::Battlefield {
                continue;
            }

            // CR 701.15a: Mark the creature as goaded by the controller of this effect.
            // CR 701.15d: Re-goading by the same player is a no-op (HashSet semantics).
            obj.goaded_by.insert(ability.controller);
        }
    }

    events.push(GameEvent::EffectResolved {
        kind: EffectKind::Goad,
        source_id: ability.source_id,
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game::zones::create_object;
    use crate::types::ability::{Effect, TargetFilter, TargetRef};
    use crate::types::identifiers::{CardId, ObjectId};
    use crate::types::player::PlayerId;

    fn make_goad_ability(target: ObjectId, controller: PlayerId) -> ResolvedAbility {
        ResolvedAbility::new(
            Effect::Goad {
                target: TargetFilter::Any,
            },
            vec![TargetRef::Object(target)],
            ObjectId(100),
            controller,
        )
    }

    #[test]
    fn goad_marks_creature_with_goading_player() {
        let mut state = GameState::new_two_player(42);
        let target_id = create_object(
            &mut state,
            CardId(1),
            PlayerId(1),
            "Bear".to_string(),
            Zone::Battlefield,
        );

        let ability = make_goad_ability(target_id, PlayerId(0));
        let mut events = Vec::new();

        resolve(&mut state, &ability, &mut events).unwrap();

        let obj = state.objects.get(&target_id).unwrap();
        assert!(obj.goaded_by.contains(&PlayerId(0)));
        assert_eq!(obj.goaded_by.len(), 1);
    }

    #[test]
    fn goad_same_player_twice_is_idempotent() {
        let mut state = GameState::new_two_player(42);
        let target_id = create_object(
            &mut state,
            CardId(1),
            PlayerId(1),
            "Bear".to_string(),
            Zone::Battlefield,
        );

        let ability = make_goad_ability(target_id, PlayerId(0));
        let mut events = Vec::new();

        // CR 701.15d: Same player goading again has no additional effect.
        resolve(&mut state, &ability, &mut events).unwrap();
        resolve(&mut state, &ability, &mut events).unwrap();

        let obj = state.objects.get(&target_id).unwrap();
        assert_eq!(obj.goaded_by.len(), 1);
    }

    #[test]
    fn goad_multiple_players() {
        let mut state = GameState::new_two_player(42);
        let target_id = create_object(
            &mut state,
            CardId(1),
            PlayerId(1),
            "Bear".to_string(),
            Zone::Battlefield,
        );

        let mut events = Vec::new();
        // CR 701.15c: Goaded by two different players.
        resolve(
            &mut state,
            &make_goad_ability(target_id, PlayerId(0)),
            &mut events,
        )
        .unwrap();
        resolve(
            &mut state,
            &make_goad_ability(target_id, PlayerId(1)),
            &mut events,
        )
        .unwrap();

        let obj = state.objects.get(&target_id).unwrap();
        assert!(obj.goaded_by.contains(&PlayerId(0)));
        assert!(obj.goaded_by.contains(&PlayerId(1)));
        assert_eq!(obj.goaded_by.len(), 2);
    }

    #[test]
    fn goad_nonexistent_target_is_skipped() {
        let mut state = GameState::new_two_player(42);
        let ability = make_goad_ability(ObjectId(999), PlayerId(0));
        let mut events = Vec::new();

        // Should succeed (no-op for missing targets, not an error).
        let result = resolve(&mut state, &ability, &mut events);
        assert!(result.is_ok());
    }

    #[test]
    fn goad_emits_effect_resolved() {
        let mut state = GameState::new_two_player(42);
        let target_id = create_object(
            &mut state,
            CardId(1),
            PlayerId(1),
            "Bear".to_string(),
            Zone::Battlefield,
        );

        let ability = make_goad_ability(target_id, PlayerId(0));
        let mut events = Vec::new();
        resolve(&mut state, &ability, &mut events).unwrap();

        assert!(events.iter().any(|e| matches!(
            e,
            GameEvent::EffectResolved {
                kind: EffectKind::Goad,
                ..
            }
        )));
    }
}
