/**
 * ChangeTree — the per-`Ref` mutation tracker attached via `$changes`.
 *
 * This file owns: class shape (fields, flags, ctor), inline
 * ChangeRecorder implementation (record / forEach / …), mutation API
 * (change / delete / operation / …), and encode lifecycle (endEncode /
 * discard / …). Helpers split out into ./changeTree/:
 *
 *   - parentChain.ts     addParent / removeParent / find / has / getAll
 *   - liveIteration.ts   forEachLive
 *   - inheritedFlags.ts  filter / unreliable / patchOnly / static inheritance
 *   - treeAttachment.ts  setRoot / setParent / forEachChild(+WithCtx)
 *
 * Public surface on ChangeTree is unchanged — methods are thin pass-throughs
 * into the helpers. V8 inlines the pass-throughs; the runtime shape stays
 * a single class to preserve hidden-class + IC behavior.
 */
import { OPERATION } from "../encoding/spec.js";
import { Schema } from "../Schema.js";
import { $changes, $decoder, $encoder, $getByIndex, $refId, type $deleteByIndex } from "../types/symbols.js";
import type { MapSchema } from "../types/custom/MapSchema.js";
import type { ArraySchema } from "../types/custom/ArraySchema.js";
import type { CollectionSchema } from "../types/custom/CollectionSchema.js";
import type { SetSchema } from "../types/custom/SetSchema.js";
import type { StreamSchema } from "../types/custom/StreamSchema.js";
import { Root } from "./Root.js";
import { Metadata } from "../Metadata.js";
import { type ChangeRecorder } from "./ChangeRecorder.js";
import type { EncodeOperation } from "./EncodeOperation.js";
import { type EncodeDescriptor } from "./EncodeDescriptor.js";
import type { DecodeOperation } from "../decoder/DecodeOperation.js";
declare global {
    interface Object {
        [$changes]?: ChangeTree;
        [$encoder]?: EncodeOperation;
        [$decoder]?: DecodeOperation;
    }
}
export interface IRef {
    [$refId]?: number;
    [$getByIndex](index: number, isEncodeAll?: boolean): any;
    [$deleteByIndex](index: number): void;
}
export type Ref = Schema | ArraySchema | MapSchema | CollectionSchema | SetSchema | StreamSchema;
export interface ChangeTreeNode {
    changeTree: ChangeTree;
    next?: ChangeTreeNode;
    prev?: ChangeTreeNode;
    position: number;
}
export interface ChangeTreeList {
    next?: ChangeTreeNode;
    tail?: ChangeTreeNode;
    nextPosition: number;
}
export declare function createChangeTreeList(): ChangeTreeList;
/**
 * Live node in a tree's parent chain — mutating one edits the chain. Only
 * `parentChain.ts` should hold these.
 */
export interface ParentChain {
    ref: Ref;
    index: number;
    next?: ParentChain;
}
/**
 * Detached copy of one parent link, handed out by the query helpers. Distinct
 * from `ParentChain` on purpose: it carries no `next`, so it cannot be walked
 * as if it were the chain, and it is readonly, so it cannot be mistaken for a
 * way to move a parent's index — `setParentIndex` does that.
 */
export interface ParentEntry {
    readonly ref: Ref;
    readonly index: number;
}
export declare const IS_FILTERED = 1, IS_VISIBILITY_SHARED = 2, IS_NEW = 4;
export declare const IS_UNRELIABLE = 8, IS_PATCH_ONLY = 16, IS_FULL_STATE_ONLY = 32;
export declare const IS_STREAM_COLLECTION = 64;
export declare const NEEDS_RESTAGE = 128;
export declare const PENDING_FILTER_REFRESH = 256;
export declare const PENDING_SHIPPED_BY_FULL_SYNC = 512;
/**
 * Flags a child inherits from its parent's own transitive state via
 * `checkInheritedFlags`. Read as a bitwise mask so the inheritance step
 * is a single OR instead of three getter/setter pairs.
 *
 * `IS_UNRELIABLE` is intentionally excluded: `@unreliable` is rejected
 * at decoration time for ref-type fields (see `Metadata.setUnreliable`)
 * because an unreliable ADD/DELETE could leave the decoder unable to
 * interpret later packets referencing an orphan refId. Tree-level
 * unreliable is therefore dead on every Schema/Collection tree today;
 * the bit and its machinery are kept in place so this can be
 * reconsidered if a safe semantics (e.g. reliable ADD + unreliable
 * field mutations only) is designed later.
 */
export declare const INHERITABLE_FLAGS: number;
export declare class ChangeTree<T extends Ref = any> implements ChangeRecorder {
    ref: T;
    /**
     * Non-Proxy target of `ref` for encoder hot-path reads. For
     * `ArraySchema`, `ref` is the Proxy users interact with; every property
     * access on it runs through the `get` trap (even for symbol keys, which
     * fall through to `Reflect.get` — one extra hop per lookup). The encoder
     * loop reads `[$getByIndex]`, `[$childType]`, `.items`, `.tmpItems` at
     * high frequency during `encode()` / `encodeAll()`; going through
     * `refTarget` skips all of those traps.
     *
     * For non-proxied types (Schema, MapSchema, SetSchema, CollectionSchema,
     * StreamSchema), `refTarget === ref`. Consumers that need the user-
     * facing identity (debug output, callback parents) keep using `ref`.
     */
    refTarget: T;
    /**
     * True when `ref` is an ArraySchema — the only proxied type, so its
     * user-facing identity differs from `refTarget`. Canonical predicate for
     * "is this tree's ref an array" without probing `ref` (which would hit
     * the Proxy trap) — two monomorphic loads on the tree itself.
     */
    get isArray(): boolean;
    metadata: Metadata;
    /**
     * Per-class cache of encoder fn / filter fn / isSchema / metadata /
     * per-field arrays, looked up once at construction. The encode loop reads
     * `tree.encDescriptor` and never touches `ref.constructor` again. See
     * EncodeDescriptor.ts.
     */
    encDescriptor: EncodeDescriptor;
    root?: Root;
    parentRef?: Ref;
    _parentIndex?: number;
    extraParents?: ParentChain;
    flags: number;
    /**
     * Per-walk visit stamp written by `Encoder.encodeFullSync`'s DFS. A
     * tree is considered "already visited by the current walk" iff
     * `tree._fullSyncGen === ctx.gen` — the encoder bumps its generation
     * counter once per walk, then stamps each tree with that value on
     * first visit; any later encounter of the same tree (shared refs
     * reachable through multiple parents) short-circuits on the equality
     * check instead of recursing again.
     */
    _fullSyncGen: number;
    _isSchema: boolean;
    dirtyLow: number;
    dirtyHigh: number;
    opsLow: number;
    opsHigh: number;
    ops?: Uint8Array;
    collDirty?: Map<number, OPERATION>;
    collPureOps?: Array<[number, OPERATION]>;
    unreliableRecorder?: ChangeRecorder;
    paused: boolean;
    changesNode?: ChangeTreeNode;
    unreliableChangesNode?: ChangeTreeNode;
    visibleViews?: number[];
    tagViews?: Map<number, number[]>;
    /**
     * Per-view subscription bitmap — same layout as `visibleViews`. Set by
     * `StateView.subscribe(collection)` to mark the view as persistently
     * interested in this collection's contents. When a new child is
     * attached to a subscribed collection (setParent hook), it's
     * auto-propagated to every subscribed view (force-shipped for
     * Array/Map/Set/Collection; enqueued into per-view pending for
     * streams). Undefined until the first subscribe.
     */
    subscribedViews?: number[];
    get isFiltered(): boolean;
    set isFiltered(v: boolean);
    get isVisibilitySharedWithParent(): boolean;
    set isVisibilitySharedWithParent(v: boolean);
    get isNew(): boolean;
    set isNew(v: boolean);
    get isUnreliable(): boolean;
    set isUnreliable(v: boolean);
    get isPatchOnly(): boolean;
    set isPatchOnly(v: boolean);
    get isFullStateOnly(): boolean;
    set isFullStateOnly(v: boolean);
    get isStreamCollection(): boolean;
    set isStreamCollection(v: boolean);
    get needsRestage(): boolean;
    set needsRestage(v: boolean);
    get hasFilteredFields(): boolean;
    ensureUnreliableRecorder(): ChangeRecorder;
    isFieldUnreliable(index: number): boolean;
    isFieldFullStateOnly(index: number): boolean;
    isFieldStream(index: number): boolean;
    constructor(ref: T, refTarget?: T);
    private _opAt;
    private _opPut;
    private _markDirty;
    record(index: number, op: OPERATION): void;
    recordDelete(index: number, op: OPERATION): void;
    recordRaw(index: number, op: OPERATION): void;
    recordPure(op: OPERATION): void;
    operationAt(index: number): OPERATION | undefined;
    setOperationAt(index: number, op: OPERATION): void;
    forEach(cb: (index: number, op: OPERATION) => void): void;
    forEachWithCtx<C>(ctx: C, cb: (ctx: C, index: number, op: OPERATION) => void): void;
    size(): number;
    has(): boolean;
    reset(): void;
    /**
     * Full reset to construction defaults so the owning ref can be returned to
     * a pool and reused for a different logical entity (see encoder/Pool.ts +
     * Schema.reset). Unlike `reset()` / `endEncode()` (which only clear the
     * dirty bucket for the next encode), this also drops parent links, queue
     * nodes and per-view bitmaps, and re-arms IS_NEW.
     *
     * Precondition: the tree must already be detached from the encoder
     * (`root === undefined`) — i.e. the ref was removed from its parent
     * collection/field, which `Root.remove` does before this runs.
     */
    recycle(): void;
    /**
     * ArraySchema insert (unshift / splice with more inserts than deletes):
     * re-key pending ops at or above `at` by `+count`, then record ADDs for
     * the new items at indexes `at..at+count-1`.
     *
     * The rebuilt map's insertion order IS the wire order:
     *   1. ops below `at` — the insert doesn't move them, and an insert of
     *      their own must still be applied before this one (ascending);
     *   2. the new ADDs, ascending — the decoder splice-inserts each one,
     *      which only works lowest-index-first;
     *   3. the re-keyed ops, in their original relative order — their
     *      indexes now address the post-insert layout.
     * See ArraySchema#$setAt.
     */
    insertAt(at: number, count: number): void;
    /**
     * Inverse of `insertAt`: the wire slots in `[at, at+count)` never existed.
     * Drop their pending ops and re-key everything above them down by `count`,
     * preserving relative order exactly as `insertAt` does for the entries it
     * shifts up.
     *
     * Reached only through `ArraySchema.$cancelAdd`, after `ChangeTree.delete`
     * has already enqueued this tree and released the element's refCount — so
     * no enqueue here, and no `paused`/`isFullStateOnly` handling: neither can
     * have put an ADD in `collDirty` (`_routeAndRecord` returns early), and
     * the caller only cancels a pending ADD. `collPureOps` is left alone for
     * the same reason `insertAt` leaves it: a CLEAR/REVERSE resets the bucket
     * first (`ArraySchema.clear` → `discard()`).
     */
    removeAt(at: number, count: number): void;
    /** ArraySchema#unshift(): insert `count` items at the head. */
    unshift(count: number): void;
    setRoot(root: Root): void;
    setParent(parent: Ref, root?: Root, parentIndex?: number): void;
    forEachChild(cb: (change: ChangeTree, at: any) => void): void;
    forEachChildWithCtx<C>(ctx: C, cb: (ctx: C, change: ChangeTree, at: any) => void): void;
    forEachLive(cb: (index: number) => void): void;
    forEachLiveWithCtx<C>(ctx: C, cb: (ctx: C, index: number) => void): void;
    operation(op: OPERATION): void;
    /**
     * Route a field-level mutation to the reliable or unreliable channel
     * and enqueue into the matching queue. Shared by `change` and
     * `indexedOperation`; `raw=true` bypasses DELETE→ADD merge
     * (ArraySchema positional writes), `raw=false` merges inside `record`.
     *
     * Note: record() on both channels handles DELETE→ADD merge internally,
     * so callers do not need to pre-compute the merged op.
     *
     * `@unreliable` is decoration-time-validated to apply only to primitive
     * fields (see annotations.ts), so the per-field unreliable flag here
     * always means "primitive value updates" — the structural-ADD-routes-
     * reliable footgun for ref-type fields can't reach this code path.
     *
     * `!isNew` holds an `@unreliable` field on the RELIABLE channel until this
     * tree's own ADD has shipped there. A decoder can only apply a field write
     * to a ref it already knows, so a value emitted before the ADD is dropped —
     * permanently, if the field is never written again. `isNew` clears in
     * `endEncode()`, i.e. after a reliable pass, and recording reliably is
     * itself what enqueues the tree for that pass; the state is self-clearing
     * and no tree can be stranded on the wrong channel. Mirrors `encodeAll`,
     * which has always seeded these fields for late joiners.
     *
     * Ordering matters: `isFieldUnreliable` short-circuits on the class-level
     * `hasAnyUnreliable`, so schemas without the modifier never read `flags`.
     */
    private _routeAndRecord;
    change(index: number, operation?: OPERATION): void;
    indexedOperation(index: number, operation: OPERATION): void;
    getChange(index: number): OPERATION;
    pause(): void;
    resume(): void;
    untracked<T>(fn: () => T): T;
    markDirty(index: number, operation?: OPERATION): void;
    getValue(index: number, isEncodeAll?: boolean): any;
    delete(index: number, operation?: OPERATION): any;
    endEncode(): void;
    endEncodeUnreliable(): void;
    discard(): void;
    discardAll(): void;
    get changed(): boolean;
    /** Immediate parent (primary). See `extraParents` for the 2nd+ chain. */
    get parent(): Ref | undefined;
    get parentIndex(): number | undefined;
    addParent(parent: Ref, index: number): void;
    /** Re-point an existing parent's cached index after the parent reindexed. */
    setParentIndex(parent: Ref, index: number): void;
    /** @returns true if parent was found and removed */
    removeParent(parent?: Ref): boolean;
    findParent(predicate: (parent: Ref, index: number) => boolean): ParentEntry | undefined;
    hasParent(predicate: (parent: Ref, index: number) => boolean): boolean;
    /** Wire index this tree holds inside `parent`, or undefined if not a parent. */
    indexInParent(parent: Ref): number | undefined;
    getAllParents(): ParentEntry[];
}
/**
 * Lightweight per-instance no-op ChangeTree used for instances the decoder
 * builds. Those instances never feed back into an Encoder, so the full
 * `ChangeTree` machinery (EncodeDescriptor lookup, recorder state, Maps /
 * Uint8Arrays for change slots) is pure overhead — this stub carries only a
 * `ref` back-pointer and no-op methods, so tree walkers and debug tooling
 * continue to work.
 *
 * Plug-in contract: each collection class and the `Decoder` pick between
 * `new ChangeTree(ref)` and `createUntrackedChangeTree(ref)` explicitly via
 * dedicated factories (`initializeForDecoder` on collections,
 * `createInstanceOfType` on the `Decoder`). There is no global state — every
 * decision is local to the call site.
 */
export declare class UntrackedChangeTree {
    ref: Ref;
    root: undefined;
    parentRef: undefined;
    paused: boolean;
    isNew: boolean;
    flags: number;
    constructor(ref: Ref);
    change(): void;
    delete(): void;
    indexedOperation(): void;
    operation(): void;
    setParent(): void;
    addParent(): void;
    setParentIndex(): void;
    removeParent(): boolean;
    getChange(): number;
    discard(): void;
    discardAll(): void;
    pause(): void;
    resume(): void;
    untracked<T>(fn: () => T): T;
    markDirty(): void;
    forEachChild(callback: (change: any, at: any) => void): void;
    forEachChildWithCtx<C>(ctx: C, callback: (ctx: C, change: any, at: any) => void): void;
    forEachLive(): void;
    forEachLiveWithCtx(): void;
    forEach(): void;
}
export declare function createUntrackedChangeTree(ref: Ref): ChangeTree;
/**
 * Install a non-enumerable `$changes: UntrackedChangeTree` on `target`.
 * Shared by `Schema.initializeForDecoder` and every collection's
 * `initializeForDecoder`. `publicRef` defaults to `target` — pass a Proxy
 * instead (ArraySchema) so children attached to this tree see the Proxy
 * as their parent, not the raw target.
 *
 * `enumerable: false` is load-bearing — tests use `deepStrictEqual` on
 * decoded instances and walking into `$changes` would recurse through
 * circular refs. Same descriptor shape as the tracked `Schema.initialize`
 * + collection ctors.
 */
export declare function installUntrackedChangeTree(target: object, publicRef?: object): void;
