import { $changes, $childType, $decoder, $deleteByIndex, $encoder, $filter, $getByIndex, $onEncodeEnd, $refId, $reset, $resyncPrune } from "../symbols.js";
import { Collection } from "../HelperTypes.js";
import { ChangeTree, type IRef } from "../../encoder/ChangeTree.js";
import { type StreamableState } from "../../encoder/streaming.js";
import type { StateView } from "../../encoder/StateView.js";
import type { Schema } from "../../Schema.js";
export declare class SetSchema<V = any> implements Collection<number, V>, IRef {
    [$changes]: ChangeTree;
    [$refId]?: number;
    protected [$childType]: string | typeof Schema;
    /** The user-visible data, keyed directly by the wire-protocol index. */
    protected $items: Map<number, V>;
    /** Snapshots of values that were deleted this tick (for filter visibility). */
    protected deletedItems: {
        [field: string]: V;
    };
    /** Monotonic counter for assigning indexes to newly-added items. */
    protected $refId: number;
    /**
     * Streamable state — lazily allocated when the field is opted into
     * streaming via `t.set(X).stream()`. See MapSchema for the same
     * pattern / rationale.
     */
    _stream?: StreamableState;
    /** Max ADD ops emitted per tick per view. Ignored outside streaming mode. */
    get maxPerTick(): number;
    set maxPerTick(n: number);
    /** Per-view priority callback — see StreamSchema / MapSchema. */
    get priority(): ((view: any, element: V) => number) | undefined;
    set priority(fn: ((view: any, element: V) => number) | undefined);
    static [$encoder]: import("../../encoder/EncodeOperation.js").EncodeOperation<any>;
    static [$decoder]: import("../../decoder/DecodeOperation.js").DecodeOperation<any>;
    /** Integer tag read by `decodeKeyValueOperation` — see `CollectionKind`. */
    static readonly COLLECTION_KIND: 3;
    /**
     * Determine if a property must be filtered.
     * - If returns false, the property is NOT going to be encoded.
     * - If returns true, the property is going to be encoded.
     *
     * Encoding with "filters" happens in two steps:
     * - First, the encoder iterates over all "not owned" properties and encodes them.
     * - Then, the encoder iterates over all "owned" properties per instance and encodes them.
     */
    static [$filter](ref: SetSchema, index: number, view: StateView): boolean;
    static is(type: any): boolean;
    constructor(initialValues?: Array<V>);
    /**
     * Decoder-side factory. Skips the tracking `ChangeTree` allocation;
     * `Object.create` also bypasses the class-field initializers, so we
     * replicate the minimum slot init here. Must stay in sync with the
     * class-field declarations above.
     */
    static initializeForDecoder<V = any>(): SetSchema<V>;
    add(value: V): number | false;
    entries(): MapIterator<[number, V]>;
    delete(item: V): boolean;
    clear(): void;
    /**
     * Pool reset: empty this set and recycle its ChangeTree WITHOUT recording
     * any wire op (the parent field's ADD/DELETE owns the wire). Recurses into
     * ref-type children. Called by Schema.reset when a pooled entity has a set
     * field. The instance must already be detached from the encoder.
     */
    [$reset](): void;
    has(value: V): boolean;
    forEach(callbackfn: (value: V, key: number, collection: SetSchema<V>) => void): void;
    values(): MapIterator<V>;
    get size(): number;
    pauseTracking(): void;
    resumeTracking(): void;
    untracked<T>(fn: () => T): T;
    get isTrackingPaused(): boolean;
    /** Iterator */
    [Symbol.iterator](): IterableIterator<V>;
    protected setIndex(_index: number, _key: number): void;
    protected getIndex(index: number): number;
    [$getByIndex](index: number): any;
    [$deleteByIndex](index: number): void;
    [$resyncPrune](visited: Set<number | string>, prune: (value: V, identity: number | string) => void, keep: (value: V) => void): void;
    protected [$onEncodeEnd](): void;
    _dropView(viewId: number): void;
    _unregister(): void;
    toArray(): V[];
    toJSON(): V[];
    clone(isDecoding?: boolean): SetSchema<V>;
}
