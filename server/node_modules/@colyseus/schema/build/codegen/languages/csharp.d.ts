import { File } from "../types.js";
import { GenerateOptions } from "../api.js";
import { Context } from "../types.js";
export declare const name = "Unity/C#";
/**
 * Generate individual files for each class/interface/enum
 */
export declare function generate(context: Context, options: GenerateOptions): File[];
/**
 * Generate a single bundled file containing all classes, interfaces, and enums
 */
export declare function renderBundle(context: Context, options: GenerateOptions): File;
