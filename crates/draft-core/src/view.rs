use serde::{Deserialize, Serialize};

use crate::types::*;

/// Public seat info visible to all players.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeatPublicView {
    pub seat_index: u8,
    pub display_name: String,
    pub is_bot: bool,
    pub connected: bool,
    pub has_submitted_deck: bool,
}

/// Filtered draft state for a specific player. Built from scratch (not a reference
/// into DraftSession) to prevent accidental hidden state leakage.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DraftPlayerView {
    /// Current draft status
    pub status: DraftStatus,
    /// Draft kind (Quick/Premier/Traditional)
    pub kind: DraftKind,
    /// Which pack round (0, 1, 2)
    pub current_pack_number: u8,
    /// Which pick within the current pack
    pub pick_number: u8,
    /// Current pass direction
    pub pass_direction: PassDirection,
    /// The viewer's current pack (None if between packs or not their turn)
    pub current_pack: Option<Vec<DraftCardInstance>>,
    /// The viewer's drafted pool
    pub pool: Vec<DraftCardInstance>,
    /// Public info for all seats
    pub seats: Vec<SeatPublicView>,
    /// Total cards per pack (for UI progress display)
    pub cards_per_pack: u8,
    /// Total pack count (for UI progress display)
    pub pack_count: u8,
}

/// Produce a filtered view of the draft session for a specific seat.
///
/// The viewer sees:
/// - Their own current pack and pool
/// - Public draft status, kind, pack/pick numbers, direction
/// - Public seat info (names, connected status, submission status)
///
/// The viewer does NOT see:
/// - Other players' packs or pools
/// - RNG seed
/// - Bot rankings or archetypes
/// - Unopened packs (packs_by_seat)
/// - Other players' deck submissions
pub fn filter_for_player(session: &DraftSession, seat_index: u8) -> DraftPlayerView {
    let idx = seat_index as usize;

    let current_pack = session.current_pack.get(idx).and_then(|p| p.as_ref()).map(|p| p.0.clone());

    let pool = session.pools.get(idx).cloned().unwrap_or_default();

    let seats = session
        .seats
        .iter()
        .enumerate()
        .map(|(i, seat)| {
            let player_id_for_seat = match seat {
                DraftSeat::Human { player_id, .. } => Some(*player_id),
                DraftSeat::Bot { .. } => None,
            };
            SeatPublicView {
                seat_index: i as u8,
                display_name: match seat {
                    DraftSeat::Human { display_name, .. } => display_name.clone(),
                    DraftSeat::Bot { name, .. } => name.clone(),
                },
                is_bot: matches!(seat, DraftSeat::Bot { .. }),
                connected: match seat {
                    DraftSeat::Human { connected, .. } => *connected,
                    DraftSeat::Bot { .. } => true,
                },
                has_submitted_deck: player_id_for_seat
                    .map(|pid| session.submitted_decks.contains_key(&pid))
                    .unwrap_or(false),
            }
        })
        .collect();

    DraftPlayerView {
        status: session.status,
        kind: session.kind,
        current_pack_number: session.current_pack_number,
        pick_number: session.pick_number,
        pass_direction: session.pass_direction,
        current_pack,
        pool,
        seats,
        cards_per_pack: session.config.cards_per_pack,
        pack_count: session.config.pack_count,
    }
}
