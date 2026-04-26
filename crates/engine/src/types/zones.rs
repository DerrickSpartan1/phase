use serde::{Deserialize, Serialize};

/// CR 400.1: The seven game zones — library, hand, battlefield, graveyard, stack, exile, and command.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Zone {
    /// CR 401: The library — a player's draw pile, face-down, order matters.
    Library,
    Hand,
    /// CR 403: The battlefield — where permanents exist.
    Battlefield,
    Graveyard,
    Stack,
    /// CR 406: The exile zone — a holding area for removed objects.
    Exile,
    /// CR 408: The command zone — reserved for emblems, commanders, dungeons, and other specialized objects.
    Command,
}

/// CR 118.9a + CR 601.2b + CR 601.2h: Source zone for an `AbilityCost::Exile`
/// payment. Only `Hand` (pitch spells, CR 118.9a) and `Graveyard` (escape,
/// CR 702.138a) are valid; any other zone is rejected at cost-resolution time
/// and falls through to the non-interactive path. Making the invariant a type
/// removes the load-bearing `unreachable!` panics that previously guarded
/// downstream matches on the broader `Zone` enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ExileCostSourceZone {
    Hand,
    Graveyard,
}

impl ExileCostSourceZone {
    pub fn as_zone(self) -> Zone {
        match self {
            Self::Hand => Zone::Hand,
            Self::Graveyard => Zone::Graveyard,
        }
    }

    pub fn try_from_zone(zone: Zone) -> Option<Self> {
        match zone {
            Zone::Hand => Some(Self::Hand),
            Zone::Graveyard => Some(Self::Graveyard),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zone_has_all_seven_mtg_zones() {
        let zones = [
            Zone::Library,
            Zone::Hand,
            Zone::Battlefield,
            Zone::Graveyard,
            Zone::Stack,
            Zone::Exile,
            Zone::Command,
        ];
        assert_eq!(zones.len(), 7);
    }

    #[test]
    fn zone_serializes_as_string() {
        let zone = Zone::Battlefield;
        let json = serde_json::to_value(zone).unwrap();
        assert_eq!(json, "Battlefield");
    }

    #[test]
    fn zone_roundtrips() {
        let zone = Zone::Graveyard;
        let serialized = serde_json::to_string(&zone).unwrap();
        let deserialized: Zone = serde_json::from_str(&serialized).unwrap();
        assert_eq!(zone, deserialized);
    }
}
