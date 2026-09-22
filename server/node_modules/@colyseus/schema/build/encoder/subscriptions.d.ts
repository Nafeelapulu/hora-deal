/**
 * Per-view collection subscriptions — `view.subscribe(collection)` opts
 * a view into ALL future content changes of a collection, not just a
 * one-shot snapshot. Covers every collection type:
 *
 * - `ArraySchema` / `MapSchema` / `SetSchema` / `CollectionSchema`: new
 *   children are force-shipped immediately via `view._addImmediate(child)`.
 *   Subsequent field mutations on those children emit via the normal
 *   view pass (the children are now visible).
 * - `StreamSchema` (or a `.stream()` map/set): new positions are
 *   enqueued into `_pendingByView` so the encoder's priority pass
 *   drains them respecting `maxPerTick`.
 *
 * The propagation hook is in `changeTree/treeAttachment.ts setParent`
 * — every new child attachment to a collection checks the parent tree's
 * `subscribedViews` bitmap and fans out to subscribed views.
 */
import type { ChangeTree, Ref } from "./ChangeTree.js";
import type { Root } from "./Root.js";
/**
 * Walk the `subscribedViews` bitmap of `parentTree` and propagate a new
 * child attachment to every subscribed view. Streams route through the
 * priority/pending queue; all other collections force-ship immediately.
 */
export declare function propagateNewChildToSubscribers(parentTree: ChangeTree, childIndex: number, childRef: Ref, root: Root): void;
