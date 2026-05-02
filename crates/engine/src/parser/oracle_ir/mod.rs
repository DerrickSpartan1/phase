//! Unified Oracle IR module — AST types and document-level IR.
//!
//! Phase 47: Foundation module for the Oracle AST/IR layer (v1.4).
//! - `ast`: All parser AST types (moved from oracle_effect/types.rs, oracle_modal.rs, oracle.rs)
//! - `doc`: Document-level IR types (OracleDocIr, OracleItemIr) — added in plan 02

pub(crate) mod ast;

pub(crate) use self::ast::*;
