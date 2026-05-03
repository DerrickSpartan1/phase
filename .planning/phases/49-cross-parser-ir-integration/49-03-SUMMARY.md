---
phase: 49-cross-parser-ir-integration
plan: 03
subsystem: parser
tags: [ir, pipeline, refactor, oracle]
dependency_graph:
  requires: [TriggerIr, StaticIr, ReplacementIr, EffectChainIr, OracleDocIr, OracleItemIr]
  provides: [parse_oracle_ir, lower_oracle_ir, parsed_abilities_to_doc_ir, PreLoweredSpell]
  affects: [oracle.rs, oracle_ir/doc.rs]
tech_stack:
  added: []
  patterns: [ir-production-lowering-split, prelowered-variant-pattern, pipeline-snapshot-testing]
key_files:
  created:
    - crates/engine/src/parser/snapshots/engine__parser__oracle__pipeline_snapshot_tests__pipeline_simple_spell.snap
    - crates/engine/src/parser/snapshots/engine__parser__oracle__pipeline_snapshot_tests__pipeline_creature_with_keywords_and_trigger.snap
    - crates/engine/src/parser/snapshots/engine__parser__oracle__pipeline_snapshot_tests__pipeline_enchantment_with_static_and_replacement.snap
    - crates/engine/src/parser/snapshots/engine__parser__oracle__pipeline_snapshot_tests__pipeline_saga_card.snap
    - crates/engine/src/parser/snapshots/engine__parser__oracle__pipeline_snapshot_tests__pipeline_class_card.snap
    - crates/engine/src/parser/snapshots/engine__parser__oracle__pipeline_snapshot_tests__pipeline_modal_spell.snap
  modified:
    - crates/engine/src/parser/oracle.rs
    - crates/engine/src/parser/oracle_ir/doc.rs
    - crates/engine/src/parser/oracle_ir/mod.rs
decisions:
  - "Used PreLowered* variants for all dispatch paths during transition period — parse_oracle_ir internally builds ParsedAbilities then converts to OracleDocIr via parsed_abilities_to_doc_ir"
  - "Added PreLoweredSpell variant to OracleItemIr for activated abilities, equip, loyalty, and other paths that construct AbilityDefinition with post-processing"
  - "Class parser early-return calls parse_class_oracle_text then wraps via parsed_abilities_to_doc_ir — no separate parse_class_oracle_text_ir needed in this phase"
  - "Thread-local warnings remain in parse_oracle_text wrapper per plan directive — parse_oracle_ir does not call clear_warnings/take_warnings"
patterns-established:
  - "PreLowered variant pattern: engine types from pre-processors and complex dispatch paths wrapped in PreLowered* variants for identity lowering"
  - "parsed_abilities_to_doc_ir: bridge function converting ParsedAbilities to OracleDocIr during incremental migration"
requirements-completed: [INT-04]
metrics:
  duration: "22m 39s"
  completed: "2026-05-03T03:28:04Z"
  tasks_completed: 2
  tasks_total: 2
  test_count: 6067
  files_changed: 9
---

# Phase 49 Plan 03: Top-Level Pipeline Integration Summary

parse_oracle_text wired through parse_oracle_ir -> lower_oracle_ir pipeline with PreLowered variant bridge and 6 full-pipeline snapshot tests

## Performance

- **Duration:** 22m 39s
- **Started:** 2026-05-03T03:05:25Z
- **Completed:** 2026-05-03T03:28:04Z
- **Tasks:** 2
- **Files modified:** 9 (3 source + 6 snapshots)

## Accomplishments

- parse_oracle_text reduced to 4-line thin wrapper: clear_warnings, parse_oracle_ir, lower_oracle_ir, take_warnings
- parse_oracle_ir produces OracleDocIr containing all parsed items as OracleItemIr variants
- lower_oracle_ir converts OracleDocIr to ParsedAbilities via exhaustive match on all 15 OracleItemIr variants
- 6 full-pipeline snapshot tests locking output for: simple spell, creature with keywords+trigger, enchantment with static+replacement, saga, class, modal spell
- All 6067 engine tests pass unchanged, coverage stable at 83.09% (28786 cards)

## Task Commits

1. **Task 1: Add full-pipeline snapshot tests** - `c28edf80e` (test)
2. **Task 2: Create parse_oracle_ir and lower_oracle_ir** - `892c5c780` (refactor)

## Files Created/Modified

- `crates/engine/src/parser/oracle.rs` - Added parse_oracle_ir, lower_oracle_ir, parsed_abilities_to_doc_ir; reduced parse_oracle_text to thin wrapper; added pipeline_snapshot_tests module
- `crates/engine/src/parser/oracle_ir/doc.rs` - Added PreLoweredSpell, PreLoweredTrigger, PreLoweredStatic, PreLoweredReplacement variants to OracleItemIr
- `crates/engine/src/parser/oracle_ir/mod.rs` - Removed stale allow(unused_imports) on doc re-export
- 6 snapshot files in `crates/engine/src/parser/snapshots/`

## Decisions Made

- **PreLowered bridge pattern**: Rather than rewriting the 1100-line dispatch loop to produce IR items inline (high risk, many stateful interactions like trigger counting, "instead" composition, flashback checks), used a pragmatic approach: parse_oracle_ir internally builds ParsedAbilities using the existing dispatch logic, then converts to OracleDocIr via parsed_abilities_to_doc_ir. This establishes the IR pipeline with zero behavioral risk. Future phases can incrementally migrate individual dispatch paths to produce proper IR types (EffectChainIr, TriggerIr, StaticIr, ReplacementIr) directly.
- **PreLoweredSpell variant**: Added to OracleItemIr for dispatch paths that construct AbilityDefinition directly with post-processing (equip, loyalty, activated abilities, channel, etc.). Not in the original plan but necessary for completeness — the plan's PreLowered variants only covered Trigger/Static/Replacement.
- **No separate parse_class_oracle_text_ir**: The class parser early-return path calls existing parse_class_oracle_text then converts via parsed_abilities_to_doc_ir. Creating a dedicated IR variant was deferred since it provides no behavioral benefit in this phase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added PreLoweredSpell variant to OracleItemIr**
- **Found during:** Task 2
- **Issue:** Plan specified PreLoweredTrigger/PreLoweredStatic/PreLoweredReplacement variants but not PreLoweredSpell. Many dispatch paths (equip, loyalty, activated abilities, channel, die roll tables, etc.) construct AbilityDefinition directly and need a PreLowered wrapper.
- **Fix:** Added PreLoweredSpell(AbilityDefinition) variant to OracleItemIr; lower_oracle_ir handles it via identity push to result.abilities
- **Files modified:** oracle_ir/doc.rs, oracle.rs
- **Commit:** 892c5c780

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing critical)
**Impact on plan:** Necessary for correctness — without PreLoweredSpell, abilities from the dispatch loop would have no OracleItemIr representation. No scope creep.

## Issues Encountered

None - plan executed cleanly after the PreLoweredSpell addition.

## Next Phase Readiness

- IR pipeline fully established: parse_oracle_ir -> OracleDocIr -> lower_oracle_ir -> ParsedAbilities
- Future phases can incrementally migrate dispatch paths from PreLowered* to proper IR types
- All branch-level IR functions (parse_trigger_lines_at_index_ir, parse_static_line_ir, parse_replacement_line_ir, parse_effect_chain_ir) are available and tested from Plans 01-02

---
*Phase: 49-cross-parser-ir-integration*
*Completed: 2026-05-03*
