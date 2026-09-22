import type { Schema } from "../Schema.js";
import type { CollectionSchema } from "../types/custom/CollectionSchema.js";
import type { MapSchema } from "../types/custom/MapSchema.js";
import type { SetSchema } from "../types/custom/SetSchema.js";
import type { ArraySchema } from "../types/custom/ArraySchema.js";
import type { Ref } from "../encoder/ChangeTree.js";
export declare class EncodeSchemaError extends Error {
}
export declare function assertType(value: any, type: string, klass: Schema, field: string | number): void;
export declare function assertInstanceType(value: Ref, type: typeof Schema | typeof ArraySchema | typeof MapSchema | typeof CollectionSchema | typeof SetSchema, instance: Ref, field: string | number): void;
