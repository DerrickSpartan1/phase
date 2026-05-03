/**
 * P2P Draft Tournament Host.
 *
 * Runs the authoritative DraftSession via draft-wasm and coordinates
 * an 8-player draft pod over PeerJS DataChannels. Follows the same
 * hub-and-spoke topology as `P2PHostAdapter` (game host), but speaks
 * the `DraftP2PMessage` protocol instead of `P2PMessage`.
 *
 * Requirements: P2P-01, P2P-03, P2P-05, P2P-06, P2P-07.
 */

import type Peer from "peerjs";
import type { DataConnection } from "peerjs";

import { DraftAdapter } from "./draft-adapter";
import type { DraftPlayerView, SeatPublicView } from "./draft-adapter";
import {
  createDraftPeerSession,
  type DraftPeerSession,
} from "../network/draftPeerSession";
import { DRAFT_PROTOCOL_VERSION } from "../network/draftProtocol";
import type { DraftP2PMessage } from "../network/draftProtocol";
import {
  saveDraftHostSession,
  clearDraftHostSession,
  type PersistedDraftHostSession,
} from "../services/draftPersistence";

// ── Types ──────────────────────────────────────────────────────────────

export type DraftHostEvent =
  | { type: "seatJoined"; seatIndex: number; displayName: string }
  | { type: "seatReconnected"; seatIndex: number }
  | { type: "seatDisconnected"; seatIndex: number }
  | { type: "seatKicked"; seatIndex: number; reason: string }
  | { type: "lobbyUpdate"; joined: number; total: number }
  | { type: "lobbyFull" }
  | { type: "draftStarted"; view: DraftPlayerView }
  | { type: "pickReceived"; seatIndex: number; cardInstanceId: string }
  | { type: "roundComplete" }
  | { type: "draftComplete" }
  | { type: "deckSubmitted"; seatIndex: number }
  | { type: "allDecksSubmitted" }
  | { type: "error"; message: string }
  | { type: "viewUpdated"; view: DraftPlayerView };

type DraftHostEventListener = (event: DraftHostEvent) => void;

/** Default grace window for guest reconnect during draft. */
const DRAFT_GRACE_PERIOD_MS = 60_000;

// ── P2PDraftHost ───────────────────────────────────────────────────────

export class P2PDraftHost {
  private adapter = new DraftAdapter();
  private listeners: DraftHostEventListener[] = [];

  private guestSessions = new Map<number, DraftPeerSession>();
  private seatTokens = new Map<number, string>();
  private seatNames = new Map<number, string>();
  private kickedTokens = new Set<string>();
  private disconnectedSeats = new Map<
    number,
    { disconnectedAt: number; timer: ReturnType<typeof setTimeout> | null }
  >();
  private picksThisRound = new Set<number>();

  private draftStarted = false;
  private draftCode = "";
  private hostConnectionUnsub: (() => void) | null = null;
  private paused = false;

  constructor(
    private readonly hostPeer: Peer,
    private readonly onGuestConnected: (
      handler: (conn: DataConnection) => void,
    ) => () => void,
    private readonly setPoolJson: string,
    private readonly kind: "Premier" | "Traditional",
    private readonly podSize: number,
    private readonly hostDisplayName: string,
    private readonly gracePeriodMs: number = DRAFT_GRACE_PERIOD_MS,
    private readonly persistenceId?: string,
    private readonly roomCode?: string,
  ) {
    // Host is always seat 0
    this.seatNames.set(0, hostDisplayName);
  }

  // ── Event emitter ──────────────────────────────────────────────────

  onEvent(listener: DraftHostEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: DraftHostEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  // ── Initialization ─────────────────────────────────────────────────

  async initialize(): Promise<void> {
    this.hostConnectionUnsub = this.onGuestConnected((conn) => {
      this.handleNewConnection(conn);
    });
    this.syncLobbyToGuests();
  }

  // ── Connection handling ────────────────────────────────────────────

  private handleNewConnection(conn: DataConnection): void {
    const session = createDraftPeerSession(conn, {
      onSessionEnd: () => {
        for (const [seat, s] of this.guestSessions.entries()) {
          if (s === session) {
            this.handleGuestDisconnect(seat);
            return;
          }
        }
      },
    });

    let identified = false;
    const unsub = session.onMessage((msg) => {
      if (identified) return;
      identified = true;
      unsub();

      if (msg.type === "draft_join") {
        this.handleNewGuest(session, msg.displayName);
      } else if (msg.type === "draft_reconnect") {
        this.handleReconnect(session, msg.draftToken);
      } else {
        session.send({
          type: "draft_reconnect_rejected",
          reason: "Expected draft_join or draft_reconnect as first message",
        });
        session.close("Protocol violation");
      }
    });
  }

  private handleNewGuest(session: DraftPeerSession, displayName: string): void {
    if (this.draftStarted) {
      session.send({ type: "draft_kicked", reason: "Draft already in progress" });
      session.close("Draft in progress");
      return;
    }

    const seat = this.firstOpenSeat();
    if (seat === null) {
      session.send({ type: "draft_kicked", reason: "Pod is full" });
      session.close("Pod full");
      return;
    }

    const token = crypto.randomUUID();
    this.seatTokens.set(seat, token);
    this.guestSessions.set(seat, session);
    this.seatNames.set(seat, displayName);

    session.onMessage((msg) => this.handleGuestMessage(seat, msg));

    // Send welcome with empty view (draft hasn't started)
    const emptyView: DraftPlayerView = this.buildLobbyView();

    session.send({
      type: "draft_welcome",
      draftProtocolVersion: DRAFT_PROTOCOL_VERSION,
      draftToken: token,
      seatIndex: seat,
      view: emptyView,
      draftCode: this.draftCode || "pending",
    });

    this.persistSession();
    this.emit({ type: "seatJoined", seatIndex: seat, displayName });
    this.syncLobbyToGuests();

    if (this.firstOpenSeat() === null) {
      this.emit({ type: "lobbyFull" });
    }
  }

  private handleReconnect(session: DraftPeerSession, draftToken: string): void {
    if (this.kickedTokens.has(draftToken)) {
      session.send({ type: "draft_reconnect_rejected", reason: "Player kicked" });
      session.close("Kicked");
      return;
    }

    let seat: number | null = null;
    for (const [s, token] of this.seatTokens) {
      if (token === draftToken) {
        seat = s;
        break;
      }
    }

    if (seat === null) {
      session.send({ type: "draft_reconnect_rejected", reason: "Unknown token" });
      session.close("Unknown token");
      return;
    }

    if (!this.disconnectedSeats.has(seat)) {
      session.send({
        type: "draft_reconnect_rejected",
        reason: "No grace window active for this seat",
      });
      session.close("Not in grace");
      return;
    }

    const grace = this.disconnectedSeats.get(seat)!;
    if (grace.timer !== null) clearTimeout(grace.timer);
    this.disconnectedSeats.delete(seat);
    this.guestSessions.set(seat, session);

    session.onMessage((msg) => this.handleGuestMessage(seat!, msg));

    // Send current view
    void (async () => {
      try {
        const view = this.draftStarted
          ? await this.adapter.getViewForSeat(seat!)
          : this.buildLobbyView();

        session.send({
          type: "draft_reconnect_ack",
          draftProtocolVersion: DRAFT_PROTOCOL_VERSION,
          seatIndex: seat!,
          view,
          draftCode: this.draftCode,
        });
      } catch (err) {
        console.error("[P2PDraftHost] reconnect view failed:", err);
      }
    })();

    for (const [otherSeat, otherSession] of this.guestSessions) {
      if (otherSeat === seat) continue;
      otherSession.send({
        type: "draft_lobby_update",
        seats: this.buildSeatPublicViews(),
        joined: this.occupiedSeatCount(),
        total: this.podSize,
      });
    }

    this.emit({ type: "seatReconnected", seatIndex: seat });

    // Resume if no other seats disconnected
    if (this.disconnectedSeats.size === 0 && this.paused) {
      this.paused = false;
      this.broadcastToGuests({ type: "draft_resumed" });
    }
  }

  // ── Message handling ───────────────────────────────────────────────

  private async handleGuestMessage(seat: number, msg: DraftP2PMessage): Promise<void> {
    switch (msg.type) {
      case "draft_pick": {
        if (!this.draftStarted || this.paused) {
          this.guestSessions.get(seat)?.send({
            type: "draft_error",
            reason: this.paused ? "Draft is paused" : "Draft not started",
          });
          return;
        }
        await this.handlePick(seat, msg.cardInstanceId);
        break;
      }
      case "draft_submit_deck": {
        if (!this.draftStarted) {
          this.guestSessions.get(seat)?.send({
            type: "draft_error",
            reason: "Draft not started",
          });
          return;
        }
        await this.handleDeckSubmission(seat, msg.mainDeck);
        break;
      }
      default:
        break;
    }
  }

  // ── Draft operations ───────────────────────────────────────────────

  /**
   * Start the draft. Called by the host UI once the pod is full
   * (or the host decides to start with fewer players).
   */
  async startDraft(): Promise<void> {
    if (this.draftStarted) return;

    const seatNames: string[] = [];
    for (let i = 0; i < this.podSize; i++) {
      seatNames.push(this.seatNames.get(i) ?? `Player ${i + 1}`);
    }

    const seed = Math.floor(Math.random() * 0xffffffff);
    const hostView = await this.adapter.startMultiplayerDraft(
      this.setPoolJson,
      this.kind,
      seatNames,
      seed,
    );

    this.draftStarted = true;
    this.draftCode = `draft-${seed.toString(16).padStart(8, "0")}`;
    this.picksThisRound.clear();

    // Send each guest their filtered view
    for (const [seat, session] of this.guestSessions) {
      try {
        const view = await this.adapter.getViewForSeat(seat);
        session.send({ type: "draft_state_update", view });
      } catch (err) {
        console.error(`[P2PDraftHost] Failed to send start view to seat ${seat}:`, err);
      }
    }

    this.persistSession();
    this.emit({ type: "draftStarted", view: hostView });
  }

  /**
   * Host submits their own pick (seat 0).
   */
  async submitHostPick(cardInstanceId: string): Promise<DraftPlayerView> {
    return this.handlePick(0, cardInstanceId);
  }

  /**
   * Host submits their own deck (seat 0).
   */
  async submitHostDeck(mainDeck: string[]): Promise<DraftPlayerView> {
    return this.handleDeckSubmission(0, mainDeck);
  }

  private async handlePick(seat: number, cardInstanceId: string): Promise<DraftPlayerView> {
    try {
      const view = await this.adapter.submitPickForSeat(seat, cardInstanceId);
      this.picksThisRound.add(seat);

      // Send pick acknowledgement to the picking player
      const session = this.guestSessions.get(seat);
      if (session) {
        session.send({ type: "draft_pick_ack", view });
      }

      this.emit({ type: "pickReceived", seatIndex: seat, cardInstanceId });
      this.persistSession();

      // Check if all picks for this round are in
      const allPicked = await this.adapter.allPicksSubmitted();
      if (allPicked) {
        this.picksThisRound.clear();
        this.emit({ type: "roundComplete" });

        // Broadcast updated views to all players
        await this.broadcastViews();

        // Check if draft is complete (deckbuilding)
        const hostView = await this.adapter.getViewForSeat(0);
        if (hostView.status === "Deckbuilding") {
          this.emit({ type: "draftComplete" });
        }
      }

      // Return the host's updated view if this was the host's pick
      if (seat === 0) {
        return view;
      }
      return await this.adapter.getViewForSeat(0);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const session = this.guestSessions.get(seat);
      if (session) {
        session.send({ type: "draft_error", reason });
      }
      throw err;
    }
  }

  private async handleDeckSubmission(seat: number, mainDeck: string[]): Promise<DraftPlayerView> {
    try {
      const view = await this.adapter.submitDeckForSeat(seat, mainDeck);

      const session = this.guestSessions.get(seat);
      if (session) {
        session.send({ type: "draft_state_update", view });
      }

      this.emit({ type: "deckSubmitted", seatIndex: seat });
      this.persistSession();

      // Check if all decks are submitted
      const hostView = await this.adapter.getViewForSeat(0);
      if (hostView.seats.every((s) => s.has_submitted_deck || s.is_bot)) {
        this.emit({ type: "allDecksSubmitted" });
      }

      if (seat === 0) return view;
      return hostView;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const session = this.guestSessions.get(seat);
      if (session) {
        session.send({ type: "draft_error", reason });
      }
      throw err;
    }
  }

  // ── Broadcast ──────────────────────────────────────────────────────

  private async broadcastViews(): Promise<void> {
    for (const [seat, session] of this.guestSessions) {
      if (this.disconnectedSeats.has(seat)) continue;
      try {
        const view = await this.adapter.getViewForSeat(seat);
        await session.send({ type: "draft_state_update", view });
      } catch (err) {
        console.error(`[P2PDraftHost] broadcast view error seat ${seat}:`, err);
      }
    }
    // Update host's own view
    try {
      const hostView = await this.adapter.getViewForSeat(0);
      this.emit({ type: "viewUpdated", view: hostView });
    } catch { /* best-effort */ }
  }

  private broadcastToGuests(msg: DraftP2PMessage): void {
    for (const [seat, session] of this.guestSessions) {
      if (this.disconnectedSeats.has(seat)) continue;
      session.send(msg);
    }
  }

  private syncLobbyToGuests(): void {
    const joined = this.occupiedSeatCount();
    const total = this.podSize;
    const seats = this.buildSeatPublicViews();

    for (const session of this.guestSessions.values()) {
      session.send({
        type: "draft_lobby_update",
        seats,
        joined,
        total,
      });
    }

    this.emit({ type: "lobbyUpdate", joined, total });
  }

  // ── Disconnect / Reconnect ─────────────────────────────────────────

  private handleGuestDisconnect(seat: number): void {
    if (!this.guestSessions.has(seat)) return;
    if (this.disconnectedSeats.has(seat)) return;

    this.guestSessions.delete(seat);

    if (!this.draftStarted) {
      // Pre-draft disconnect: free the seat
      this.seatTokens.delete(seat);
      this.seatNames.delete(seat);
      this.persistSession();
      this.syncLobbyToGuests();
      this.emit({ type: "seatDisconnected", seatIndex: seat });
      return;
    }

    // Mid-draft disconnect: grace window
    const timer = setTimeout(() => {
      // Grace expired — mark seat as abandoned but don't remove from draft
      // (other players' packs may depend on this seat's position)
      this.disconnectedSeats.delete(seat);
      this.emit({ type: "seatKicked", seatIndex: seat, reason: "Disconnect grace expired" });
    }, this.gracePeriodMs);

    this.disconnectedSeats.set(seat, { disconnectedAt: Date.now(), timer });

    if (!this.paused) {
      this.paused = true;
      this.broadcastToGuests({ type: "draft_paused", reason: "Player disconnected" });
    }

    this.emit({ type: "seatDisconnected", seatIndex: seat });
  }

  // ── Host controls ──────────────────────────────────────────────────

  kickPlayer(seat: number, reason: string = "Kicked by host"): void {
    const token = this.seatTokens.get(seat);
    if (token) this.kickedTokens.add(token);

    const session = this.guestSessions.get(seat);
    if (session) {
      session.send({ type: "draft_kicked", reason });
      session.close("Kicked");
      this.guestSessions.delete(seat);
    }

    // Cancel grace timer if active
    const grace = this.disconnectedSeats.get(seat);
    if (grace) {
      if (grace.timer !== null) clearTimeout(grace.timer);
      this.disconnectedSeats.delete(seat);
    }

    this.persistSession();
    this.emit({ type: "seatKicked", seatIndex: seat, reason });
    this.syncLobbyToGuests();
  }

  requestPause(): void {
    if (!this.paused) {
      this.paused = true;
      this.broadcastToGuests({ type: "draft_paused", reason: "Paused by host" });
    }
  }

  requestResume(): void {
    if (this.paused && this.disconnectedSeats.size === 0) {
      this.paused = false;
      this.broadcastToGuests({ type: "draft_resumed" });
    }
  }

  // ── Persistence (P2P-05) ──────────────────────────────────────────

  private persistSession(): void {
    if (!this.persistenceId) return;
    void (async () => {
      try {
        const sessionJson = this.draftStarted
          ? await this.adapter.exportSession()
          : null;

        const snapshot: PersistedDraftHostSession = {
          persistenceId: this.persistenceId!,
          roomCode: this.roomCode ?? "",
          kind: this.kind,
          podSize: this.podSize,
          hostDisplayName: this.hostDisplayName,
          seatTokens: Object.fromEntries(this.seatTokens),
          seatNames: Object.fromEntries(this.seatNames),
          kickedTokens: [...this.kickedTokens],
          draftStarted: this.draftStarted,
          draftCode: this.draftCode,
          draftSessionJson: sessionJson,
          setPoolJson: this.setPoolJson,
        };

        await saveDraftHostSession(this.persistenceId!, snapshot);
      } catch (err) {
        console.warn("[P2PDraftHost] persist failed:", err);
      }
    })();
  }

  /**
   * Restore host state from a persisted snapshot.
   * Called before `initialize()` to rehydrate a crashed host.
   */
  async restoreFromPersisted(session: PersistedDraftHostSession): Promise<DraftPlayerView | null> {
    for (const [seatStr, token] of Object.entries(session.seatTokens)) {
      this.seatTokens.set(Number(seatStr), token);
    }
    for (const [seatStr, name] of Object.entries(session.seatNames)) {
      this.seatNames.set(Number(seatStr), name);
    }
    for (const token of session.kickedTokens) {
      this.kickedTokens.add(token);
    }
    this.draftStarted = session.draftStarted;
    this.draftCode = session.draftCode;

    if (session.draftSessionJson) {
      const view = await this.adapter.importSession(session.draftSessionJson);

      // Arm grace windows for all guest seats
      for (const seatStr of Object.keys(session.seatTokens)) {
        const seat = Number(seatStr);
        if (seat === 0) continue;
        const timer = setTimeout(() => {
          this.disconnectedSeats.delete(seat);
          this.emit({ type: "seatKicked", seatIndex: seat, reason: "Resume grace expired" });
        }, 5 * 60_000);
        this.disconnectedSeats.set(seat, { disconnectedAt: Date.now(), timer });
      }

      if (this.disconnectedSeats.size > 0) {
        this.paused = true;
      }

      return view;
    }

    return null;
  }

  // ── Cleanup ────────────────────────────────────────────────────────

  dispose(): void {
    if (this.hostConnectionUnsub) this.hostConnectionUnsub();
    for (const { timer } of this.disconnectedSeats.values()) {
      if (timer !== null) clearTimeout(timer);
    }
    this.disconnectedSeats.clear();
    for (const session of this.guestSessions.values()) {
      session.close();
    }
    this.guestSessions.clear();
    this.listeners = [];
  }

  async terminateDraft(): Promise<void> {
    for (const session of this.guestSessions.values()) {
      await session.send({ type: "draft_host_left", reason: "Host left the draft" });
    }
    if (this.persistenceId) {
      void clearDraftHostSession(this.persistenceId);
    }
    this.dispose();
    try {
      this.hostPeer.destroy();
    } catch { /* best-effort */ }
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private firstOpenSeat(): number | null {
    for (let i = 1; i < this.podSize; i++) {
      if (!this.seatTokens.has(i)) return i;
    }
    return null;
  }

  private occupiedSeatCount(): number {
    // Host (seat 0) + connected guests
    return 1 + this.seatTokens.size - (this.seatTokens.has(0) ? 0 : 0);
  }

  private buildSeatPublicViews(): SeatPublicView[] {
    const seats: SeatPublicView[] = [];
    for (let i = 0; i < this.podSize; i++) {
      seats.push({
        seat_index: i,
        display_name: this.seatNames.get(i) ?? "",
        is_bot: false,
        connected: i === 0 || this.guestSessions.has(i),
        has_submitted_deck: false,
        pick_status: "NotDrafting",
      });
    }
    return seats;
  }

  private buildLobbyView(): DraftPlayerView {
    return {
      status: "Lobby",
      kind: this.kind,
      current_pack_number: 0,
      pick_number: 0,
      pass_direction: "Left",
      current_pack: null,
      pool: [],
      seats: this.buildSeatPublicViews(),
      cards_per_pack: 14,
      pack_count: 3,
      timer_remaining_ms: null,
      standings: [],
      current_round: 0,
      tournament_format: "Swiss",
      pod_policy: "Competitive",
      pairings: [],
    };
  }

  /** Get the host's current view. */
  async getHostView(): Promise<DraftPlayerView> {
    if (!this.draftStarted) return this.buildLobbyView();
    return this.adapter.getViewForSeat(0);
  }

  /** Whether the draft pod is full. */
  get isFull(): boolean {
    return this.firstOpenSeat() === null;
  }

  /** Whether the draft has started. */
  get isStarted(): boolean {
    return this.draftStarted;
  }

  /** Whether the draft is paused. */
  get isPaused(): boolean {
    return this.paused;
  }
}
