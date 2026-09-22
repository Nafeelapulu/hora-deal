export declare const $refId: unique symbol;
export declare const $track = "~track";
export declare const $encoder = "~encoder";
export declare const $decoder = "~decoder";
export declare const $filter = "~filter";
export declare const $getByIndex = "~getByIndex";
export declare const $deleteByIndex = "~deleteByIndex";
/**
 * Resync-sweep hook (see decoder/Resync.ts): prune every entry the rejoin
 * snapshot did not visit. Each collection owns its storage-specific
 * bookkeeping (journal pruning, compaction, item indexes); the generic
 * DELETE/ref/callback bookkeeping arrives via the `prune`/`keep` callbacks.
 */
export declare const $resyncPrune = "~resyncPrune";
/**
 * Used to hold ChangeTree instances whitin the structures.
 *
 * Real JS Symbol — see the `$values` comment for rationale.
 */
export declare const $changes: unique symbol;
/**
 * Used to keep track of the type of the child elements of a collection
 * (MapSchema, ArraySchema, etc.). Real Symbol — same rationale as $values.
 */
export declare const $childType: unique symbol;
/**
 * Self-reference an instance sets on `this` so its own methods can recover
 * the underlying object even when `this` is a Proxy wrapper. Used by
 * ArraySchema (whose public API is a Proxy) to grab the underlying instance
 * once at the top of hot methods and then access fields directly without
 * paying the Proxy.get cost on every read.
 */
export declare const $proxyTarget: unique symbol;
/**
 * Optional "discard" method for custom types (ArraySchema)
 * (Discards changes for next serialization)
 */
export declare const $onEncodeEnd = "~onEncodeEnd";
/**
 * Optional "reset" method on every poolable Ref (Schema + collections).
 * Empties the instance's backing store and recycles its ChangeTree WITHOUT
 * emitting any wire op, and recurses into ref-type children — so the instance
 * can be returned to a SchemaPool and reused, avoiding the cost of `new`.
 * See encoder/Pool.ts and Schema.reset().
 */
export declare const $reset = "~reset";
/**
 * When decoding, this method is called after the instance is fully decoded
 */
export declare const $onDecodeEnd = "~onDecodeEnd";
/**
 * Per-instance dense array holding field values by index.
 * Replaces per-field _fieldName shadow properties.
 *
 * Real JS Symbol (not "~"-prefixed string) so plain assignment is safe —
 * symbols are non-enumerable to Object.keys / JSON.stringify / for-in,
 * which means we can drop Object.defineProperty(...{ enumerable: false })
 * and avoid the slow-path / dictionary-mode hazards that come with it.
 */
export declare const $values: unique symbol;
/**
 * Brand for FieldBuilder instances so schema() can detect them.
 */
export declare const $builder = "~builder";
/**
 * Metadata
 */
export declare const $descriptors = "~descriptors";
/**
 * Cached per-class encode descriptor: bundles encoder fn, filter fn,
 * metadata, isSchema flag and the per-field arrays into one object stashed
 * on the constructor. Replaces several separate per-tree property chases /
 * function calls in the encode loop with a single property load.
 */
export declare const $encodeDescriptor = "~__encodeDescriptor";
export declare const $encoders = "~encoders";
export declare const $numFields = "~__numFields";
export declare const $refTypeFieldIndexes = "~__refTypeFieldIndexes";
export declare const $viewFieldIndexes = "~__viewFieldIndexes";
export declare const $fieldIndexesByViewTag = "$__fieldIndexesByViewTag";
export declare const $unreliableFieldIndexes = "~__unreliableFieldIndexes";
export declare const $patchOnlyFieldIndexes = "~__patchOnlyFieldIndexes";
export declare const $fullSyncSkipIndexes = "~__fullSyncSkipIndexes";
export declare const $fullStateOnlyFieldIndexes = "~__fullStateOnlyFieldIndexes";
export declare const $streamFieldIndexes = "~__streamFieldIndexes";
export declare const $streamPriorities = "~__streamPriorities";
