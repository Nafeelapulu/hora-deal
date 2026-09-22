import { File, Context } from "../types.js";
import { GenerateOptions } from "../api.js";
export declare const name = "Swift";
/**
 * Swift Code Generator
 *
 * Emits typed façades over the `Colyseus` package's runtime: one `SchemaRef`
 * subclass per schema, whose properties read through the shared handle on the
 * instance the core decoded. Nothing is copied and nothing is stored, so a
 * generated class stays correct as patches arrive.
 *
 * Collection properties return `MapSchema<T>` / `ArraySchema<T>`, which carry
 * the field they came from — that is what `callbacks.onAdd(state.players, …)`
 * registers against.
 */
/**
 * Generate individual files for each class/interface/enum
 */
export declare function generate(context: Context, options: GenerateOptions): File[];
/**
 * Generate a single bundled file containing all classes, interfaces, and enums
 */
export declare function renderBundle(context: Context, options: GenerateOptions): File;
