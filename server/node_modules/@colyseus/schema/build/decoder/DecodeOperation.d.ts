import { OPERATION } from "../encoding/spec.js";
import { Schema } from "../Schema.js";
import type { IRef, Ref } from "../encoder/ChangeTree.js";
import type { Decoder } from "./Decoder.js";
import { Iterator } from "../encoding/decode.js";
export interface DataChange<T = any, F = string> {
    ref: IRef;
    refId: number;
    op: OPERATION;
    /** Set for Schema field changes; omitted for collection item changes (which carry a `dynamicIndex` instead). */
    field?: F;
    dynamicIndex?: number | string;
    value: T;
    previousValue: T;
}
export declare const DEFINITION_MISMATCH = -1;
/**
 * When no `triggerChanges` subscriber is attached, `Decoder.decode` passes
 * `null` so the per-field change objects are never allocated. Every push
 * site uses `allChanges?.push(...)` — optional chaining also short-circuits
 * the object literal, so there's nothing to collect and nothing to throw
 * away.
 */
export type DecodeOperation<T extends Schema = any> = (decoder: Decoder<T>, bytes: Uint8Array, it: Iterator, ref: IRef, allChanges: DataChange[] | null) => number | void;
/**
 * Collection-kind discriminator declared on each collection class as
 * `static COLLECTION_KIND = CollectionKind.X`. The decoder's key/value
 * dispatch used to make three back-to-back `typeof(ref.method) ===
 * "function"` checks per entry; those collapse into one switch on the
 * target's class tag. Missing / `undefined` on a ref hits the switch's
 * `default` branch and logs a warning — a guard for future collection
 * types that land without a tag.
 *
 * Declared as a `const` object (not a TS `enum`) so the codegen parser —
 * which picks up every `EnumDeclaration` in the lib source via transitive
 * imports — doesn't emit a generated .cs file for it.
 */
export declare const CollectionKind: {
    readonly Map: 1;
    readonly Array: 2;
    readonly Set: 3;
    readonly Collection: 4;
    readonly Stream: 5;
};
export type CollectionKind = typeof CollectionKind[keyof typeof CollectionKind];
/**
 * Structural type for any class that participates in the `decodeKeyValue-
 * Operation` dispatch. Lets the hot-path read `tgt.constructor.COLLECTION_KIND`
 * without an `any` cast.
 */
export interface CollectionCtor {
    readonly COLLECTION_KIND: CollectionKind;
}
/**
 * Decode the next wire value for `ref[index]`. Returns the decoded value.
 *
 * Callers pass `previousValue` explicitly — it's the current value at the
 * slot before decoding and is needed for ref-count bookkeeping (on DELETE)
 * and for the DELETE_AND_ADD self-reassign case. Keeping it as a parameter
 * lets this function return a single primitive instead of a pair, so the
 * hot call path allocates nothing.
 */
export declare function decodeValue<T extends Ref>(decoder: Decoder, operation: OPERATION, ref: T, index: number, previousValue: any, type: any, bytes: Uint8Array, it: Iterator, allChanges: DataChange[] | null): any;
export declare const decodeSchemaOperation: DecodeOperation;
export declare const decodeKeyValueOperation: DecodeOperation;
export declare const decodeArray: DecodeOperation;
