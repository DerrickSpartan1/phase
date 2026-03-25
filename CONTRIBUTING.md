# Contributing to phase.rs

Thanks for your interest in contributing! This project maintains a high bar for code quality and rules correctness. Please read this guide before opening a pull request.

## Getting Started

### Prerequisites

- [Rust toolchain](https://rustup.rs/)
- wasm32 target: `rustup target add wasm32-unknown-unknown`
- wasm-bindgen-cli: `cargo install wasm-bindgen-cli@0.2.114`
- wasm-opt (optional): `brew install binaryen` or `apt install binaryen`
- [Node.js](https://nodejs.org/) 18+ and [pnpm](https://pnpm.io/): `npm i -g pnpm`

### Setup

```bash
git clone https://github.com/phase-rs/phase && cd phase
./scripts/setup.sh     # Downloads card data, builds WASM, installs deps
cd client && pnpm dev  # Start dev server at localhost:5173
```

### Running Tests

```bash
# Rust
cargo test-all                             # All tests (nextest)
cargo clippy --all-targets -- -D warnings  # Lint
cargo fmt --all -- --check                 # Format check

# Frontend
cd client
pnpm lint                                  # ESLint
pnpm run type-check                        # TypeScript check
pnpm test -- --run                         # Vitest (single run)
```

## Before You Start

**Open an issue or discussion first.** Unsolicited PRs for new features or large refactors are likely to be declined. This project has specific architectural opinions and a high correctness bar — discussing your approach before writing code saves everyone time.

Good candidates for contribution without prior discussion:
- Bug fixes with a clear reproduction
- Typos or documentation corrections
- Test coverage improvements

For anything else — new mechanics, parser extensions, engine changes — please open an issue describing what you'd like to do and why.

## Submitting Changes

1. Fork the repo and create a branch from `main`
2. Make your changes — keep commits focused and well-described
3. Ensure `cargo fmt`, `cargo clippy`, and `cargo test-all` pass
4. If you changed frontend code, ensure `pnpm lint`, `pnpm run type-check`, and `pnpm test -- --run` pass
5. Open a pull request against `main`

## Architecture Overview

The project has two main parts:

- **Rust engine** (`crates/engine/`) — all game rules, parsing, and logic live here
- **React frontend** (`client/`) — a pure display layer that renders engine-provided state

Key principle: **the engine owns all logic.** If you need the frontend to show something, add it to the engine's output rather than computing it client-side.

For more detail, see the [Architecture section](README.md#architecture) in the README.

## Conventions

### Rust

- Run `cargo fmt` before committing — CI enforces it
- Use `cargo clippy --all-targets -- -D warnings` — zero warnings policy
- Prefer exhaustive `match` over wildcard fallbacks
- Use `strip_prefix`/`strip_suffix` over `starts_with` + manual slicing
- Annotate game rules with CR (Comprehensive Rules) numbers: `// CR 704.5a: ...`
- Verify CR numbers against `docs/MagicCompRules.txt` before adding them

### TypeScript

- ESLint with `@typescript-eslint/recommended`
- Unused variables prefixed with `_`
- No game logic in the frontend — display and dispatch only

### Commit Messages

Follow conventional commits: `type(scope): description`

```
feat(engine): add ward keyword ability
fix(client): mana payment overlay not closing on escape
docs: update README coverage badges
```

## Design Principles

- **Build for the class, not the card.** Every new parser pattern, effect handler, or filter should handle a category of cards, not a single card.
- **Rules-correct over convenient.** The MTG Comprehensive Rules are the source of truth. When a rules-correct implementation is more complex than a shortcut, take the complex path.
- **Compose from building blocks.** Decompose features into reusable primitives. Check existing helpers in `parser/oracle_util.rs`, `game/filter.rs`, `game/quantity.rs`, and `game/ability_utils.rs` before writing new ones.

## Getting Help

- Join the [Discord](https://discord.gg/dUZwhYHUyk) to ask questions or discuss ideas
- Open an issue for bugs or feature requests

## License

By contributing, you agree that your contributions will be dual-licensed under [MIT](LICENSE-MIT) and [Apache 2.0](LICENSE-APACHE).
