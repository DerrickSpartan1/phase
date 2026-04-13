//! Layer 2 — Plan: derived schedule (static prior) + per-decision realization.
//!
//! `derive_snapshot` lives in `curves.rs` and consumes a `DeckFeatures` prior
//! to produce a `PlanSnapshot`. Live realization (`PlanState`) is Phase C+.

pub mod curves;

pub use curves::derive_snapshot;

/// Tempo classification of a deck — a coarse strategic axis used by the plan.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum TempoClass {
    Aggro,
    #[default]
    Midrange,
    Ramp,
    Control,
    Combo,
}

/// Static deck prior — computed once per deck.
#[derive(Debug, Clone, Default)]
pub struct PlanSnapshot {
    pub expected_lands: [u8; 15],
    pub expected_mana: [u8; 15],
    pub expected_threats: [u8; 15],
    pub tempo_class: TempoClass,
}

/// Live per-decision realization — derived cheaply from snapshot + current state.
#[derive(Debug, Clone, Copy, Default)]
pub struct PlanState {
    pub lands_behind: i8,
    pub mana_behind: i8,
    pub threats_behind: i8,
}
