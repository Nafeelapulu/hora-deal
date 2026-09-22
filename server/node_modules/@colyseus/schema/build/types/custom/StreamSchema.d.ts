import { $changes, $childType, $decoder, $deleteByIndex, $encoder, $filter, $getByIndex, $onEncodeEnd, $refId, $resyncPrune } from "../symbols.js";
import { ChangeTree, type IRef } from "../../encoder/ChangeTree.js";
import { type StreamableState } from "../../encoder/streaming.js";
import type { StateView } from "../../encoder/StateView.js";
import type { Schema } from "../../Schema.js";
/**
 * `t.stream(Entity)` — priority-batched collection of Schema instances.
 *
 * Designed for ECS-style use cases where many entities spawn/despawn each
 * tick and the full set won't fit in one encode budget. Adds are queued
 * per-client and drained in priority order (callback on StateView) up to
 * `maxPerTick` per encode pass. Field mutations on already-sent elements
 * propagate through the normal reliable channel without consuming the
 * per-tick budget. Chain `.fullStateOnly()` on the field builder to suppress
 * post-add mutation tracking entirely.
 */
export declare class StreamSchema<V = any> implements IRef {
    [$changes]: ChangeTree;
    [$refId]?: number;
    protected [$childType]: string | typeof Schema;
    /**
     * Wire-keyed storage: `position → element`. Position is a monotonic
     * counter assigned by `add()` — stable identity even when elements
     * are removed, so pending/sent view state can keep using the same
     * keys across ticks. Map (not Array) so `$items.keys()` / `.values()`
     * skip removed positions without a sparse-slot check.
     */
    protected $items: Map<number, V>;
    /** Monotonic position counter. Incremented on every `add()`. */
    protected $nextPosition: number;
    /** Reverse lookup for O(1) `remove(el)`. */
    protected _itemIndex: Map<V, number>;
    /**
     * Streamable state — holds per-view and broadcast bookkeeping. Lazily
     * allocated when the stream is attached to a Root (or when the user
     * touches `maxPerTick`). `undefined` on detached streams so
     * construction is cheap.
     */
    _stream?: StreamableState;
    /** Max element ADDs emitted per encode tick (per view, or broadcast). */
    get maxPerTick(): number;
    set maxPerTick(n: number);
    /**
     * Per-view priority callback. Initialized from the schema declaration
     * (`.priority(fn)` or `@type({ stream, priority })`); assigning here
     * overrides the class-level default for this instance. Only fires
     * during `encodeView` — broadcast mode drains FIFO.
     */
    get priority(): ((view: any, element: V) => number) | undefined;
    set priority(fn: ((view: any, element: V) => number) | undefined);
    /**
     * Brand used by Root / StateView to detect stream trees without
     * importing this class (avoids circular deps). The `isStreamCollection`
     * ChangeTree flag (set via `inheritedFlags`) is the preferred runtime
     * check — this brand is kept for back-compat.
     */
    static readonly $isStream: true;
    static [$encoder]: import("../../encoder/EncodeOperation.js").EncodeOperation<any>;
    static [$decoder]: import("../../decoder/DecodeOperation.js").DecodeOperation<any>;
    /** Integer tag read by `decodeKeyValueOperation` — see `CollectionKind`. */
    static readonly COLLECTION_KIND: 5;
    /**
     * Element-level visibility. Identical to SetSchema's filter: stream
     * elements are always per-view, the filter just defers to the view's
     * per-tree visibility bitmap.
     */
    static [$filter](ref: StreamSchema, index: number, view: StateView): boolean;
    static is(type: any): boolean;
    constructor();
    /**
     * Decoder-side factory. Skips the tracking `ChangeTree` allocation;
     * `Object.create` also bypasses the class-field initializers, so we
     * replicate the minimum slot init here. Must stay in sync with the
     * class-field declarations above.
     */
    static initializeForDecoder<V = any>(): StreamSchema<V>;
    /**
     * Append an element to the stream. Returns the assigned position,
     * or -1 if the element was already in the stream.
     */
    add(value: V): number;
    /**
     * Remove an element by reference. If the element was pending (never sent
     * to a view), the pending entry is dropped silently. If already sent,
     * a DELETE op is forced on next `encodeView` for that view.
     */
    remove(value: V): boolean;
    has(value: V): boolean;
    /** Remove every element; queue DELETE wire ops for already-sent items. */
    clear(): void;
    forEach(callback: (value: V, index: number, collection: StreamSchema<V>) => void): void;
    values(): IterableIterator<V>;
    /**
     * Iterate `[position, value]` pairs in insertion order. Used by
     * `setParent` recursion when the stream is reassigned to a new parent.
     */
    entries(): IterableIterator<[number, V]>;
    [Symbol.iterator](): IterableIterator<V>;
    /** Live element count. */
    get size(): number;
    /** Alias for `size`. */
    get length(): number;
    protected setIndex(_index: number, _key: number): void;
    protected getIndex(index: number): number;
    [$getByIndex](index: number): V;
    [$deleteByIndex](index: number): void;
    [$resyncPrune](): void;
    protected [$onEncodeEnd](): void;
    toArray(): V[];
    toJSON(): any[];
    clone(isDecoding?: boolean): StreamSchema<V>;
    _dropView(viewId: number): void;
    /** Called by Root.remove when the stream's refcount hits zero. */
    _unregister(): void;
}
