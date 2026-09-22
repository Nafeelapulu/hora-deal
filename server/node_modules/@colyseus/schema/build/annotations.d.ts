import "./symbol.shim.js";
import { Schema } from './Schema.js';
import { ArraySchema } from './types/custom/ArraySchema.js';
import { MapSchema } from './types/custom/MapSchema.js';
import { TypeDefinition } from "./types/registry.js";
import type { InferValueType, InferSchemaInstanceType, BuilderInitProps } from "./types/HelperTypes.js";
import { CollectionSchema } from "./types/custom/CollectionSchema.js";
import { SetSchema } from "./types/custom/SetSchema.js";
import { StreamSchema } from "./types/custom/StreamSchema.js";
import { FieldBuilder } from "./types/builder.js";
export type RawPrimitiveType = "string" | "number" | "boolean" | "int8" | "uint8" | "int16" | "uint16" | "int32" | "uint32" | "int64" | "uint64" | "float32" | "float64" | "bigint64" | "biguint64";
export type PrimitiveType = RawPrimitiveType | typeof Schema | object;
export type DefinitionType<T extends PrimitiveType = PrimitiveType> = T | T[] | {
    type: T;
    default?: InferValueType<T>;
    view?: boolean | number;
    sync?: boolean;
} | {
    array: T;
    default?: ArraySchema<InferValueType<T>>;
    view?: boolean | number;
    sync?: boolean;
} | {
    map: T;
    default?: MapSchema<InferValueType<T>>;
    view?: boolean | number;
    sync?: boolean;
} | {
    collection: T;
    default?: CollectionSchema<InferValueType<T>>;
    view?: boolean | number;
    sync?: boolean;
} | {
    set: T;
    default?: SetSchema<InferValueType<T>>;
    view?: boolean | number;
    sync?: boolean;
} | {
    stream: T;
    default?: StreamSchema<InferValueType<T>>;
    view?: boolean | number;
    sync?: boolean;
    priority?: (view: any, element: InferValueType<T>) => number;
};
export type Definition = {
    [field: string]: DefinitionType;
};
export interface TypeOptions {
    manual?: boolean;
}
export declare const DEFAULT_VIEW_TAG = -1;
/**
 * Class decorator that registers a `@type`-style Schema class with the
 * TypeContext (required for reflection / cross-language codegen).
 *
 *     @entity
 *     class Player extends Schema { ... }
 */
export declare function entity<T extends Function>(constructor: T): T;
/**
 * [See documentation](https://docs.colyseus.io/state/schema/)
 *
 * Annotate a Schema property to be serializeable.
 * \@type()'d fields are automatically flagged as "dirty" for the next patch.
 *
 * @example Standard usage, with automatic change tracking.
 * ```
 * \@type("string") propertyName: string;
 * ```
 *
 * @example You can provide the "manual" option if you'd like to manually control your patches via .setDirty().
 * ```
 * \@type("string", { manual: true })
 * ```
 */
export declare function view<T>(tag?: number): (target: T, fieldName: string) => void;
/**
 * `@unreliable` — route a field onto the unreliable transport channel, so a
 * dropped update costs one stale value instead of stalling the ordered stream
 * behind a retransmit. Primitive fields only (see `Metadata.setUnreliable`).
 *
 * The field's FIRST value still travels the reliable channel, as part of the
 * owning instance's ADD; only later mutations become unreliable. A decoder
 * cannot apply a write to a ref it has not been told about, so a value emitted
 * ahead of that ADD would be dropped — and lost for good if the field is never
 * written again.
 */
export declare function unreliable<T>(target: T, field: string): void;
/**
 * @patchOnly — mark a field as not persisted to snapshots (encodeAll /
 * encodeAllView). PatchOnly fields are still emitted on per-tick patches
 * (reliable or unreliable), but late-joining clients won't see them until
 * the next mutation.
 *
 * Orthogonal to @unreliable: a field can be either, both, or neither.
 */
export declare function patchOnly<T>(target: T, field: string): void;
/**
 * @fullStateOnly — mark a field as delivered in the full state sync only
 * (encodeAll / encodeAllView), never on per-tick patches. Writes after a
 * client has joined are not propagated to it — populate these fields
 * before clients connect (e.g. during onCreate).
 *
 * The exact mirror of @patchOnly — the two are mutually exclusive.
 */
export declare function fullStateOnly<T>(target: T, field: string): void;
export declare function type(type: DefinitionType, options?: TypeOptions): PropertyDecorator;
export declare function getPropertyDescriptor(fieldName: string, fieldIndex: number, type: DefinitionType, complexTypeKlass: TypeDefinition | false): {
    get: (this: Schema) => any;
    set: (this: Schema, value: any) => void;
    enumerable: boolean;
    configurable: boolean;
};
/**
 * `@deprecated()` flag a field as deprecated.
 * The previous `@type()` annotation should remain along with this one.
 */
export declare function deprecated(throws?: boolean): PropertyDecorator;
/**
 * Adds synchronizable fields to an existing `Schema` subclass — the pre-5.0
 * helper for plain JavaScript users.
 *
 * @deprecated Use `schema()` with `t.*` field builders instead:
 * https://docs.colyseus.io/state/schema
 */
export declare function defineTypes(target: typeof Schema, fields: Definition, options?: TypeOptions): typeof Schema;
type ExtractInitProps<T> = T extends {
    initialize: (...args: infer P) => void;
} ? P extends readonly [] ? never : P extends readonly [infer First] ? First extends object ? First : P : P : BuilderInitProps<T>;
type HasRequiredKeys<X> = {} extends X ? false : true;
type IsInitPropsRequired<T> = T extends {
    initialize: (...args: infer P) => void;
} ? P extends readonly [] ? false : true : HasRequiredKeys<BuilderInitProps<T>>;
type HasExplicitInit<T> = T extends {
    initialize: (...args: infer P) => void;
} ? P extends readonly [] ? false : true : false;
/**
 * A `schema()` field definition accepts a FieldBuilder, a Schema subclass
 * (shorthand for `t.ref(Class)`), or a method (attached to the prototype).
 */
export type FieldsAndMethods = Record<string, FieldBuilder<any, boolean, boolean> | (new (...args: any[]) => Schema) | Function>;
type SchemaInstance<T, P extends typeof Schema> = InferSchemaInstanceType<T> & InstanceType<P>;
export interface SchemaWithExtends<T, P extends typeof Schema> {
    extend: <T2 extends FieldsAndMethods = FieldsAndMethods>(fields: T2 & ThisType<SchemaInstance<T & T2, P>>, name?: string) => SchemaWithExtendsConstructor<T & T2, ExtractInitProps<T & T2>, P>;
}
/**
 * Get the type of the schema defined via `schema('Name', {...})` method.
 *
 * @example
 * const Entity = schema('Entity', {
 *     x: t.number(),
 *     y: t.number(),
 * });
 * type Entity = SchemaType<typeof Entity>;
 */
export type SchemaType<T extends {
    '~type': any;
}> = T['~type'];
export interface SchemaWithExtendsConstructor<T, InitProps, P extends typeof Schema> extends SchemaWithExtends<T, P> {
    '~type': SchemaInstance<T, P>;
    new (...args: [
        InitProps
    ] extends [never] ? [] : InitProps extends readonly any[] ? InitProps : HasExplicitInit<T> extends true ? [InitProps] : IsInitPropsRequired<T> extends true ? ([] | [InitProps]) : [InitProps?]): SchemaInstance<T, P>;
    prototype: SchemaInstance<T, P>;
}
/**
 * Define a Schema class declaratively.
 *
 * `initialize()` acts as the constructor: a class created with `.extend()`
 * inherits the parent's unless it defines its own.
 *
 * @example
 * import { schema, t } from '@colyseus/schema';
 *
 * const Player = schema({
 *   hp: t.uint8().default(100),
 *   name: t.string().view(),
 *   takeDamage(n: number) { this.hp -= n; },
 * }, 'Player');
 *
 * const Warrior = Player.extend({
 *   weapon: t.string(),
 * }, 'Warrior');
 */
export declare function schema<T extends FieldsAndMethods, P extends typeof Schema = typeof Schema>(fieldsAndMethods: T & ThisType<SchemaInstance<T, P>>, name?: string, inherits?: P): SchemaWithExtendsConstructor<T, ExtractInitProps<T>, P>;
export {};
