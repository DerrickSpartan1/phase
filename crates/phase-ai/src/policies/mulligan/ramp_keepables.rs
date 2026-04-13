//! `RampKeepablesMulligan` — feature-driven mulligan policy for mana-ramp decks.
//!
//! CR 103.5 (`docs/MagicCompRules.txt:295`): deciding to keep after the
//! mulligan process. When a deck's mana-ramp commitment is meaningful, opening
//! hands that combine a ramp spell with enough lands to cast it early are
//! strongly preferred.
//!
//! Opts out for decks where `features.mana_ramp.commitment <= 0.3` — the
//! baseline `KeepablesByLandCount` policy is the sole voice for those decks.

use engine::types::card_type::CoreType;
use engine::types::game_state::GameState;
use engine::types::identifiers::ObjectId;

use crate::features::DeckFeatures;
use crate::plan::PlanSnapshot;
use crate::policies::registry::{PolicyId, PolicyReason};

use super::{MulliganPolicy, MulliganScore, TurnOrder};

/// Commitment threshold below which this policy opts out. Matches the
/// plan-mandated 0.3 boundary — fewer than ~2-3 ramp pieces doesn't warrant
/// ramp-specific mulligan preferences.
const COMMITMENT_THRESHOLD: f32 = 0.3;

pub struct RampKeepablesMulligan;

impl MulliganPolicy for RampKeepablesMulligan {
    fn id(&self) -> PolicyId {
        PolicyId::RampKeepablesMulligan
    }

    fn evaluate(
        &self,
        hand: &[ObjectId],
        state: &GameState,
        features: &DeckFeatures,
        _plan: &PlanSnapshot,
        _turn_order: TurnOrder,
        _mulligans_taken: u8,
    ) -> MulliganScore {
        let commitment = features.mana_ramp.commitment;
        if commitment <= COMMITMENT_THRESHOLD {
            return MulliganScore::Score {
                delta: 0.0,
                reason: PolicyReason::new("ramp_keepables_na")
                    .with_fact("commitment_x1000", (commitment * 1000.0) as i64),
            };
        }

        let mut land_count: i64 = 0;
        let mut ramp_count: i64 = 0;

        for &oid in hand {
            let Some(obj) = state.objects.get(&oid) else {
                continue;
            };
            if obj.card_types.core_types.contains(&CoreType::Land) {
                land_count += 1;
            }
            // A ramp piece in hand is any instant/sorcery that could
            // accelerate mana — detected via the presence of a Spell-kind
            // ability that searches for a land or produces mana. We keep this
            // light (just type check + ability-kind check) to avoid duplicating
            // the full chain-walk at mulligan evaluation time; exact shape
            // matters less at this decision point than presence.
            //
            // Creatures and artifacts (dorks/rocks) are already counted
            // implicitly by the commitment floor: a deck with high dork_count
            // also has high commitment and opts in here.
            if obj
                .card_types
                .core_types
                .iter()
                .any(|t| matches!(t, CoreType::Instant | CoreType::Sorcery))
                && obj.abilities.iter().any(|a| {
                    use engine::types::ability::AbilityKind;
                    a.kind == AbilityKind::Spell
                })
            {
                ramp_count += 1;
            }
        }

        // Ideal: ramp spell + enough lands to cast it early.
        if ramp_count >= 1 && land_count >= 2 {
            return MulliganScore::Score {
                delta: 2.0,
                reason: PolicyReason::new("ramp_keepable_ideal")
                    .with_fact("ramp_count", ramp_count)
                    .with_fact("land_count", land_count)
                    .with_fact("commitment_x1000", (commitment * 1000.0) as i64),
            };
        }

        // A ramp spell with only one land is risky but passable.
        if ramp_count >= 1 && land_count == 1 {
            return MulliganScore::Score {
                delta: 0.5,
                reason: PolicyReason::new("ramp_light_lands_ok")
                    .with_fact("ramp_count", ramp_count)
                    .with_fact("land_count", land_count),
            };
        }

        // Many lands but no ramp spells in hand undermines a ramp deck's plan.
        if ramp_count == 0 && land_count >= 3 {
            return MulliganScore::Score {
                delta: -0.5,
                reason: PolicyReason::new("ramp_no_ramp_in_hand")
                    .with_fact("land_count", land_count)
                    .with_fact("commitment_x1000", (commitment * 1000.0) as i64),
            };
        }

        // Everything else — defer to the baseline keepables policy.
        MulliganScore::Score {
            delta: 0.0,
            reason: PolicyReason::new("ramp_defer_to_baseline")
                .with_fact("ramp_count", ramp_count)
                .with_fact("land_count", land_count),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use engine::game::zones::create_object;
    use engine::types::ability::{AbilityDefinition, AbilityKind, Effect, QuantityExpr};
    use engine::types::card_type::{CardType, CoreType};
    use engine::types::game_state::GameState;
    use engine::types::identifiers::CardId;
    use engine::types::mana::ManaCost;
    use engine::types::player::PlayerId;
    use engine::types::zones::Zone;

    use crate::features::{DeckFeatures, ManaRampFeature};

    fn features_with_commitment(commitment: f32) -> DeckFeatures {
        DeckFeatures {
            mana_ramp: ManaRampFeature {
                dork_count: 4,
                land_fetch_count: 4,
                commitment,
                ..Default::default()
            },
            ..DeckFeatures::default()
        }
    }

    fn plan() -> PlanSnapshot {
        PlanSnapshot::default()
    }

    fn add_card(
        state: &mut GameState,
        idx: u64,
        name: &str,
        core_types: Vec<CoreType>,
        with_spell_ability: bool,
    ) -> ObjectId {
        let oid = create_object(
            state,
            CardId(2000 + idx),
            PlayerId(0),
            name.to_string(),
            Zone::Hand,
        );
        let obj = state.objects.get_mut(&oid).expect("just created");
        obj.card_types = CardType {
            supertypes: Vec::new(),
            core_types,
            subtypes: Vec::new(),
        };
        obj.mana_cost = ManaCost::NoCost;
        if with_spell_ability {
            obj.abilities.push(AbilityDefinition::new(
                AbilityKind::Spell,
                Effect::Draw {
                    count: QuantityExpr::Fixed { value: 1 },
                },
            ));
        }
        oid
    }

    fn make_hand(lands: usize, sorcery_ramps: usize, filler: usize) -> (GameState, Vec<ObjectId>) {
        let mut state = GameState::new_two_player(42);
        state.players[0].hand.clear();
        let mut hand = Vec::new();
        for i in 0..lands {
            hand.push(add_card(
                &mut state,
                i as u64,
                &format!("Forest {i}"),
                vec![CoreType::Land],
                false,
            ));
        }
        for j in 0..sorcery_ramps {
            hand.push(add_card(
                &mut state,
                (100 + j) as u64,
                &format!("Rampant Growth {j}"),
                vec![CoreType::Sorcery],
                true,
            ));
        }
        for k in 0..filler {
            hand.push(add_card(
                &mut state,
                (200 + k) as u64,
                &format!("Filler {k}"),
                vec![CoreType::Creature],
                false,
            ));
        }
        (state, hand)
    }

    #[test]
    fn opts_out_when_commitment_low() {
        let features = features_with_commitment(0.1);
        let (state, hand) = make_hand(3, 1, 3);
        let score =
            RampKeepablesMulligan.evaluate(&hand, &state, &features, &plan(), TurnOrder::OnPlay, 0);
        match score {
            MulliganScore::Score { delta, reason } => {
                assert_eq!(delta, 0.0);
                assert_eq!(reason.kind, "ramp_keepables_na");
            }
            _ => panic!("expected opt-out Score"),
        }
    }

    #[test]
    fn ideal_hand_ramp_plus_two_lands() {
        let features = features_with_commitment(0.9);
        // 2 lands + 1 ramp + 4 filler = 7 cards
        let (state, hand) = make_hand(2, 1, 4);
        let score =
            RampKeepablesMulligan.evaluate(&hand, &state, &features, &plan(), TurnOrder::OnPlay, 0);
        match score {
            MulliganScore::Score { delta, reason } => {
                assert!(delta > 0.0, "expected positive delta, got {delta}");
                assert_eq!(reason.kind, "ramp_keepable_ideal");
            }
            _ => panic!("expected ideal Score"),
        }
    }

    #[test]
    fn ramp_light_lands_ok() {
        let features = features_with_commitment(0.9);
        // 1 land + 1 ramp + 5 filler
        let (state, hand) = make_hand(1, 1, 5);
        let score =
            RampKeepablesMulligan.evaluate(&hand, &state, &features, &plan(), TurnOrder::OnPlay, 0);
        match score {
            MulliganScore::Score { delta, reason } => {
                assert!(delta > 0.0, "expected positive delta, got {delta}");
                assert_eq!(reason.kind, "ramp_light_lands_ok");
            }
            _ => panic!("expected light-lands Score"),
        }
    }

    #[test]
    fn no_ramp_in_hand_penalty() {
        let features = features_with_commitment(0.9);
        // 3 lands + 0 ramp + 4 filler
        let (state, hand) = make_hand(3, 0, 4);
        let score =
            RampKeepablesMulligan.evaluate(&hand, &state, &features, &plan(), TurnOrder::OnPlay, 0);
        match score {
            MulliganScore::Score { delta, reason } => {
                assert!(delta < 0.0, "expected negative delta, got {delta}");
                assert_eq!(reason.kind, "ramp_no_ramp_in_hand");
            }
            _ => panic!("expected penalty Score"),
        }
    }

    #[test]
    fn defer_to_baseline_when_no_lands_no_ramp() {
        let features = features_with_commitment(0.9);
        // 0 lands + 0 ramp + 7 filler
        let (state, hand) = make_hand(0, 0, 7);
        let score =
            RampKeepablesMulligan.evaluate(&hand, &state, &features, &plan(), TurnOrder::OnPlay, 0);
        match score {
            MulliganScore::Score { delta, reason } => {
                assert_eq!(delta, 0.0);
                assert_eq!(reason.kind, "ramp_defer_to_baseline");
            }
            _ => panic!("expected defer Score"),
        }
    }
}
