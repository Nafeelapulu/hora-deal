import { File, Context } from "../types.js";
import { GenerateOptions } from "../api.js";
export declare const name = "C++";
/**
 * Generate individual files for each class
 */
export declare function generate(context: Context, options: GenerateOptions): File[];
/**
 * Generate a single bundled header file containing all classes
 */
export declare function renderBundle(context: Context, options: GenerateOptions): File;
