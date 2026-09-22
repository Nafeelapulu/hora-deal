import type { ChangeTree, ParentEntry, Ref } from "../ChangeTree.js";
/**
 * Add a parent to the chain. If `parent` already exists anywhere in the
 * chain, update the primary parent's index instead (matches legacy
 * behavior).
 */
export declare function addParent(tree: ChangeTree, parent: Ref, index: number): void;
/**
 * Move `parent`'s existing chain entry to `index`, skipping the attachment
 * work `addParent` does. `parent` must already be a parent of `tree`.
 *
 * Called by collections whose wire slots shift (ArraySchema): StateView
 * addresses per-view ADD/DELETE by that index, so it has to follow the
 * element it names.
 */
export declare function setParentIndex(tree: ChangeTree, parent: Ref, index: number): void;
/**
 * Remove a parent from the chain.
 * @returns true if parent was found and removed (Root.remove relies on this).
 */
export declare function removeParent(tree: ChangeTree, parent: Ref): boolean;
/**
 * First parent matching `predicate`, as a detached `ParentEntry`. Never returns
 * a live `ParentChain` node — the inline parent has no node to return in the
 * first place, so handing out the real node for the `extraParents` case only
 * would make writes land or vanish depending on which parent matched. Use
 * `setParentIndex` to move an index and `indexInParent` to read one.
 */
export declare function findParent(tree: ChangeTree, predicate: (parent: Ref, index: number) => boolean): ParentEntry | undefined;
/** Walks in place — `addParent` calls this per shared-instance attach. */
export declare function hasParent(tree: ChangeTree, predicate: (parent: Ref, index: number) => boolean): boolean;
/**
 * Wire index `tree` holds inside `parent`, or undefined when `parent` is
 * nowhere in the chain. Allocation-free variant of `findParent` for the
 * encodeView drain, which resolves identity-keyed view entries per emission.
 *
 * A child detached from `parent` this tick usually still resolves: Root.remove
 * leaves the child's own parent link dangling, and the staged snapshot keeps
 * the child in `tmpItems` (so reindexes keep the index current) until
 * `$onEncodeEnd` — which runs after the drain.
 */
export declare function indexInParent(tree: ChangeTree, parent: Ref): number | undefined;
/**
 * Return all parents as detached entries (debug/test helper).
 */
export declare function getAllParents(tree: ChangeTree): ParentEntry[];
/**
 * True iff `parent` currently holds `tree`. Detached edges linger in the
 * parent chain (load-bearing for same-tick view drains — see
 * `indexInParent` above), so the chain alone cannot answer which edges
 * are live. ArraySchema is probed by scanning `items`: the recorded slot
 * can go stale after reorders, and `items` — unlike `$getByIndex`'s staged
 * view — reflects the tick's completed mutations.
 */
export declare function isEdgeLive(tree: ChangeTree, parentTree: ChangeTree, index: number): boolean;
