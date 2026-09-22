import type { ArraySchema } from "./custom/ArraySchema.js";
import type { MapSchema } from "./custom/MapSchema.js";
import type { SetSchema } from "./custom/SetSchema.js";
import type { CollectionSchema } from "./custom/CollectionSchema.js";
import type { StreamSchema } from "./custom/StreamSchema.js";
import type { Schema } from "../Schema.js";
import type { DefinitionType, RawPrimitiveType } from "../annotations.js";
import type { InferValueType, Constructor, CodecFor } from "./HelperTypes.js";
import { $builder } from "./symbols.js";
import { type QuantizeOptions } from "./quantize.js";
/**
 * Internal record produced by FieldBuilder#toDefinition() and consumed by schema().
 */
export interface BuilderDefinition {
    type: DefinitionType;
    default?: any;
    hasDefault: boolean;
    view?: number;
    unreliable?: boolean;
    patchOnly?: boolean;
    deprecated?: boolean;
    deprecatedThrows?: boolean;
    fullStateOnly?: boolean;
    stream?: boolean;
    optional?: boolean;
    /** Local-only field: typed + initialized, but never registered for sync. */
    noSync?: boolean;
    /** Declaration-scope priority callback for `.stream()` fields. */
    streamPriority?: (view: any, element: any) => number;
}
/**
 * Type-function that infers the instance value for a builder.
 */
export type BuilderOf<T> = FieldBuilder<T>;
/**
 * Chainable field builder. Instances are produced by `t.*()` factories.
 *
 * Generics:
 *  - `T` is the runtime/JS type of the field (e.g. `number`, `string`,
 *    `ArraySchema<Item>`). `.optional()` widens it to `T | undefined`
 *    so the inferred instance/toJSON shapes reflect absence.
 *  - `HasDefault` is a compile-time flag that the field carries a
 *    construction-time default — either an explicit `.default(v)` or an
 *    auto-default from a collection factory (`t.array`, `t.map`, …) or a
 *    Schema ref whose `initialize` takes zero args.
 *  - `IsOptional` is a compile-time brand for `.optional()`. Both
 *    `HasDefault` and `IsOptional` make the field omittable in
 *    `BuilderInitProps<T>`; `IsOptional` alone marks the instance property
 *    `?:`. A separate brand (rather than reading `undefined extends V`)
 *    keeps both correct for consumers compiling with
 *    `strictNullChecks: false`, where `undefined extends V` is true for
 *    every V.
 *
 * schema() reads the internal configuration via `toDefinition()` and wires
 * up metadata through the existing pipeline.
 */
export declare class FieldBuilder<T = unknown, HasDefault extends boolean = false, IsOptional extends boolean = false> {
    readonly [$builder]: true;
    private _type;
    private _default;
    private _hasDefault;
    private _view;
    private _unreliable;
    private _patchOnly;
    private _deprecated;
    private _deprecatedThrows;
    private _fullStateOnly;
    private _stream;
    private _optional;
    private _noSync;
    private _streamPriority;
    constructor(type: DefinitionType);
    /**
     * Provide a default value for this field.
     *
     * Pass a **factory function** `() => T` to build a FRESH value per instance
     * (invoked once per construction) instead of sharing a single default — the
     * clean way to default a ref to a plain custom class, or any field that must
     * not share a mutable default across instances:
     *
     * ```ts
     * acc: t.ref(GunAccuracy).noSync().default(() => new GunAccuracy()),
     * ```
     *
     * Schema fields are never function-typed, so a function is always treated as a
     * factory. A non-function value is shared (and cloned per instance if it is
     * clone-able, e.g. a Schema/collection).
     */
    default(value: T | (() => T)): FieldBuilder<T, true, IsOptional>;
    /** Tag this field with a view tag (DEFAULT_VIEW_TAG when called without arg). */
    view(tag?: number): this;
    /**
     * Mark this field as unreliable — tick patches emit it on the unreliable
     * transport channel. Still persisted to full-sync snapshots unless also
     * tagged with `.patchOnly()`. Primitive fields only.
     *
     * The field's FIRST value still travels the reliable channel, as part of
     * the owning instance's ADD; only later mutations become unreliable. A
     * decoder cannot apply a write to a ref it has not been told about, so a
     * value emitted ahead of that ADD would be dropped — and lost for good if
     * the field is never written again.
     */
    unreliable(): this;
    /**
     * Deliver this field on tick patches ONLY — it is never written to a
     * full-state sync (`encodeAll` / `encodeAllView`). Late-joining clients
     * see the field only after its next mutation is emitted on a patch.
     * The mirror of `.fullStateOnly()`, and orthogonal to `.unreliable()`.
     */
    patchOnly(): this;
    /**
     * Deliver this field in the full state sync ONLY (`encodeAll` /
     * `encodeAllView`) — it never enters a tick patch. A client receives it
     * on join (and again on a resync); writes after that are not tracked.
     * The mirror of `.patchOnly()`.
     *
     * The field itself is NOT frozen — it stays mutable server-side, only
     * its propagation stops. On a stream field (`t.stream(X).fullStateOnly()`)
     * the same rule applies per element: post-add mutations are no-ops.
     */
    fullStateOnly(): this;
    /**
     * Mark this field as **local-only** — it is typed and initialized on the
     * instance (so `.default()` and the inferred instance type still apply),
     * but is never registered for synchronization: it never enters change
     * tracking, never goes over the wire, and decoders never receive it.
     *
     * Useful for server-side scratch state, per-peer UI state, or values you
     * want on the class for typing convenience without paying any sync cost.
     *
     * Mutually exclusive with the sync-only modifiers (`.view()`,
     * `.unreliable()`, `.patchOnly()`, `.fullStateOnly()`, `.stream()`) — combining
     * them throws at `schema()` time.
     *
     * ```ts
     * const Player = schema({
     *     hp: t.uint8().default(100),          // synchronized
     *     lastInputTick: t.number().noSync(),  // local-only
     * }, 'Player');
     * ```
     */
    noSync(): this;
    /**
     * Opt a collection field into priority-batched streaming delivery —
     * ADDs drain at most `maxPerTick` per tick per view (or per broadcast
     * tick without a view). Applies to `t.map(X)` / `t.set(X)` /
     * `t.collection(X)`. Redundant on `t.stream(X)` (the factory already
     * sets this flag).
     *
     * **Not supported on `t.array(X)`.** Array positional operations
     * (`splice`, `unshift`, `reverse`) shift every subsequent index —
     * holding some ADDs back for a later tick while indexes mutate
     * underneath would produce a decoder-side state that doesn't match
     * the server. Use `t.stream(X)` (stable monotonic positions) or
     * `t.map(X).stream()` (keys never shift) instead.
     */
    stream(): this;
    /**
     * Attach a priority callback for per-view `encodeView` delivery. The
     * callback receives the client's StateView and the candidate element;
     * higher return values emit first. Does nothing in broadcast mode
     * (shared `encode()` drains FIFO). Only meaningful on stream fields.
     *
     * `StateView` carries no position of its own — attach whatever the
     * callback needs to sort by (`view` is loosely typed for this).
     *
     * ```ts
     * t.stream(Enemy).priority((view, enemy) =>
     *     -((enemy.x - view.x) ** 2 + (enemy.y - view.y) ** 2)
     * )
     * ```
     */
    priority<V = any>(fn: (view: any, element: V) => number): this;
    /** Mark this field as deprecated. Pass `false` to silence the access error. */
    deprecated(throws?: boolean): this;
    /**
     * Mark this field as optional — inferred instance type becomes
     * `T | undefined` and the property becomes omittable in initialization
     * props. Skips the auto-instantiation of collection / Schema-ref
     * defaults, so the field starts as `undefined` at runtime.
     */
    optional(): FieldBuilder<T | undefined, HasDefault, true>;
    /**
     * @internal — snapshot of the builder's configuration consumed by
     * `schema()`. `private` keeps it out of autocomplete; internal callers
     * reach it via element access (`builder['toDefinition']()`).
     */
    private toDefinition;
}
export declare function isBuilder(value: any): value is FieldBuilder<any>;
/**
 * Primitive field factory. Calling it bare (`t.int8()`) yields the natural type
 * for the wire codec (`number` for the int/float formats, plus `string` /
 * `boolean` / `bigint`). Pass an explicit type argument to refine the inferred
 * value at the TYPE level, while the wire encoding is unchanged:
 *
 *     moveX: t.int8<-1 | 0 | 1>(),       // typed -1|0|1, still encoded as int8
 *     team:  t.string<"red" | "blue">(),
 *
 * Two call signatures, NOT a defaulted generic `<T extends TBase = TBase>`: the
 * bare form must return a CONCRETE `FieldBuilder<TBase>` so `schema({ x:
 * t.number() })` still infers `x: number`. A defaulted free type parameter gets
 * captured as `any` during `schema()`'s self-referential field inference,
 * degrading every field's value type to `any`.
 *
 * NOTE: the refinement is a TYPE-LEVEL assertion, not a runtime guarantee — the
 * wire still carries the codec's full range and the DECODER writes whatever
 * bytes arrive. Sound for server-authored state; for INPUT schemas the value
 * comes from an untrusted client (the type reads `-1|0|1` while a peer can send
 * any int8), so keep validating/clamping on the receiving side.
 */
interface PrimitiveFactory<TBase> {
    (): FieldBuilder<TBase>;
    <T extends TBase>(): FieldBuilder<T>;
}
export type ChildType = RawPrimitiveType | Constructor<Schema>;
interface ArrayFactory {
    <C extends Constructor<Schema>>(child: C): FieldBuilder<ArraySchema<InstanceType<C>>, true, false>;
    <P extends RawPrimitiveType>(child: P): FieldBuilder<ArraySchema<InferValueType<P>>, true, false>;
    <T>(child: CodecFor<T>): FieldBuilder<ArraySchema<T>, true, false>;
}
interface MapFactory {
    <C extends Constructor<Schema>>(child: C): FieldBuilder<MapSchema<InstanceType<C>>, true, false>;
    <P extends RawPrimitiveType>(child: P): FieldBuilder<MapSchema<InferValueType<P>>, true, false>;
    <T>(child: CodecFor<T>): FieldBuilder<MapSchema<T>, true, false>;
}
interface SetFactory {
    <C extends Constructor<Schema>>(child: C): FieldBuilder<SetSchema<InstanceType<C>>, true, false>;
    <P extends RawPrimitiveType>(child: P): FieldBuilder<SetSchema<InferValueType<P>>, true, false>;
    <T>(child: CodecFor<T>): FieldBuilder<SetSchema<T>, true, false>;
}
interface CollectionFactory {
    <C extends Constructor<Schema>>(child: C): FieldBuilder<CollectionSchema<InstanceType<C>>, true, false>;
    <P extends RawPrimitiveType>(child: P): FieldBuilder<CollectionSchema<InferValueType<P>>, true, false>;
    <T>(child: CodecFor<T>): FieldBuilder<CollectionSchema<T>, true, false>;
}
interface StreamFactory {
    <C extends Constructor<Schema>>(child: C): FieldBuilder<StreamSchema<InstanceType<C>>, true, false>;
}
type RefHasDefault<C> = C extends {
    prototype: {
        initialize(...args: infer P): any;
    };
} ? (P extends readonly [] ? true : false) : true;
interface RefFactory {
    <C extends Constructor>(ctor: C): FieldBuilder<InstanceType<C>, RefHasDefault<C>, false>;
}
/**
 * A bounded float carried on the wire as a fixed-width unsigned integer. App code
 * reads/writes the FLOAT; the wire carries the quantized int and the field only
 * ever yields `dequant(q)`, so client predict and server sim read the same value
 * (no full-precision path to leak ⇒ no shot misprediction). See
 * {@link QuantizeOptions} for the precision/wire trade-offs.
 *
 *     yaw:      t.quantized({ min: 0, max: TWO_PI, mode: "wrap" }), // 16-bit
 *     pitch:    t.quantized({ min: -PITCH_LIMIT, max: PITCH_LIMIT }), // clamp (default)
 *     throttle: t.quantized({ min: 0, max: 1, bits: 8 }),           // 1 byte
 */
declare function quantizedFactory(opts: QuantizeOptions): FieldBuilder<number>;
export declare const t: Readonly<{
    string: PrimitiveFactory<string>;
    number: PrimitiveFactory<number>;
    boolean: PrimitiveFactory<boolean>;
    int8: PrimitiveFactory<number>;
    uint8: PrimitiveFactory<number>;
    int16: PrimitiveFactory<number>;
    uint16: PrimitiveFactory<number>;
    int32: PrimitiveFactory<number>;
    uint32: PrimitiveFactory<number>;
    int64: PrimitiveFactory<number>;
    uint64: PrimitiveFactory<number>;
    float32: PrimitiveFactory<number>;
    float64: PrimitiveFactory<number>;
    bigint64: PrimitiveFactory<bigint>;
    biguint64: PrimitiveFactory<bigint>;
    /**
     * Reference to a Schema subtype — `t.array(Item)` usually reads better, but
     * this is available when a plain ref is needed.
     *
     * The target may also be a **non-Schema custom class**. A synced ref still
     * requires it to be encodable — a `Schema` subclass, or a class retrofitted
     * with `Metadata.setFields(...)` (both carry `[Symbol.metadata]`); a bare
     * custom class is rejected at `schema()` time. A `.noSync()` (local-only)
     * field accepts ANY zero-arg class and auto-instantiates one per parent.
     */
    ref: RefFactory;
    array: ArrayFactory;
    map: MapFactory;
    set: SetFactory;
    collection: CollectionFactory;
    stream: StreamFactory;
    /**
     * A bounded float quantized to a fixed-width unsigned int on the wire — half
     * (or a quarter) the bytes of a `float32` at a precision you pick. The field
     * reads/writes the float and only ever yields `dequant(q)`. {@see QuantizeOptions}
     */
    quantized: typeof quantizedFactory;
    /**
     * Sugar for a full-circle wrapping angle in radians:
     * `t.quantized({ min: 0, max: 2π, mode: "wrap", bits })` (default 16-bit,
     * ~0.0055°/step). Any input angle is range-reduced into `[0, 2π)`. Render note:
     * lerp interpolated remotes shortest-arc (`attach({ angle: true })`) — the
     * wrap fixes the WIRE seam, not interpolation (see {@link QuantizeOptions.mode}).
     */
    angle: (opts?: {
        bits?: 8 | 16 | 32;
    }) => FieldBuilder<number, false, false>;
}>;
export {};
