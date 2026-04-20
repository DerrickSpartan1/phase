//! Regression test for Abigale, Eloquent First-Year (BLC).
//!
//! Oracle text:
//!   Flying, first strike, lifelink
//!   When Abigale enters, up to one other target creature loses all
//!   abilities. Put a flying counter, a first strike counter, and a
//!   lifelink counter on that creature.
//!
//! Bug symptom: counters were landing on Abigale itself, not on the
//! targeted other creature. The second sentence's "that creature" is
//! an anaphor to the first sentence's target, lowered by the parser
//! as a `PutCounter` chain with `TargetFilter::ParentTarget`.

#![allow(unused_imports)]

use crate::rules::{GameAction, GameScenario, WaitingFor, Zone, P0, P1};
use engine::types::ability::TargetRef;
use engine::types::counter::CounterType;
use engine::types::phase::Phase;

fn flying() -> CounterType {
    CounterType::Generic("flying".to_string())
}
fn first_strike() -> CounterType {
    CounterType::Generic("first strike".to_string())
}
fn lifelink() -> CounterType {
    CounterType::Generic("lifelink".to_string())
}

#[test]
fn abigale_enters_puts_counters_on_target_creature_not_self() {
    let mut scenario = GameScenario::new();
    scenario.at_phase(Phase::PreCombatMain);

    let abigale_oracle = "Flying, first strike, lifelink\n\
        When Abigale enters, up to one other target creature loses all abilities. \
        Put a flying counter, a first strike counter, and a lifelink counter on that creature.";
    let abigale_builder =
        scenario.add_creature_to_hand_from_oracle(P0, "Abigale", 1, 1, abigale_oracle);
    let abigale_id = abigale_builder.id();

    let bear_id = scenario.add_creature(P1, "Grizzly Bears", 2, 2).id();

    let mut runner = scenario.build();
    let abigale_card_id = runner.state().objects[&abigale_id].card_id;

    runner
        .act(GameAction::CastSpell {
            object_id: abigale_id,
            card_id: abigale_card_id,
            targets: vec![],
        })
        .expect("cast Abigale");

    for _ in 0..30 {
        match runner.state().waiting_for.clone() {
            WaitingFor::TargetSelection { .. } | WaitingFor::TriggerTargetSelection { .. } => {
                runner
                    .act(GameAction::SelectTargets {
                        targets: vec![TargetRef::Object(bear_id)],
                    })
                    .expect("select bear as target");
            }
            WaitingFor::Priority { .. } => {
                if runner.state().stack.is_empty() {
                    // Pass once more to drain pending triggers into stack, then exit if truly idle.
                    if runner.act(GameAction::PassPriority).is_err() {
                        break;
                    }
                    if runner.state().stack.is_empty()
                        && matches!(runner.state().waiting_for, WaitingFor::Priority { .. })
                    {
                        break;
                    }
                } else if runner.act(GameAction::PassPriority).is_err() {
                    break;
                }
            }
            _ => break,
        }
    }

    let bear = runner.state().objects.get(&bear_id).expect("bear present");
    assert!(
        bear.counters.get(&flying()).copied().unwrap_or(0) >= 1,
        "Bear should have a flying counter; counters = {:?}",
        bear.counters,
    );
    assert!(
        bear.counters.get(&first_strike()).copied().unwrap_or(0) >= 1,
        "Bear should have a first strike counter; counters = {:?}",
        bear.counters,
    );
    assert!(
        bear.counters.get(&lifelink()).copied().unwrap_or(0) >= 1,
        "Bear should have a lifelink counter; counters = {:?}",
        bear.counters,
    );

    let abigale = runner
        .state()
        .objects
        .get(&abigale_id)
        .expect("abigale present");
    assert_eq!(
        abigale.counters.get(&flying()).copied().unwrap_or(0),
        0,
        "Abigale must not have a flying counter; counters = {:?}",
        abigale.counters,
    );
    assert_eq!(
        abigale.counters.get(&first_strike()).copied().unwrap_or(0),
        0,
        "Abigale must not have a first strike counter; counters = {:?}",
        abigale.counters,
    );
    assert_eq!(
        abigale.counters.get(&lifelink()).copied().unwrap_or(0),
        0,
        "Abigale must not have a lifelink counter; counters = {:?}",
        abigale.counters,
    );
}

#[test]
fn abigale_enters_with_no_target_skipped_puts_no_counters_on_self() {
    // When the optional "up to one other target creature" is skipped, the
    // anaphor "that creature" has no referent. No counters should land on
    // Abigale (CR 115.1d: "up to N" targets is independent of the second
    // sentence's placement clause — skipping means nothing gets counters).
    let mut scenario = GameScenario::new();
    scenario.at_phase(Phase::PreCombatMain);

    let abigale_oracle = "Flying, first strike, lifelink\n\
        When Abigale enters, up to one other target creature loses all abilities. \
        Put a flying counter, a first strike counter, and a lifelink counter on that creature.";
    let abigale_builder =
        scenario.add_creature_to_hand_from_oracle(P0, "Abigale", 1, 1, abigale_oracle);
    let abigale_id = abigale_builder.id();

    // No other creatures: "up to one" can only be zero targets.
    let mut runner = scenario.build();
    let abigale_card_id = runner.state().objects[&abigale_id].card_id;

    runner
        .act(GameAction::CastSpell {
            object_id: abigale_id,
            card_id: abigale_card_id,
            targets: vec![],
        })
        .expect("cast Abigale");

    for _ in 0..30 {
        match runner.state().waiting_for.clone() {
            WaitingFor::TargetSelection { .. } | WaitingFor::TriggerTargetSelection { .. } => {
                runner
                    .act(GameAction::SelectTargets { targets: vec![] })
                    .expect("skip optional target");
            }
            WaitingFor::Priority { .. } => {
                if runner.state().stack.is_empty() {
                    if runner.act(GameAction::PassPriority).is_err() {
                        break;
                    }
                    if runner.state().stack.is_empty()
                        && matches!(runner.state().waiting_for, WaitingFor::Priority { .. })
                    {
                        break;
                    }
                } else if runner.act(GameAction::PassPriority).is_err() {
                    break;
                }
            }
            _ => break,
        }
    }

    let abigale = runner
        .state()
        .objects
        .get(&abigale_id)
        .expect("abigale present");
    assert!(
        abigale.counters.is_empty(),
        "Abigale must not receive counters when the optional target was skipped; \
         counters = {:?}",
        abigale.counters,
    );
}
