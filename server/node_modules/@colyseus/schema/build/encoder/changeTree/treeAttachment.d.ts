import { Root } from "../Root.js";
import type { ChangeTree, Ref } from "../ChangeTree.js";
export declare function setRoot(tree: ChangeTree, root: Root): void;
export declare function setParent(tree: ChangeTree, parent: Ref, root?: Root, parentIndex?: number): void;
export declare function forEachChild(tree: ChangeTree, callback: (change: ChangeTree, at: any) => void): void;
/**
 * Closure-free variant of {@link forEachChild}. Hot setRoot / setParent
 * recursion calls this once per new Schema instance attached to the
 * tree — the per-call closure was the #1 JS hotspot in profile-baseline.
 * Pass an explicit `ctx` so callers can hoist the callback to module
 * scope and avoid the allocation.
 */
export declare function forEachChildWithCtx<C>(tree: ChangeTree, ctx: C, callback: (ctx: C, change: ChangeTree, at: any) => void): void;
