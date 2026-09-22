import { File, Context } from "../types.js";
import { GenerateOptions } from "../api.js";
export declare const name = "Java";
/**
 * Java Code Generator
 */
/**
 * Generate individual files for each class
 */
export declare function generate(context: Context, options: GenerateOptions): File[];
/**
 * Generate a single bundled file containing all classes
 * Note: Java typically requires one public class per file, so bundled mode
 * generates all classes in a single file with package-private visibility
 */
export declare function renderBundle(context: Context, options: GenerateOptions): File;
