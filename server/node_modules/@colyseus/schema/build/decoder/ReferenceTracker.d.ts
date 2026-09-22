import type { IRef } from "../encoder/ChangeTree.js";
/**
 * Used for decoding only.
 */
export type SchemaCallbacks = {
    [field: string | number]: Function[];
};
export declare class ReferenceTracker {
    refs: Map<number, IRef>;
    refCount: {
        [refId: number]: number;
    };
    deletedRefs: Set<number>;
    callbacks: {
        [refId: number]: SchemaCallbacks;
    };
    protected nextUniqueId: number;
    getNextUniqueId(): number;
    addRef(refId: number, ref: IRef, incrementCount?: boolean): void;
    removeRef(refId: number): void;
    clearRefs(): void;
    garbageCollectDeletedRefs(): void;
    addCallback(refId: number, fieldOrOperation: string | number, callback: Function): () => void;
    removeCallback(refId: number, field: string | number, callback: Function): void;
}
