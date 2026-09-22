import { OPERATION } from "../encoding/spec.js";
import type { Decoder } from "./Decoder.js";
import type { DataChange } from "./DecodeOperation.js";
/**
 * Resync ("full-snapshot reconciliation") support for {@link Decoder.decodeResync}.
 *
 * A rejoin snapshot is authoritative for everything it contains — but the
 * plain decode path is additive: entries deleted (or hidden by a view)
 * while the client was off the wire survive as ghosts. This module owns the
 * generic reconciliation algorithm:
 *
 * - during the decode walk, the collection DecodeOperation functions report
 *   every entry the payload touches ({@link resyncRecordVisit}) and every
 *   collection that appears at all ({@link resyncMarkPresent});
 * - after the walk, {@link resyncSweep} removes whatever was never reported,
 *   through the same DELETE bookkeeping the regular decode path uses
 *   (DataChange DELETE → onRemove; removeRef → GC).
 *
 * Storage-specific pruning (journal upkeep, array compaction, stream
 * exemption) lives on each collection class as `[$resyncPrune]` — declared
 * on the `Collection` interface, so every collection kind must state its
 * own sweep semantics.
 *
 * All entry points are guarded by `decoder.resyncVisited !== null` at the
 * call sites — the normal decode path never pays for any of this.
 */
/**
 * Record that the current structure's entry at `identity` (map string key /
 * element index) appeared in the payload — even when its value is unchanged
 * (`allChanges` cannot serve as this record: its pushes are guarded by
 * `previousValue !== value`, so unchanged entries would look unvisited).
 *
 * Also releases a replaced occupant: full-sync emits plain ADD (never
 * DELETE_AND_ADD), so an entry whose instance changed while this client was
 * off the wire would otherwise leak its previous ref (no onRemove, never
 * GC'd). This release is correct ONLY under a full snapshot — a live patch's
 * plain ADD over a different instance can be a positional rewrite (array
 * shift/unshift) where the occupant *moved* and is still alive; a snapshot
 * re-adds moved instances elsewhere, so the refcounts balance.
 */
export declare function resyncTouchEntry(decoder: Decoder, ref: any, operation: OPERATION, identity: number | string, previousValue: any, value: any, allChanges: DataChange[] | null): void;
/**
 * Mark a collection as present in the payload — even with zero entries.
 * The sweep only prunes collections reported here: absence means "not part
 * of full-sync" (@patchOnly, view-invisible), where pruning would destroy
 * live data. Reflected clients have no @patchOnly metadata, so payload
 * presence is the only reliable signal.
 */
export declare function resyncMarkPresent(decoder: Decoder, refId: number): void;
/**
 * Post-decode phase of {@link Decoder.decodeResync}: remove every collection
 * entry the snapshot did not visit.
 *
 * Walks the tree from the root — NOT `root.refs` — for three reasons:
 * `@patchOnly` fields are never part of a snapshot and must be left alone;
 * entries of subtrees removed by the sweep itself are left to the GC's
 * transitive walk (sweeping them directly would double-decrement shared
 * children); and collections the snapshot never mentions (emptied
 * server-side) are still reachable and get pruned.
 */
export declare function resyncSweep(decoder: Decoder, allChanges: DataChange[] | null): void;
