use crate::game::zones;
use crate::types::ability::{
    Effect, EffectError, EffectKind, LibraryPosition, ResolvedAbility, TargetRef,
};
use crate::types::events::GameEvent;
use crate::types::game_state::GameState;

/// CR 701.24g / CR 401.3: Place target card at a specific position in its owner's
/// library. Unlike ChangeZone { destination: Library } which auto-shuffles per
/// CR 401.3, this places at a specific position without shuffling.
pub fn resolve(
    state: &mut GameState,
    ability: &ResolvedAbility,
    events: &mut Vec<GameEvent>,
) -> Result<(), EffectError> {
    let position = match &ability.effect {
        Effect::PutAtLibraryPosition { position, .. } => position.clone(),
        _ => LibraryPosition::Top,
    };

    let object_id = ability
        .targets
        .iter()
        .find_map(|t| {
            if let TargetRef::Object(id) = t {
                Some(*id)
            } else {
                None
            }
        })
        .ok_or(EffectError::InvalidParam(
            "PutAtLibraryPosition requires a target".to_string(),
        ))?;

    let index = match position {
        // CR 701.24g: Top = index 0, Bottom = None (push to end),
        // NthFromTop = index n-1 ("second from the top" = index 1).
        LibraryPosition::Top => Some(0),
        LibraryPosition::Bottom => None,
        LibraryPosition::NthFromTop { n } => Some(n.saturating_sub(1) as usize),
    };
    zones::move_to_library_at_index(state, object_id, index, events);

    events.push(GameEvent::EffectResolved {
        kind: EffectKind::PutAtLibraryPosition,
        source_id: ability.source_id,
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game::zones::create_object;
    use crate::types::ability::{Effect, ResolvedAbility, TargetFilter};
    use crate::types::identifiers::{CardId, ObjectId};
    use crate::types::player::PlayerId;
    use crate::types::zones::Zone;

    #[test]
    fn test_resolve_puts_card_on_top_of_library() {
        let mut state = GameState::new_two_player(42);
        // Create two cards in the library
        let _id1 = create_object(
            &mut state,
            CardId(1),
            PlayerId(0),
            "Card A".to_string(),
            Zone::Library,
        );
        let id2 = create_object(
            &mut state,
            CardId(2),
            PlayerId(0),
            "Card B".to_string(),
            Zone::Library,
        );

        // id2 is at the end of the library; put it on top
        let ability = ResolvedAbility::new(
            Effect::PutAtLibraryPosition {
                target: TargetFilter::Any,
                position: LibraryPosition::Top,
            },
            vec![TargetRef::Object(id2)],
            ObjectId(100),
            PlayerId(0),
        );

        let mut events = vec![];
        resolve(&mut state, &ability, &mut events).unwrap();

        // id2 should now be at library[0] (top)
        assert_eq!(state.players[0].library[0], id2);
        assert_eq!(state.objects[&id2].zone, Zone::Library);
    }

    #[test]
    fn test_resolve_does_not_shuffle_library() {
        let mut state = GameState::new_two_player(42);
        // Create three cards to verify order is preserved
        let id1 = create_object(
            &mut state,
            CardId(1),
            PlayerId(0),
            "Card A".to_string(),
            Zone::Library,
        );
        let id2 = create_object(
            &mut state,
            CardId(2),
            PlayerId(0),
            "Card B".to_string(),
            Zone::Library,
        );
        let id3 = create_object(
            &mut state,
            CardId(3),
            PlayerId(0),
            "Card C".to_string(),
            Zone::Library,
        );

        // Record order before: [id1, id2, id3]
        let lib = &state.players[0].library;
        let before_order: Vec<_> = lib.to_vec();
        assert_eq!(before_order, vec![id1, id2, id3]);

        // Put id2 on top
        let ability = ResolvedAbility::new(
            Effect::PutAtLibraryPosition {
                target: TargetFilter::Any,
                position: LibraryPosition::Top,
            },
            vec![TargetRef::Object(id2)],
            ObjectId(100),
            PlayerId(0),
        );

        let mut events = vec![];
        resolve(&mut state, &ability, &mut events).unwrap();

        // Expected: [id2, id1, id3] — id2 on top, rest preserved in order
        let lib = &state.players[0].library;
        let after_order: Vec<_> = lib.to_vec();
        assert_eq!(after_order, vec![id2, id1, id3]);
    }

    #[test]
    fn test_resolve_puts_card_on_bottom() {
        let mut state = GameState::new_two_player(42);
        let id1 = create_object(
            &mut state,
            CardId(1),
            PlayerId(0),
            "Card A".to_string(),
            Zone::Library,
        );
        let id2 = create_object(
            &mut state,
            CardId(2),
            PlayerId(0),
            "Card B".to_string(),
            Zone::Library,
        );
        // Put id1 on bottom
        let ability = ResolvedAbility::new(
            Effect::PutAtLibraryPosition {
                target: TargetFilter::Any,
                position: LibraryPosition::Bottom,
            },
            vec![TargetRef::Object(id1)],
            ObjectId(100),
            PlayerId(0),
        );
        let mut events = vec![];
        resolve(&mut state, &ability, &mut events).unwrap();

        // id1 should be at the bottom, id2 on top
        let lib = &state.players[0].library;
        assert_eq!(*lib.last().unwrap(), id1);
        assert_eq!(lib[0], id2);
    }

    #[test]
    fn test_resolve_puts_card_nth_from_top() {
        let mut state = GameState::new_two_player(42);
        let id1 = create_object(
            &mut state,
            CardId(1),
            PlayerId(0),
            "Card A".to_string(),
            Zone::Library,
        );
        let id2 = create_object(
            &mut state,
            CardId(2),
            PlayerId(0),
            "Card B".to_string(),
            Zone::Library,
        );
        let id3 = create_object(
            &mut state,
            CardId(3),
            PlayerId(0),
            "Card C".to_string(),
            Zone::Library,
        );
        let id4 = create_object(
            &mut state,
            CardId(4),
            PlayerId(0),
            "Card D".to_string(),
            Zone::Hand,
        );

        // Library is [id1, id2, id3]. Put id4 (from hand) third from top.
        let ability = ResolvedAbility::new(
            Effect::PutAtLibraryPosition {
                target: TargetFilter::Any,
                position: LibraryPosition::NthFromTop { n: 3 },
            },
            vec![TargetRef::Object(id4)],
            ObjectId(100),
            PlayerId(0),
        );
        let mut events = vec![];
        resolve(&mut state, &ability, &mut events).unwrap();

        // "third from the top" = index 2: [id1, id2, id4, id3]
        let lib: Vec<_> = state.players[0].library.to_vec();
        assert_eq!(lib, vec![id1, id2, id4, id3]);
        assert_eq!(state.objects[&id4].zone, Zone::Library);
    }
}
