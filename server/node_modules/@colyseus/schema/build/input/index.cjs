'use strict';

var symbols_js = require("@colyseus/schema");
var encode_js = require("@colyseus/schema");
var Encoder_js = require("@colyseus/schema");
var EncodeDescriptor_js = require("@colyseus/schema");
var Decoder_js = require("@colyseus/schema");
var decode_js = require("@colyseus/schema");

const DEFAULT_SLOT_SIZE = 256;
const LENGTH_PREFIX_WORST_CASE = 5; // varint max for a uint32 length.
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
class InputEncoder {
    instance;
    mode;
    historySize;
    _desc;
    _numFields;
    // Unreliable-mode ring: `_slots`/`_slotLens` hold each snapshot; `_outBuffer` holds the concatenated packet.
    _slots;
    _slotLens;
    _slotHead = 0;
    _slotCount = 0;
    _outBuffer;
    // Monotonic per-tick input seq (unreliable only): ++ per pushed slot. The
    // packet carries the OLDEST slot's seq once; the decoder derives each slot's
    // seq by position (slots are consecutive — every tick pushes). This is the
    // framework-owned seq that drives server-side dedupe of the redundancy ring
    // WITHOUT the user adding a seq field. Monotonic across reset() so a
    // reconnect that reuses the server buffer doesn't replay already-seen seqs.
    _seq = 0;
    // Delta delegate; setters populate its ChangeTree, `encode()` drains dirty fields.
    _encoder;
    constructor(instance, options = {}) {
        this.instance = instance;
        this.mode = options.mode ?? "reliable";
        this.historySize = this.mode === "unreliable"
            ? Math.max(1, options.historySize ?? 3)
            : 1;
        // Resolve + validate schema metadata up front.
        this._desc = EncodeDescriptor_js.getEncodeDescriptor(instance);
        const numFields = this._desc.metadata?.[symbols_js.$numFields];
        if (numFields === undefined) {
            throw new Error(`InputEncoder: '${instance.constructor.name}' has no fields`);
        }
        this._numFields = numFields;
        for (let i = 0; i <= numFields; i++) {
            if (this._desc.names[i] !== undefined && this._desc.encoders[i] === undefined) {
                throw new Error(`InputEncoder: non-primitive field '${this._desc.names[i]}' on '${instance.constructor.name}' is not supported. Use Encoder for state containing refs/collections.`);
            }
        }
        if (this.mode === "unreliable") {
            this._slots = new Array(this.historySize);
            this._slotLens = new Array(this.historySize).fill(0);
            for (let i = 0; i < this.historySize; i++) {
                this._slots[i] = new Uint8Array(DEFAULT_SLOT_SIZE);
            }
            this._outBuffer = new Uint8Array((DEFAULT_SLOT_SIZE + LENGTH_PREFIX_WORST_CASE) * this.historySize);
        }
        // Wrap a standard Encoder; keep tracking on so setters keep populating
        // the dirty set we drain each encode().
        this._encoder = new Encoder_js.Encoder(instance);
    }
    /**
     * The framework input seq of the most recently encoded tick (unreliable
     * mode): monotonic, ++ per `encode()`, kept across {@link reset}. `0` in
     * reliable mode (which sequences inputs implicitly by message count). The
     * client keys its reconciliation replay ring by this so the server's
     * seq-value ack lines up across packet loss.
     */
    get seq() { return this._seq; }
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
    encode() {
        const blob = this._produceDelta();
        return this.mode === "reliable" ? blob : this._pushAndEmitRing(blob);
    }
    /**
     * Reset the encoder's internal state:
     * - Drops the unreliable ring buffer.
     * - Re-marks every currently populated field as dirty, so the next
     *   `encode()` emits a fresh full snapshot.
     *
     * Useful on disconnect / reconnect / scene transitions.
     */
    reset() {
        this._slotHead = 0;
        this._slotCount = 0;
        this._encoder.discardChanges();
        const tree = this.instance[symbols_js.$changes];
        const values = this.instance[symbols_js.$values];
        for (let i = 0; i <= this._numFields; i++) {
            if (values[i] === undefined || values[i] === null)
                continue;
            tree.markDirty(i);
        }
    }
    /**
     * Copy the bound instance's field values into `target` (a same-type instance)
     * in place — no allocation, no `Object.keys` (cf. `Schema#assign`) and no
     * `clone()`. For buffering a snapshot of the just-sent input into a reused
     * slot (e.g. a client reconciliation/replay ring) without the transport
     * having to reach into schema internals. The codec owns this because it owns
     * the field representation. The in-place / alloc-free cousin of `clone()`,
     * and the inverse direction of `Schema#assign(source)`.
     */
    copyInto(target) {
        const src = this.instance[symbols_js.$values];
        const dst = target[symbols_js.$values];
        for (let i = 0; i <= this._numFields; i++)
            dst[i] = src[i];
    }
    // ────────────────────────────────────────────────────────────────────
    // Delta producer — one diff of the instance; caller routes by mode.
    // ────────────────────────────────────────────────────────────────────
    /** Delegate to the wrapped Encoder, then clear its dirty set. */
    _produceDelta() {
        const bytes = this._encoder.encode();
        this._encoder.discardChanges();
        return bytes;
    }
    // ────────────────────────────────────────────────────────────────────
    // Ring — push blob to current slot, concat oldest→newest, return framed packet.
    // ────────────────────────────────────────────────────────────────────
    _pushAndEmitRing(blob) {
        // Push a slot EVERY tick (even an empty delta) so ring seqs stay
        // consecutive: the packet carries ONE base seq and the decoder derives
        // each slot's seq by position. An empty slot decodes as carry-forward.
        this._seq++;
        let slot = this._slots[this._slotHead];
        if (blob.length > slot.byteLength) {
            slot = this._slots[this._slotHead] = InputEncoder._grow(slot, blob.length, "unreliable ring slot");
        }
        slot.set(blob);
        this._slotLens[this._slotHead] = blob.length;
        this._slotHead = (this._slotHead + 1) % this.historySize;
        if (this._slotCount < this.historySize)
            this._slotCount++;
        return this._emitRing();
    }
    _emitRing() {
        // Packet layout: [baseSeq][len][slot]…[len][slot] (oldest→newest).
        // baseSeq = the oldest slot's seq; consecutive slots ⇒ slot i has seq baseSeq + i.
        const baseSeq = this._seq - this._slotCount + 1;
        // Upper bound: baseSeq varint + sum of slot byte counts + per-slot varint length.
        let needed = LENGTH_PREFIX_WORST_CASE;
        for (let i = 0; i < this._slotCount; i++) {
            needed += this._slotLens[i] + LENGTH_PREFIX_WORST_CASE;
        }
        let out = this._outBuffer;
        if (needed > out.byteLength) {
            out = this._outBuffer = InputEncoder._grow(out, needed, "unreliable output packet");
        }
        const outIt = { offset: 0 };
        encode_js.encode.number(out, baseSeq, outIt); // packet-level base seq
        const oldest = (this._slotHead - this._slotCount + this.historySize) % this.historySize;
        for (let i = 0; i < this._slotCount; i++) {
            const idx = (oldest + i) % this.historySize;
            const len = this._slotLens[idx];
            encode_js.encode.number(out, len, outIt);
            out.set(this._slots[idx].subarray(0, len), outIt.offset);
            outIt.offset += len;
        }
        return out.subarray(0, outIt.offset);
    }
    // ────────────────────────────────────────────────────────────────────
    // Buffer growth. Writes past `byteLength` silently drop but `it.offset` still advances, so callers detect overflow via `offset > byteLength` and re-encode into the grown buffer.
    // ────────────────────────────────────────────────────────────────────
    static _warned = false;
    static _grow(buf, needed, where) {
        const newSize = Math.max(needed, buf.byteLength * 2);
        if (!InputEncoder._warned) {
            InputEncoder._warned = true;
            console.warn(`@colyseus/schema/input: InputEncoder buffer overflow in ${where}. ` +
                `Growing to ${newSize} bytes.`);
        }
        return new Uint8Array(newSize);
    }
}

/**
 * Bound single-struct decoder for input packets. Wraps the standard
 * `Decoder` so bytes emitted by `InputEncoder` land on the bound instance.
 *
 * - `decode(bytes)`: single-input packet (reliable mode).
 * - `decodeAll(bytes, cb)`: multi-input length-framed packet (unreliable
 *   mode). Invokes `cb` with the mutated instance once per framed input,
 *   oldest → newest. The instance is re-used across callbacks — consume
 *   synchronously (apply to game state) rather than holding the reference.
 */
class InputDecoder {
    instance;
    _decoder;
    _it = { offset: 0 };
    constructor(instance) {
        this.instance = instance;
        this._decoder = new Decoder_js.Decoder(instance);
    }
    /**
     * Decode a single-input (reliable) packet into the bound instance.
     * Returns the instance for chaining.
     */
    decode(bytes) {
        this._decoder.decode(bytes);
        return this.instance;
    }
    /**
     * Walk a multi-input (unreliable) packet, decoding each length-framed
     * input into the bound instance in order and invoking `onInput` after
     * each decode. `onInput` receives the bound instance and the framework
     * **seq** of that input (decoded from the packet's base seq + position) —
     * the receiver dedupes the redundancy ring on it (monotonic: drop seq ≤
     * last seen). Reads of the instance must be synchronous; downstream code
     * should apply the input to game state, not retain the reference.
     *
     * Packet layout: `[baseSeq][len][body]…[len][body]` (oldest→newest);
     * slot *i* has `seq = baseSeq + i`.
     *
     * Returns the number of inputs decoded.
     */
    decodeAll(bytes, onInput) {
        const it = this._it;
        it.offset = 0;
        const baseSeq = decode_js.decode.number(bytes, it); // packet-level base seq (oldest slot)
        let count = 0;
        while (it.offset < bytes.length) {
            const len = decode_js.decode.number(bytes, it);
            const end = it.offset + len;
            this._decoder.decode(bytes.subarray(it.offset, end));
            onInput(this.instance, baseSeq + count); // slot seq by position
            it.offset = end;
            count++;
        }
        return count;
    }
}

exports.InputDecoder = InputDecoder;
exports.InputEncoder = InputEncoder;
//# sourceMappingURL=index.cjs.map
