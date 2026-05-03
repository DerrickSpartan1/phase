/* tslint:disable */
/* eslint-disable */

/**
 * Load the card database from a JSON string (card-data.json contents).
 * Required for Hard/VeryHard bot AI evaluation and accurate deck suggestion.
 * Returns the number of cards loaded.
 */
export function load_card_database(json_str: string): number;

/**
 * Start a Quick Draft session: 1 human + 7 bots.
 *
 * - `set_pool_json`: serialized LimitedSetPool from draft-pools.json
 * - `difficulty`: 0=VeryEasy, 1=Easy, 2=Medium, 3=Hard, 4=VeryHard
 * - `seed`: RNG seed for deterministic pack generation
 *
 * Returns the initial DraftPlayerView as a JS object.
 */
export function start_quick_draft(set_pool_json: string, difficulty: number, seed: number): any;

/**
 * Submit the human player's pick and resolve all bot picks synchronously.
 * Returns the updated DraftPlayerView.
 */
export function submit_pick(card_instance_id: string): any;

/**
 * Get the current DraftPlayerView without mutation.
 */
export function get_view(): any;

/**
 * Submit the human player's deck for limited play.
 * `main_deck_json`: JSON array of card instance ID strings.
 */
export function submit_deck(main_deck_json: string): any;

/**
 * Auto-suggest a playable Limited deck from the human's pool.
 * Returns a SuggestedDeck with ~23 spells + ~17 lands.
 */
export function suggest_deck(): any;

/**
 * Suggest land counts for a given set of spells.
 * `spells_json`: JSON array of card name strings from the pool.
 * Returns a map of land name -> count.
 */
export function suggest_lands(spells_json: string): any;

/**
 * Get a bot's auto-built deck for match play.
 * `bot_seat`: seat index 1-7 for the bot opponent.
 */
export function get_bot_deck(bot_seat: number): any;

/**
 * Create a multiplayer draft session (P2P host role).
 *
 * `set_pool_json`: serialized LimitedSetPool
 * `seats_json`: JSON array of seat descriptors
 * `kind`: 0=Quick, 1=Premier, 2=Traditional
 * `seed`: RNG seed
 * `draft_code`: unique room identifier
 */
export function create_multiplayer_draft(
  set_pool_json: string,
  seats_json: string,
  kind: number,
  seed: number,
  draft_code: string,
): any;

/**
 * Apply a draft action from any seat (P2P host forwards guest actions).
 * `action_json`: serialized DraftAction.
 * Returns array of DraftDeltas.
 */
export function apply_draft_action(action_json: string): any;

/**
 * Get a filtered draft view for a specific seat.
 * Used by P2P host to produce per-player state snapshots.
 */
export function get_draft_view_for_seat(seat_index: number): any;

/**
 * Get the current draft status string.
 */
export function get_draft_status(): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
}

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 */
export default function __wbg_init(module_or_path?: InitInput | Promise<InitInput>): Promise<InitOutput>;
