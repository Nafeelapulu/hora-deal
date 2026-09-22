import { type ChangeTree, type Ref } from "../ChangeTree.js";
import type { Root } from "../Root.js";
/**
 * Reconcile queue membership + inherited flags for a tree that just had
 * its root/parent assigned. See `_checkInheritedFlags` for the flag
 * inheritance logic.
 */
export declare function checkIsFiltered(tree: ChangeTree, parent: Ref, parentIndex: number, _isNewChangeTree: boolean): void;
/**
 * Inherit filter / unreliable / patchOnly / static classification from
 * the parent field's annotation. Collections (MapSchema / ArraySchema /
 * etc.) inherit these from the Schema field that holds them.
 *
 * The common case — fresh tree attached to a parent field that carries
 * none of the inheritable annotations — produces no flag change and no
 * queue update. Flag inheritance is a single bitwise OR onto
 * `tree.flags`: the per-annotation reads pack into `fieldBits`, the
 * parent's inherited bits come from `parentChangeTree.flags` directly,
 * and one read-modify-write replaces three getter/setter cycles. The bit
 * diff against `beforeFlags` gives the "just became static / unreliable"
 * signal for the side-effect branches.
 */
export declare function checkInheritedFlags(tree: ChangeTree, parent: Ref, parentIndex: number): void;
/**
 * Drain `root.pendingFilterRefresh`. Called by the encoder before any
 * emission (per-tick channels and full-sync).
 */
export declare function drainFilterRefresh(root: Root): void;
