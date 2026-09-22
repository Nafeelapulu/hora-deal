import { File, Context } from "../types.js";
import { GenerateOptions } from "../api.js";
export declare const name = "TypeScript";
/**
 * Generate individual files for each class/interface
 */
export declare function generate(context: Context, options: GenerateOptions): File[];
/**
 * Generate a single bundled file containing all classes and interfaces
 */
export declare function renderBundle(context: Context, options: GenerateOptions): File;
