import { DefinitionType } from "./annotations.js";
import { TypeDefinition } from "./types/registry.js";
import { $descriptors, $encoders, $fieldIndexesByViewTag, $numFields, $refTypeFieldIndexes, $fullStateOnlyFieldIndexes, $fullSyncSkipIndexes, $streamFieldIndexes, $streamPriorities, $patchOnlyFieldIndexes, $unreliableFieldIndexes, $viewFieldIndexes } from "./types/symbols.js";
/**
 * Field indexes ride in the low 6 bits of the operation byte
 * (`(index | operation) & 255`), which leaves room for 0..63. Index 63 is
 * given up: `DELETE_AND_ADD | 63` is 255, the same byte the decoder claims
 * as SWITCH_TO_STRUCTURE before any field decoder sees it. Every nullable
 * field can produce that operation (delete-then-set in one tick merges to
 * DELETE_AND_ADD), so the slot is unusable rather than partly usable.
 */
export declare const MAX_FIELDS = 63;
export type MetadataField = {
    type: DefinitionType;
    name: string;
    index: number;
    tag?: number;
    unreliable?: boolean;
    patchOnly?: boolean;
    deprecated?: boolean;
    fullStateOnly?: boolean;
    stream?: boolean;
    optional?: boolean;
};
export type Metadata = {
    [$numFields]: number;
} & // number of fields
{
    [$viewFieldIndexes]: number[];
} & // all field indexes with "view" tag
{
    [$fieldIndexesByViewTag]: {
        [tag: number]: number[];
    };
} & // field indexes by "view" tag
{
    [$refTypeFieldIndexes]: number[];
} & // all field indexes containing Ref types (Schema, ArraySchema, MapSchema, etc)
{
    [$unreliableFieldIndexes]: number[];
} & // all field indexes tagged with @unreliable
{
    [$patchOnlyFieldIndexes]: number[];
} & // all field indexes tagged with @patchOnly (not persisted to snapshots)
{
    [$fullSyncSkipIndexes]: number[];
} & // @patchOnly ∪ @deprecated() — never read during full sync
{
    [$fullStateOnlyFieldIndexes]: number[];
} & // all field indexes tagged @fullStateOnly / .fullStateOnly() (not tracked after assignment)
{
    [$streamFieldIndexes]: number[];
} & // all field indexes holding a t.stream(...) collection
{
    [$streamPriorities]: {
        [field: number]: (view: any, element: any) => number;
    };
} & // per-stream-field priority callback declared at schema definition time
{
    [$encoders]: Array<(bytes: Uint8Array, value: any, it: any) => void>;
} & // pre-computed encoder fn per primitive field
{
    [field: number]: MetadataField;
} & // index => field name
{
    [field: string]: number;
} & // field name => field metadata
{
    [$descriptors]: {
        [field: string]: PropertyDescriptor;
    };
};
/**
 * Given a normalized field type (`"number"`, `{ map: Foo }`, `Player`,
 * etc.), split into the collection-type descriptor (`{ constructor:
 * MapSchema, ... }`) if applicable and the inner child type. Shared by
 * `@type()` decoration and `Metadata.setFields` — both need to build a
 * property accessor that knows whether the slot holds a collection.
 */
export declare function resolveFieldType(type: any): {
    complexTypeKlass: TypeDefinition | false;
    childType: any;
};
export declare function getNormalizedType(type: any): DefinitionType;
export declare const Metadata: {
    addField(metadata: any, index: number, name: string, type: DefinitionType, descriptor?: PropertyDescriptor): void;
    setTag(metadata: Metadata, fieldName: string, tag: number): void;
    setUnreliable(metadata: Metadata, fieldName: string): void;
    setPatchOnly(metadata: Metadata, fieldName: string): void;
    /**
     * `@deprecated()` bookkeeping: the field keeps its wire index (so peers
     * that still carry it stay compatible) but is excluded from full sync —
     * its accessor may throw — and hidden from `for..in` consumers.
     */
    setDeprecated(metadata: Metadata, fieldName: string): void;
    setFullStateOnly(metadata: Metadata, fieldName: string): void;
    setStream(metadata: Metadata, fieldName: string): void;
    /**
     * Attach a declaration-scope priority callback to a stream field.
     * Called at schema definition time (via `t.stream(X).priority(fn)` or
     * `@type({ stream: X, priority: fn })`), looked up at stream-attach
     * time to seed the instance's `_stream.priority` slot. The callback
     * signature is `(view: StateView, element: V) => number` — only fires
     * during `encodeView`, broadcast mode emits FIFO regardless.
     */
    setStreamPriority(metadata: Metadata, fieldName: string, fn: (view: any, element: any) => number): void;
    getStreamPriority(metadata: Metadata | undefined, index: number): (view: any, element: any) => number;
    /**
     * Install a single field with full encoder wiring: accessor descriptor
     * on the prototype + `metadata[$encoders]` slot for primitives. Shared
     * between `Metadata.setFields` (build path) and
     * `Reflection.makeEncodable` (Reflection upgrade path).
     */
    defineField(target: any, metadata: any, fieldIndex: number, fieldName: string, type: DefinitionType): void;
    setFields<T extends {
        new (...args: any[]): InstanceType<T>;
    } = any>(target: T, fields: { [field in keyof InstanceType<T>]?: DefinitionType; }): T;
    isDeprecated(metadata: any, field: string): boolean;
    initialize(constructor: any): Metadata;
    isValidInstance(klass: any): boolean;
    getFields(klass: any): any;
    hasViewTagAtIndex(metadata: Metadata, index: number): boolean;
    hasUnreliableAtIndex(metadata: Metadata, index: number): boolean;
    hasPatchOnlyAtIndex(metadata: Metadata, index: number): boolean;
    hasFullStateOnlyAtIndex(metadata: Metadata, index: number): boolean;
    hasStreamAtIndex(metadata: Metadata, index: number): boolean;
};
