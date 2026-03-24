import type { GameEvent } from "../adapter/types";

export type VfxQuality = "full" | "reduced" | "minimal";

export type AnimationSpeed = "slow" | "normal" | "fast" | "instant";
export type CombatPacing = "normal" | "slow" | "cinematic";

export const SPEED_MULTIPLIERS: Record<AnimationSpeed, number> = {
  slow: 1.5,
  normal: 1.0,
  fast: 0.5,
  instant: 0,
};

/**
 * Additional pacing applied to combat choreography only.
 * Multiplies base combat event durations before global animation speed.
 */
export const COMBAT_PACING_MULTIPLIERS: Record<CombatPacing, number> = {
  normal: 1.0,
  slow: 1.35,
  cinematic: 1.75,
};

export interface StepEffect {
  event: GameEvent;
  duration: number;
}

export interface AnimationStep {
  effects: StepEffect[];
  duration: number;
}

export type PositionSnapshot = Map<number, DOMRect>;

/** Combat pacing defaults (normal speed). */
export const COMBAT_ENGAGEMENT_DURATION_MS = 900;

export const EVENT_DURATIONS: Record<string, number> = {
  ZoneChanged: 400,
  DamageDealt: COMBAT_ENGAGEMENT_DURATION_MS,
  LifeChanged: 300,
  SpellCast: 500,
  CreatureDestroyed: 400,
  TokenCreated: 400,
  CounterAdded: 200,
  CounterRemoved: 200,
  PermanentTapped: 200,
  PermanentUntapped: 200,
};

export const DEFAULT_DURATION = 200;

/** How long the card slam flight phase takes before impact (ms, before speed multiplier). */
export const CARD_SLAM_FLIGHT_MS = 200;
