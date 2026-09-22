import { OPERATION } from "../encoding/spec.js";
/**
 * ChangeRecorder — "what changed this tick" for a single ref.
 *
 * This file holds the two standalone recorder classes used for the
 * unreliable channel (lazy, opt-in). The reliable channel is inlined on
 * `ChangeTree` for perf; see `ChangeTree._isSchema` dispatch.
 *
 * Interface design (ISP):
 *   - {@link ChangeRecorder}: common ops, implemented by both Schema and
 *     Collection recorders.
 *   - {@link ICollectionChangeRecorder}: extends with `recordPure` +
 *     `shift` — collection-only. Schema recorders do NOT carry these.
 *
 * Per-field filter/visibility is decided at encode time, not record time.
 * Full-sync output is derived structurally via `ChangeTree.forEachLive`.
 */
export interface ChangeRecorder {
    /**
     * Record a change at the given index. Handles op merge
     * (DELETE followed by ADD becomes DELETE_AND_ADD).
     */
    record(index: number, op: OPERATION): void;
    /** Record a DELETE at the given index. */
    recordDelete(index: number, op: OPERATION): void;
    /**
     * Record an operation without op-merge semantics. Used by ArraySchema
     * positional writes where DELETE→ADD merge is undesirable.
     */
    recordRaw(index: number, op: OPERATION): void;
    /** Current operation at index, or undefined if none. */
    operationAt(index: number): OPERATION | undefined;
    /** Overwrite the operation at index. */
    setOperationAt(index: number, op: OPERATION): void;
    /**
     * Iterate (index, op) pairs in record order.
     * Pure operations emit with index = -op (wire convention).
     */
    forEach(cb: (index: number, op: OPERATION) => void): void;
    /** Closure-free forEach variant for the hot encode path. */
    forEachWithCtx<T>(ctx: T, cb: (ctx: T, index: number, op: OPERATION) => void): void;
    size(): number;
    has(): boolean;
    reset(): void;
}
/**
 * Extended recorder for collection types — adds `recordPure` (CLEAR /
 * REVERSE) and `shift` (ArraySchema.unshift support).
 */
export interface ICollectionChangeRecorder extends ChangeRecorder {
    /**
     * Record a pure operation (CLEAR / REVERSE) with no index.
     * Interleaves with indexed ops at record order.
     */
    recordPure(op: OPERATION): void;
    /** Shift current-tick dirty indexes by `shiftIndex`. */
    shift(shiftIndex: number): void;
}
/**
 * Schema field operations are limited to ADD(128), DELETE(64), and
 * DELETE_AND_ADD(192). REPLACE(0) is collection-only, so `ops[i] === 0`
 * is a safe "no operation" sentinel.
 */
export declare class SchemaChangeRecorder implements ChangeRecorder {
    private dirtyLow;
    private dirtyHigh;
    private readonly ops;
    constructor(numFields: number);
    record(index: number, op: OPERATION): void;
    recordDelete(index: number, op: OPERATION): void;
    recordRaw(index: number, op: OPERATION): void;
    operationAt(index: number): OPERATION | undefined;
    setOperationAt(index: number, op: OPERATION): void;
    forEach(cb: (index: number, op: OPERATION) => void): void;
    forEachWithCtx<T>(ctx: T, cb: (ctx: T, index: number, op: OPERATION) => void): void;
    size(): number;
    has(): boolean;
    reset(): void;
}
/**
 * Collection items have sparse indexes (e.g. 0, 7, 1024) exceeding the
 * 64-field cap Schema imposes. Map-based storage handles arbitrary
 * indexes; the value at each entry is the OPERATION.
 *
 * Pure operations (CLEAR, REVERSE) live in `pureOps` as `[position, op]`
 * entries where `position` is `dirty.size` at record time — preserves
 * insertion-order interleaving with indexed ops (e.g. CLEAR must emit
 * BEFORE subsequent ADDs).
 */
export declare class CollectionChangeRecorder implements ICollectionChangeRecorder {
    private dirty;
    private pureOps;
    record(index: number, op: OPERATION): void;
    recordDelete(index: number, op: OPERATION): void;
    recordRaw(index: number, op: OPERATION): void;
    recordPure(op: OPERATION): void;
    operationAt(index: number): OPERATION | undefined;
    setOperationAt(index: number, op: OPERATION): void;
    forEach(cb: (index: number, op: OPERATION) => void): void;
    forEachWithCtx<T>(ctx: T, cb: (ctx: T, index: number, op: OPERATION) => void): void;
    size(): number;
    has(): boolean;
    reset(): void;
    shift(shiftIndex: number): void;
}
/** 32-bit Hamming weight (popcount). */
export declare function popcount32(n: number): number;
