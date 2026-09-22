import { OPERATION } from "../encoding/spec.js";
import type { ChangeTree, Ref } from "./ChangeTree.js";
import type { Encoder } from "./Encoder.js";
import type { Iterator } from "../encoding/decode.js";
import type { Metadata } from "../Metadata.js";
export type EncodeOperation<T extends Ref = any> = (encoder: Encoder, bytes: Uint8Array, changeTree: ChangeTree<T>, index: number, operation: OPERATION, it: Iterator, isEncodeAll: boolean, hasView: boolean, metadata?: Metadata) => void;
export declare function encodeValue(encoder: Encoder, bytes: Uint8Array, type: any, value: any, operation: OPERATION, it: Iterator, encoderFn?: (bytes: Uint8Array, value: any, it: Iterator) => void): void;
/**
 * Used for Schema instances.
 * @private
 */
export declare const encodeSchemaOperation: EncodeOperation;
/**
 * Encode a single MapSchema entry. Splits the legacy
 * `encodeKeyValueOperation` so the per-emission `typeof ref['set']` check
 * is gone — MapSchema instances are routed here via their `[$encoder]`
 * static, the dynamic-key string emission is unconditional on ADD.
 *
 * @private
 */
export declare const encodeMapEntry: EncodeOperation;
/**
 * Encode a single SetSchema / CollectionSchema entry. Wire format is the
 * same as MapSchema minus the dynamic-key string, so this path skips the
 * legacy `typeof ref['set']` check entirely.
 *
 * @private
 */
export declare const encodeIndexedEntry: EncodeOperation;
/**
 * Unified encoder kept for back-compat with external consumers that may
 * have registered it directly via `static [$encoder] =
 * encodeKeyValueOperation`. New code (and all internal collections)
 * should use the split variants — `encodeMapEntry` for MapSchema and
 * `encodeIndexedEntry` for SetSchema / CollectionSchema.
 *
 * The runtime `typeof ref['set']` check below is the per-emission cost
 * the split is designed to remove.
 */
export declare const encodeKeyValueOperation: EncodeOperation;
/**
 * Used for collections (MapSchema, ArraySchema, etc.)
 * @private
 */
export declare const encodeArray: EncodeOperation;
