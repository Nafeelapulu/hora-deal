export declare const generators: Record<string, any>;
export interface GenerateOptions {
    files: string[];
    output: string;
    decorator?: string;
    namespace?: string;
    bundle?: boolean;
    /** Overrides the nearest-tsconfig lookup used to resolve import path aliases. */
    tsconfig?: string;
}
export declare function generate(targetId: string, options: GenerateOptions): void;
