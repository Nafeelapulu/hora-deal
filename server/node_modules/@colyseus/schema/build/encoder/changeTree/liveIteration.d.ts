import type { ChangeTree } from "../ChangeTree.js";
/**
 * Re-stage one live index as a fresh ADD on its channel. Shared by
 * `Root.add` (refCount-0 / NEEDS_RESTAGE re-adds) and
 * `inheritedFlags.refreshFilterState` (filtered→public flip) via
 * `forEachLiveWithCtx(tree, restageLiveCb)` — one home for the
 * unreliable-routing rule.
 */
export declare const restageLiveCb: (tree: ChangeTree, fieldIndex: number) => void;
export declare function forEachLive(tree: ChangeTree, callback: (index: number) => void): void;
export declare function forEachLiveWithCtx<C>(tree: ChangeTree, ctx: C, cb: (ctx: C, index: number) => void): void;
