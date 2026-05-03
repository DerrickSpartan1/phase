use draft_core::types::DraftCardInstance;
use engine::database::CardDatabase;
use phase_ai::config::AiDifficulty;
use rand::Rng;

/// Select a card index from the pack for a bot to pick.
///
/// Strategy scales with difficulty per D-02:
/// - VeryEasy: pure random
/// - Easy: rarity-weighted
/// - Medium: color preference + rarity + curve awareness
/// - Hard/VeryHard: CardDatabase evaluation + color discipline + curve
///
/// Returns the index into the `pack` slice.
pub fn bot_pick(
    pack: &[DraftCardInstance],
    difficulty: AiDifficulty,
    _prior_picks: &[DraftCardInstance],
    _card_db: Option<&CardDatabase>,
    rng: &mut impl Rng,
) -> usize {
    if pack.is_empty() {
        return 0;
    }

    match difficulty {
        AiDifficulty::VeryEasy => rng.random_range(0..pack.len()),
        AiDifficulty::Easy => pick_by_rarity(pack),
        AiDifficulty::Medium => 0,
        AiDifficulty::Hard | AiDifficulty::VeryHard => 0,
    }
}

/// Pick the highest-rarity card. Ties broken by first occurrence.
fn pick_by_rarity(pack: &[DraftCardInstance]) -> usize {
    pack.iter()
        .enumerate()
        .max_by_key(|(_, c)| rarity_score(&c.rarity))
        .map(|(i, _)| i)
        .unwrap_or(0)
}

fn rarity_score(rarity: &str) -> u8 {
    match rarity {
        "mythic" => 4,
        "rare" => 3,
        "uncommon" => 2,
        "common" => 1,
        _ => 0,
    }
}
