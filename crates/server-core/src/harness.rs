//! Integration test harness for full draft tournament simulation.
//! Runs at server-core crate level (D-06) -- no network, no tokio runtime needed.

use crate::draft_session::DraftSessionManager;
use draft_core::pack_source::FixturePackSource;
use draft_core::types::{
    DraftAction, DraftConfig, DraftKind, DraftStatus, PodPolicy, SpectatorVisibility,
    TournamentFormat,
};
use draft_core::view::DraftPlayerView;

/// Reusable harness for full 8-player Premier draft simulation.
///
/// Wraps `DraftSessionManager` with convenience methods for driving
/// the entire draft lifecycle: start, pick all packs, submit decks,
/// and simulate disconnects/reconnects. Used by Plan 03 integration
/// tests and Plan 05 edge-case tests.
pub(crate) struct TournamentHarness {
    pub manager: DraftSessionManager,
    pub draft_code: String,
    pub tokens: Vec<String>,
    pub source: FixturePackSource,
}

impl TournamentHarness {
    /// Create an 8-player Premier Draft pod, all seats joined, ready to start.
    pub fn new_premier_draft() -> Self {
        let mut manager = DraftSessionManager::new();
        let config = DraftConfig {
            set_code: "TST".to_string(),
            kind: DraftKind::Premier,
            cards_per_pack: 14,
            pack_count: 3,
            rng_seed: 42,
            tournament_format: TournamentFormat::Swiss,
            pod_policy: PodPolicy::Competitive,
            spectator_visibility: SpectatorVisibility::default(),
        };
        let (draft_code, host_token, _) = manager.create_draft(config, "Player0".into());
        let mut tokens = vec![host_token];
        for i in 1..8usize {
            let (tok, _, _) = manager
                .join_draft(&draft_code, format!("Player{i}"), None)
                .unwrap();
            tokens.push(tok);
        }
        let source = FixturePackSource {
            set_code: "TST".to_string(),
            cards_per_pack: 14,
        };
        Self {
            manager,
            draft_code,
            tokens,
            source,
        }
    }

    /// Start the draft (transition from Lobby -> Drafting).
    pub fn start(&mut self) {
        self.manager
            .apply_system_action(
                &self.draft_code,
                DraftAction::StartDraft,
                Some(&self.source),
            )
            .unwrap();
    }

    /// Pick the first available card for all seats that have a pending pack.
    pub fn pick_first_for_all_seats(&mut self) {
        for seat in 0..self.tokens.len() {
            let session = &self.manager.sessions[&self.draft_code];
            let view = session.view_for_seat(seat);
            if let Some(pack) = view.current_pack {
                if let Some(card) = pack.first() {
                    let _ = self.manager.handle_draft_action(
                        &self.draft_code,
                        &self.tokens[seat],
                        DraftAction::Pick {
                            seat: seat as u8,
                            card_instance_id: card.instance_id.clone(),
                        },
                        Some(&self.source),
                    );
                }
            }
        }
    }

    /// Run all picks for all packs (14 cards x 3 packs = 42 picks per seat).
    pub fn run_all_picks(&mut self) {
        let total_picks = self.source.cards_per_pack as usize * 3;
        for _ in 0..total_picks {
            self.pick_first_for_all_seats();
        }
    }

    /// Submit auto-generated decks for all seats.
    ///
    /// Uses 23 pool card names + 17 basic lands to reach the 40-card minimum
    /// required by limited deck validation.
    pub fn submit_all_decks(&mut self) {
        for seat in 0..self.tokens.len() {
            let session = &self.manager.sessions[&self.draft_code];
            let view = session.view_for_seat(seat);
            let mut main_deck: Vec<String> =
                view.pool.iter().take(23).map(|c| c.name.clone()).collect();
            main_deck.extend(std::iter::repeat_n("Plains".to_string(), 17));
            let _ = self.manager.handle_draft_action(
                &self.draft_code,
                &self.tokens[seat],
                DraftAction::SubmitDeck {
                    seat: seat as u8,
                    main_deck,
                },
                Some(&self.source),
            );
        }
    }

    /// Simulate a seat disconnecting.
    pub fn disconnect_seat(&mut self, seat: usize) {
        self.manager.handle_disconnect(&self.draft_code, seat);
    }

    /// Simulate a seat reconnecting. Returns the refreshed view.
    pub fn reconnect_seat(&mut self, seat: usize) -> Result<DraftPlayerView, String> {
        self.manager
            .handle_reconnect(&self.draft_code, &self.tokens[seat])
    }

    /// Get current draft status.
    pub fn status(&self) -> DraftStatus {
        self.manager.sessions[&self.draft_code].session.status
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn full_8_player_premier_draft_picks_complete() {
        let mut h = TournamentHarness::new_premier_draft();
        h.start();
        assert_eq!(h.status(), DraftStatus::Drafting);
        h.run_all_picks();
        assert_eq!(h.status(), DraftStatus::Deckbuilding);
    }

    #[test]
    fn full_lifecycle_picks_then_deckbuild() {
        let mut h = TournamentHarness::new_premier_draft();
        h.start();
        h.run_all_picks();
        h.submit_all_decks();
        // After all decks submitted, status should advance past Deckbuilding
        assert!(matches!(
            h.status(),
            DraftStatus::Pairing | DraftStatus::MatchInProgress | DraftStatus::RoundComplete
        ));
    }

    #[test]
    fn disconnect_and_reconnect_during_drafting() {
        let mut h = TournamentHarness::new_premier_draft();
        h.start();
        h.disconnect_seat(3);
        // Seat 3 can still reconnect
        let view = h.reconnect_seat(3);
        assert!(view.is_ok());
    }

    #[test]
    fn all_seats_have_42_cards_after_all_picks() {
        let mut h = TournamentHarness::new_premier_draft();
        h.start();
        h.run_all_picks();
        for seat in 0..8 {
            let view = h.manager.sessions[&h.draft_code].view_for_seat(seat);
            assert_eq!(view.pool.len(), 42, "seat {seat} should have 42 cards");
        }
    }

    #[test]
    fn disconnect_multiple_seats_during_drafting() {
        let mut h = TournamentHarness::new_premier_draft();
        h.start();
        h.disconnect_seat(0);
        h.disconnect_seat(5);
        // Both can reconnect independently
        assert!(h.reconnect_seat(0).is_ok());
        assert!(h.reconnect_seat(5).is_ok());
    }

    #[test]
    fn picks_continue_after_disconnect_reconnect() {
        let mut h = TournamentHarness::new_premier_draft();
        h.start();
        // Do a few picks
        h.pick_first_for_all_seats();
        // Disconnect seat 2, pick some more
        h.disconnect_seat(2);
        h.pick_first_for_all_seats();
        // Reconnect seat 2
        let view = h.reconnect_seat(2).unwrap();
        assert_eq!(view.status, DraftStatus::Drafting);
    }
}
