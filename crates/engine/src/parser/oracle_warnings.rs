//! Thread-local parse warning accumulator.
//!
//! Collects diagnostic warnings during Oracle text parsing — silent fallbacks,
//! ignored remainders, bare filters — without changing any parse results.
//! Warnings are harvested after each card's parse and stored on `CardFace`.

use std::cell::RefCell;

use super::oracle_ir::diagnostic::OracleDiagnostic;

thread_local! {
    static WARNINGS: RefCell<Vec<String>> = const { RefCell::new(Vec::new()) };
    /// Typed diagnostics accumulated in parallel with string warnings (D-11 dual-emit).
    /// Temporary scaffolding — Plan 3 removes the string WARNINGS and promotes this.
    static TYPED_DIAGNOSTICS: RefCell<Vec<OracleDiagnostic>> = const { RefCell::new(Vec::new()) };
}

/// Push a diagnostic warning for the card currently being parsed.
pub fn push_warning(msg: impl Into<String>) {
    WARNINGS.with(|w| w.borrow_mut().push(msg.into()));
}

/// Drain all accumulated warnings (returns them and clears the buffer).
pub fn take_warnings() -> Vec<String> {
    WARNINGS.with(|w| w.borrow_mut().drain(..).collect())
}

/// Discard any accumulated warnings (called at the start of each card parse).
pub fn clear_warnings() {
    WARNINGS.with(|w| w.borrow_mut().clear());
}

/// Snapshot the current warnings buffer length. Pair with `truncate_warnings`
/// to roll back any warnings emitted during a trial parse that ends up being
/// rejected — e.g., `try_parse_choose_one_of_inline` runs `parse_effect_clause`
/// on a candidate left/right half before deciding whether the split is
/// real, and side-effects from those trial parses must not leak into the
/// committed warnings buffer when the split is rejected.
pub fn snapshot_warnings() -> usize {
    WARNINGS.with(|w| w.borrow().len())
}

/// Truncate the warnings buffer back to the given snapshot length, discarding
/// any warnings pushed since the snapshot. Used for trial-parse rollback.
pub fn truncate_warnings(snapshot: usize) {
    WARNINGS.with(|w| {
        let mut buf = w.borrow_mut();
        if snapshot < buf.len() {
            buf.truncate(snapshot);
        }
    });
}

// ── Typed diagnostic thread-local (D-11 dual-emit scaffolding) ───────────

/// Push a typed diagnostic alongside the existing string warning.
pub fn push_typed_diagnostic(d: OracleDiagnostic) {
    TYPED_DIAGNOSTICS.with(|v| v.borrow_mut().push(d));
}

/// Drain all typed diagnostics (returns them and clears the buffer).
pub fn take_typed_diagnostics() -> Vec<OracleDiagnostic> {
    TYPED_DIAGNOSTICS.with(|v| v.borrow_mut().drain(..).collect())
}

/// Discard any typed diagnostics (called at the start of each card parse).
pub fn clear_typed_diagnostics() {
    TYPED_DIAGNOSTICS.with(|v| v.borrow_mut().clear());
}

/// Snapshot the current typed diagnostics buffer length.
pub fn snapshot_typed_diagnostics() -> usize {
    TYPED_DIAGNOSTICS.with(|v| v.borrow().len())
}

/// Truncate the typed diagnostics buffer back to the given snapshot length.
pub fn truncate_typed_diagnostics(snapshot: usize) {
    TYPED_DIAGNOSTICS.with(|v| {
        let mut buf = v.borrow_mut();
        if snapshot < buf.len() {
            buf.truncate(snapshot);
        }
    });
}
