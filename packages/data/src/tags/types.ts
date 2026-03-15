/**
 * Effect tag types mirrored from packages/engine/src/types.ts.
 * Keep in sync when new EffectTag variants are added to the engine.
 */

export interface RebuildRealmEffect {
  type: "rebuild_realm"
}

export interface TurnTriggerEffect {
  type: "turn_trigger"
  timing: "start" | "end"
}

export interface CounterEventEffect {
  type: "counter_event"
}

export interface CounterSpellEffect {
  type: "counter_spell"
}

export type EffectTag = RebuildRealmEffect | TurnTriggerEffect | CounterEventEffect | CounterSpellEffect
