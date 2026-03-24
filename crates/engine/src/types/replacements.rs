use std::fmt;
use std::str::FromStr;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// All replacement event types from Forge's replacement effect registry.
/// Matched case-sensitively against Forge event strings.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
pub enum ReplacementEvent {
    // --- First-class variants with active matchers/appliers ---
    DamageDone,
    Destroy,
    Discard,
    Draw,
    LoseLife,
    GainLife,
    TurnFaceUp,
    Counter,
    ChangeZone,
    Moved,
    AddCounter,
    RemoveCounter,
    CreateToken,
    Tap,
    Untap,
    DealtDamage,
    Mill,
    PayLife,
    LifeReduced,
    Attached,

    // --- Placeholder variants (recognized, no active logic yet) ---
    DrawCards,
    ProduceMana,
    Scry,
    Transform,
    Explore,

    // --- Stub-only Forge types (recognized but no-op) ---
    AssembleContraption,
    BeginPhase,
    BeginTurn,
    Cascade,
    CopySpell,
    DeclareBlocker,
    GameLoss,
    GameWin,
    Learn,
    LoseMana,
    PlanarDiceResult,
    Planeswalk,
    Proliferate,

    /// Fallback for truly unknown event strings.
    Other(String),
}

impl fmt::Display for ReplacementEvent {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ReplacementEvent::DamageDone => write!(f, "DamageDone"),
            ReplacementEvent::Destroy => write!(f, "Destroy"),
            ReplacementEvent::Discard => write!(f, "Discard"),
            ReplacementEvent::Draw => write!(f, "Draw"),
            ReplacementEvent::LoseLife => write!(f, "LoseLife"),
            ReplacementEvent::GainLife => write!(f, "GainLife"),
            ReplacementEvent::TurnFaceUp => write!(f, "TurnFaceUp"),
            ReplacementEvent::Counter => write!(f, "Counter"),
            ReplacementEvent::ChangeZone => write!(f, "ChangeZone"),
            ReplacementEvent::Moved => write!(f, "Moved"),
            ReplacementEvent::AddCounter => write!(f, "AddCounter"),
            ReplacementEvent::RemoveCounter => write!(f, "RemoveCounter"),
            ReplacementEvent::CreateToken => write!(f, "CreateToken"),
            ReplacementEvent::Tap => write!(f, "Tap"),
            ReplacementEvent::Untap => write!(f, "Untap"),
            ReplacementEvent::DealtDamage => write!(f, "DealtDamage"),
            ReplacementEvent::Mill => write!(f, "Mill"),
            ReplacementEvent::PayLife => write!(f, "PayLife"),
            ReplacementEvent::LifeReduced => write!(f, "LifeReduced"),
            ReplacementEvent::Attached => write!(f, "Attached"),
            ReplacementEvent::DrawCards => write!(f, "DrawCards"),
            ReplacementEvent::ProduceMana => write!(f, "ProduceMana"),
            ReplacementEvent::Scry => write!(f, "Scry"),
            ReplacementEvent::Transform => write!(f, "Transform"),
            ReplacementEvent::Explore => write!(f, "Explore"),
            ReplacementEvent::AssembleContraption => write!(f, "AssembleContraption"),
            ReplacementEvent::BeginPhase => write!(f, "BeginPhase"),
            ReplacementEvent::BeginTurn => write!(f, "BeginTurn"),
            ReplacementEvent::Cascade => write!(f, "Cascade"),
            ReplacementEvent::CopySpell => write!(f, "CopySpell"),
            ReplacementEvent::DeclareBlocker => write!(f, "DeclareBlocker"),
            ReplacementEvent::GameLoss => write!(f, "GameLoss"),
            ReplacementEvent::GameWin => write!(f, "GameWin"),
            ReplacementEvent::Learn => write!(f, "Learn"),
            ReplacementEvent::LoseMana => write!(f, "LoseMana"),
            ReplacementEvent::PlanarDiceResult => write!(f, "PlanarDiceResult"),
            ReplacementEvent::Planeswalk => write!(f, "Planeswalk"),
            ReplacementEvent::Proliferate => write!(f, "Proliferate"),
            ReplacementEvent::Other(s) => write!(f, "{s}"),
        }
    }
}

impl FromStr for ReplacementEvent {
    type Err = std::convert::Infallible;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let event = match s {
            "DamageDone" => ReplacementEvent::DamageDone,
            "Destroy" => ReplacementEvent::Destroy,
            "Discard" => ReplacementEvent::Discard,
            "Draw" => ReplacementEvent::Draw,
            "LoseLife" => ReplacementEvent::LoseLife,
            "GainLife" => ReplacementEvent::GainLife,
            "TurnFaceUp" => ReplacementEvent::TurnFaceUp,
            "Counter" => ReplacementEvent::Counter,
            "ChangeZone" => ReplacementEvent::ChangeZone,
            "Moved" => ReplacementEvent::Moved,
            "AddCounter" => ReplacementEvent::AddCounter,
            "RemoveCounter" => ReplacementEvent::RemoveCounter,
            "CreateToken" => ReplacementEvent::CreateToken,
            "Tap" => ReplacementEvent::Tap,
            "Untap" => ReplacementEvent::Untap,
            "DealtDamage" => ReplacementEvent::DealtDamage,
            "Mill" => ReplacementEvent::Mill,
            "PayLife" => ReplacementEvent::PayLife,
            "LifeReduced" => ReplacementEvent::LifeReduced,
            "Attached" => ReplacementEvent::Attached,
            "DrawCards" => ReplacementEvent::DrawCards,
            "ProduceMana" => ReplacementEvent::ProduceMana,
            "Scry" => ReplacementEvent::Scry,
            "Transform" => ReplacementEvent::Transform,
            "Explore" => ReplacementEvent::Explore,
            "AssembleContraption" => ReplacementEvent::AssembleContraption,
            "BeginPhase" => ReplacementEvent::BeginPhase,
            "BeginTurn" => ReplacementEvent::BeginTurn,
            "Cascade" => ReplacementEvent::Cascade,
            "CopySpell" => ReplacementEvent::CopySpell,
            "DeclareBlocker" => ReplacementEvent::DeclareBlocker,
            "GameLoss" => ReplacementEvent::GameLoss,
            "GameWin" => ReplacementEvent::GameWin,
            "Learn" => ReplacementEvent::Learn,
            "LoseMana" => ReplacementEvent::LoseMana,
            "PlanarDiceResult" => ReplacementEvent::PlanarDiceResult,
            "Planeswalk" => ReplacementEvent::Planeswalk,
            "Proliferate" => ReplacementEvent::Proliferate,
            other => ReplacementEvent::Other(other.to_string()),
        };
        Ok(event)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_known_replacement_events() {
        assert_eq!(
            ReplacementEvent::from_str("DamageDone").unwrap(),
            ReplacementEvent::DamageDone
        );
        assert_eq!(
            ReplacementEvent::from_str("Destroy").unwrap(),
            ReplacementEvent::Destroy
        );
        assert_eq!(
            ReplacementEvent::from_str("Moved").unwrap(),
            ReplacementEvent::Moved
        );
    }

    #[test]
    fn parse_promoted_replacement_events() {
        assert_eq!(
            ReplacementEvent::from_str("AddCounter").unwrap(),
            ReplacementEvent::AddCounter
        );
        assert_eq!(
            ReplacementEvent::from_str("CreateToken").unwrap(),
            ReplacementEvent::CreateToken
        );
        assert_eq!(
            ReplacementEvent::from_str("DealtDamage").unwrap(),
            ReplacementEvent::DealtDamage
        );
        assert_eq!(
            ReplacementEvent::from_str("Mill").unwrap(),
            ReplacementEvent::Mill
        );
    }

    #[test]
    fn parse_unknown_replacement_event() {
        assert_eq!(
            ReplacementEvent::from_str("FakeEvent").unwrap(),
            ReplacementEvent::Other("FakeEvent".to_string())
        );
    }

    #[test]
    fn display_roundtrips() {
        let events = vec![
            ReplacementEvent::DamageDone,
            ReplacementEvent::Moved,
            ReplacementEvent::AddCounter,
            ReplacementEvent::CreateToken,
            ReplacementEvent::DealtDamage,
            ReplacementEvent::Other("Custom".to_string()),
        ];
        for event in events {
            let s = event.to_string();
            assert_eq!(ReplacementEvent::from_str(&s).unwrap(), event);
        }
    }

    #[test]
    fn serde_roundtrip() {
        let events = vec![
            ReplacementEvent::DamageDone,
            ReplacementEvent::Destroy,
            ReplacementEvent::AddCounter,
            ReplacementEvent::CreateToken,
            ReplacementEvent::Other("Custom".to_string()),
        ];
        let json = serde_json::to_string(&events).unwrap();
        let deserialized: Vec<ReplacementEvent> = serde_json::from_str(&json).unwrap();
        assert_eq!(events, deserialized);
    }

    #[test]
    fn replacement_event_display_matches_forge_string() {
        assert_eq!(ReplacementEvent::DamageDone.to_string(), "DamageDone");
        assert_eq!(ReplacementEvent::Moved.to_string(), "Moved");
        assert_eq!(ReplacementEvent::AddCounter.to_string(), "AddCounter");
        assert_eq!(ReplacementEvent::CreateToken.to_string(), "CreateToken");
        assert_eq!(
            ReplacementEvent::Other("NewEvent".to_string()).to_string(),
            "NewEvent"
        );
    }
}
