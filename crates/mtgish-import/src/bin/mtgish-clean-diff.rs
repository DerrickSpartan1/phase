//! Compare clean mtgish conversions against native `card-data.json`.
//!
//! Usage:
//! ```text
//!   mtgish-clean-diff [<mtgish-cards.json>] [<card-data.json>] [<report.json>]
//! ```
//!
//! The comparison is scoped to the semantic fields emitted by
//! `EngineFaceStub`: keywords, abilities, triggers, static abilities,
//! replacements, and casting metadata. Card metadata owned by the native
//! card-data pipeline (mana cost, typeline, legalities, rulings, etc.) is
//! intentionally outside this report.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use anyhow::{Context, Result};
use mtgish_import::convert::{convert_card, EngineFaceStub};
use mtgish_import::diff::{canonicalize, classify_value, Severity};
use mtgish_import::report::{Ctx, ImportReport};
use mtgish_import::schema::types::{Card, DoorInfo, FlipInfo, OracleCard};
use serde_json::{json, Value};

struct Args {
    mtgish_path: PathBuf,
    native_path: PathBuf,
    report_path: Option<PathBuf>,
}

fn main() -> ExitCode {
    match run() {
        Ok(report) => {
            let serialized = serde_json::to_string_pretty(&report).expect("report serializes");
            let report_path = parse_args().report_path;
            match report_path {
                Some(path) => {
                    if let Err(e) = write_report(&path, &serialized) {
                        eprintln!("mtgish-clean-diff: {e:#}");
                        return ExitCode::FAILURE;
                    }
                    println!("wrote clean diff report -> {}", path.display());
                }
                None => println!("{serialized}"),
            }
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("mtgish-clean-diff: {e:#}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<Value> {
    let args = parse_args();
    let raw_cards = fs::read_to_string(&args.mtgish_path)
        .with_context(|| format!("reading {}", args.mtgish_path.display()))?;
    let raw_values: Vec<Value> =
        serde_json::from_str(&raw_cards).context("parsing mtgish cards")?;
    let native = load_native_card_data(&args.native_path)?;

    let mut cards_total = 0usize;
    let mut clean_total = 0usize;
    let mut compared_faces = 0usize;
    let mut clean_cards_with_diff = 0usize;
    let mut missing_native_faces = Vec::new();
    let mut diffs = Vec::new();

    for raw in raw_values {
        cards_total += 1;
        let display_name = display_name_from_raw(&raw);
        let card: OracleCard = match serde_json::from_value(raw) {
            Ok(card) => card,
            Err(e) => {
                diffs.push(json!({
                    "card_name": display_name,
                    "kind": "deserialize-failure",
                    "error": e.to_string(),
                }));
                continue;
            }
        };

        let mut import_report = ImportReport::default();
        let mut ctx = Ctx::new(display_name.clone(), &mut import_report);
        let stubs = match convert_card(&card, &mut ctx) {
            Ok(stubs) if !ctx.finish() => stubs,
            Ok(_) | Err(_) => continue,
        };
        clean_total += 1;

        let face_names = converted_face_names(&card);
        let face_count = face_names.len().max(stubs.len());
        let mut card_diffs = Vec::new();

        for idx in 0..face_count {
            let face_name = face_names
                .get(idx)
                .cloned()
                .unwrap_or_else(|| format!("{display_name}#{idx}"));
            let Some(native_face) = native.get(&face_name.to_lowercase()) else {
                missing_native_faces.push(json!({
                    "card_name": display_name,
                    "face_index": idx,
                    "face_name": face_name,
                }));
                continue;
            };
            compared_faces += 1;

            let empty_stub = empty_stub_projection();
            let mtgish = stubs
                .get(idx)
                .map(project_mtgish_stub)
                .unwrap_or(empty_stub);
            let native = project_native_face(native_face);
            let mtgish = canonicalize(mtgish);
            let native = canonicalize(native);
            if mtgish == native {
                continue;
            }

            let divergences = classify_value(&native, &mtgish)
                .into_iter()
                .map(|d| {
                    json!({
                        "path": d.path,
                        "severity": severity_name(d.severity),
                        "native": d.native,
                        "mtgish": d.mtgish,
                    })
                })
                .collect::<Vec<_>>();
            card_diffs.push(json!({
                "face_index": idx,
                "face_name": face_name,
                "divergences": divergences,
            }));
        }

        if !card_diffs.is_empty() {
            clean_cards_with_diff += 1;
            diffs.push(json!({
                "card_name": display_name,
                "kind": "structural-diff",
                "faces": card_diffs,
            }));
        }
    }

    Ok(json!({
        "summary": {
            "cards_total": cards_total,
            "clean_cards": clean_total,
            "clean_percent": percent(clean_total, cards_total),
            "compared_faces": compared_faces,
            "clean_cards_with_diff": clean_cards_with_diff,
            "missing_native_faces": missing_native_faces.len(),
        },
        "missing_native_faces": missing_native_faces,
        "diffs": diffs,
    }))
}

fn parse_args() -> Args {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    Args {
        mtgish_path: args
            .first()
            .cloned()
            .unwrap_or_else(|| "data/mtgish-cards.json".to_string())
            .into(),
        native_path: args
            .get(1)
            .cloned()
            .unwrap_or_else(|| "client/public/card-data.json".to_string())
            .into(),
        report_path: args.get(2).map(PathBuf::from),
    }
}

fn write_report(path: &Path, serialized: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).with_context(|| format!("creating {}", parent.display()))?;
        }
    }
    fs::write(path, serialized).with_context(|| format!("writing {}", path.display()))
}

fn load_native_card_data(path: &Path) -> Result<serde_json::Map<String, Value>> {
    let raw = fs::read_to_string(path).with_context(|| format!("reading {}", path.display()))?;
    match serde_json::from_str::<Value>(&raw)
        .with_context(|| format!("parsing {}", path.display()))?
    {
        Value::Object(map) => Ok(map),
        _ => anyhow::bail!("{} must be a top-level object", path.display()),
    }
}

fn project_mtgish_stub(stub: &EngineFaceStub) -> Value {
    json!({
        "keywords": stub.keywords,
        "abilities": stub.abilities,
        "triggers": stub.triggers,
        "static_abilities": stub.statics,
        "replacements": stub.replacements,
        "additional_cost": stub.additional_cost,
        "casting_options": stub.casting_options,
        "casting_restrictions": stub.casting_restrictions,
        "strive_cost": stub.strive_cost,
    })
}

fn empty_stub_projection() -> Value {
    json!({
        "keywords": [],
        "abilities": [],
        "triggers": [],
        "static_abilities": [],
        "replacements": [],
        "additional_cost": null,
        "casting_options": [],
        "casting_restrictions": [],
        "strive_cost": null,
    })
}

fn project_native_face(face: &Value) -> Value {
    json!({
        "keywords": field_or_empty_array(face, "keywords"),
        "abilities": field_or_empty_array(face, "abilities"),
        "triggers": field_or_empty_array(face, "triggers"),
        "static_abilities": field_or_empty_array(face, "static_abilities"),
        "replacements": field_or_empty_array(face, "replacements"),
        "additional_cost": face.get("additional_cost").cloned().unwrap_or(Value::Null),
        "casting_options": field_or_empty_array(face, "casting_options"),
        "casting_restrictions": field_or_empty_array(face, "casting_restrictions"),
        "strive_cost": face.get("strive_cost").cloned().unwrap_or(Value::Null),
    })
}

fn field_or_empty_array(face: &Value, field: &str) -> Value {
    face.get(field).cloned().unwrap_or_else(|| json!([]))
}

fn display_name_from_raw(raw: &Value) -> String {
    let mut names = Vec::new();
    collect_raw_names(raw, &mut names);
    if names.is_empty() {
        "<no name>".to_string()
    } else {
        names.join(" // ")
    }
}

fn collect_raw_names(value: &Value, names: &mut Vec<String>) {
    if let Some(name) = value.get("Name").and_then(Value::as_str) {
        names.push(name.to_string());
        return;
    }

    for key in [
        "FrontFace",
        "BackFace",
        "Adventure",
        "Prepared",
        "Omen",
        "Unflipped",
        "Flipped",
        "LeftDoor",
        "RightDoor",
    ] {
        if let Some(child) = value.get(key) {
            collect_raw_names(child, names);
        }
    }

    if let Some(cards) = value.get("Cards").and_then(Value::as_array) {
        for child in cards {
            collect_raw_names(child, names);
        }
    }
}

fn converted_face_names(card: &OracleCard) -> Vec<String> {
    match card {
        OracleCard::Card { name, rules, .. } => names_for_optional_rules(name, rules),
        OracleCard::MeldPiece { name, .. }
        | OracleCard::Melded { name, .. }
        | OracleCard::Planar { name, .. }
        | OracleCard::Conspiracy { name, .. }
        | OracleCard::Scheme { name, .. }
        | OracleCard::Dungeon { name, .. }
        | OracleCard::Vanguard { name, .. } => vec![name.clone()],
        OracleCard::Adventurer {
            name,
            rules,
            adventure,
            ..
        }
        | OracleCard::Preparer {
            name,
            rules,
            prepared: adventure,
            ..
        } => {
            let mut names = names_for_optional_rules(name, rules);
            names.extend(names_for_card(adventure));
            names
        }
        OracleCard::Ominous { name, omen, .. } => {
            let mut names = vec![name.clone()];
            names.extend(names_for_card(omen));
            names
        }
        OracleCard::ModalDFC {
            front_face,
            back_face,
        }
        | OracleCard::Transforming {
            front_face,
            back_face,
        } => {
            let mut names = names_for_card(front_face);
            names.extend(names_for_card(back_face));
            names
        }
        OracleCard::Flip {
            unflipped, flipped, ..
        } => {
            let mut names = names_for_flip(unflipped);
            names.extend(names_for_flip(flipped));
            names
        }
        OracleCard::Room {
            left_door,
            right_door,
            ..
        } => {
            let mut names = names_for_door(left_door);
            names.extend(names_for_door(right_door));
            names
        }
        OracleCard::Split { cards } => cards.iter().flat_map(names_for_card).collect(),
        OracleCard::StickerSheet { .. } => Vec::new(),
    }
}

fn names_for_optional_rules(
    name: &str,
    rules: &Option<Vec<mtgish_import::schema::types::Rule>>,
) -> Vec<String> {
    if rules.is_some() {
        vec![name.to_string()]
    } else {
        Vec::new()
    }
}

fn names_for_card(card: &Card) -> Vec<String> {
    names_for_optional_rules(&card.name, &card.rules)
}

fn names_for_flip(face: &FlipInfo) -> Vec<String> {
    vec![face.name.clone()]
}

fn names_for_door(face: &DoorInfo) -> Vec<String> {
    vec![face.name.clone()]
}

fn percent(numerator: usize, denominator: usize) -> f64 {
    if denominator == 0 {
        0.0
    } else {
        ((numerator as f64 / denominator as f64) * 10_000.0).round() / 100.0
    }
}

fn severity_name(severity: Severity) -> &'static str {
    match severity {
        Severity::SemanticDivergence => "SemanticDivergence",
        Severity::ScopeDivergence => "ScopeDivergence",
        Severity::Cosmetic => "Cosmetic",
    }
}
