---
phase: 47-ir-module-type-migration
plan: 02
subsystem: parser/oracle_ir
tags: [ir, types, ast, document-model]
dependency_graph:
  requires: [47-01]
  provides: [OracleDocIr, OracleItemIr]
  affects: [parser/oracle_ir/doc.rs, parser/oracle_ir/mod.rs]
tech_stack:
  added: []
  patterns: [document-IR-envelope, variant-per-parser-category]
key_files:
  created:
    - crates/engine/src/parser/oracle_ir/doc.rs
  modified:
    - crates/engine/src/parser/oracle_ir/mod.rs
    - crates/engine/src/parser/oracle_ir/ast.rs
    - crates/engine/src/parser/oracle_effect/mod.rs
decisions:
  - "Used #[allow(dead_code)] and #[allow(clippy::large_enum_variant)] since IR types are defined ahead of usage (Phase 48 wires them in)"
  - "No Serialize/Deserialize derives — IR types are crate-internal only"
  - "Variants carry existing engine types directly per D-05 (no premature newtype wrappers)"
metrics:
  duration: "3m"
  completed: "2026-05-02"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 4
---

# Phase 47 Plan 02: Document-Level IR Types Summary

OracleDocIr and OracleItemIr types covering all 11 parser output categories with pub(crate) visibility and no serialization

## Completed Tasks

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create OracleDocIr and OracleItemIr types with basic tests | 3ec2e419d | doc.rs, mod.rs |

## Implementation Details

- `OracleDocIr`: Document envelope with `items: Vec<OracleItemIr>`, `source_text: String`, `card_name: String`
- `OracleItemIr`: 11 variants — Spell, Trigger, Static, Replacement, Keyword, Modal, AdditionalCost, CastingRestriction, CastingOption, SolveCondition, StriveCost
- All variants carry existing engine types directly (AbilityDefinition, TriggerDefinition, etc.)
- 3 unit tests: empty construction, keyword variant wrapping, mixed-item doc

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-existing unused import lint in oracle_effect/mod.rs**
- **Found during:** Task 1
- **Issue:** `TokenDescription` re-export from `oracle_ir::ast` was unused, blocking clippy -D warnings
- **Fix:** Added `#[allow(unused_imports)]` annotation (re-export is intentional for future migration consumers)
- **Files modified:** crates/engine/src/parser/oracle_effect/mod.rs
- **Commit:** 3ec2e419d

**2. [Rule 3 - Blocking] Fixed pre-commit hook false positive on ast.rs allow-noncombinator placement**
- **Found during:** Task 1
- **Issue:** `cargo fmt` moved the `allow-noncombinator` annotation to a line the hook didn't check (inside closure body instead of preceding line)
- **Fix:** Moved annotation to the line immediately preceding the `strip_prefix` call
- **Files modified:** crates/engine/src/parser/oracle_ir/ast.rs
- **Commit:** 3ec2e419d

## Verification Results

- `cargo clippy -p engine -- -D warnings`: PASS (exit 0)
- `cargo test -p engine -- oracle_ir::doc`: 3 tests PASS
- `cargo test -p engine`: 6026 passed, 8 ignored, 0 failed
- No `Serialize`/`Deserialize` derives in doc.rs
- All visibility is `pub(crate)` (no `pub(super)`)

## Self-Check: PASSED
