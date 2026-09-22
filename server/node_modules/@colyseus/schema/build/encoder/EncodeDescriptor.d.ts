import type { StateView } from "./StateView.js";
import type { EncodeOperation } from "./EncodeOperation.js";
export interface EncodeDescriptor {
    encoder: EncodeOperation;
    filter: ((ref: any, index: number, view?: StateView) => boolean) | undefined;
    metadata: any;
    isSchema: boolean;
    /**
     * Bit i set iff field i has a @view tag. 0 for collection trees.
     * Lets `encodeChangeCb` do a single bitwise op instead of a per-field
     * metadata[i]?.tag chase. Fields 0–31 only, like the bitmasks below —
     * `encodeChangeCb` reads `tags` past that.
     */
    filterBitmask: number;
    /**
     * Class-level "any field has the flag" booleans + per-field bitmasks.
     * Hot path: per-mutation `_routeAndRecord` calls `isFieldFullStateOnly` and
     * `isFieldUnreliable`. The common case is "no static/unreliable fields
     * anywhere on this class" (booleans short-circuit before the symbol-keyed
     * metadata lookup); the secondary common case is "this class has some
     * such fields and we need to know if THIS field is one" — the bitmask
     * answers in one bitwise op instead of an `Array.includes` linear scan.
     *
     * Bitmasks cover fields 0–31 only — shift counts wrap at 32. Fields ≥32
     * fall back to `Metadata.hasXAtIndex`.
     */
    hasAnyFullStateOnly: boolean;
    hasAnyUnreliable: boolean;
    hasAnyStream: boolean;
    /**
     * Class-level "any field carries a `@view` tag". Read by
     * `ChangeTree.hasFilteredFields` to decide whether a parent tree must
     * be included in a view's bootstrap.
     */
    hasAnyView: boolean;
    fullStateOnlyBitmask: number;
    unreliableBitmask: number;
    /**
     * Bit i set iff field i holds a `t.stream(...)` collection. Hot encode
     * path reads this to dispatch stream fields into the priority/budget
     * gate instead of the normal recorder iteration.
     */
    streamBitmask: number;
    /**
     * Per-field parallel arrays — Schemas only (empty arrays for
     * collections). Replaces hot-path `metadata[i].name` / `metadata[i].type`
     * / `metadata[i].tag` chains with direct array indexing on a small
     * fixed-shape object.
     *
     * Sparse where natural: `tags[i]` is undefined unless field i carries
     * a @view tag; readers should null-check before comparing.
     *
     * `encoders[i]` mirrors `metadata[$encoders]` — the pre-computed
     * encoder fn for primitive-typed fields. Cached here so encode loops
     * skip a `metadata[$encoders]?.[i]` symbol-chain per emission.
     */
    names: string[];
    types: any[];
    tags: (number | undefined)[];
    encoders: (((bytes: Uint8Array, value: any, it: any) => void) | undefined)[];
}
export declare function getEncodeDescriptor(ref: any): EncodeDescriptor;
