import { ChangeTree, Ref } from "./ChangeTree.js";
import { OPERATION } from "../encoding/spec.js";
import type { StreamSchema } from "../types/custom/StreamSchema.js";
import type { MapSchema } from "../types/custom/MapSchema.js";
import type { SetSchema } from "../types/custom/SetSchema.js";
import type { CollectionSchema } from "../types/custom/CollectionSchema.js";
export declare function createView(iterable?: boolean): StateView;
/**
 * Compact description of a rejected argument, for warning messages.
 * Passing the value itself to `console.warn` is not an option — a
 * populated collection inspects into dozens of lines of encoder
 * internals and buries the message that matters.
 */
/**
 * Sentinel inner-map key: "snapshot every live element of this ref-typed
 * ArraySchema". Written by `_add`'s bulk path instead of one entry per
 * element; `encodeView` expands it structurally at drain time, so the
 * emitted slots reflect any reindex that happened after `view.add()` —
 * and a whole-array snapshot costs one Map insert instead of N.
 * Real slots are never negative, so -1 cannot collide.
 */
export declare const ARRAY_SNAPSHOT = -1;
export declare class StateView {
    iterable: boolean;
    /**
     * Iterable list of items that are visible to this view
     * (Available only if constructed with `iterable: true`)
     */
    items: Ref[];
    /**
     * Unique ID assigned by the Root that owns this view's encoder. Used
     * to address per-StateView visibility bits stored on each ChangeTree.
     * Lazily allocated on first `add()` because the StateView itself
     * doesn't know its Root until then.
     */
    id: number;
    private _root?;
    /** Cached `id >> 5` and `1 << (id & 31)` for the hot encode-loop check. */
    private _slot;
    private _bit;
    /**
     * Per-tree custom-tag membership lives on each ChangeTree's `tagViews`
     * map (keyed by tag, value is a per-view bitmap). The StateView only
     * needs its slot/bit pair to read/write it. Replaces the legacy
     * `tags: WeakMap<ChangeTree, Set<number>>` allocation per (view, tree).
     */
    /**
     * Manual "ADD" operations for changes per ChangeTree, specific to this view.
     * (Used to force encoding a property even if it was not changed.)
     *
     * Inner storage is a Map so the encode loop in `encodeView` can iterate
     * directly with numeric keys — the legacy `{[index]: OPERATION}` shape
     * forced an `Object.keys(...)` allocation + `Number(key)` parse per ref.
     *
     * Inner keys are numbers (Schema field indexes, MapSchema journal
     * indexes, Set/Collection indexes, stream positions — all stable within
     * a tick), EXCEPT element bindings under a ref-typed ArraySchema parent,
     * which are keyed by the child's ChangeTree. An array wire slot captured
     * at `view.add()` time goes stale if the array reindexes (unshift /
     * reverse / move) later in the same tick — identity keys let
     * `encodeView` resolve the CURRENT slot at drain time instead.
     */
    changes: Map<number, Map<number | ChangeTree<any>, OPERATION>>;
    constructor(iterable?: boolean);
    /**
     * Lazily bind this view to a Root and acquire a view ID. Called on
     * the first add() because StateView is constructed before its target
     * Root is known.
     */
    private _bindRoot;
    /**
     * Release this view's ID back to the Root for reuse, AND clear all
     * visibility bits this view set on any ChangeTree. The clear is
     * essential — without it, a future view that acquires this same ID
     * would inherit our visibility state and see things it shouldn't
     * (privacy bug). Documented in StateViewInternals.test.ts.
     *
     * Optional API but strongly recommended on client-leave; otherwise
     * the FinalizationRegistry backstop runs at GC (non-deterministic).
     */
    dispose(): void;
    /** True iff this view can see `tree`. */
    isVisible(tree: ChangeTree): boolean;
    /** Mark `tree` as visible to this view. */
    markVisible(tree: ChangeTree): void;
    /** Clear visibility bit. */
    unmarkVisible(tree: ChangeTree): void;
    /** True iff this view is subscribed to `tree`. */
    isSubscribed(tree: ChangeTree): boolean;
    /** Set the subscription bit on `tree`. */
    private _setSubscribed;
    /** Clear the subscription bit on `tree`. */
    private _clearSubscribed;
    /**
     * True iff this view shares at least one tag bit with `tree`.
     *
     * `tagViews` is keyed by individual power-of-two bits (custom tags must
     * be powers of two; `@view(A|B)` field masks are decomposed on store).
     * A field whose mask is `tag` is visible if the view was `add()`ed with
     * any overlapping bit — so we walk `tag`'s set bits and return on the
     * first match. Passing DEFAULT_VIEW_TAG (-1, all bits) answers "does
     * this view hold ANY custom tag on the tree".
     */
    hasTagOnTree(tree: ChangeTree, tag: number): boolean;
    /** Mark `tree` as carrying `tag` (each of its bits) for this view. */
    addTag(tree: ChangeTree, tag: number): void;
    /** Clear each of `tag`'s bits for this view on `tree`. */
    removeTag(tree: ChangeTree, tag: number): void;
    /** Clear ALL tag bits this view holds on `tree` (used when the per-tag isn't known). */
    removeAllTagsOnTree(tree: ChangeTree): void;
    add(obj: Ref, tag?: number, checkIncludeParent?: boolean): boolean;
    /**
     * Internal: force-ship an object through `view.changes` without
     * applying stream-element routing. Called by `Encoder._emitStreamPriority`
     * when it's draining `_pendingByView` — the element is already out of
     * pending at that point, so re-routing back into pending would be a
     * loop. User code should always call `add()`.
     */
    _addImmediate(obj: Ref, tag?: number): void;
    private _add;
    /**
     * Walk an isNew subtree marking each descendant visible. Counterpart
     * to the `_add()` fast path: skips `view.changes` allocations because
     * the shared encode pass emits the whole fresh subtree structurally
     * — the view pass just needs visibility bits to let those emissions
     * through the per-tree filter.
     *
     * Preserves the `@view()`-tag filter from `_add`'s forEachChild: a
     * Schema descendant behind a non-matching field tag is skipped so
     * tagged fields don't leak into a default-tag view. Collections have
     * no per-field tags (`encDescriptor.tags` is empty), so the filter
     * is a no-op for collection children.
     *
     * If a descendant has `isNew=false` (rare: a detached sub-collection
     * was re-attached to a fresh parent), fall back to the full `_add`
     * path for that branch so its cumulative state is emitted correctly.
     */
    private _markSubtreeVisible;
    protected addParentOf(childChangeTree: ChangeTree, tag: number): void;
    /**
     * Walk `tree`'s parent chain to root and insert an empty entry into
     * `view.changes` for any ancestor not already present. Empty entries
     * are skipped by `encodeView` (`changes.size === 0` continue), so no
     * wire bytes are emitted — but the Map's insertion order now puts
     * each ancestor BEFORE the descendant entry that the caller is about
     * to write. Combined with `addParentOf`'s full-recursion walk on
     * `view.add`, this preserves the global invariant that
     * `view.changes` iteration order is topological.
     *
     * Iterative (not recursive) so the stack is bounded by tree depth
     * regardless of call patterns. Stops the walk as soon as it hits an
     * ancestor that's already in `view.changes` — at that point the
     * remainder of the chain is guaranteed to also be present (invariant
     * upheld by every prior caller).
     */
    private _touchAncestorsOf;
    remove(obj: Ref, tag?: number): this;
    remove(obj: Ref, tag?: number, _isClear?: boolean): this;
    has(obj: Ref): boolean;
    hasTag(ob: Ref, tag?: number): boolean;
    /**
     * Persistent subscription to a collection's contents. Unlike `add()`,
     * which is a one-shot bootstrap, `subscribe()` enrolls this view in
     * future content changes — every subsequent push / set / add to the
     * collection automatically flows to this view, and every removal
     * queues a DELETE op. Works on every collection type:
     *
     * - `ArraySchema` / `MapSchema` / `SetSchema` / `CollectionSchema`:
     *   new children are force-shipped immediately (equivalent to
     *   `view.add(child)` per item).
     * - `StreamSchema` (or `.stream()` maps/sets): new positions are
     *   enqueued into `_pendingByView` so the priority pass drains them
     *   respecting `maxPerTick`.
     *
     * On a streaming collection, pass a `priority` callback to order THIS
     * client's backlog. It receives only the element, so whatever the
     * client sorts by is captured in the closure — nothing is attached to
     * the view, and both the element and the captured entity stay typed:
     *
     * ```ts
     * onJoin(client) {
     *     const player = this.state.players.get(client.sessionId);
     *     client.view.subscribe(this.state.enemies, (enemy) =>
     *         -((enemy.x - player.x) ** 2 + (enemy.y - player.y) ** 2));
     * }
     * ```
     *
     * A per-view callback overrides the collection's declaration-scope
     * `.priority()` for this client only.
     *
     * Idempotent on re-subscribe: subscribing to an already-subscribed
     * collection is a no-op, EXCEPT that a supplied `priority` always
     * replaces the previous one — re-subscribe to retarget the ordering.
     * Omitting the argument leaves any existing callback in place; pass
     * `null` to drop it and fall back to the declaration-scope callback.
     */
    subscribe<V>(collection: StreamSchema<V> | MapSchema<V, any> | SetSchema<V> | CollectionSchema<V>, priority?: ((element: V) => number) | null): this;
    subscribe(collection: Ref): this;
    /**
     * End a persistent subscription. Queues DELETE for every already-sent
     * child and clears any pending. After this call, future content
     * changes on the collection no longer auto-flow to this view (though
     * direct `view.add(element)` calls still work for per-entity use).
     */
    unsubscribe(collection: Ref): this;
    clear(): void;
    isChangeTreeVisible(changeTree: ChangeTree): boolean;
    protected _recursiveDeleteVisibleChangeTree(changeTree: ChangeTree): void;
    /**
     * Drop the pending `view.changes` entries of `tree` and every descendant.
     * Called when a same-patch pending ADD is cancelled: the subtree's
     * introduction never reaches this client, so its entries would emit
     * refIds the decoder cannot resolve ("refId" not found).
     */
    private _dropPendingEntries;
    /**
     * Queue DELETE for a @view field on `changes` and hide the field
     * value's subtree from this view. When the field's ADD is still
     * pending (same-patch add + remove), the value's introduction never
     * ships — its pending subtree entries are dropped along with it.
     */
    private _removeViewField;
}
