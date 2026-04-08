#![allow(unused_imports)]
use super::*;

/// CR 510.1: Unblocked attacker deals combat damage to defending player
#[test]
fn unblocked_attacker_deals_damage_to_player() {
    let mut scenario = GameScenario::new();
    scenario.at_phase(Phase::PreCombatMain);
    let attacker_id = scenario.add_creature(P0, "Bear", 2, 2).id();
    let mut runner = scenario.build();

    run_combat(&mut runner, vec![attacker_id], vec![]);

    let state = runner.state();
    let p1_life = state.players.iter().find(|p| p.id == P1).unwrap().life;
    assert_eq!(
        p1_life, 18,
        "Defending player should take 2 damage from unblocked 2/2"
    );
}

/// CR 510.1c: Blocked creature and blocker exchange damage
#[test]
fn blocked_creature_and_blocker_exchange_damage() {
    let mut scenario = GameScenario::new();
    scenario.at_phase(Phase::PreCombatMain);
    let attacker_id = scenario.add_creature(P0, "Centaur", 3, 3).id();
    let blocker_id = scenario.add_creature(P1, "Bear", 2, 2).id();
    let mut runner = scenario.build();

    run_combat(
        &mut runner,
        vec![attacker_id],
        vec![(blocker_id, attacker_id)],
    );

    let state = runner.state();
    // Blocker (2/2) took 3 damage (lethal) -- should be in graveyard after SBAs
    assert!(
        !state.battlefield.contains(&blocker_id),
        "2/2 blocker should die to 3 damage"
    );
    // Attacker (3/3) took 2 damage -- survives
    let attacker = &state.objects[&attacker_id];
    assert_eq!(
        attacker.damage_marked, 2,
        "3/3 attacker should have 2 damage marked"
    );
    assert!(
        state.battlefield.contains(&attacker_id),
        "3/3 attacker should survive with 2 damage"
    );
}

/// CR 510.1b: First strike damage resolves before regular damage
#[test]
fn first_strike_kills_before_regular_damage() {
    let mut scenario = GameScenario::new();
    scenario.at_phase(Phase::PreCombatMain);
    let attacker_id = {
        let mut b = scenario.add_creature(P0, "Knight", 2, 2);
        b.first_strike();
        b.id()
    };
    let blocker_id = scenario.add_creature(P1, "Bear", 3, 2).id();
    let mut runner = scenario.build();

    run_combat(
        &mut runner,
        vec![attacker_id],
        vec![(blocker_id, attacker_id)],
    );

    let state = runner.state();
    // First strike 2/2 deals 2 to blocker with toughness 2 = lethal.
    // Blocker dies before dealing regular damage.
    assert!(
        !state.battlefield.contains(&blocker_id),
        "Blocker should die to first strike damage before dealing regular damage"
    );
    assert_eq!(
        state.objects[&attacker_id].damage_marked, 0,
        "First strike attacker should take 0 damage (blocker died before regular step)"
    );

    // Snapshot for regression anchoring
    insta::assert_json_snapshot!(
        "combat_first_strike_kills_before_regular",
        runner.snapshot()
    );
}

/// CR 510.1c: Double strike deals damage in both steps
#[test]
fn double_strike_deals_damage_in_both_steps() {
    let mut scenario = GameScenario::new();
    scenario.at_phase(Phase::PreCombatMain);
    let attacker_id = {
        let mut b = scenario.add_creature(P0, "Champion", 3, 3);
        b.double_strike();
        b.id()
    };
    let blocker_id = scenario.add_creature(P1, "Rhino", 5, 5).id();
    let mut runner = scenario.build();

    run_combat(
        &mut runner,
        vec![attacker_id],
        vec![(blocker_id, attacker_id)],
    );

    let state = runner.state();
    // Double strike 3/3 deals 3 in first strike step + 3 in regular step = 6 total
    // 6 >= 5 toughness = lethal, blocker should die
    assert!(
        !state.battlefield.contains(&blocker_id),
        "5/5 blocker should die to 6 total damage from double strike 3/3"
    );
}

/// CR 702.2b: Defender can't attack
#[test]
fn defender_cannot_attack() {
    let mut scenario = GameScenario::new();
    scenario.at_phase(Phase::PreCombatMain);
    let wall_id = {
        let mut b = scenario.add_creature(P0, "Wall", 0, 4);
        b.defender();
        b.id()
    };
    let mut runner = scenario.build();

    // Pass priority to get to DeclareAttackers
    runner.pass_both_players();

    // Trying to declare a defender as attacker should fail
    let result = runner.act(GameAction::DeclareAttackers {
        attacks: vec![(wall_id, AttackTarget::Player(P1))],
    });
    assert!(
        result.is_err(),
        "Creature with Defender should not be able to attack"
    );
}

/// CR 510.1: Multiple attackers and blockers resolve correctly
#[test]
fn multiple_attackers_mixed_blocking() {
    let mut scenario = GameScenario::new();
    scenario.at_phase(Phase::PreCombatMain);
    let attacker1 = scenario.add_creature(P0, "Centaur", 3, 3).id();
    let attacker2 = scenario.add_creature(P0, "Bear", 2, 2).id();
    let blocker = scenario.add_creature(P1, "Guard", 2, 2).id();
    let mut runner = scenario.build();

    // One blocker blocks attacker1, attacker2 is unblocked
    run_combat(
        &mut runner,
        vec![attacker1, attacker2],
        vec![(blocker, attacker1)],
    );

    // Unblocked attacker2 (2/2) deals 2 damage to P1
    assert_eq!(
        runner.life(P1),
        18,
        "Unblocked 2/2 should deal 2 damage to defending player"
    );

    // Blocked exchange: 3/3 vs 2/2 -- blocker dies, attacker takes 2 damage
    let state = runner.state();
    assert!(
        !state.battlefield.contains(&blocker),
        "2/2 blocker should die to 3/3 attacker"
    );
    assert_eq!(
        state.objects[&attacker1].damage_marked, 2,
        "3/3 attacker should have 2 damage from blocker"
    );

    // Snapshot for regression anchoring
    insta::assert_json_snapshot!(
        "combat_multiple_attackers_mixed_blocking",
        runner.snapshot()
    );
}

/// CR 510.1: Attacker taps when attacking (no vigilance)
#[test]
fn attacker_taps_when_attacking() {
    let mut scenario = GameScenario::new();
    scenario.at_phase(Phase::PreCombatMain);
    let attacker_id = scenario.add_creature(P0, "Bear", 2, 2).id();
    let mut runner = scenario.build();

    // Pass priority to get to DeclareAttackers
    runner.pass_both_players();

    runner
        .act(GameAction::DeclareAttackers {
            attacks: vec![(attacker_id, AttackTarget::Player(P1))],
        })
        .expect("DeclareAttackers should succeed");

    assert!(
        runner.state().objects[&attacker_id].tapped,
        "Attacker without vigilance should be tapped after declaring attack"
    );
}

/// CR 603.2 + CR 704.3: DamageReceived triggers fire even when the source creature
/// dies from the same combat damage (triggers are collected before SBAs destroy it).
/// Regression test for Jackal Pup / Boros Reckoner pattern.
#[test]
fn damage_received_trigger_fires_when_creature_dies() {
    use engine::types::ability::{
        AbilityDefinition, AbilityKind, Effect, QuantityExpr, QuantityRef, TargetFilter,
        TriggerDefinition,
    };
    use engine::types::triggers::TriggerMode;

    let mut scenario = GameScenario::new();
    scenario.at_phase(Phase::PreCombatMain);

    // P0 attacks with a vanilla 1/1 — it will die to the blocker
    let attacker_id = scenario.add_creature(P0, "Goblin", 1, 1).id();

    // P1 blocks with a "Jackal Pup" — 2/1 with DamageReceived trigger that deals
    // that much damage to its controller (P1).
    let pup_trigger = TriggerDefinition::new(TriggerMode::DamageReceived)
        .execute(AbilityDefinition::new(
            AbilityKind::Spell,
            Effect::DealDamage {
                amount: QuantityExpr::Ref {
                    qty: QuantityRef::EventContextAmount,
                },
                target: TargetFilter::Controller,
                damage_source: None,
            },
        ))
        .valid_card(TargetFilter::SelfRef)
        .trigger_zones(vec![Zone::Battlefield]);

    let pup_id = {
        let mut b = scenario.add_creature(P1, "Jackal Pup", 2, 1);
        b.with_trigger_definition(pup_trigger);
        b.id()
    };

    let mut runner = scenario.build();

    run_combat(&mut runner, vec![attacker_id], vec![(pup_id, attacker_id)]);

    // After combat damage, both creatures die (1 toughness each).
    // The trigger should be on the stack — resolve it.
    runner.resolve_top();

    // Jackal Pup took 1 damage from the 1/1 attacker, so its trigger should deal
    // 1 damage to P1 (its controller).
    assert_eq!(
        runner.life(P1),
        19,
        "Jackal Pup's DamageReceived trigger should deal 1 damage to its controller"
    );

    // Verify both creatures died
    assert!(
        !runner.state().battlefield.contains(&attacker_id),
        "1/1 attacker should die to 2 damage from Jackal Pup"
    );
    assert!(
        !runner.state().battlefield.contains(&pup_id),
        "Jackal Pup (2/1) should die to 1 damage from attacker"
    );
}

/// CR 603.10a: Dies triggers (leaves-the-battlefield) fire from graveyard scan
/// after combat damage. The ZoneChanged events from SBAs are processed by
/// run_post_action_pipeline when auto_advance returns Priority after CombatDamage.
#[test]
fn dies_trigger_fires_from_combat_damage() {
    use engine::types::ability::{
        AbilityDefinition, AbilityKind, Effect, QuantityExpr, TargetFilter, TriggerDefinition,
    };
    use engine::types::triggers::TriggerMode;

    let mut scenario = GameScenario::new();
    scenario.at_phase(Phase::PreCombatMain);

    let attacker_id = scenario.add_creature(P0, "Bear", 3, 3).id();

    // P1 creature with "When this creature dies, you gain 3 life."
    let dies_trigger = TriggerDefinition::new(TriggerMode::ChangesZone)
        .execute(AbilityDefinition::new(
            AbilityKind::Spell,
            Effect::GainLife {
                amount: QuantityExpr::Fixed { value: 3 },
                player: engine::types::ability::GainLifePlayer::Controller,
            },
        ))
        .valid_card(TargetFilter::SelfRef)
        .origin(Zone::Battlefield)
        .destination(Zone::Graveyard)
        .trigger_zones(vec![Zone::Graveyard]);

    let blocker_id = {
        let mut b = scenario.add_creature(P1, "Doomed Traveler", 1, 1);
        b.with_trigger_definition(dies_trigger);
        b.id()
    };

    let mut runner = scenario.build();

    run_combat(
        &mut runner,
        vec![attacker_id],
        vec![(blocker_id, attacker_id)],
    );

    // CR 510.4: After combat damage, players receive priority. The dies trigger
    // is placed on the stack by run_post_action_pipeline processing ZoneChanged events.
    // Resolve the trigger by passing priority.
    runner.resolve_top();

    assert!(
        !runner.state().battlefield.contains(&blocker_id),
        "1/1 blocker should die to 3 damage"
    );

    // P1 started at 20, blocker died → trigger grants 3 life → 23
    assert_eq!(
        runner.life(P1),
        23,
        "Dies trigger should fire and grant 3 life to controller"
    );
}
