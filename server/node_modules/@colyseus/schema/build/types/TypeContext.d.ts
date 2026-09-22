import { Schema } from "../Schema.js";
export declare class TypeContext {
    types: {
        [id: number]: typeof Schema;
    };
    schemas: Map<typeof Schema, number>;
    hasFilters: boolean;
    /**
     * For inheritance support
     * Keeps track of which classes extends which. (parent -> children)
     */
    static inheritedTypes: Map<typeof Schema, Set<typeof Schema>>;
    static cachedContexts: Map<typeof Schema, TypeContext>;
    static register(target: typeof Schema): void;
    static cache(rootClass: typeof Schema): TypeContext;
    constructor(rootClass?: typeof Schema);
    has(schema: typeof Schema): boolean;
    get(typeid: number): typeof Schema;
    add(schema: typeof Schema, typeid?: number): boolean;
    getTypeId(klass: typeof Schema): number;
    private discoverTypes;
    debug(): string;
}
