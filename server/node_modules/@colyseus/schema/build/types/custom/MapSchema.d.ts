import { $changes, $childType, $decoder, $deleteByIndex, $onEncodeEnd, $encoder, $filter, $getByIndex, $refId, $reset, $resyncPrune } from "../symbols.js";
import { ChangeTree, IRef } from "../../encoder/ChangeTree.js";
import { Collection } from "../HelperTypes.js";
import { MapJournal } from "../../encoder/MapJournal.js";
import { type StreamableState } from "../../encoder/streaming.js";
import type { StateView } from "../../encoder/StateView.js";
import type { Schema } from "../../Schema.js";
export declare class MapSchema<V = any, K extends string = string> implements Map<K, V>, Collection<K, V, [K, V]>, IRef {
    [$changes]: ChangeTree;
    [$refId]?: number;
    protected childType: new () => V;
    protected [$childType]: string | typeof Schema;
    protected $items: Map<K, V>;
    /**
     * Wire-protocol identity + change-tracking metadata for this map.
     *
     * Owns: index↔key mapping, monotonic index counter, snapshots of removed
     * values for filter visibility checks. Replaces what used to live as three
     * separate fields on this class ($indexes, _collectionIndexes, deletedItems).
     */
    protected journal: MapJournal<K>;
    /**
     * Streamable state — lazily allocated by `inheritedFlags` (or the
     * `maxPerTick` setter) when streaming actually activates. `undefined`
     * on every non-streaming MapSchema so the common case pays zero
     * Map/Set allocation. Single slot → hidden-class shape stays stable
     * across streaming and non-streaming instances.
     */
    _stream?: StreamableState;
    /** Max ADD ops emitted per tick per view. Ignored outside streaming mode. */
    get maxPerTick(): number;
    set maxPerTick(n: number);
    /**
     * Per-view priority callback for `.stream()` maps. Initialized from the
     * schema declaration (`t.map(X).stream().priority(fn)` or `@type({ map,
     * priority })`); assigning here overrides for this instance. Only fires
     * during `encodeView` — broadcast mode drains FIFO.
     */
    get priority(): ((view: any, element: V) => number) | undefined;
    set priority(fn: ((view: any, element: V) => number) | undefined);
    /** Backwards-compat alias for `journal.keyByIndex`. */
    get $indexes(): Map<number, K>;
    /**
     * Backwards-compat alias for `journal.indexByKey`. Plain object so
     * polymorphic call sites like `ref._collectionIndexes?.[key]` keep working.
     */
    get _collectionIndexes(): {
        [key: string]: number;
    };
    static [$encoder]: import("../../encoder/EncodeOperation.js").EncodeOperation<any>;
    static [$decoder]: import("../../decoder/DecodeOperation.js").DecodeOperation<any>;
    /** Integer tag read by `decodeKeyValueOperation` — see `CollectionKind`. */
    static readonly COLLECTION_KIND: 1;
    /**
     * Determine if a property must be filtered.
     * - If returns false, the property is NOT going to be encoded.
     * - If returns true, the property is going to be encoded.
     *
     * Encoding with "filters" happens in two steps:
     * - First, the encoder iterates over all "not owned" properties and encodes them.
     * - Then, the encoder iterates over all "owned" properties per instance and encodes them.
     */
    static [$filter](ref: MapSchema, index: number, view: StateView): boolean;
    static is(type: any): boolean;
    constructor(initialValues?: Map<K, V> | Record<K, V>);
    /**
     * Decoder-side factory. Skips the tracking `ChangeTree` allocation;
     * `Object.create` also bypasses the class-field initializers, so we
     * replicate the minimum slot init here. Must stay in sync with the
     * class-field declarations above and with the constructor body.
     */
    static initializeForDecoder<V = any, K extends string = string>(): MapSchema<V, K>;
    /** Iterator */
    [Symbol.iterator](): ReturnType<Map<K, V>[typeof Symbol.iterator]>;
    get [Symbol.toStringTag](): string;
    static get [Symbol.species](): typeof MapSchema;
    set(key: K, value: V): this;
    get(key: K): V | undefined;
    /**
     * Returns the value for `key` if present. Otherwise inserts `defaultValue`
     * (tracked as an ADD change, like `set()`) and returns it.
     *
     * Mirrors `Map.prototype.getOrInsert` (TC39 "upsert" proposal, typed in
     * TypeScript 6's standard library).
     */
    getOrInsert(key: K, defaultValue: V): V;
    /**
     * Returns the value for `key` if present. Otherwise computes a value via
     * `callbackfn(key)`, inserts it (tracked as an ADD change, like `set()`)
     * and returns it. The callback is only invoked when the key is missing.
     *
     * Mirrors `Map.prototype.getOrInsertComputed` (TC39 "upsert" proposal,
     * typed in TypeScript 6's standard library).
     */
    getOrInsertComputed(key: K, callbackfn: (key: K) => V): V;
    delete(key: K): boolean;
    clear(): void;
    /**
     * Pool reset: empty this map and recycle its ChangeTree WITHOUT recording
     * any wire op (the parent field's ADD/DELETE owns the wire). Recurses into
     * ref-type children. Called by Schema.reset when a pooled entity has a
     * map field. The instance must already be detached from the encoder.
     */
    [$reset](): void;
    has(key: K): boolean;
    forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void): void;
    entries(): MapIterator<[K, V]>;
    keys(): MapIterator<K>;
    values(): MapIterator<V>;
    get size(): number;
    pauseTracking(): void;
    resumeTracking(): void;
    untracked<T>(fn: () => T): T;
    get isTrackingPaused(): boolean;
    protected setIndex(index: number, key: K): void;
    protected getIndex(index: number): K;
    [$getByIndex](index: number): V | undefined;
    [$deleteByIndex](index: number): void;
    [$resyncPrune](visited: Set<number | string>, prune: (value: V, identity: number | string) => void, keep: (value: V) => void): void;
    protected [$onEncodeEnd](): void;
    _dropView(viewId: number): void;
    _unregister(): void;
    toJSON(): any;
    clone(isDecoding?: boolean): MapSchema<V>;
}
