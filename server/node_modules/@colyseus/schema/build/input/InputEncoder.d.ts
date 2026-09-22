import type { Schema } from "../Schema.js";
/**
 * Delivery-channel hint. Controls the wire layout:
 * - `"reliable"`: single input per packet, no framing — bytes are
 *   wire-compatible with the standard {@link Decoder}.
 * - `"unreliable"`: ring buffer of the last `historySize` inputs packed
 *   into one packet, each prefixed with a varint length. Gives the
 *   receiver redundancy against dropped packets. Use
 *   {@link InputDecoder.decodeAll} on the receiving end.
 */
export type InputMode = "reliable" | "unreliable";
export interface InputEncoderOptions {
    /** Defaults to `"reliable"`. */
    mode?: InputMode;
    /**
     * Unreliable-mode only. Number of past inputs to pack into each
     * packet as redundancy against drops. Default: 3. Ignored in
     * reliable mode (always exactly one input per packet).
     */
    historySize?: number;
}
/**
 * Bound single-struct encoder for client→server input packets. Holds a
 * reference to a Schema instance and produces wire-compatible bytes.
 *
 * Always delta-encodes: each `encode()` emits only the fields that changed
 * since the previous call (via the setter-populated ChangeTree dirty set),
 * wrapping a standard {@link Encoder}. The first call (or first after
 * {@link reset}) emits a full snapshot, since there's no baseline to diff
 * against.
 *
 * **Reliable mode** emits one delta per `encode()` — or an empty
 * `Uint8Array` when nothing changed (the caller decides whether to send a
 * body-less keep-alive or skip the tick). The bytes decode cleanly through
 * the standard {@link Decoder}.
 *
 * **Unreliable mode** pushes each delta onto a ring buffer of size
 * `historySize` and emits the last N in one packet, each framed with a
 * varint length prefix. A no-change tick still pushes an (empty,
 * carry-forward) slot so every tick gets a consecutive framework seq. Use
 * {@link InputDecoder.decodeAll} to walk the framed packet. Wire ops use
 * absolute values, so re-applying a redundant slot is per-field idempotent.
 *
 * Flat primitive fields only. Nested Schema / collection fields throw
 * at construction.
 */
export declare class InputEncoder<T extends Schema = any> {
    readonly instance: T;
    readonly mode: InputMode;
    readonly historySize: number;
    private readonly _desc;
    private readonly _numFields;
    private _slots?;
    private readonly _slotLens?;
    private _slotHead;
    private _slotCount;
    private _outBuffer?;
    private _seq;
    private readonly _encoder;
    constructor(instance: T, options?: InputEncoderOptions);
    /**
     * The framework input seq of the most recently encoded tick (unreliable
     * mode): monotonic, ++ per `encode()`, kept across {@link reset}. `0` in
     * reliable mode (which sequences inputs implicitly by message count). The
     * client keys its reconciliation replay ring by this so the server's
     * seq-value ack lines up across packet loss.
     */
    get seq(): number;
    /**
     * Encode the bound instance's delta. Returns a subarray of an internal
     * buffer — copy if retaining across calls.
     *
     * Output shape by mode:
     * - `reliable`: only changed fields, or empty when nothing changed.
     * - `unreliable`: ring of the last `historySize` deltas, length-framed
     *   per slot. A no-change tick pushes an empty (carry-forward) slot but
     *   still re-emits the ring. Empty only until the first slot is pushed.
     *
     * Buffers auto-grow on overflow; a one-time `console.warn` is
     * emitted the first time it happens.
     */
    encode(): Uint8Array;
    /**
     * Reset the encoder's internal state:
     * - Drops the unreliable ring buffer.
     * - Re-marks every currently populated field as dirty, so the next
     *   `encode()` emits a fresh full snapshot.
     *
     * Useful on disconnect / reconnect / scene transitions.
     */
    reset(): void;
    /**
     * Copy the bound instance's field values into `target` (a same-type instance)
     * in place — no allocation, no `Object.keys` (cf. `Schema#assign`) and no
     * `clone()`. For buffering a snapshot of the just-sent input into a reused
     * slot (e.g. a client reconciliation/replay ring) without the transport
     * having to reach into schema internals. The codec owns this because it owns
     * the field representation. The in-place / alloc-free cousin of `clone()`,
     * and the inverse direction of `Schema#assign(source)`.
     */
    copyInto(target: T): void;
    /** Delegate to the wrapped Encoder, then clear its dirty set. */
    private _produceDelta;
    private _pushAndEmitRing;
    private _emitRing;
    private static _warned;
    private static _grow;
}
