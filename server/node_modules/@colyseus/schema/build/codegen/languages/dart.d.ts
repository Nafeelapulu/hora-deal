import { File, Context } from "../types.js";
import { GenerateOptions } from "../api.js";
export declare const name = "Dart/Flutter";
/**
 * Dart Code Generator
 *
 * Emits typed façades over the `colyseus` Flutter package's runtime: one
 * `SchemaRef` subclass per schema, with typed getters over the shared native
 * handle. Collection getters return `MapSchema<T>` / `ArraySchema<T>`, which
 * also carry the field they came from — that is what
 * `callbacks.onAdd(state.players, ...)` registers against.
 */
/**
 * Generate individual files for each class/interface/enum
 */
export declare function generate(context: Context, options: GenerateOptions): File[];
/**
 * Generate a single bundled file containing all classes, interfaces, and enums
 */
export declare function renderBundle(context: Context, options: GenerateOptions): File;
