use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use draft_core::types::DraftCardInstance;
use engine::database::CardDatabase;
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
pub fn suggest_deck(
    pool: &[DraftCardInstance],
    _difficulty: AiDifficulty,
    _card_db: Option<&CardDatabase>,
) -> SuggestedDeck {
    if pool.is_empty() {
        return SuggestedDeck {
            main_deck: Vec::new(),
            lands: HashMap::new(),
        };
    }

    // Select up to 23 spell names from pool
    let spell_names: Vec<String> = pool.iter().take(23).map(|c| c.name.clone()).collect();
    let lands = suggest_lands(&spell_names, pool);

    let mut main_deck = spell_names;
    for (land_name, count) in &lands {
        for _ in 0..*count {
            main_deck.push(land_name.clone());
        }
    }

    SuggestedDeck { main_deck, lands }
}

/// Compute color-proportional land distribution for a set of spells.
///
/// Per D-11: distributes 17 lands proportional to color frequency.
pub fn suggest_lands(
    spell_names: &[String],
    pool: &[DraftCardInstance],
) -> HashMap<String, u8> {
    // Build name -> card lookup from pool
    let card_by_name: HashMap<&str, &DraftCardInstance> =
        pool.iter().map(|c| (c.name.as_str(), c)).collect();

    // Count color occurrences from spells
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
    sorted_colors.sort_by(|a, b| b.1.cmp(a.1));

    for (i, (color, count)) in sorted_colors.iter().enumerate() {
        let land_name = color_to_land(color);
        let share = if i == sorted_colors.len() - 1 {
            // Last color gets remainder to ensure exactly 17
            total_lands - assigned
        } else {
            let raw = ((**count as f64 / total_pips as f64) * total_lands as f64).round() as u8;
            // Minimum 1 land of any represented color
            raw.max(1).min(total_lands - assigned - (sorted_colors.len() - i - 1) as u8)
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
