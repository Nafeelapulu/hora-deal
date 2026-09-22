/** Root of the @colyseus/schema package — `src/codegen/` in dev, `build/codegen/` once bundled. */
export declare const PACKAGE_ROOT: string;
export declare function getCommentHeader(singleLineComment?: string): string;
export declare class Context {
    classes: Class[];
    interfaces: Interface[];
    enums: Enum[];
    getStructures(): {
        classes: Class[];
        interfaces: Interface[];
        enums: Enum[];
    };
    addStructure(structure: IStructure): void;
    private isSchemaClass;
}
export interface IStructure {
    context: Context;
    name: string;
    properties: Property[];
    addProperty(property: Property): void;
}
export declare class Interface implements IStructure {
    context: Context;
    name: string;
    properties: Property[];
    addProperty(property: Property): void;
}
export declare class Class implements IStructure {
    context: Context;
    name: string;
    properties: Property[];
    extends: string;
    addProperty(property: Property): void;
    postProcessing(): void;
}
export declare class Enum implements IStructure {
    context: Context;
    name: string;
    properties: Property[];
    addProperty(property: Property): void;
}
/**
 * Statically-extracted `t.quantized()` options. `wrap` is already normalized
 * from the source's `mode` string; emitters derive `range`/`span` via
 * {@link resolveQuantized} so every language ships identical precomputed values.
 */
export interface QuantizedProperty {
    min: number;
    max: number;
    bits: 8 | 16 | 32;
    wrap: boolean;
}
/**
 * Mirror of the runtime's `resolveQuantize()` scale math (wrap spreads 2^bits
 * steps across [min,max); clamp maps the endpoints onto 0 and 2^bits-1, one
 * fewer on a range symmetric about zero so zero lands on a step).
 */
export declare function resolveQuantized(q: QuantizedProperty): {
    range: number;
    span: number;
};
export declare class Property {
    index: number;
    name: string;
    type: string;
    childType: string;
    quantized?: QuantizedProperty;
    deprecated?: boolean;
    /**
     * Construction default (`.default(v)`, or a decorator field's initializer),
     * only when it is a statically-known literal. Emitters may fall back to the
     * language's zero value when it is absent or doesn't fit the field's type.
     */
    defaultValue?: string | number | boolean;
}
export interface File {
    name: string;
    content: string;
}
/**
 * Structured file representation for code generation.
 * Separates imports, local references, and body content to enable
 * clean bundling without string parsing.
 */
export interface GeneratedFile {
    name: string;
    /** External imports (e.g., "@colyseus/schema", "Colyseus.Schema") */
    imports: string[];
    /** References to other generated classes (used for imports in non-bundle mode) */
    localRefs: string[];
    /** The class/interface/enum definition body (without imports or namespace wrapper) */
    body: string;
}
export declare function getInheritanceTree(klass: Class, allClasses: Class[], includeSelf?: boolean): Class[];
