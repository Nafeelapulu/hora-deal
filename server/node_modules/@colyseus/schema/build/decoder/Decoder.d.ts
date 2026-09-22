import { TypeContext } from "../types/TypeContext.js";
import { Schema } from "../Schema.js";
import { type IRef } from "../encoder/ChangeTree.js";
import type { Iterator } from "../encoding/decode.js";
import { ReferenceTracker } from "./ReferenceTracker.js";
import { type DataChange } from "./DecodeOperation.js";
import { Collection } from "../types/HelperTypes.js";
export declare class Decoder<T extends IRef = any> {
    context: TypeContext;
    state: T;
    root: ReferenceTracker;
    currentRefId: number;
    triggerChanges?: (allChanges: DataChange[]) => void;
    /**
     * @internal Non-null only while a `decodeResync()` walk is in progress:
     * collection refId → entry identities the payload visited (map string
     * keys; array/set/collection/stream indexes). Written by the collection
     * DecodeOperation functions, read by the post-decode sweep.
     */
    resyncVisited: Map<number, Set<number | string>> | null;
    /**
     * @internal Set when a structure had to be skipped during a resync
     * decode — visited data is incomplete, so the sweep must not delete.
     */
    resyncDamaged: boolean;
    constructor(root: T, context?: TypeContext);
    protected setState(root: T): void;
    decode(bytes: Uint8Array, it?: Iterator, ref?: IRef): DataChange<any, string>[];
    /**
     * Full-snapshot reconciliation ("resync") decode.
     *
     * Behaves exactly like {@link decode}, plus: every collection entry the
     * payload does NOT mention is removed through the regular DELETE path —
     * `onRemove` callbacks fire with the real previous value and released
     * refs are garbage-collected. Use it to apply a rejoin/reconnect full
     * state over an existing decoded tree: DELETEs that happened while the
     * client was off the wire are reconciled as if they had been received,
     * while surviving entries keep their instance identity and callbacks.
     *
     * ONLY valid for full-snapshot payloads (`encodeAll` / `encodeAllView`
     * output). Calling it on an incremental patch would prune everything
     * the patch doesn't touch.
     */
    decodeResync(bytes: Uint8Array, it?: Iterator): DataChange<any, string>[];
    skipCurrentStructure(bytes: Uint8Array, it: Iterator, totalBytes: number): void;
    getInstanceType(bytes: Uint8Array, it: Iterator, defaultType: typeof Schema): typeof Schema;
    createInstanceOfType(type: typeof Schema): Schema;
    removeChildRefs(ref: Collection, allChanges: DataChange[] | null): void;
}
