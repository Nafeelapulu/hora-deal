/**
 * `t.quantized()` — a bounded float encoded as a fixed-width unsigned integer.
 *
 * A float that changes every frame within a known range (look angles, a
 * normalized scalar, a unit-vector component) costs a full `float32` (4 value
 * bytes). Mapping it onto `uint8`/`uint16`/`uint32` halves or quarters that at a
 * precision you choose — e.g. a yaw on `uint16` is ~0.0055°/step, finer than any
 * mouse, for 2 bytes instead of 4.
 *
 * Quantization is LOSSY, but lossy IDENTICALLY on both peers: the field only ever
 * yields `dequant(q)`, so client prediction and server simulation read the SAME
 * value and a predicted hitscan ray bit-matches the server's — the lossiness is
 * vs. the original float, never between the two peers (see the reconciler note in
 * `predict/reconciler.ts`).
 *
 * Portable by construction (a C/C#/Lua client must reproduce it bit-for-bit):
 * rounding is explicit `floor(x + 0.5)` — NOT the language-default round, which
 * disagrees on the `.5` case (JS half-up, C# banker's, C half-away) — and a
 * wrapping range is reduced in the FLOAT domain BEFORE the integer step, so there
 * is no huge-double→int cast (UB in C, throws in C#). All math is float64.
 */
export interface QuantizeOptions {
    /** Inclusive lower bound of the value domain. */
    min: number;
    /** Upper bound of the value domain (inclusive when clamped, exclusive when wrapping). */
    max: number;
    /**
     * Wire width in bits — a typed union, NOT a free integer: schema fields are
     * byte-aligned, so only 8/16/32 change the wire (`bits: 13` would still occupy
     * 2 bytes and mislead). Default 16.
     */
    bits?: 8 | 16 | 32;
    /**
     * Is the value CYCLIC (lives on a circle) or BOUNDED (has hard walls)? That is
     * the whole choice — the wire size is identical either way.
     *
     * `"clamp"` (default) — for a BOUNDED value with hard ends (pitch, a health bar,
     * a 0–1 throttle). A UNORM over `[min, max]` INCLUSIVE: both endpoints are exact
     * + distinct, and out-of-range inputs CLAMP to the nearest end. Pitch past the
     * limit stops AT the limit. A range symmetric about zero (`min === -max`: an
     * input axis, a velocity) also carries an EXACT zero — see `span`.
     *
     * `"wrap"` — for a CYCLIC value where `min` and `max` are the SAME point (an
     * angle/heading, compass bearing, hue, phase). `[min, max)` over `2^bits` steps
     * with the top folding onto the bottom; any input is range-reduced modulo
     * `(max − min)` first, so a large accumulated or negative angle maps into the
     * domain (yaw keeps spinning, never jams). `min` is exact; `max ≡ min`.
     *
     * Decision rule: does one step past the top return you to the bottom as the SAME
     * physical thing? → `"wrap"`. Is the top a wall you can't cross? → `"clamp"`.
     * Choosing wrong is a real bug: a clamped heading JAMS at the 0/2π seam; a wrapped
     * pitch FLIPS the camera the instant you look a hair too far up.
     *
     * NB (cyclic fields): `"wrap"` fixes the WIRE seam, not rendering — a wrapped
     * field that's interpolated must ALSO be lerped shortest-arc (the SDK predict
     * `attach({ angle: true })`), or it unwinds the long way across the `0 ↔ max` seam.
     */
    mode?: "clamp" | "wrap";
}
/**
 * Resolved, plain-data quantization descriptor stored on the field metadata as
 * `{ quantized: QuantizeDescriptor }`. Both encode and decode derive `scale` from
 * the same fields, so the two sides — and a future cross-language port — agree by
 * construction. Serializable (no functions) so it can ride schema reflection.
 */
export interface QuantizeDescriptor {
    min: number;
    max: number;
    bits: 8 | 16 | 32;
    wrap: boolean;
    /** Wire codec name — `"uint8" | "uint16" | "uint32"`, derived from `bits`. */
    wire: "uint8" | "uint16" | "uint32";
    /** `max − min`, the domain width. */
    range: number;
    /**
     * The integer span used for the scale:
     *  - wrapping: `2^bits` (the number of steps; the top step folds onto 0).
     *  - clamped:  `2^bits − 1` (endpoints inclusive, so the max maps to it), or
     *    `2^bits − 2` when `min === -max`: an odd interval count puts zero on a step
     *    BOUNDARY, so half-up rounding always lifts it to `+1` quantum and a released
     *    axis / resting velocity never reads back as `0` (`q = span/2` is exact with
     *    an even span). One wire code goes unused.
     */
    span: number;
}
/** Validate options and precompute the wire codec + scale span. */
export declare function resolveQuantize(opts: QuantizeOptions): QuantizeDescriptor;
/** Type guard for the `{ quantized: QuantizeDescriptor }` field-type shape. */
export declare function isQuantizedType(type: any): type is {
    quantized: QuantizeDescriptor;
};
/**
 * Float → unsigned integer. Rounding is explicit half-up `floor(x + 0.5)`;
 * wrapping ranges are reduced in the float domain first (no huge→int cast).
 */
export declare function quantize(desc: QuantizeDescriptor, value: number): number;
/** Unsigned integer → float. Correctly-rounded mul/div ⇒ bit-identical across languages. */
export declare function dequantize(desc: QuantizeDescriptor, q: number): number;
/**
 * Pre-baked encoder for a quantized field: quantize the (snapped) float held on
 * the instance, then write it with the field's unsigned-int wire codec. Stored in
 * `metadata[$encoders]` so the encode hot path reaches it via the fast lane,
 * exactly like the pre-computed primitive encoders.
 */
export declare function makeQuantizedEncoder(desc: QuantizeDescriptor): (bytes: any, value: number, it: any) => void;
/** Decode a quantized field: read the unsigned-int wire value, then dequantize. */
export declare function decodeQuantized(desc: QuantizeDescriptor, bytes: any, it: any): number;
