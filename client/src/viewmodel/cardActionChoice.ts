import type { GameAction, ObjectId } from "../adapter/types.ts";

export function collectObjectActions(
  legalActions: GameAction[],
  objectId: ObjectId,
): GameAction[] {
  const playActions = legalActions.filter(
    (action) =>
      (action.type === "PlayLand" || action.type === "CastSpell")
      && Number(action.data.object_id) === Number(objectId),
  );
  const abilityActions = legalActions.filter(
    (action) => action.type === "ActivateAbility" && Number(action.data.source_id) === Number(objectId),
  );
  return [...playActions, ...abilityActions];
}
