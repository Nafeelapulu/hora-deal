export interface ResolveOptions {
    /** Explicit `--tsconfig`. When set, nearest-config discovery is skipped. */
    tsconfig?: string;
}
/**
 * Drop every cached tsconfig lookup. Called once per top-level `parseFiles()`
 * run so a long-lived process can generate for two different projects.
 */
export declare function resetResolver(options?: ResolveOptions): void;
/**
 * Resolve a non-relative import (`@schemas/Player`, `shared/Player`) to a
 * first-party source file through the tsconfig governing `containingFile`.
 * Returns undefined for npm packages, declaration files, and specifiers no
 * alias covers.
 */
export declare function resolveNonRelativeImport(specifier: string, containingFile: string): string | undefined;
/** The extension alternatives parseFiles() probes, in order. Pure — no fs. */
export declare function sourceFileCandidates(fileName: string): string[];
/** Same probing as parseFiles(), answering "which candidate exists?". */
export declare function resolveSourceFile(fileName: string): string | undefined;
/**
 * The serializer's own source declares wire-internal schemas (`Reflection`,
 * `ReflectionField`, …) that must never reach generated client code.
 */
export declare function isOwnPackageSource(fileName: string): boolean;
