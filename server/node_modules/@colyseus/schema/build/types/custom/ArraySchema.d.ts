import { $changes, $childType, $decoder, $deleteByIndex, $onEncodeEnd, $encoder, $filter, $getByIndex, $onDecodeEnd, $proxyTarget, $refId, $reset, $resyncPrune } from "../symbols.js";
import type { Schema } from "../../Schema.js";
import { type IRef, ChangeTree } from "../../encoder/ChangeTree.js";
import { OPERATION } from "../../encoding/spec.js";
import { Collection } from "../HelperTypes.js";
import type { StateView } from "../../encoder/StateView.js";
export declare class ArraySchema<V = any> implements Array<V>, Collection<number, V>, IRef {
    [n: number]: V;
    [$changes]: ChangeTree;
    [$refId]?: number;
    [$proxyTarget]: this;
    protected [$childType]: string | typeof Schema;
    protected items: V[];
    protected tmpItems: V[];
    protected deletedIndexes: boolean[];
    protected isMovingItems: boolean;
    /** Decode-side: `items` has holes (delete or gap-write) — `$onDecodeEnd` must compact. */
    protected _needsCompaction: boolean;
    static [$encoder]: import("../../encoder/EncodeOperation.js").EncodeOperation<any>;
    static [$decoder]: import("../../decoder/DecodeOperation.js").DecodeOperation<any>;
    /** Integer tag read by `decodeKeyValueOperation` — see `CollectionKind`. */
    static readonly COLLECTION_KIND: 2;
    /**
     * Determine if a property must be filtered.
     * - If returns false, the property is NOT going to be encoded.
     * - If returns true, the property is going to be encoded.
     *
     * Encoding with "filters" happens in two steps:
     * - First, the encoder iterates over all "not owned" properties and encodes them.
     * - Then, the encoder iterates over all "owned" properties per instance and encodes them.
     */
    static [$filter](ref: ArraySchema, index: number, view: StateView): boolean;
    static is(type: any): boolean;
    static from<T>(iterable: Iterable<T> | ArrayLike<T>): ArraySchema<T>;
    constructor(...items: V[]);
    /**
     * Decoder-side factory. Skips the `ChangeTree` allocation and
     * replicates the class-field initializers by hand (since `Object.create`
     * bypasses them). Must stay in sync with the class-field declarations
     * and the constructor body above.
     *
     * Pass the Proxy to `installUntrackedChangeTree` as the public identity
     * so children set their parent to the Proxy, not the raw target.
     */
    static initializeForDecoder<V = any>(): ArraySchema<V>;
    set length(newLength: number);
    get length(): number;
    pauseTracking(): void;
    resumeTracking(): void;
    untracked<T>(fn: () => T): T;
    get isTrackingPaused(): boolean;
    push(...values: V[]): number;
    /**
     * Removes the last element from an array and returns it.
     */
    pop(): V | undefined;
    at(index: number): V;
    /**
     * items-index → wire (tmpItems) index. Identity while no deletions are
     * staged this tick; otherwise maps to the index-th live (non-deleted)
     * tmpItems slot — the same live-index walk `splice()` uses. Without the
     * translation, index writes recorded after a same-tick `shift()`/`splice()`
     * land on the wrong wire slots.
     */
    protected $wireIndex(index: number): number;
    /**
     * True when wire slot `at` holds an ADD recorded this tick that no client
     * has seen, so the slot can be erased outright instead of shipping a
     * DELETE for something nobody has. Only Schema children matter: their
     * DELETE goes out as DELETE_BY_REFID, which the decoder resolves against
     * every reference to the instance — a phantom one decrements a refCount
     * owned by whichever other collection still holds it.
     *
     * Call BEFORE `ChangeTree.delete()`, which overwrites the ADD. One mask
     * test rules out both hazards (a same-tick full sync made the pending
     * indexes load-bearing; a stream journal owns the positions).
     */
    protected $isUnsentAdd(at: number): boolean;
    /**
     * Erase a wire slot whose ADD never reached a client. The staged layout
     * closes over it, so no emitter — shared pass, view drain, snapshot or
     * stream — can address it: the add never happened.
     *
     * Caller must have run `changeTree.delete(at)` FIRST: it resolves
     * `$getByIndex(at)` against the still-intact snapshot (splicing first
     * would resolve the next element) and releases the element's refCount.
     */
    protected $cancelAdd(at: number, reindex?: boolean): void;
    /**
     * Re-point children at their wire slot. `ChangeTree._parentIndex` caches
     * the slot a child holds in `tmpItems`, and StateView addresses per-view
     * ADD/DELETE with it — so a reorder that leaves it behind aims those ops
     * at whichever element inherited the slot (issue #231).
     *
     * The filter check is a correctness boundary, not a tunable: StateView is
     * the only reader and reaches the index only through a filtered array
     * (`addParentOf` bails on `hasFilteredFields`, `remove` on the child's
     * `isFiltered`). Everything else stops at the flag read instead of walking
     * its children every tick.
     *
     * Callers name the lowest slot that moved as `from`. Compaction cannot, so
     * it hands over the pre-compaction layout as `staged` and the unchanged
     * prefix is skipped instead. Either way tail churn walks nothing.
     */
    protected $reindexChildren(from: number, staged?: V[]): void;
    protected $changeAt(index: number, value: V): number | undefined;
    protected $deleteAt(index: number, operation?: OPERATION): void;
    protected $setAt(index: number, value: V, operation: OPERATION): void;
    clear(): void;
    /**
     * Pool reset: empty this array and recycle its ChangeTree WITHOUT recording
     * any wire op (the parent field's ADD/DELETE owns the wire). Recurses into
     * ref-type children. Called by Schema.reset when a pooled entity has an
     * array field. The instance must already be detached from the encoder.
     */
    [$reset](): void;
    /**
     * Combines two or more arrays.
     * @param items Additional items to add to the end of array1.
     */
    concat(...items: (V | ConcatArray<V>)[]): ArraySchema<V>;
    /**
     * Adds all the elements of an array separated by the specified separator string.
     * @param separator A string used to separate one element of an array from the next in the resulting String. If omitted, the array elements are separated with a comma.
     */
    join(separator?: string): string;
    /**
     * Reverses the elements in an Array.
     */
    reverse(): ArraySchema<V>;
    /**
     * Removes the first element from an array and returns it.
     */
    shift(): V | undefined;
    /**
     * Returns a section of an array.
     * @param start The beginning of the specified portion of the array.
     * @param end The end of the specified portion of the array. This is exclusive of the element at the index 'end'.
     */
    slice(start?: number, end?: number): V[];
    /**
     * Sorts an array.
     * @param compareFn Function used to determine the order of the elements. It is expected to return
     * a negative value if first argument is less than second argument, zero if they're equal and a positive
     * value otherwise. If omitted, the elements are sorted in ascending, ASCII character order.
     * ```ts
     * [11,2,22,1].sort((a, b) => a - b)
     * ```
     */
    sort(compareFn?: (a: V, b: V) => number): this;
    /**
     * Removes elements from an array and, if necessary, inserts new elements in their place, returning the deleted elements.
     * @param start The zero-based location in the array from which to start removing elements.
     * @param deleteCount The number of elements to remove.
     * @param insertItems Elements to insert into the array in place of the deleted elements.
     */
    splice(start: number, deleteCount?: number, ...insertItems: V[]): V[];
    /**
     * Inserts new elements at the start of an array.
     * @param items  Elements to insert at the start of the Array.
     */
    unshift(...items: V[]): number;
    /**
     * Returns the index of the first occurrence of a value in an array.
     * @param searchElement The value to locate in the array.
     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the search starts at index 0.
     */
    indexOf(searchElement: V, fromIndex?: number): number;
    /**
     * Returns the index of the last occurrence of a specified value in an array.
     * @param searchElement The value to locate in the array.
     * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the search starts at the last index in the array.
     */
    lastIndexOf(searchElement: V, fromIndex?: number): number;
    /**
     * Determines whether all the members of an array satisfy the specified test.
     * @param callbackfn A function that accepts up to three arguments. The every method calls
     * the callbackfn function for each element in the array until the callbackfn returns a value
     * which is coercible to the Boolean value false, or until the end of the array.
     * @param thisArg An object to which the this keyword can refer in the callbackfn function.
     * If thisArg is omitted, undefined is used as the this value.
     */
    every<S extends V>(predicate: (value: V, index: number, array: V[]) => value is S, thisArg?: any): this is S[];
    every(callbackfn: (value: V, index: number, array: V[]) => unknown, thisArg?: any): boolean;
    /**
     * Determines whether the specified callback function returns true for any element of an array.
     * @param callbackfn A function that accepts up to three arguments. The some method calls
     * the callbackfn function for each element in the array until the callbackfn returns a value
     * which is coercible to the Boolean value true, or until the end of the array.
     * @param thisArg An object to which the this keyword can refer in the callbackfn function.
     * If thisArg is omitted, undefined is used as the this value.
     */
    some(callbackfn: (value: V, index: number, array: V[]) => unknown, thisArg?: any): boolean;
    /**
     * Performs the specified action for each element in an array.
     * @param callbackfn  A function that accepts up to three arguments. forEach calls the callbackfn function one time for each element in the array.
     * @param thisArg  An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
     */
    forEach(callbackfn: (value: V, index: number, array: V[]) => void, thisArg?: any): void;
    /**
     * Calls a defined callback function on each element of an array, and returns an array that contains the results.
     * @param callbackfn A function that accepts up to three arguments. The map method calls the callbackfn function one time for each element in the array.
     * @param thisArg An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
     */
    map<U>(callbackfn: (value: V, index: number, array: V[]) => U, thisArg?: any): U[];
    /**
     * Returns the elements of an array that meet the condition specified in a callback function.
     * @param callbackfn A function that accepts up to three arguments. The filter method calls the callbackfn function one time for each element in the array.
     * @param thisArg An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
     */
    filter(callbackfn: (value: V, index: number, array: V[]) => unknown, thisArg?: any): V[];
    /**
     * Calls the specified callback function for all the elements in an array. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
     * @param callbackfn A function that accepts up to four arguments. The reduce method calls the callbackfn function one time for each element in the array.
     * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.
     */
    reduce<U = V>(callbackfn: (previousValue: U, currentValue: V, currentIndex: number, array: V[]) => U, initialValue?: U): U;
    /**
     * Calls the specified callback function for all the elements in an array, in descending order. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
     * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls the callbackfn function one time for each element in the array.
     * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.
     */
    reduceRight<U = V>(callbackfn: (previousValue: U, currentValue: V, currentIndex: number, array: V[]) => U, initialValue?: U): U;
    /**
     * Returns the value of the first element in the array where predicate is true, and undefined
     * otherwise.
     * @param predicate find calls predicate once for each element of the array, in ascending
     * order, until it finds one where predicate returns true. If such an element is found, find
     * immediately returns that element value. Otherwise, find returns undefined.
     * @param thisArg If provided, it will be used as the this value for each invocation of
     * predicate. If it is not provided, undefined is used instead.
     */
    find(predicate: (value: V, index: number, obj: V[]) => boolean, thisArg?: any): V | undefined;
    /**
     * Returns the index of the first element in the array where predicate is true, and -1
     * otherwise.
     * @param predicate find calls predicate once for each element of the array, in ascending
     * order, until it finds one where predicate returns true. If such an element is found,
     * findIndex immediately returns that element index. Otherwise, findIndex returns -1.
     * @param thisArg If provided, it will be used as the this value for each invocation of
     * predicate. If it is not provided, undefined is used instead.
     */
    findIndex(predicate: (value: V, index: number, obj: V[]) => unknown, thisArg?: any): number;
    /**
     * Returns the this object after filling the section identified by start and end with value
     * @param value value to fill array section with
     * @param start index to start filling the array at. If start is negative, it is treated as
     * length+start where length is the length of the array.
     * @param end index to stop filling the array at. If end is negative, it is treated as
     * length+end.
     */
    fill(value: V, start?: number, end?: number): this;
    /**
     * Returns the this object after copying a section of the array identified by start and end
     * to the same array starting at position target
     * @param target If target is negative, it is treated as length+target where length is the
     * length of the array.
     * @param start If start is negative, it is treated as length+start. If end is negative, it
     * is treated as length+end.
     * @param end If not specified, length of the this object is used as its default value.
     */
    copyWithin(target: number, start: number, end?: number): this;
    /**
     * Returns a string representation of an array.
     */
    toString(): string;
    /**
     * Returns a string representation of an array. The elements are converted to string using their toLocalString methods.
     */
    toLocaleString(): string;
    /** Iterator */
    [Symbol.iterator](): ArrayIterator<V>;
    static get [Symbol.species](): typeof ArraySchema;
    [Symbol.unscopables]: any;
    /**
     * Returns an iterable of key, value pairs for every entry in the array
     */
    entries(): ArrayIterator<[number, V]>;
    /**
     * Returns an iterable of keys in the array
     */
    keys(): ArrayIterator<number>;
    /**
     * Returns an iterable of values in the array
     */
    values(): ArrayIterator<V>;
    /**
     * Determines whether an array includes a certain element, returning true or false as appropriate.
     * @param searchElement The element to search for.
     * @param fromIndex The position in this array at which to begin searching for searchElement.
     */
    includes(searchElement: V, fromIndex?: number): boolean;
    /**
     * Calls a defined callback function on each element of an array. Then, flattens the result into
     * a new array.
     * This is identical to a map followed by flat with depth 1.
     *
     * @param callback A function that accepts up to three arguments. The flatMap method calls the
     * callback function one time for each element in the array.
     * @param thisArg An object to which the this keyword can refer in the callback function. If
     * thisArg is omitted, undefined is used as the this value.
     */
    flatMap<U, This = undefined>(callback: (this: This, value: V, index: number, array: V[]) => U | ReadonlyArray<U>, thisArg?: This): U[];
    /**
     * Returns a new array with all sub-array elements concatenated into it recursively up to the
     * specified depth.
     *
     * @param depth The maximum recursion depth
     */
    flat<A, D extends number = 1>(this: A, depth?: D): any;
    findLast(): any;
    findLastIndex(...args: any[]): any;
    with(index: number, value: V): ArraySchema<V>;
    toReversed(): V[];
    toSorted(compareFn?: (a: V, b: V) => number): V[];
    toSpliced(start: number, deleteCount: number, ...items: V[]): V[];
    toSpliced(start: number, deleteCount?: number): V[];
    shuffle(): this;
    /**
     * Allows to move items around in the array.
     *
     * Example:
     *     state.cards.move((cards) => {
     *         [cards[4], cards[3]] = [cards[3], cards[4]];
     *         [cards[3], cards[2]] = [cards[2], cards[3]];
     *         [cards[2], cards[0]] = [cards[0], cards[2]];
     *         [cards[1], cards[1]] = [cards[1], cards[1]];
     *         [cards[0], cards[0]] = [cards[0], cards[0]];
     *     })
     *
     * @param cb
     * @returns
     */
    move(cb: (arr: this) => void): this;
    /**
     * Encoder-only. Reads the staged-snapshot (`tmpItems`) so the encoder can
     * resolve a wire-index even after the user has mutated `items` mid-tick.
     * The decoder reads `items[index]` directly — see `decodeArray` and
     * `$deleteByIndex` below.
     */
    [$getByIndex](index: number, isEncodeAll?: boolean): any;
    [$deleteByIndex](index: number): void;
    protected [$onEncodeEnd](): void;
    protected [$onDecodeEnd](): void;
    [$resyncPrune](visited: Set<number | string>, prune: (value: V, identity: number | string) => void, keep: (value: V) => void): void;
    toArray(): V[];
    toJSON(): any[];
    clone(isDecoding?: boolean): ArraySchema<V>;
}
