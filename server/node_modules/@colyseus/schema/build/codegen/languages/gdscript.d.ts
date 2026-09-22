import { File, Context } from "../types.js";
import { GenerateOptions } from "../api.js";
export declare const name = "GDScript";
/**
 * GDScript Code Generator
 */
/**
 * Generate individual files for each class
 */
export declare function generate(context: Context, options: GenerateOptions): File[];
/**
 * Generate a single bundled file containing all classes and enums
 */
export declare function renderBundle(context: Context, options: GenerateOptions): File;
