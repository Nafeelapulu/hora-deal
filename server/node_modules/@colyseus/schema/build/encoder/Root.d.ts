import { TypeContext } from "../types/TypeContext.js";
import { ChangeTree, ChangeTreeList, type ChangeTreeNode } from "./ChangeTree.js";
import { $changes, $refId } from "../types/symbols.js";
import type { StateView } from "./StateView.js";
import type { StreamableState } from "./streaming.js";
/**
 * Minimal shape the encoder needs from a streamable collection. Both
 * `StreamSchema` and `.stream()`-decorated `MapSchema`/`SetSchema` etc.
 * satisfy this via a single lazily-allocated `_stream` slot — the
 * per-view / broadcast bookkeeping lives on that object, not directly
 * on the collection, so non-streaming instances pay zero Map/Set
 * allocation cost.
 */
export interface Streamable {
    [$refId]?: number;
    [$changes]: ChangeTree;
    _stream?: StreamableState;
    _dropView(viewId: number): void;
    _unregister(): void;
}
export declare class Root {
    types: TypeContext;
    /**
     * Monotonic refId counter. RefIds are never recycled — a refId is a
     * stable identity for the lifetime of the room, so a client that
     * missed DELETEs (reconnect) can never see an old id rebound to a
     * different instance. DevMode reads/writes this across HMR cycles.
     */
    protected nextUniqueId: number;
    refCount: {
        [id: number]: number;
    };
    changeTrees: {
        [refId: number]: ChangeTree;
    };
    /**
     * Queue of all ChangeTrees with reliable dirty state. Per-tick encode()
     * walks this queue; per-view encodeView() walks it too (filtering at
     * emission time via tree.isFiltered + per-field @view tag).
     */
    changes: ChangeTreeList;
    /**
     * Queue of all ChangeTrees with unreliable dirty state. Walked by
     * `Encoder.encodeUnreliable` / `encodeUnreliableView`. A tree may live
     * in both queues when the Schema has both reliable and unreliable
     * fields dirty at the same time.
     */
    unreliableChanges: ChangeTreeList;
    /**
     * Trees whose parent-edge set changed this tick (instance sharing
     * gained or lost an edge). The encoder drains this before emission —
     * `inheritedFlags.drainFilterRefresh` re-derives each tree's filter
     * state against the then-settled containers. Only populated when the
     * TypeContext has any @view/@stream field.
     */
    pendingFilterRefresh: ChangeTree[];
    enqueueFilterRefresh(tree: ChangeTree): void;
    /**
     * Free-list of ChangeTreeNode objects. Both queues share this pool —
     * a node carries no queue affinity, only `{ changeTree, prev, next, position }`.
     * Reusing nodes turns ~1,250 per-tick allocations (in bench) into 0.
     */
    private _nodePool;
    /**
     * View ID allocator for StateView visibility bitmaps on ChangeTree.
     * Each new StateView claims the lowest free ID; releaseViewId() puts
     * the ID back. Avoids unbounded bitmap growth across long-running rooms
     * with view churn (clients joining/leaving).
     */
    private _nextViewId;
    private _freeViewIds;
    /** Allocate a fresh view ID (lowest available). */
    acquireViewId(): number;
    /** Return a view ID to the freelist for reuse. */
    releaseViewId(id: number): void;
    /**
     * Currently-bound StateViews, keyed by view ID and held via `WeakRef`
     * so the FinalizationRegistry backstop in StateView still works when
     * the user forgets `dispose()`. Callers must iterate via
     * `forEachActiveView`, which prunes dead entries.
     */
    activeViews: Map<number, WeakRef<StateView>>;
    /**
     * Streamable collections attached under this Root — `StreamSchema`
     * plus any collection opted into streaming via `.stream()` on the
     * builder. Encoder.encodeView / broadcast pass iterates this set to
     * dispatch per-view / per-tick budget gates.
     */
    streamTrees: Set<Streamable>;
    registerView(view: StateView): void;
    unregisterView(view: StateView): void;
    /**
     * Iterate all live StateViews bound to this Root. Prunes entries
     * whose underlying view has been garbage collected without an
     * explicit `dispose()`.
     */
    forEachActiveView(cb: (view: StateView) => void): void;
    registerStream(stream: Streamable): void;
    unregisterStream(stream: Streamable): void;
    constructor(types: TypeContext, startRefId?: number);
    add(changeTree: ChangeTree): boolean;
    remove(changeTree: ChangeTree): number;
    recursivelyMoveNextToParent(changeTree: ChangeTree): void;
    moveNextToParent(changeTree: ChangeTree): void;
    private _moveNextToParentInList;
    enqueueChangeTree(changeTree: ChangeTree, existingNode?: ChangeTreeNode): void;
    enqueueUnreliable(changeTree: ChangeTree, existingNode?: ChangeTreeNode): void;
    private _appendToList;
    /**
     * Release a detached node back to the free-list. Caller must have
     * already unlinked it from any list and cleared the changeTree's
     * pointer to it. Clears `changeTree`/`prev`/`next` so the pool
     * doesn't retain references through the GC root.
     */
    releaseNode(node: ChangeTreeNode): void;
    removeFromQueue(changeTree: ChangeTree): boolean;
    removeFromUnreliableQueue(changeTree: ChangeTree): boolean;
    private _removeNode;
}
