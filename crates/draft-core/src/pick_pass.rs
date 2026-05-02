use crate::types::*;

/// Apply a pick action: remove a card from the seat's current pack and add it to their pool.
/// After all seats have picked, trigger pack passing.
pub fn apply_pick(
    session: &mut DraftSession,
    seat: u8,
    card_instance_id: String,
) -> Result<Vec<DraftDelta>, DraftError> {
    if session.status != DraftStatus::Drafting {
        return Err(DraftError::InvalidTransition {
            from: session.status,
            action: "Pick".to_string(),
        });
    }

    let pod_size = session.seats.len() as u8;
    if seat >= pod_size {
        return Err(DraftError::SeatOutOfRange { seat, pod_size });
    }

    let pack = session.current_pack[seat as usize]
        .as_mut()
        .ok_or(DraftError::NoPendingPack { seat })?;

    let card_index = pack
        .0
        .iter()
        .position(|c| c.instance_id == card_instance_id)
        .ok_or_else(|| DraftError::CardNotInPack {
            card_instance_id: card_instance_id.clone(),
        })?;

    let picked = pack.0.remove(card_index);
    session.pools[seat as usize].push(picked);
    session.picks_this_round += 1;

    let mut deltas = vec![DraftDelta::CardPicked {
        seat,
        card_instance_id,
    }];

    // Check if all seats have picked this round
    if session.picks_this_round >= pod_size {
        session.picks_this_round = 0;

        // Check if current packs are empty (pack round complete)
        let packs_empty = session
            .current_pack
            .iter()
            .all(|p| p.as_ref().is_none_or(|pack| pack.0.is_empty()));

        if packs_empty {
            session.current_pack_number += 1;

            if session.current_pack_number >= session.config.pack_count {
                // All packs exhausted -- transition to Deckbuilding
                session.status = DraftStatus::Deckbuilding;
                deltas.push(DraftDelta::TransitionedTo {
                    status: DraftStatus::Deckbuilding,
                });
            } else {
                // Start new pack round
                session.pass_direction =
                    PassDirection::for_pack(session.current_pack_number);
                session.pick_number = 0;

                for s in 0..pod_size as usize {
                    if !session.packs_by_seat[s].is_empty() {
                        session.current_pack[s] =
                            Some(session.packs_by_seat[s].remove(0));
                    }
                }

                deltas.push(DraftDelta::PackExhausted {
                    new_pack_number: session.current_pack_number,
                });
            }
        } else {
            // Pass packs around
            session.pick_number += 1;
            deltas.push(DraftDelta::PackPassed);

            let mut new_packs: Vec<Option<DraftPack>> = vec![None; pod_size as usize];
            for i in 0..pod_size {
                let dest = session.pass_direction.next_seat(i, pod_size);
                new_packs[dest as usize] = session.current_pack[i as usize].take();
            }
            session.current_pack = new_packs;
        }
    }

    Ok(deltas)
}
