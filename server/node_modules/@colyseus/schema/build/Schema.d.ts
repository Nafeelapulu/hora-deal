import { OPERATION } from './encoding/spec.js';
import { type DefinitionType } from "./annotations.js";
import { AssignableProps, NonFunctionPropNames, ToJSON } from './types/HelperTypes.js';
import { ChangeTree, IRef, Ref } from './encoder/ChangeTree.js';
import { $decoder, $deleteByIndex, $encoder, $filter, $getByIndex, $refId, $reset, $track, $values } from './types/symbols.js';
import { StateView } from './encoder/StateView.js';
import type { Decoder } from './decoder/Decoder.js';
import type { Metadata } from './Metadata.js';
/**
 * Schema encoder / decoder
 */
export declare class Schema<C = any> implements IRef {
    static [Symbol.metadata]: Metadata;
    static [$encoder]: import("./encoder/EncodeOperation.js").EncodeOperation<any>;
    static [$decoder]: import("./decoder/DecodeOperation.js").DecodeOperation<any>;
    [$refId]?: number;
    [$values]: any[];
    /**
     * Initialize change tracking on this instance.
     * Field accessor descriptors (getter/setter) live on the prototype,
     * installed once at class-definition time. Per-instance work is limited
     * to allocating a ChangeTree and a values array.
     */
    static initialize(instance: any): void;
    /**
     * Decoder-side factory. Skips the user subclass ctor entirely —
     * decoder-built instances are passive mirrors of server state, so any
     * field initializer / ctor body work would be overwritten by the
     * decoded ADDs immediately after. Assignment order matches
     * {@link Schema.initialize} so V8 assigns the same hidden class
     * ($changes, then $values), keeping decode-path ICs monomorphic even
     * when tracked and untracked instances coexist.
     *
     * The `this:` constraint pins the return type to the concrete subclass
     * when called as `Player.initializeForDecoder()`, not the base Schema.
     */
    static initializeForDecoder<T extends Schema = Schema>(this: {
        prototype: T;
    } & typeof Schema): T;
    /**
     * Reset a DETACHED instance to construction defaults so it can be returned
     * to a {@link SchemaPool} and reused, avoiding the cost of `new`. Recurses
     * into ref-type fields (child Schemas / collections).
     *
     * Preconditions (enforced):
     * - The instance must be tracked (encoder-side), not a decoder mirror.
     * - The instance must NOT be shared across multiple parents.
     * - The instance must already be removed from its parent collection/field
     *   (so the encoder detached it: `root === undefined`).
     *
     * NOTE: primitive field values are NOT reset to class defaults — re-assign
     * the fields you care about when you reuse the instance (standard
     * object-pool discipline).
     */
    static reset(instance: Schema): void;
    /**
     * Per-instance reset primitive (the recursive worker behind
     * {@link Schema.reset}). Resets ref-type children first (depth-first),
     * then recycles this instance's ChangeTree and drops its `$refId` so a
     * re-add is assigned a fresh refId exactly like a freshly constructed
     * instance. Dropping `$refId` is what makes instance reuse
     * wire-format-identical to `new T()`.
     */
    [$reset](): void;
    /**
     * Check whether `type` describes a Schema *class* (a subclass
     * constructor carrying `Symbol.metadata`, as installed by `@type`).
     * Returns false for primitive type strings like `"number"`, descriptor
     * objects like `{ map: Player }`, and Schema *instances*.
     *
     * For the instance-level check — "is this value a Schema instance?" —
     * see {@link Schema.isSchema}.
     */
    static is(type: DefinitionType): boolean;
    /**
     * Check if a value is an *instance* of Schema. Uses duck-typing on
     * `.assign` to work across multiple `@colyseus/schema` versions that
     * may be loaded in the same process (e.g. bundled server types vs.
     * client types in a p2p setup).
     *
     * For the class-level check — "is this type a Schema subclass?" —
     * see {@link Schema.is}.
     *
     * @param obj Value to check
     * @returns true if the value is a Schema instance
     */
    static isSchema(obj: any): obj is Schema;
    /**
     * Track property changes. Exposed as an override point so downstream
     * tools (debuggers, transparent proxies, custom instrumentation) can
     * intercept per-field writes. Hot-path code in `annotations.ts` calls
     * `(this.constructor as typeof Schema)[$track](...)` rather than
     * `changeTree.change(...)` directly so any subclass override wins.
     */
    static [$track](changeTree: ChangeTree, index: number, operation?: OPERATION): void;
    /**
     * Determine if a property must be filtered.
     * - If returns false, the property is NOT going to be encoded.
     * - If returns true, the property is going to be encoded.
     *
     * Encoding with "filters" happens in two steps:
     * - First, the encoder iterates over all "not owned" properties and encodes them.
     * - Then, the encoder iterates over all "owned" properties per instance and encodes them.
     */
    static [$filter](ref: Schema, index: number, view: StateView): boolean;
    constructor(arg?: C);
    /**
     * Assign properties to the instance.
     * @param props Properties to assign to the instance
     * @returns
     */
    assign<T extends Partial<this>>(props: AssignableProps<T>): this;
    /**
     * Metadata-driven property assignment.
     * Reads tracked fields via property access (works with prototype accessors),
     * then copies any remaining own properties for non-tracked fields.
     */
    protected static assignProps(target: any, source: any): void;
    /**
     * Restore the instance from JSON data.
     * @param jsonData JSON data to restore the instance from
     * @returns
     */
    restore(jsonData: ToJSON<this>): this;
    /**
     * (Server-side): Flag a property to be encoded for the next patch.
     * @param instance Schema instance
     * @param property string representing the property name, or number representing the index of the property.
     * @param operation OPERATION to perform (detected automatically)
     */
    setDirty<K extends NonFunctionPropNames<this>>(property: K | number, operation?: OPERATION): void;
    /** Stop recording mutations until resumeTracking() is called. */
    pauseTracking(): void;
    /** Re-enable automatic change tracking. */
    resumeTracking(): void;
    /**
     * Run `fn` with change tracking paused, then resume.
     * Returns the function's return value. Safe to nest.
     */
    untracked<T>(fn: () => T): T;
    /** True while tracking is paused. */
    get isTrackingPaused(): boolean;
    clone(): this;
    toJSON(this: any): ToJSON<this>;
    /**
     * Used in tests only
     * @internal
     */
    discardAllChanges(): void;
    [$getByIndex](index: number): any;
    [$deleteByIndex](index: number): void;
    /**
     * Inspect the `refId` of all Schema instances in the tree. Optionally display the contents of the instance.
     *
     * @param ref Schema instance
     * @param showContents display JSON contents of the instance
     * @returns
     */
    static debugRefIds<T extends Schema>(ref: T, showContents?: boolean, level?: number, decoder?: Decoder, keyPrefix?: string): string;
    /**
     * @param changeSet
     *  - "changes": iterate the current-tick dirty queue (per-tick encode order)
     *  - "allChanges" / "allFilteredChanges" (legacy): structurally walk the
     *    tree in DFS preorder (matches the order in which full-sync emits
     *    trees). The two legacy modes differ by which side of the filter
     *    split they include.
     */
    static debugRefIdEncodingOrder<T extends Ref>(ref: T, changeSet?: "changes" | "allChanges" | "allFilteredChanges"): number[];
    static debugRefIdsFromDecoder(decoder: Decoder): string;
    /**
     * Return a string representation of the changes on a Schema instance.
     * The list of changes is cleared after each encode.
     *
     * @param instance Schema instance
     * @param isEncodeAll Return "full encode" instead of current change set.
     * @returns
     */
    static debugChanges<T extends Ref>(instance: T, isEncodeAll?: boolean): string;
}
