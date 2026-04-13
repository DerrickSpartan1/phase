//! Static plan derivation — turns a `DeckFeatures` prior into a
//! `PlanSnapshot` describing the expected curve of lands, mana, and threats
//! across the first 15 turns.
//!
//! Consumed once per game by `AiSession::from_game`. Live realization against
//! the current board lives in `plan/mod.rs::PlanState` (not exercised by
//! Phase B).

use crate::deck_profile::DeckArchetype;
use crate::features::DeckFeatures;

use super::{PlanSnapshot, TempoClass};

const SCHEDULE_LEN: usize = 15;

/// Derive a `PlanSnapshot` from deck features. The snapshot models a deck's
/// expected curve — it does not depend on game state and is cached per game.
pub fn derive_snapshot(features: &DeckFeatures) -> PlanSnapshot {
    let tempo_class = tempo_class_for(features);
    let expected_lands = expected_lands_for(features);
    let expected_mana = expected_lands; // No mana_ramp contribution yet — stub returns 0.
    let expected_threats = expected_threats_for(features);

    PlanSnapshot {
        expected_lands,
        expected_mana,
        expected_threats,
        tempo_class,
    }
}

fn tempo_class_for(features: &DeckFeatures) -> TempoClass {
    // Landfall commitment biases toward Ramp regardless of coarse archetype —
    // a landfall deck plays like a ramp deck in practice (extra lands per turn,
    // threats scale with lands). Everything else maps from `DeckArchetype`.
    if features.landfall.commitment > 0.5 {
        return TempoClass::Ramp;
    }
    match features.archetype {
        DeckArchetype::Aggro => TempoClass::Aggro,
        DeckArchetype::Control => TempoClass::Control,
        DeckArchetype::Combo => TempoClass::Combo,
        DeckArchetype::Ramp => TempoClass::Ramp,
        DeckArchetype::Midrange => TempoClass::Midrange,
    }
}

fn expected_lands_for(features: &DeckFeatures) -> [u8; SCHEDULE_LEN] {
    let mut lands = [0u8; SCHEDULE_LEN];
    // Baseline: one land drop per turn, capped at turn 5 curve.
    for (turn_idx, slot) in lands.iter_mut().enumerate() {
        let turn = (turn_idx + 1) as u8;
        *slot = turn.min(6);
    }
    // Landfall commitment bumps the turn-3 and turn-4 schedule by one extra
    // land each, modeling a fetch crack during those turns. Ratchet forward so
    // the later slots stay consistent with the bump.
    if features.landfall.commitment > 0.3 {
        for (turn_idx, slot) in lands.iter_mut().enumerate().skip(2) {
            if turn_idx < 4 {
                *slot = slot.saturating_add(1);
            } else {
                // Preserve the forward curve — everything from turn 5 onward
                // inherits the same +1 until the cap.
                *slot = slot.saturating_add(1).min(8);
            }
        }
    }
    lands
}

fn expected_threats_for(features: &DeckFeatures) -> [u8; SCHEDULE_LEN] {
    let mut threats = [0u8; SCHEDULE_LEN];
    // Conservative default — one threat per two turns after turn 2. Aggro
    // front-loads, control delays.
    for (turn_idx, slot) in threats.iter_mut().enumerate() {
        let turn = (turn_idx + 1) as u8;
        *slot = match features.archetype {
            DeckArchetype::Aggro => turn.saturating_sub(1).min(5),
            DeckArchetype::Control => turn.saturating_sub(3).min(4),
            _ => turn.saturating_sub(2).min(5),
        };
    }
    threats
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::{DeckFeatures, LandfallFeature};

    #[test]
    fn landfall_commitment_bumps_turn_three_and_four_lands() {
        let mut features = DeckFeatures::default();
        let baseline = derive_snapshot(&features);

        features.landfall = LandfallFeature {
            commitment: 0.9,
            payoff_count: 3,
            enabler_count: 4,
            payoff_names: vec!["Payoff".to_string()],
        };
        let bumped = derive_snapshot(&features);

        assert_eq!(bumped.expected_lands[2], baseline.expected_lands[2] + 1);
        assert_eq!(bumped.expected_lands[3], baseline.expected_lands[3] + 1);
    }

    #[test]
    fn high_landfall_commitment_picks_ramp_tempo() {
        let features = DeckFeatures {
            landfall: LandfallFeature {
                commitment: 0.9,
                ..Default::default()
            },
            ..Default::default()
        };
        let snapshot = derive_snapshot(&features);
        assert_eq!(snapshot.tempo_class, TempoClass::Ramp);
    }

    #[test]
    fn empty_features_produces_midrange_default() {
        let snapshot = derive_snapshot(&DeckFeatures::default());
        assert_eq!(snapshot.tempo_class, TempoClass::Midrange);
    }
}
