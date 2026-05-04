# Bug Triage System — Operator Reference

## Quick Commands

```bash
# Full pipeline (fetch new Discord messages → extract → triage → render)
bun scripts/sync-bug-reports.ts fetch
bun scripts/sync-bug-reports.ts extract
bun scripts/sync-bug-reports.ts triage
bun scripts/sync-bug-reports.ts render

# Check a specific card's parser status
jq '.["card name"]' client/public/card-data.json
jq '.["card name"] | {abilities: [.abilities[]? | select(.effect.type == "Unimplemented")], triggers: [.triggers[]? | select(.mode == "Unknown")]}' client/public/card-data.json

# Regenerate card data (after parser changes)
./scripts/gen-card-data.sh

# Single card debug
cargo run --bin oracle-gen -- data --filter "card name"
```

## GitHub Issue Workflow

```bash
# List open issues by priority
gh issue list --repo phase-rs/phase --state open --label "priority:p0-softlock"
gh issue list --repo phase-rs/phase --state open --label "priority:p1-core-mechanic"

# Close a fixed issue
gh issue close <N> --repo phase-rs/phase --comment "Fixed in <commit>. Card is now fully parsed with no Unimplemented effects."

# Transition issue status
gh issue edit <N> --repo phase-rs/phase --remove-label "status:confirmed" --add-label "status:fixed-unreleased"
gh issue edit <N> --repo phase-rs/phase --remove-label "status:fixed-unreleased" --add-label "status:needs-runtime-verify"

# After runtime verification passes
gh issue close <N> --repo phase-rs/phase --comment "Verified in gameplay. Closing."
gh issue edit <N> --repo phase-rs/phase --remove-label "status:needs-runtime-verify" --add-label "status:verified"
```

## Status Lifecycle

```
needs-triage → confirmed → in-progress → fixed-unreleased → needs-runtime-verify → verified → closed
                                        → fixed-dirty-tree → fixed-unreleased → ...
                         → stale → closed
                         → wont-fix → closed
                         → duplicate → closed
```

## Resync Workflow (periodic maintenance)

Run this after parser/engine changes to update triage state:

### Step 1: Regenerate card data
```bash
./scripts/gen-card-data.sh
```

### Step 2: Re-run coverage cross-reference
Spawn a Sonnet agent to re-read `triage/llm-triage-items.jsonl` and cross-reference against the updated `client/public/card-data.json`. Write results to `triage/coverage-crossref.jsonl` and `triage/coverage-crossref-summary.md`.

### Step 3: Identify newly-fixed issues
Compare the new cross-reference against open GitHub issues. For each open issue where all referenced cards are now fully parsed:
- If the bug was a parser gap → close with comment citing the fix commit
- If the bug was a runtime issue → transition to `status:needs-runtime-verify`

### Step 4: Fetch new Discord messages
```bash
bun scripts/sync-bug-reports.ts fetch
```
If new messages exist, re-run extract → triage → render and review new items.

### Step 5: Update dashboard
```bash
bun scripts/sync-bug-reports.ts render
```

## Investigating Whether a Bug Is Fixed

### Parser-gap bugs (area:parser)
1. Check the card: `jq '.["card name"]' client/public/card-data.json`
2. Look for `Unimplemented` effects or `Unknown` triggers
3. If none found → parser gap is closed
4. Verify the specific ability mentioned in the bug has a real effect type (not just "the card parses")

### Runtime/engine bugs (area:engine)
1. Read the bug description
2. Find the relevant handler in `crates/engine/src/game/effects/` or `crates/engine/src/game/`
3. Check if the described behavior is handled correctly
4. Best: write a test that reproduces the bug scenario → if test passes, bug is fixed

### AI bugs (area:ai)
1. Check `crates/phase-ai/` for the relevant evaluation/action-generation logic
2. AI bugs are rarely caught by parser coverage — they need gameplay testing

## Triage Data Files

| File | Description | Gitignored |
|------|-------------|------------|
| `triage/raw/discord-messages.jsonl` | Raw Discord messages (775+) | yes |
| `triage/report-items.jsonl` | Heuristic-extracted report items | yes |
| `triage/triage-items.jsonl` | Heuristic triage classifications | yes |
| `triage/llm-triage-items.jsonl` | LLM (Sonnet) triage — 333 items, best quality | yes |
| `triage/coverage-crossref.jsonl` | Cross-reference against parser coverage | yes |
| `triage/coverage-crossref-summary.md` | Human-readable summary | yes |
| `triage/p0-verification.md` | Manual spot-check of P0 likely-fixed bugs | yes |
| `triage/unknown-card-mapping.json` | Card name corrections | yes |
| `triage/no-card-bugs.md` | Engine/UI bugs not tied to cards | yes |
| `triage/threads-compact.json` | Compact thread data for LLM agent input | yes |
| `triage/sync-state.json` | Incremental fetch cursors | yes |
| `triage/dashboard.md` | Generated dashboard | yes |

## Label Taxonomy

| Group | Labels | Purpose |
|-------|--------|---------|
| status | needs-triage, needs-repro, confirmed, in-progress, fixed-dirty-tree, fixed-unreleased, needs-card-data-regen, needs-runtime-verify, verified, stale, duplicate, wont-fix | Lifecycle |
| area | engine, parser, frontend, ui, ai, card-data, deckbuilder, multiplayer, infra | Ownership |
| priority | p0-softlock, p1-core-mechanic, p1-infinite-loop, p2-wrong-game-result, p2-interaction, p3-card-specific, p3-edge-case | Urgency |
| mechanic | triggered-abilities, mana, combat, tokens, costs, zone-change, continuous-effects, keyword, replacement-effects, counters, layers, attachments, modal, search, card-data-regen, ai-policy, targeting | Subsystem |
| source | discord, github, playtesting | Provenance |
| resolution | split, merged, upstream, cant-reproduce, by-design | Closure reason |
| special | collector | Omnibus issue marker |
