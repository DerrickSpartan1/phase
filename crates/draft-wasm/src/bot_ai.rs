use std::collections::HashMap;

use draft_core::types::DraftCardInstance;
use engine::database::CardDatabase;
use engine::types::keywords::Keyword;
use phase_ai::config::AiDifficulty;
use rand::Rng;

/// Select a card index from the pack for a bot to pick.
///
/// Strategy scales with difficulty per D-02:
/// - VeryEasy: pure random
/// - Easy: rarity-weighted
/// - Medium: color preference + rarity + curve awareness (from enriched DraftCardInstance)
/// - Hard/VeryHard: CardDatabase evaluation + color discipline + curve
///
/// Returns the index into the `pack` slice.
pub fn bot_pick(
    pack: &[DraftCardInstance],
    difficulty: AiDifficulty,
    prior_picks: &[DraftCardInstance],
    card_db: Option<&CardDatabase>,
    rng: &mut impl Rng,
) -> usize {
    if pack.is_empty() {
        return 0;
    }

    match difficulty {
        AiDifficulty::VeryEasy => rng.random_range(0..pack.len()),
        AiDifficulty::Easy => pick_by_rarity(pack),
        AiDifficulty::Medium => pick_by_color_and_rarity(pack, prior_picks),
        AiDifficulty::Hard => pick_by_evaluation(pack, prior_picks, card_db, false),
        AiDifficulty::VeryHard => pick_by_evaluation(pack, prior_picks, card_db, true),
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

/// Medium strategy: score = rarity * 2 + color_bonus + curve_bonus.
/// Uses enriched DraftCardInstance fields (colors, cmc) directly.
fn pick_by_color_and_rarity(
    pack: &[DraftCardInstance],
    prior_picks: &[DraftCardInstance],
) -> usize {
    let preferred_colors = color_preference(prior_picks);

    pack.iter()
        .enumerate()
        .max_by_key(|(_, card)| {
            let rarity = rarity_score(&card.rarity) as i16 * 2;
            let color_bonus = if card.colors.is_empty() {
                // Colorless cards are always on-color
                1i16
            } else if card.colors.iter().any(|c| preferred_colors.contains(c)) {
                3
            } else if preferred_colors.is_empty() {
                // No preference yet (early picks) — no bonus/penalty
                0
            } else {
                -1
            };
            let curve = curve_bonus(card.cmc, prior_picks.len() as u8);
            rarity + color_bonus + curve as i16
        })
        .map(|(i, _)| i)
        .unwrap_or(0)
}

/// Hard/VeryHard strategy: CardDatabase evaluation + color discipline + curve.
/// Falls back to Medium strategy if CardDatabase is not loaded.
fn pick_by_evaluation(
    pack: &[DraftCardInstance],
    prior_picks: &[DraftCardInstance],
    card_db: Option<&CardDatabase>,
    strict: bool,
) -> usize {
    let card_db = match card_db {
        Some(db) => db,
        None => return pick_by_color_and_rarity(pack, prior_picks),
    };

    let preferred_colors = color_preference(prior_picks);
    let pick_number = prior_picks.len() as u8;

    // Color bonus multiplier: stricter for VeryHard
    let on_color_bonus: f32 = if strict { 6.0 } else { 4.0 };
    let off_color_penalty: f32 = if strict { -2.0 } else { 0.0 };

    pack.iter()
        .enumerate()
        .max_by(|(_, a), (_, b)| {
            let score_a = eval_score(
                a,
                card_db,
                &preferred_colors,
                pick_number,
                on_color_bonus,
                off_color_penalty,
            );
            let score_b = eval_score(
                b,
                card_db,
                &preferred_colors,
                pick_number,
                on_color_bonus,
                off_color_penalty,
            );
            score_a
                .partial_cmp(&score_b)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|(i, _)| i)
        .unwrap_or(0)
}

/// Compute a draft evaluation score for a card using CardDatabase data.
fn eval_score(
    card: &DraftCardInstance,
    card_db: &CardDatabase,
    preferred_colors: &[String],
    pick_number: u8,
    on_color_bonus: f32,
    off_color_penalty: f32,
) -> f32 {
    let base = eval_card_for_draft(card, Some(card_db));

    let color_bonus = if card.colors.is_empty() {
        1.0 // Colorless — always fine
    } else if preferred_colors.is_empty() {
        0.0 // No preference yet
    } else if card.colors.iter().any(|c| preferred_colors.contains(c)) {
        on_color_bonus
    } else {
        off_color_penalty
    };

    let curve = curve_bonus(card.cmc, pick_number) as f32;

    base + color_bonus + curve
}

/// Evaluate a card for draft pick quality using CardDatabase.
///
/// Looks up the card in the engine's CardDatabase for keyword/stat analysis.
/// Falls back to rarity score if the card is not found.
fn eval_card_for_draft(card: &DraftCardInstance, card_db: Option<&CardDatabase>) -> f32 {
    let base_rarity = rarity_score(&card.rarity) as f32;

    let Some(db) = card_db else {
        return base_rarity;
    };

    let Some(face) = db.get_face_by_name(&card.name) else {
        return base_rarity;
    };

    let mut score = base_rarity;

    // Power + toughness sum for creatures
    let power = face.power.as_ref().map_or(0, |p| match p {
        engine::types::ability::PtValue::Fixed(v) => *v,
        _ => 0,
    });
    let toughness = face.toughness.as_ref().map_or(0, |t| match t {
        engine::types::ability::PtValue::Fixed(v) => *v,
        _ => 0,
    });
    if power > 0 || toughness > 0 {
        score += (power + toughness) as f32 * 0.3;
    }

    // Keyword bonuses — evasion and removal-relevant keywords valued highly in Limited
    for keyword in &face.keywords {
        score += match keyword {
            Keyword::Flying => 3.0,
            Keyword::Trample => 1.5,
            Keyword::Deathtouch => 3.0,
            Keyword::Lifelink => 2.0,
            Keyword::Hexproof => 2.5,
            Keyword::Menace => 2.0,
            Keyword::FirstStrike | Keyword::DoubleStrike => 2.0,
            Keyword::Vigilance => 1.0,
            Keyword::Haste => 1.0,
            Keyword::Reach => 1.0,
            Keyword::Indestructible => 3.0,
            Keyword::Flash => 1.5,
            _ => 0.0,
        };
    }

    // Abilities count as a rough proxy for card complexity/power
    score += face.abilities.len().min(3) as f32 * 0.5;

    score
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

/// Extract the 1-2 most common colors from prior picks.
/// Returns empty vec if no clear preference (early draft).
fn color_preference(prior_picks: &[DraftCardInstance]) -> Vec<String> {
    if prior_picks.len() < 3 {
        return Vec::new();
    }

    let mut counts: HashMap<&str, u32> = HashMap::new();
    for card in prior_picks {
        for color in &card.colors {
            *counts.entry(color.as_str()).or_insert(0) += 1;
        }
    }

    if counts.is_empty() {
        return Vec::new();
    }

    let mut sorted: Vec<(&&str, &u32)> = counts.iter().collect();
    sorted.sort_by(|a, b| b.1.cmp(a.1));

    // Take top 2 colors
    sorted
        .iter()
        .take(2)
        .map(|(color, _)| color.to_string())
        .collect()
}

/// Mana curve position bonus. Prefer CMC 2-4 creatures, especially early in draft.
fn curve_bonus(cmc: u8, pick_number: u8) -> i8 {
    let early = pick_number < 15; // First pack roughly

    match cmc {
        2 => {
            if early {
                2
            } else {
                1
            }
        }
        3 => {
            if early {
                2
            } else {
                1
            }
        }
        4 => 1,
        5 => 0,
        1 => 0,
        0 => 0, // lands, weird cards
        _ => {
            // CMC 6+: slight penalty, less so late
            if early {
                -1
            } else {
                0
            }
        }
    }
}
