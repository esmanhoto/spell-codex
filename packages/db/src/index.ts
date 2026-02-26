export { sql } from "./connection.ts"
export { hashState } from "./hash.ts"

export type { CreateGameInput } from "./games.ts"
export { createGame, getGame, getGamePlayers, setGameStatus, touchGame, findExpiredGames } from "./games.ts"

export type { SaveActionInput } from "./actions.ts"
export { saveAction, listActions, lastSequence } from "./actions.ts"

export type { ReconstructError, ReconstructResult } from "./reconstruct.ts"
export { reconstructState } from "./reconstruct.ts"

// Re-export schema types for callers that need them.
export type { Game, NewGame, GamePlayer, GameAction, NewGameAction } from "./schema.ts"
