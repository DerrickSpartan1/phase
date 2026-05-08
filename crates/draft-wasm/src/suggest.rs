use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use draft_core::types::DraftCardInstance;
use engine::database::CardDatabase;
use engine::types::keywords::Keyword;
use phase_ai::config::AiDifficulty;

/// A suggested Limited deck: spell names + land distribution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuggestedDeck {
    pub main_deck: Vec<String>,
    pub lands: HashMap<String, u8>,
}

/// Auto-build a playable Limited deck from a pool.
///
/// Per D-12: selects ~23 best spells + ~17 lands with curve awareness.
/// Algorithm:
/// 1. Identify the 2 strongest colors by card count + quality
/// 2. Filter pool to those colors (+ colorless)
/// 3. Score and sort by evaluation
/// 4. Select ~23 spells respecting mana curve
/// 5. Compute land distribution
pub fn suggest_deck(
    pool: &[DraftCardInstance],
    _difficulty: AiDifficulty,
    card_db: Option<&CardDatabase>,
) -> SuggestedDeck {
    if pool.is_empty() {
        return SuggestedDeck {
            main_deck: Vec::new(),
            lands: HashMap::new(),
        };
    }

    // 1. Identify the 2 strongest colors
    let best_colors = find_best_colors(pool, card_db);

    // 2. Filter to on-color + colorless cards
    let on_color: Vec<&DraftCardInstance> = pool
        .iter()
        .filter(|c| {
            c.colors.is_empty()
                || c.colors
                    .iter()
                    .any(|col| best_colors.contains(&col.as_str()))
        })
        .collect();

    // 3. Score and sort
    let mut scored: Vec<(&DraftCardInstance, f32)> = on_color
        .iter()
        .map(|c| (*c, score_card(c, card_db)))
        .collect();
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    // 4. Select ~23 spells with curve awareness
    let spells = select_spells_with_curve(&scored, 23);

    // 5. Compute lands
    let spell_names: Vec<String> = spells.iter().map(|c| c.name.clone()).collect();
    let lands = suggest_lands(&spell_names, pool);

    let mut main_deck = spell_names;
    for (land_name, count) in &lands {
        for _ in 0..*count {
            main_deck.push(land_name.clone());
        }
    }

    SuggestedDeck { main_deck, lands }
}

/// Find the 2 strongest colors in the pool by card count weighted by quality.
fn find_best_colors<'a>(
    pool: &[DraftCardInstance],
    card_db: Option<&CardDatabase>,
) -> Vec<&'a str> {
    let mut color_scores: HashMap<&str, f32> = HashMap::new();

    for card in pool {
        let card_score = score_card(card, card_db);
        for color in &card.colors {
            let key = match color.as_str() {
                "W" => "W",
                "U" => "U",
                "B" => "B",
                "R" => "R",
                "G" => "G",
                _ => continue,
            };
            *color_scores.entry(key).or_insert(0.0) += card_score;
        }
    }

    let mut sorted: Vec<(&&str, &f32)> = color_scores.iter().collect();
    sorted.sort_by(|a, b| b.1.partial_cmp(a.1).unwrap_or(std::cmp::Ordering::Equal));

    sorted.iter().take(2).map(|(color, _)| **color).collect()
}

/// Score a card for deck inclusion quality.
fn score_card(card: &DraftCardInstance, card_db: Option<&CardDatabase>) -> f32 {
    let base_rarity = match card.rarity.as_str() {
        "mythic" => 4.0,
        "rare" => 3.0,
        "uncommon" => 2.0,
        "common" => 1.0,
        _ => 0.5,
    };

    let Some(db) = card_db else {
        return base_rarity;
    };

    let Some(face) = db.get_face_by_name(&card.name) else {
        return base_rarity;
    };

    let mut score = base_rarity;

    // Creature stats
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

    // Keyword bonuses
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

    score += face.abilities.len().min(3) as f32 * 0.5;

    score
}

/// Select spells respecting a good mana curve for Limited.
///
/// Target distribution for ~23 spells:
/// - CMC 1: 1-2
/// - CMC 2: 5-6
/// - CMC 3: 5-6
/// - CMC 4: 3-4
/// - CMC 5: 2-3
/// - CMC 6+: 1-2
fn select_spells_with_curve<'a>(
    scored: &[(&'a DraftCardInstance, f32)],
    target: usize,
) -> Vec<&'a DraftCardInstance> {
    // Curve slot targets
    let curve_targets: [(u8, u8, usize); 6] = [
        (0, 1, 2),   // CMC 0-1: up to 2
        (2, 2, 6),   // CMC 2: up to 6
        (3, 3, 6),   // CMC 3: up to 6
        (4, 4, 4),   // CMC 4: up to 4
        (5, 5, 3),   // CMC 5: up to 3
        (6, 255, 2), // CMC 6+: up to 2
    ];

    let mut selected: Vec<&DraftCardInstance> = Vec::new();
    let mut used: Vec<bool> = vec![false; scored.len()];

    // First pass: fill curve slots from highest-scored cards
    for (cmc_low, cmc_high, max_count) in &curve_targets {
        let mut count = 0;
        for (i, (card, _)) in scored.iter().enumerate() {
            if used[i] {
                continue;
            }
            if card.cmc >= *cmc_low && card.cmc <= *cmc_high && count < *max_count {
                selected.push(card);
                used[i] = true;
                count += 1;
            }
        }
    }

    // Second pass: fill remaining slots with best remaining cards
    if selected.len() < target {
        for (i, (card, _)) in scored.iter().enumerate() {
            if selected.len() >= target {
                break;
            }
            if !used[i] {
                selected.push(card);
                used[i] = true;
            }
        }
    }

    // Truncate to target if we overshot
    selected.truncate(target);
    selected
}

/// Compute color-proportional land distribution for a set of spells.
///
/// Per D-11: distributes 17 lands proportional to color frequency.
pub fn suggest_lands(spell_names: &[String], pool: &[DraftCardInstance]) -> HashMap<String, u8> {
    // Build name -> card lookup from pool
    let card_by_name: HashMap<&str, &DraftCardInstance> =
        pool.iter().map(|c| (c.name.as_str(), c)).collect();

    // Count color pip occurrences from the selected spells
    let mut color_counts: HashMap<&str, u32> = HashMap::new();
    for name in spell_names {
        if let Some(card) = card_by_name.get(name.as_str()) {
            for color in &card.colors {
                let key = match color.as_str() {
                    "W" => "W",
                    "U" => "U",
                    "B" => "B",
                    "R" => "R",
                    "G" => "G",
                    _ => continue,
                };
                *color_counts.entry(key).or_insert(0) += 1;
            }
        }
    }

    let total_lands: u8 = 17;
    let mut lands: HashMap<String, u8> = HashMap::new();

    if color_counts.is_empty() {
        // No color info — split evenly across basic lands
        lands.insert("Plains".to_string(), 4);
        lands.insert("Island".to_string(), 4);
        lands.insert("Swamp".to_string(), 3);
        lands.insert("Mountain".to_string(), 3);
        lands.insert("Forest".to_string(), 3);
        return lands;
    }

    let total_pips: u32 = color_counts.values().sum();
    let mut assigned: u8 = 0;

    // Sort colors by count descending for stable assignment
    let mut sorted_colors: Vec<(&&str, &u32)> = color_counts.iter().collect();
    sorted_colors.sort_by(|a, b| b.1.cmp(a.1).then_with(|| a.0.cmp(b.0)));

    for (i, (color, count)) in sorted_colors.iter().enumerate() {
        let land_name = color_to_land(color);
        let share = if i == sorted_colors.len() - 1 {
            // Last color gets remainder to ensure exactly 17 total
            total_lands - assigned
        } else {
            let remaining_colors = sorted_colors.len() - i - 1;
            let raw = ((**count as f64 / total_pips as f64) * total_lands as f64).round() as u8;
            // Minimum 1 land of any represented color, max leaves room for remaining
            raw.max(1)
                .min(total_lands - assigned - remaining_colors as u8)
        };
        lands.insert(land_name.to_string(), share);
        assigned += share;
    }

    lands
}

fn color_to_land(color: &str) -> &'static str {
    match color {
        "W" => "Plains",
        "U" => "Island",
        "B" => "Swamp",
        "R" => "Mountain",
        "G" => "Forest",
        _ => "Wastes",
    }
}
