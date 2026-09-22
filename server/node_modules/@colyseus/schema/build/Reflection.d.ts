import { schema, SchemaType } from "./annotations.js";
import { Iterator } from "./encoding/decode.js";
import { Encoder } from "./encoder/Encoder.js";
import { Decoder } from "./decoder/Decoder.js";
import { Schema } from "./Schema.js";
import { FieldBuilder } from "./types/builder.js";
import { ArraySchema } from "./types/custom/ArraySchema.js";
/**
 * Static methods available on Reflection
 */
interface ReflectionStatic {
    /**
     * Encodes the TypeContext of an Encoder into a buffer.
     *
     * @param encoder Encoder instance
     * @param it
     * @returns
     */
    encode: (encoder: Encoder, it?: Iterator) => Uint8Array;
    /**
     * Decodes the TypeContext from a buffer into a Decoder instance.
     *
     * @param bytes Reflection.encode() output
     * @param it
     * @returns Decoder instance
     */
    decode: <T extends Schema = Schema>(bytes: Uint8Array, it?: Iterator) => Decoder<T>;
    /**
     * Upgrade a class produced by `Reflection.decode` so its instances
     * can be used as encode sources (for `InputEncoder` or `Encoder`).
     *
     * `Reflection.decode` reconstructs classes with decoder-only field
     * slots — `inst.x = 7` lands as a direct own property and bypasses
     * the change-tracking + `$values` plumbing that encoders rely on.
     * Calling `makeEncodable(ctor)` installs the same prototype accessor
     * descriptors and `metadata[$encoders]` lookup table that the
     * `schema(...)` / `@type` builders install at class-definition time.
     *
     * Idempotent. Pay-as-you-go: callers that only decode never invoke
     * this and pay nothing extra. Must be called BEFORE any instance of
     * the class is constructed and assigned to.
     */
    makeEncodable: (ctor: typeof Schema) => typeof Schema;
}
/**
 * Reflection
 */
/**
 * `t.quantized()` field descriptor as it rides the reflection handshake —
 * schema-typed (bit-exact float64 bounds), NOT a string grammar, so every
 * language port decodes it with the schema decoder it already has.
 */
export declare const QuantizedDescriptor: import("./annotations.js").SchemaWithExtendsConstructor<{
    min: FieldBuilder<number, false, false>;
    max: FieldBuilder<number, false, false>;
    bits: FieldBuilder<number, false, false>;
    mode: FieldBuilder<number, false, false>;
}, import("./index.js").BuilderInitProps<{
    min: FieldBuilder<number, false, false>;
    max: FieldBuilder<number, false, false>;
    bits: FieldBuilder<number, false, false>;
    mode: FieldBuilder<number, false, false>;
}>, typeof Schema>;
export type QuantizedDescriptor = SchemaType<typeof QuantizedDescriptor>;
export declare const ReflectionField: import("./annotations.js").SchemaWithExtendsConstructor<{
    name: FieldBuilder<string, false, false>;
    type: FieldBuilder<string, false, false>;
    referencedType: FieldBuilder<number, false, false>;
    /** Primitive child of a collection (`array`/`map`/... of "string" etc.) —
     *  its own slot, replacing the legacy `"array:string"` colon packing. */
    childPrimitive: FieldBuilder<string, false, false>;
    /** Set only on `t.quantized()` fields (`.optional()` — no auto-instantiated
     *  default; its absence is the "not quantized" signal on decode). */
    quantized: FieldBuilder<{
        min: number;
        max: number;
        bits: number;
        mode: number;
    } & {} & Schema<any> & Schema<unknown>, true, true>;
}, import("./index.js").BuilderInitProps<{
    name: FieldBuilder<string, false, false>;
    type: FieldBuilder<string, false, false>;
    referencedType: FieldBuilder<number, false, false>;
    /** Primitive child of a collection (`array`/`map`/... of "string" etc.) —
     *  its own slot, replacing the legacy `"array:string"` colon packing. */
    childPrimitive: FieldBuilder<string, false, false>;
    /** Set only on `t.quantized()` fields (`.optional()` — no auto-instantiated
     *  default; its absence is the "not quantized" signal on decode). */
    quantized: FieldBuilder<{
        min: number;
        max: number;
        bits: number;
        mode: number;
    } & {} & Schema<any> & Schema<unknown>, true, true>;
}>, typeof Schema>;
export type ReflectionField = SchemaType<typeof ReflectionField>;
export declare const ReflectionType: import("./annotations.js").SchemaWithExtendsConstructor<{
    id: FieldBuilder<number, false, false>;
    extendsId: FieldBuilder<number, false, false>;
    fields: FieldBuilder<ArraySchema<{
        name: string;
        type: string;
        referencedType: number;
        childPrimitive: string;
    } & {
        quantized?: {
            min: number;
            max: number;
            bits: number;
            mode: number;
        } & {} & Schema<any> & Schema<unknown>;
    } & Schema<any> & Schema<unknown>>, true, false>;
}, import("./index.js").BuilderInitProps<{
    id: FieldBuilder<number, false, false>;
    extendsId: FieldBuilder<number, false, false>;
    fields: FieldBuilder<ArraySchema<{
        name: string;
        type: string;
        referencedType: number;
        childPrimitive: string;
    } & {
        quantized?: {
            min: number;
            max: number;
            bits: number;
            mode: number;
        } & {} & Schema<any> & Schema<unknown>;
    } & Schema<any> & Schema<unknown>>, true, false>;
}>, typeof Schema>;
export type ReflectionType = SchemaType<typeof ReflectionType>;
export declare const Reflection: ReturnType<typeof schema<{
    types: FieldBuilder<ArraySchema<ReflectionType>, true, false>;
    rootType: FieldBuilder<number, false, false>;
}>> & ReflectionStatic;
export type Reflection = SchemaType<typeof Reflection>;
export {};
