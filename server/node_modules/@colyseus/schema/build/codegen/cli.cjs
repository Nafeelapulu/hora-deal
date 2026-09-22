#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');
var ts$1 = require('typescript');
var url = require('url');

var _documentCurrentScript = typeof document !== 'undefined' ? document.currentScript : null;
function _interopNamespaceDefault(e) {
    var n = Object.create(null);
    if (e) {
        Object.keys(e).forEach(function (k) {
            if (k !== 'default') {
                var d = Object.getOwnPropertyDescriptor(e, k);
                Object.defineProperty(n, k, d.get ? d : {
                    enumerable: true,
                    get: function () { return e[k]; }
                });
            }
        });
    }
    n.default = e;
    return Object.freeze(n);
}

var fs__namespace = /*#__PURE__*/_interopNamespaceDefault(fs);
var path__namespace = /*#__PURE__*/_interopNamespaceDefault(path);
var ts__namespace = /*#__PURE__*/_interopNamespaceDefault(ts$1);

/**
 * @author Ethan Davis
 * https://github.com/ethanent/gar
 */
var argv = (sargs) => {
    let props = {};
    let lones = [];
    const convertIfApplicable = (value) => (isNaN(value) ? (value.toString().toLowerCase() === 'true' ? true : (value.toString().toLowerCase() === 'false' ? false : value)) : Number(value));
    const removeStartHyphens = (value) => value.replace(/^\-+/g, '');
    for (let i = 0; i < sargs.length; i++) {
        const equalsIndex = sargs[i].indexOf('=');
        const isNextRefProp = sargs[i].charAt(0) === '-' && sargs.length - 1 >= i + 1 && sargs[i + 1].indexOf('=') === -1 && sargs[i + 1].charAt(0) !== '-';
        const argName = equalsIndex === -1 ? removeStartHyphens(sargs[i]) : removeStartHyphens(sargs[i].slice(0, equalsIndex));
        if (equalsIndex !== -1) {
            props[argName] = convertIfApplicable(sargs[i].slice(equalsIndex + 1));
        }
        else if (isNextRefProp) {
            props[argName] = convertIfApplicable(sargs[i + 1]);
            i++;
        }
        else if (sargs[i].charAt(0) === '-') {
            if (sargs[i].charAt(1) === '-') {
                props[argName] = true;
            }
            else {
                for (let b = 0; b < argName.length; b++) {
                    props[argName.charAt(b)] = true;
                }
            }
        }
        else {
            lones.push(convertIfApplicable(argName));
        }
    }
    return Object.assign(props, {
        '_': lones
    });
};

if (typeof (__dirname) === "undefined") {
    global.__dirname = path__namespace.dirname(url.fileURLToPath((typeof document === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : (_documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === 'SCRIPT' && _documentCurrentScript.src || new URL('cli.cjs', document.baseURI).href))));
}
/** Root of the @colyseus/schema package — `src/codegen/` in dev, `build/codegen/` once bundled. */
const PACKAGE_ROOT = path__namespace.resolve(__dirname, "..", "..");
const VERSION = JSON.parse(fs__namespace.readFileSync(path__namespace.resolve(PACKAGE_ROOT, "package.json")).toString()).version;
const COMMENT_HEADER = `
THIS FILE HAS BEEN GENERATED AUTOMATICALLY
DO NOT CHANGE IT MANUALLY UNLESS YOU KNOW WHAT YOU'RE DOING

GENERATED USING @colyseus/schema ${VERSION}
`;
function getCommentHeader(singleLineComment = "//") {
    return `${COMMENT_HEADER.split("\n").map(line => `${singleLineComment} ${line}`).join("\n")}`;
}
class Context {
    classes = [];
    interfaces = [];
    enums = [];
    getStructures() {
        // `isSchemaClass` already walks the full ancestor chain, so a class is
        // emitted iff it (or any ancestor) descends from Schema — no need to
        // re-walk parents here.
        return {
            classes: this.classes.filter(klass => this.isSchemaClass(klass)),
            interfaces: this.interfaces,
            enums: this.enums,
        };
    }
    addStructure(structure) {
        if (structure.context === this) {
            return;
        } // skip if already added.
        structure.context = this;
        if (structure instanceof Class) {
            this.classes.push(structure);
        }
        else if (structure instanceof Interface) {
            this.interfaces.push(structure);
        }
        else if (structure instanceof Enum) {
            this.enums.push(structure);
        }
    }
    isSchemaClass(klass) {
        // True if `klass` or any ancestor extends Schema (directly or via the
        // `schema.Schema` / `Schema.Schema` aliases).
        //
        // TODO: ideally we should check for the actual @colyseus/schema module
        // reference rather than arbitrary strings.
        for (const current of [klass, ...eachAncestor(klass, this.classes)]) {
            const isSchema = (current.extends === "Schema" ||
                current.extends === "schema.Schema" ||
                current.extends === "Schema.Schema");
            if (isSchema) {
                // Normalize a `schema.Schema`-style base on the queried class itself.
                if (current === klass) {
                    klass.extends = "Schema";
                }
                return true;
            }
        }
        return false;
    }
}
class Interface {
    context;
    name;
    properties = [];
    addProperty(property) {
        this.properties.push(property);
    }
}
class Class {
    context;
    name;
    properties = [];
    extends;
    addProperty(property) {
        property.index = this.properties.length;
        this.properties.push(property);
    }
    postProcessing() {
        // Offset each property's `index` by the field count of every ancestor,
        // so indexes stay correct across inheritance.
        for (const parent of eachAncestor(this, this.context.classes)) {
            this.properties.forEach(prop => {
                prop.index += parent.properties.length;
            });
        }
    }
}
class Enum {
    context;
    name;
    properties = [];
    addProperty(property) {
        this.properties.push(property);
    }
}
/**
 * Mirror of the runtime's `resolveQuantize()` scale math (wrap spreads 2^bits
 * steps across [min,max); clamp maps the endpoints onto 0 and 2^bits-1, one
 * fewer on a range symmetric about zero so zero lands on a step).
 */
function resolveQuantized(q) {
    return {
        range: q.max - q.min,
        span: q.wrap ? 2 ** q.bits : q.min === -q.max ? 2 ** q.bits - 2 : 2 ** q.bits - 1,
    };
}
class Property {
    index;
    name;
    type;
    childType;
    quantized;
    deprecated;
    /**
     * Construction default (`.default(v)`, or a decorator field's initializer),
     * only when it is a statically-known literal. Emitters may fall back to the
     * language's zero value when it is absent or doesn't fit the field's type.
     */
    defaultValue;
}
/**
 * Walk `klass`'s `extends` chain, parent-first, yielding each ancestor class
 * (not `klass` itself). The single safe ancestor traversal every inheritance
 * query is built on: it stops at the Schema root, an unresolved base, or a
 * cycle — so a malformed class graph can never spin forever. This is why the
 * `seen` cycle-guard lives here and nowhere else.
 */
function* eachAncestor(klass, allClasses) {
    const seen = new Set([klass]);
    let current = klass;
    while (current.extends && current.extends !== "Schema") {
        const parent = allClasses.find(c => c.name === current.extends);
        if (!parent || seen.has(parent)) {
            return;
        }
        seen.add(parent);
        yield parent;
        current = parent;
    }
}
function getInheritanceTree(klass, allClasses, includeSelf = true) {
    return [
        ...(includeSelf ? [klass] : []),
        ...eachAncestor(klass, allClasses),
    ];
}

const CONFIG_NAMES = ["tsconfig.json", "jsconfig.json"];
/** `No inputs were found in config file` — expected, since readDirectory is stubbed. */
const NO_INPUTS_FOUND = 18003;
let configByDir;
let override;
let resolveOptions;
let warned;
reset();
function reset() {
    configByDir = new Map();
    override = undefined;
    resolveOptions = {};
    warned = new Set();
}
/**
 * Drop every cached tsconfig lookup. Called once per top-level `parseFiles()`
 * run so a long-lived process can generate for two different projects.
 */
function resetResolver(options = {}) {
    reset();
    resolveOptions = options;
    if (options.tsconfig && !fs__namespace.existsSync(options.tsconfig)) {
        throw new Error(`--tsconfig: file not found: ${options.tsconfig}`);
    }
}
function warnOnce(key, message) {
    if (warned.has(key)) {
        return;
    }
    warned.add(key);
    console.warn(message);
}
/**
 * `readDirectory` is stubbed on purpose: only `compilerOptions` is wanted here,
 * and letting TypeScript glob the config's `include` set would stat the user's
 * whole project on every config discovered.
 */
const parseConfigHost = {
    useCaseSensitiveFileNames: ts__namespace.sys?.useCaseSensitiveFileNames ?? true,
    readDirectory: () => [],
    fileExists: (fileName) => fs__namespace.existsSync(fileName),
    readFile: (fileName) => {
        try {
            return fs__namespace.readFileSync(fileName, "utf8");
        }
        catch (e) {
            if (!e?.code) {
                throw e;
            }
            return undefined;
        }
    },
};
function loadConfig(configFilePath) {
    const { config, error } = ts__namespace.readConfigFile(configFilePath, parseConfigHost.readFile);
    if (error) {
        warnOnce(configFilePath, `schema-codegen: could not read "${configFilePath}" ` +
            `(${ts__namespace.flattenDiagnosticMessageText(error.messageText, " ")}) — ` +
            `its import path aliases will be ignored.`);
        return null;
    }
    // parseJsonConfigFileContent (not convertCompilerOptionsFromJson) is what
    // applies `extends` chains, `${configDir}` templates, and `pathsBasePath` —
    // the directory of the config that DECLARED `paths`, which in a monorepo is
    // not the directory of the config being loaded.
    const parsed = ts__namespace.parseJsonConfigFileContent(config, parseConfigHost, path__namespace.dirname(configFilePath), undefined, configFilePath);
    const errors = parsed.errors.filter((d) => d.code !== NO_INPUTS_FOUND && d.category === ts__namespace.DiagnosticCategory.Error);
    if (errors.length > 0) {
        warnOnce(configFilePath, `schema-codegen: "${configFilePath}" has errors — ` +
            errors.map((d) => ts__namespace.flattenDiagnosticMessageText(d.messageText, " ")).join("; "));
    }
    const options = parsed.options;
    if (!options.paths && !options.baseUrl) {
        return null;
    }
    const getCanonicalFileName = parseConfigHost.useCaseSensitiveFileNames
        ? (f) => f
        : (f) => f.toLowerCase();
    return {
        configFilePath,
        options,
        cache: ts__namespace.createModuleResolutionCache(path__namespace.dirname(configFilePath), getCanonicalFileName, options),
    };
}
function getOverrideConfig() {
    if (override === undefined) {
        override = loadConfig(path__namespace.resolve(resolveOptions.tsconfig));
        if (override === null) {
            warnOnce(`no-aliases:${resolveOptions.tsconfig}`, `schema-codegen: "${resolveOptions.tsconfig}" declares no "paths" or ` +
                `"baseUrl" — there are no import aliases to resolve.`);
        }
    }
    return override;
}
/**
 * Nearest `tsconfig.json`/`jsconfig.json` above `containingFile`. Both names are
 * checked at every level: a distant tsconfig.json must not win over an adjacent
 * jsconfig.json. Stops at the first config found even when it declares no
 * aliases — matching `tsc`, a parent project's `paths` do not leak into a child
 * that does not `extends` it.
 */
function getConfigFor(containingFile) {
    if (resolveOptions.tsconfig) {
        return getOverrideConfig();
    }
    const dir = path__namespace.dirname(containingFile);
    if (configByDir.has(dir)) {
        return configByDir.get(dir);
    }
    let config = null;
    const visited = [];
    for (let current = dir, parent;; current = parent) {
        visited.push(current);
        const found = CONFIG_NAMES
            .map((name) => path__namespace.join(current, name))
            .find((candidate) => fs__namespace.existsSync(candidate));
        if (found) {
            config = loadConfig(found);
            break;
        }
        parent = path__namespace.dirname(current);
        if (parent === current) {
            break;
        }
    }
    // memoize the whole walk, negatives included
    visited.forEach((visitedDir) => configByDir.set(visitedDir, config));
    return config;
}
/** Exact patterns win outright; among wildcards the longest prefix wins. */
function findBestPathPattern(specifier, paths) {
    let best;
    let bestPrefixLength = -1;
    for (const pattern in paths) {
        const star = pattern.indexOf("*");
        if (star === -1) {
            if (pattern === specifier) {
                return { substitutions: paths[pattern], matchedStar: "" };
            }
            continue;
        }
        const prefix = pattern.slice(0, star);
        const suffix = pattern.slice(star + 1);
        if (specifier.length >= prefix.length + suffix.length &&
            specifier.startsWith(prefix) &&
            specifier.endsWith(suffix) &&
            prefix.length > bestPrefixLength) {
            bestPrefixLength = prefix.length;
            best = {
                substitutions: paths[pattern],
                matchedStar: specifier.slice(prefix.length, specifier.length - suffix.length),
            };
        }
    }
    return best;
}
function resolveViaPathsSubstitution(matched, options) {
    // mirrors ts.getPathsBasePath(): `paths` may be declared without a baseUrl,
    // in which case it anchors on the config that declared it
    const base = options.baseUrl ?? options.pathsBasePath ?? process.cwd();
    for (const substitution of matched.substitutions) {
        const resolved = resolveSourceFile(path__namespace.resolve(base, substitution.replace("*", matched.matchedStar)));
        if (resolved) {
            return resolved;
        }
    }
    return undefined;
}
const isDeclaration = (fileName) => /\.d\.[cm]?ts$/.test(fileName);
const isInNodeModules = (fileName) => fileName.replace(/\\/g, "/").includes("/node_modules/");
/**
 * Resolve a non-relative import (`@schemas/Player`, `shared/Player`) to a
 * first-party source file through the tsconfig governing `containingFile`.
 * Returns undefined for npm packages, declaration files, and specifiers no
 * alias covers.
 */
function resolveNonRelativeImport(specifier, containingFile) {
    const config = getConfigFor(containingFile);
    if (!config) {
        return undefined;
    }
    const { options } = config;
    const matched = options.paths && findBestPathPattern(specifier, options.paths);
    // no alias hit and no baseUrl: TypeScript could only find this under
    // node_modules, which costs ~130 failed lookups to prove
    if (!matched && !options.baseUrl) {
        return undefined;
    }
    const resolved = ts__namespace.resolveModuleName(specifier, containingFile, options, ts__namespace.sys, config.cache).resolvedModule;
    if (resolved) {
        // a deliberate package/typings hit — not ours to parse, and the
        // substitution fallback must not second-guess it
        return (resolved.isExternalLibraryImport ||
            isDeclaration(resolved.resolvedFileName) ||
            isInNodeModules(resolved.resolvedFileName)) ? undefined
            : path__namespace.resolve(resolved.resolvedFileName);
    }
    // `.mjs` targets are unresolvable by ts.resolveModuleName in every
    // moduleResolution mode, but schema-codegen parses them
    const viaSubstitution = matched && resolveViaPathsSubstitution(matched, options);
    if (viaSubstitution) {
        return viaSubstitution;
    }
    if (matched) {
        warnOnce(`unresolved:${specifier}`, `schema-codegen: '${specifier}' matches a "paths" alias in ` +
            `${config.configFilePath}, but no source file was found for it — ` +
            `schemas it exports will be missing from the generated output.`);
    }
    return undefined;
}
/** The extension alternatives parseFiles() probes, in order. Pure — no fs. */
function sourceFileCandidates(fileName) {
    if (!fileName.endsWith(".ts") &&
        !fileName.endsWith(".js") &&
        !fileName.endsWith(".mjs")) {
        return [`${fileName}.ts`, `${fileName}/index.ts`];
    }
    else if (fileName.endsWith(".js")) {
        // ESM imports often spell a .ts source with a .js extension
        return [fileName, fileName.replace(/\.js$/, ".ts")];
    }
    else {
        return [fileName];
    }
}
/** Same probing as parseFiles(), answering "which candidate exists?". */
function resolveSourceFile(fileName) {
    const candidates = sourceFileCandidates(fileName);
    for (let i = 0; i < candidates.length; i++) {
        const candidate = path__namespace.resolve(candidates[i]);
        try {
            // statSync, not existsSync: a directory must fall through to the
            // next candidate, the way readFileSync's EISDIR does
            if (fs__namespace.statSync(candidate).isFile()) {
                return candidate;
            }
        }
        catch (e) {
            if (!e?.code) {
                throw e;
            }
        }
    }
    return undefined;
}
/**
 * The serializer's own source declares wire-internal schemas (`Reflection`,
 * `ReflectionField`, …) that must never reach generated client code.
 */
function isOwnPackageSource(fileName) {
    const relative = path__namespace.relative(PACKAGE_ROOT, fileName);
    return (!relative.startsWith("..") &&
        !path__namespace.isAbsolute(relative) &&
        (relative.startsWith(`src${path__namespace.sep}`) || relative.startsWith(`build${path__namespace.sep}`)));
}

let currentStructure;
let currentProperty;
let globalContext;
let defineTypesWarned = false;
const BUILDER_COLLECTION_KINDS = new Set(["array", "map", "set", "collection"]);
/**
 * For a t.*().chain().calls() expression, walk down to the base `t.X(...)`
 * call and return its method name, first argument, the names of the
 * chained modifiers (`.view()`, `.deprecated()`, …) and the argument of the
 * effective `.default(...)`. Returns null if the node does not look like a
 * builder chain.
 */
function extractBuilderBase(node) {
    const modifiers = new Set();
    let defaultArg;
    let current = node;
    while (true) {
        const expr = current.expression;
        if (!ts__namespace.isPropertyAccessExpression(expr)) {
            return null;
        }
        if (ts__namespace.isCallExpression(expr.expression)) {
            // walking outermost-first: the first `.default()` seen is the last applied
            if (expr.name.text === "default" && !modifiers.has("default")) {
                defaultArg = current.arguments[0];
            }
            modifiers.add(expr.name.text);
            current = expr.expression;
            continue;
        }
        return {
            methodName: expr.name.text,
            firstArg: current.arguments[0],
            modifiers,
            defaultArg,
        };
    }
}
/**
 * Collection kind of a message field's type annotation, and the type it holds:
 * - "array" for `T[]`, `readonly T[]`, `Array<T>` or `ReadonlyArray<T>`
 * - "map" for `Record<K, V>`, `Map<K, V>`, `ReadonlyMap<K, V>` or `{ [key: K]: V }`
 *
 * Returns undefined for any other type.
 */
function getCollectionType(node) {
    if (ts__namespace.isTypeOperatorNode(node) && node.operator === ts__namespace.SyntaxKind.ReadonlyKeyword) {
        node = node.type;
    }
    if (ts__namespace.isArrayTypeNode(node)) {
        return { type: "array", child: node.elementType };
    }
    if (ts__namespace.isTypeReferenceNode(node)) {
        const name = node.typeName.getText();
        const args = node.typeArguments;
        if (args?.length === 1 && (name === "Array" || name === "ReadonlyArray")) {
            return { type: "array", child: args[0] };
        }
        if (args?.length === 2 && (name === "Record" || name === "Map" || name === "ReadonlyMap")) {
            return { type: "map", child: args[1] };
        }
    }
    if (ts__namespace.isTypeLiteralNode(node) && node.members.length === 1 && ts__namespace.isIndexSignatureDeclaration(node.members[0])) {
        return { type: "map", child: node.members[0].type };
    }
    return undefined;
}
/**
 * Statically evaluate a default value: a string/boolean literal or a constant
 * numeric expression, `const`s included (local or imported). Returns
 * undefined for anything else (a factory function, an object).
 */
function evalDefaultLiteral(node) {
    if (!node) {
        return undefined;
    }
    if (ts__namespace.isStringLiteral(node) || ts__namespace.isNoSubstitutionTemplateLiteral(node)) {
        return node.text;
    }
    if (node.kind === ts__namespace.SyntaxKind.TrueKeyword) {
        return true;
    }
    if (node.kind === ts__namespace.SyntaxKind.FalseKeyword) {
        return false;
    }
    return evalNumericExpression(node, resolveConstIdentifier);
}
/**
 * Statically evaluate a numeric option expression. Codegen has no runtime, so
 * only constant arithmetic is supported: literals, unary +/-, `Math.PI`-style
 * constants and add/sub/mul/div combinations of those (e.g. `Math.PI * 2`).
 * A bare identifier is evaluated through `resolveIdentifier` when given.
 * Returns undefined for anything it cannot resolve (an unresolved reference, a call).
 */
function evalNumericExpression(node, resolveIdentifier) {
    if (ts__namespace.isNumericLiteral(node)) {
        return Number(node.text);
    }
    if (ts__namespace.isIdentifier(node)) {
        return resolveIdentifier?.(node);
    }
    if (ts__namespace.isParenthesizedExpression(node)) {
        return evalNumericExpression(node.expression, resolveIdentifier);
    }
    if (ts__namespace.isPrefixUnaryExpression(node)) {
        const operand = evalNumericExpression(node.operand, resolveIdentifier);
        if (operand === undefined) {
            return undefined;
        }
        if (node.operator === ts__namespace.SyntaxKind.MinusToken) {
            return -operand;
        }
        if (node.operator === ts__namespace.SyntaxKind.PlusToken) {
            return operand;
        }
        return undefined;
    }
    if (ts__namespace.isPropertyAccessExpression(node) && node.expression.getText() === "Math") {
        const constant = Math[node.name.text];
        return (typeof constant === "number") ? constant : undefined;
    }
    if (ts__namespace.isBinaryExpression(node)) {
        const left = evalNumericExpression(node.left, resolveIdentifier);
        const right = evalNumericExpression(node.right, resolveIdentifier);
        if (left === undefined || right === undefined) {
            return undefined;
        }
        switch (node.operatorToken.kind) {
            case ts__namespace.SyntaxKind.PlusToken: return left + right;
            case ts__namespace.SyntaxKind.MinusToken: return left - right;
            case ts__namespace.SyntaxKind.AsteriskToken: return left * right;
            case ts__namespace.SyntaxKind.SlashToken: return left / right;
            default: return undefined;
        }
    }
    return undefined;
}
/** Resolve an import/export specifier to a first-party source file. */
function resolveModuleFile(moduleName, currentFile) {
    return (moduleName.startsWith("."))
        ? resolveSourceFile(path__namespace.resolve(path__namespace.dirname(currentFile), moduleName))
        // may be a tsconfig `paths`/`baseUrl` alias onto first-party source;
        // npm packages are filtered out by the resolver
        : resolveNonRelativeImport(moduleName, currentFile);
}
/**
 * The initializer of the top-level `const` named `name` in `sourceFile` — or of
 * the one it imports (aliased or not) or re-exports under that name. Only
 * `const` resolves: a `let` may be reassigned before `schema()` runs.
 */
function findConstInitializer(name, sourceFile, visited = new Set()) {
    const key = `${sourceFile.fileName}#${name}`;
    if (visited.has(key)) {
        return undefined;
    } // `export *` cycle
    visited.add(key);
    const follow = (specifier, importedName) => {
        const file = resolveModuleFile(specifier.text, sourceFile.fileName);
        return file && findConstInitializer(importedName, ts__namespace.createSourceFile(file, fs.readFileSync(file).toString(), ts__namespace.ScriptTarget.Latest, true), visited);
    };
    for (const statement of sourceFile.statements) {
        if (ts__namespace.isVariableStatement(statement)) {
            if (!(statement.declarationList.flags & ts__namespace.NodeFlags.Const)) {
                continue;
            }
            const decl = statement.declarationList.declarations.find((d) => ts__namespace.isIdentifier(d.name) && d.name.text === name);
            if (decl) {
                return decl.initializer;
            }
        }
        else if (ts__namespace.isImportDeclaration(statement)) {
            const bindings = statement.importClause?.namedBindings;
            const spec = (bindings && ts__namespace.isNamedImports(bindings))
                ? bindings.elements.find((el) => el.name.text === name)
                : undefined;
            if (spec) {
                return follow(statement.moduleSpecifier, (spec.propertyName ?? spec.name).text);
            }
        }
        else if (ts__namespace.isExportDeclaration(statement) && statement.moduleSpecifier) {
            // barrels: `export * from "./x"`, `export { A as B } from "./x"`
            const clause = statement.exportClause;
            const spec = (clause && ts__namespace.isNamedExports(clause))
                ? clause.elements.find((el) => el.name.text === name)
                : undefined;
            if (!clause || spec) {
                const found = follow(statement.moduleSpecifier, spec ? (spec.propertyName ?? spec.name).text : name);
                if (found) {
                    return found;
                }
            }
        }
    }
    return undefined;
}
/**
 * Evaluate a `const` reference through its initializer, across imports. `chain`
 * holds the consts mid-evaluation, so a cyclic definition fails instead of
 * recursing forever.
 */
function resolveConstIdentifier(id, chain = new Set()) {
    const initializer = findConstInitializer(id.text, id.getSourceFile());
    if (!initializer) {
        return undefined;
    }
    // file + offset: an imported module is re-parsed per lookup, so nodes differ
    const key = `${initializer.getSourceFile().fileName}:${initializer.pos}`;
    if (chain.has(key)) {
        return undefined;
    }
    chain.add(key);
    const value = evalNumericExpression(initializer, (inner) => resolveConstIdentifier(inner, chain));
    chain.delete(key);
    return value;
}
/**
 * Extract `{ min, max, bits?, mode? }` from a `t.quantized({...})` /
 * `@type({ quantized: {...} })` object literal, or the `{ bits? }` of a
 * `t.angle()`. Throws on anything codegen cannot statically resolve — silently
 * dropping an option would generate a client that decodes every value of that
 * field wrong.
 */
function parseQuantizedOptions(node, propertyName, builder = "quantized") {
    const fail = (reason) => {
        throw new Error(`schema-codegen: cannot statically resolve t.${builder}() options of field '${propertyName}' — ${reason}. ` +
            `Use literal numbers, constant Math expressions (e.g. \`Math.PI * 2\`) or \`const\`s holding them.`);
    };
    const angle = builder === "angle";
    // `t.angle()` may omit its options entirely
    const properties = (!node && angle)
        ? []
        : (node && ts__namespace.isObjectLiteralExpression(node)) ? node.properties : undefined;
    if (!properties) {
        return fail(`expected an inline \`{ ${angle ? "bits" : "min, max, ..."} }\` object literal`);
    }
    // mirrors builder.ts: t.angle({ bits }) ≡ t.quantized({ min: 0, max: Math.PI * 2, mode: "wrap", bits })
    const result = angle ? { min: 0, max: Math.PI * 2, mode: "wrap" } : {};
    for (const prop of properties) {
        if (!ts__namespace.isPropertyAssignment(prop) || !prop.name) {
            continue;
        }
        const key = prop.name.text;
        if (angle && key !== "bits") {
            continue;
        } // the runtime reads nothing else
        if (key === "mode") {
            if (!ts__namespace.isStringLiteral(prop.initializer)) {
                return fail("`mode` must be a string literal");
            }
            result.mode = prop.initializer.text;
        }
        else if (key === "min" || key === "max" || key === "bits") {
            const value = evalNumericExpression(prop.initializer, resolveConstIdentifier);
            if (value === undefined) {
                return fail(`\`${key}\` is not a constant expression`);
            }
            result[key] = value;
        }
    }
    if (typeof result.min !== "number" || typeof result.max !== "number") {
        return fail("`min` and `max` are required");
    }
    const bits = result.bits ?? 16;
    if (bits !== 8 && bits !== 16 && bits !== 32) {
        return fail("`bits` must be 8, 16 or 32");
    }
    return { min: result.min, max: result.max, bits, wrap: result.mode === "wrap" };
}
/**
 * Fill `property` from a field's type expression. Returns false for a
 * `.noSync()` field: the runtime gives it no field index, so emitting it would
 * shift every later index on the client.
 */
function defineProperty(property, initializer) {
    // Builder-style: t.number(), t.array(Item), t.map(Item).view(), etc.
    if (ts__namespace.isCallExpression(initializer)) {
        const base = extractBuilderBase(initializer);
        if (base) {
            if (base.modifiers.has("noSync")) {
                return false;
            }
            property.defaultValue = evalDefaultLiteral(base.defaultArg);
            // same as `@deprecated()`: `.deprecated(false)` still marks the field
            if (base.modifiers.has("deprecated")) {
                property.deprecated = true;
            }
            if (BUILDER_COLLECTION_KINDS.has(base.methodName)) {
                property.type = base.methodName;
                if (base.firstArg) {
                    // see through `(x)`, `x as any`, `x satisfies T`
                    let childArg = base.firstArg;
                    while (ts__namespace.isParenthesizedExpression(childArg) || ts__namespace.isAsExpression(childArg) || ts__namespace.isSatisfiesExpression(childArg)) {
                        childArg = childArg.expression;
                    }
                    if (ts__namespace.isCallExpression(childArg)) {
                        // mirrors the runtime guard in builder.ts resolveChild()
                        const inner = extractBuilderBase(childArg);
                        const hint = (inner && !BUILDER_COLLECTION_KINDS.has(inner.methodName) && inner.methodName !== "ref" && inner.methodName !== "quantized" && inner.methodName !== "angle")
                            ? `use the type name instead: t.${base.methodName}("${inner.methodName}")`
                            : `collections accept a Schema class or a primitive type name ("string", "number", …)`;
                        throw new Error(`schema-codegen: field '${property.name}': a t.* builder is not a valid element type — ${hint}.`);
                    }
                    property.childType = childArg.text ?? childArg.getText();
                }
            }
            else if (base.methodName === "ref") {
                property.type = "ref";
                if (base.firstArg) {
                    property.childType = base.firstArg.text ?? base.firstArg.getText();
                }
            }
            else if (base.methodName === "quantized" || base.methodName === "angle") {
                property.type = "quantized";
                property.quantized = parseQuantizedOptions(base.firstArg, property.name, base.methodName);
            }
            else {
                property.type = base.methodName;
            }
            return true;
        }
    }
    if (ts__namespace.isIdentifier(initializer)) {
        property.type = "ref";
        property.childType = initializer.text;
    }
    else if (initializer.kind == ts__namespace.SyntaxKind.ObjectLiteralExpression) {
        if (initializer.properties[0].name.text === "quantized") {
            // decorator-style: @type({ quantized: { min, max, ... } })
            property.type = "quantized";
            property.quantized = parseQuantizedOptions(initializer.properties[0].initializer, property.name);
        }
        else {
            property.type = initializer.properties[0].name.text;
            property.childType = initializer.properties[0].initializer.text;
        }
    }
    else if (initializer.kind == ts__namespace.SyntaxKind.ArrayLiteralExpression) {
        property.type = "array";
        property.childType = initializer.elements[0].text;
    }
    else {
        property.type = initializer.text;
    }
    return true;
}
function followModuleSpecifier(specifier, currentFile, decoratorName) {
    const moduleName = specifier?.text;
    if (!moduleName) {
        return;
    } // `export { x }` — no module to follow
    const resolved = resolveModuleFile(moduleName, currentFile);
    if (resolved && !isOwnPackageSource(resolved)) {
        parseFiles([resolved], decoratorName, globalContext);
    }
}
function inspectNode(node, context, decoratorName) {
    switch (node.kind) {
        case ts__namespace.SyntaxKind.ImportDeclaration:
        case ts__namespace.SyntaxKind.ExportDeclaration:
            // ExportDeclaration too: path aliases usually point at a barrel
            // (`@schemas` -> `schemas/index.ts` -> `export * from "./Player"`).
            followModuleSpecifier(node.moduleSpecifier, node.getSourceFile().fileName, decoratorName);
            break;
        case ts__namespace.SyntaxKind.ClassDeclaration:
            currentStructure = new Class();
            const heritageClauses = node.heritageClauses;
            if (heritageClauses && heritageClauses.length > 0) {
                currentStructure.extends = heritageClauses[0].types[0].expression.getText();
            }
            context.addStructure(currentStructure);
            break;
        case ts__namespace.SyntaxKind.InterfaceDeclaration:
            //
            // Only generate Interfaces if it has "Message" on its name.
            // Example: MyMessage
            //
            const interfaceName = node.name.escapedText.toString();
            if (interfaceName.indexOf("Message") !== -1) {
                currentStructure = new Interface();
                currentStructure.name = interfaceName;
                context.addStructure(currentStructure);
            }
            break;
        case ts__namespace.SyntaxKind.EnumDeclaration:
            const enumName = node.name.escapedText.toString();
            currentStructure = new Enum();
            currentStructure.name = enumName;
            context.addStructure(currentStructure);
            break;
        case ts__namespace.SyntaxKind.ExtendsKeyword:
            // console.log(node.getText());
            break;
        case ts__namespace.SyntaxKind.PropertySignature:
            if (currentStructure instanceof Interface) {
                const parent = node.parent;
                // Only process direct children of InterfaceDeclaration, skip TypeLiterals
                if (!ts__namespace.isInterfaceDeclaration(parent)) {
                    break;
                }
                // Skip if property if for a another interface than the one we're interested in.
                if (currentStructure.name !== parent.name.escapedText.toString()) {
                    break;
                }
                // define a property of an interface
                const signature = node;
                const collection = getCollectionType(signature.type);
                const property = new Property();
                property.name = signature.name.escapedText.toString();
                property.type = collection?.type ?? signature.type.getText();
                property.childType = collection?.child.getText();
                currentStructure.addProperty(property);
            }
            break;
        case ts__namespace.SyntaxKind.Identifier:
            if (node.getText() === "deprecated" &&
                node.parent.kind !== ts__namespace.SyntaxKind.ImportSpecifier) {
                currentProperty = new Property();
                currentProperty.deprecated = true;
                break;
            }
            if (node.getText() === decoratorName) {
                const prop = node.parent?.parent?.parent;
                const propDecorator = getDecorators(prop);
                const hasExpression = prop?.expression?.arguments;
                const hasDecorator = (propDecorator?.length > 0);
                /**
                 * neither a `@type()` decorator or `type()` call. skip.
                 */
                if (!hasDecorator && !hasExpression) {
                    break;
                }
                // using as decorator
                if (propDecorator) {
                    /**
                     * Calling `@type()` as decorator
                     */
                    const typeDecorator = propDecorator.find((decorator => {
                        return decorator.expression.expression.escapedText === decoratorName;
                    })).expression;
                    const property = currentProperty || new Property();
                    property.name = prop.name.escapedText;
                    const typeArgument = typeDecorator.arguments[0];
                    if (defineProperty(property, typeArgument)) {
                        // `@type("string") name = "x"` — the decorator form of `.default()`
                        if (property.defaultValue === undefined) {
                            property.defaultValue = evalDefaultLiteral(prop.initializer);
                        }
                        currentStructure.addProperty(property);
                    }
                }
                else if (prop.expression.arguments?.[1] &&
                    prop.expression.expression.arguments?.[0]) {
                    /**
                     * Calling `type()` as a regular method
                     */
                    const property = currentProperty || new Property();
                    property.name = prop.expression.arguments[1].text;
                    const typeArgument = prop.expression.expression.arguments[0];
                    if (defineProperty(property, typeArgument)) {
                        currentStructure.addProperty(property);
                    }
                }
            }
            else if (node.getText() === "setFields" &&
                (node.parent.kind === ts__namespace.SyntaxKind.CallExpression ||
                    node.parent.kind === ts__namespace.SyntaxKind.PropertyAccessExpression)) {
                /**
                 * Metadata.setFields(klassName, { ... })
                 */
                const callExpression = (node.parent.kind === ts__namespace.SyntaxKind.PropertyAccessExpression)
                    ? node.parent.parent
                    : node.parent;
                /**
                 * Skip if @codegen-ignore comment is found before the call expression
                 * TODO: currently, if @codegen-ignore is on the file, it will skip all the setFields calls.
                 */
                const sourceFile = node.getSourceFile();
                const fullText = sourceFile.getFullText();
                const nodeStart = callExpression.getFullStart();
                const textBeforeNode = fullText.substring(0, nodeStart);
                if (textBeforeNode.includes('@codegen-ignore')) {
                    break;
                }
                if (callExpression.kind !== ts__namespace.SyntaxKind.CallExpression) {
                    break;
                }
                const classNameNode = callExpression.arguments[0];
                const className = ts__namespace.isClassExpression(classNameNode)
                    ? classNameNode.name?.escapedText.toString()
                    : classNameNode.getText();
                // skip if no className is provided
                if (!className) {
                    break;
                }
                if (currentStructure?.name !== className) {
                    currentStructure = new Class();
                }
                context.addStructure(currentStructure);
                currentStructure.extends = "Schema"; // force extends to Schema
                currentStructure.name = className;
                const types = callExpression.arguments[1];
                for (let i = 0; i < types.properties.length; i++) {
                    const prop = types.properties[i];
                    const property = currentProperty || new Property();
                    property.name = prop.name.escapedText;
                    if (defineProperty(property, prop.initializer)) {
                        currentStructure.addProperty(property);
                    }
                }
            }
            else if (node.getText() === "defineTypes" &&
                (node.parent.kind === ts__namespace.SyntaxKind.CallExpression ||
                    node.parent.kind === ts__namespace.SyntaxKind.PropertyAccessExpression)) {
                /**
                 * JavaScript source file (`.js`)
                 * Using `defineTypes()` (deprecated)
                 */
                const callExpression = (node.parent.kind === ts__namespace.SyntaxKind.PropertyAccessExpression)
                    ? node.parent.parent
                    : node.parent;
                if (callExpression.kind !== ts__namespace.SyntaxKind.CallExpression) {
                    break;
                }
                if (!defineTypesWarned) {
                    defineTypesWarned = true;
                    console.warn("schema-codegen: defineTypes() is deprecated and will be removed in a future release. Use schema() with t.* field builders instead → https://docs.colyseus.io/state/schema");
                }
                const className = callExpression.arguments[0].getText();
                currentStructure.name = className;
                const types = callExpression.arguments[1];
                for (let i = 0; i < types.properties.length; i++) {
                    const prop = types.properties[i];
                    const property = currentProperty || new Property();
                    property.name = prop.name.escapedText;
                    if (defineProperty(property, prop.initializer)) {
                        currentStructure.addProperty(property);
                    }
                }
            }
            if (node.parent.kind === ts__namespace.SyntaxKind.ClassDeclaration) {
                currentStructure.name = node.getText();
            }
            currentProperty = undefined;
            break;
        case ts__namespace.SyntaxKind.CallExpression:
            /**
             * Defining schema via:
             * - schema({ ... })
             * - schema({ ... }, 'Name')
             * - schema.schema({ ... }, 'Name')
             * - ParentClass.extend({ ... }, 'Name')
             */
            {
                const callExpression = node;
                const callee = callExpression.expression?.getText?.();
                if (!callee)
                    break;
                const isSchemaCall = callee === "schema" || callee === "schema.schema";
                const isExtendCall = callee.endsWith(".extend");
                if (!isSchemaCall && !isExtendCall)
                    break;
                // Signature: (fields, name?)
                const fieldsArg = callExpression.arguments[0];
                const nameArg = callExpression.arguments[1];
                if (!fieldsArg || fieldsArg.kind !== ts__namespace.SyntaxKind.ObjectLiteralExpression) {
                    break;
                }
                let className;
                if (nameArg) {
                    if (nameArg.kind === ts__namespace.SyntaxKind.StringLiteral) {
                        className = nameArg.text;
                    }
                    else {
                        className = nameArg.getText();
                    }
                }
                if (!className) {
                    // No explicit name arg — infer it from the variable the
                    // result is assigned to (`const Foo = schema({...})`).
                    let p = callExpression.parent;
                    while (p !== undefined && (p.kind === ts__namespace.SyntaxKind.PropertyAccessExpression ||
                        p.kind === ts__namespace.SyntaxKind.CallExpression)) {
                        p = p.parent;
                    }
                    if (p?.kind === ts__namespace.SyntaxKind.VariableDeclaration) {
                        className = p.name?.getText();
                    }
                }
                if (!className)
                    break;
                // Resolve the base class BEFORE registering a structure. A
                // chained `schema({...}).extend({...})` has a call expression
                // (not an identifier) as its `.extend` base, which can't be
                // statically named — bail here rather than leave a half-formed,
                // nameless Class in the context (which corrupts inheritance walks).
                let extendsClass = "Schema";
                if (isExtendCall) {
                    extendsClass = node.expression?.expression?.escapedText;
                    if (!extendsClass) {
                        console.warn(`schema-codegen: cannot resolve the base class of a chained .extend() for '${className}' — fields from that .extend({...}) are omitted.`);
                        break;
                    }
                }
                if (currentStructure?.name !== className) {
                    currentStructure = new Class();
                    context.addStructure(currentStructure);
                }
                currentStructure.extends = extendsClass;
                currentStructure.name = className;
                const types = fieldsArg;
                for (let i = 0; i < types.properties.length; i++) {
                    const prop = types.properties[i];
                    // Skip methods declared inside the fields object — the
                    // runtime gives no field index to any function value.
                    if (prop.kind === ts__namespace.SyntaxKind.MethodDeclaration)
                        continue;
                    if (!prop.initializer)
                        continue;
                    if (ts__namespace.isArrowFunction(prop.initializer) || ts__namespace.isFunctionExpression(prop.initializer))
                        continue;
                    // never inherit `currentProperty`: it's the decorator path's
                    // carry-over from a visited `deprecated` identifier, and a
                    // trailing `.deprecated()` chain can leave it set
                    const property = new Property();
                    property.name = prop.name.escapedText;
                    if (defineProperty(property, prop.initializer)) {
                        currentStructure.addProperty(property);
                    }
                }
            }
            break;
        case ts__namespace.SyntaxKind.EnumMember:
            if (currentStructure instanceof Enum) {
                const initializer = node.initializer?.text;
                const name = node.getFirstToken().getText();
                const property = currentProperty || new Property();
                property.name = name;
                if (initializer !== undefined) {
                    property.type = initializer;
                }
                currentStructure.addProperty(property);
                currentProperty = undefined;
            }
            break;
    }
    ts__namespace.forEachChild(node, (n) => inspectNode(n, context, decoratorName));
}
let parsedFiles;
/**
 * `options` is only honored for a top-level call (one passing a fresh
 * `Context`) — the recursive import walk reuses the run's resolver state.
 */
function parseFiles(fileNames, decoratorName = "type", context = new Context(), options) {
    if (typeof ts__namespace.createSourceFile !== "function") {
        // typescript@7+ (native) no longer ships the JS compiler API
        throw new Error(`schema-codegen requires the TypeScript compiler API, which the installed "typescript@${ts__namespace.version}" package does not provide.\n` +
            `TypeScript 7+ no longer ships the JS compiler API — install typescript 5.x or 6.x (e.g. \`npm install --save-dev typescript@6\`) to use schema-codegen.`);
    }
    /**
     * Re-set globalContext for each test case
     */
    if (globalContext !== context) {
        parsedFiles = {};
        globalContext = context;
        // a structure left over from a previous run would make the
        // `currentStructure?.name !== className` guard skip re-registering it
        currentStructure = undefined;
        currentProperty = undefined;
        resetResolver(options);
    }
    fileNames.forEach((fileName) => {
        let sourceFile;
        let sourceFileName;
        const fileNameAlternatives = sourceFileCandidates(fileName);
        for (let i = 0; i < fileNameAlternatives.length; i++) {
            try {
                sourceFileName = path__namespace.resolve(fileNameAlternatives[i]);
                if (parsedFiles[sourceFileName]) {
                    break;
                }
                sourceFile = ts__namespace.createSourceFile(sourceFileName, fs.readFileSync(sourceFileName).toString(), ts__namespace.ScriptTarget.Latest, true);
                parsedFiles[sourceFileName] = true;
                break;
            }
            catch (e) {
                // only swallow fs errors (ENOENT/EISDIR) while probing alternatives
                if (!e?.code) {
                    throw e;
                }
            }
        }
        if (sourceFile) {
            inspectNode(sourceFile, context, decoratorName);
        }
    });
    return context.getStructures();
}
/**
 * TypeScript 4.8+ has introduced a change on how to access decorators.
 * - https://github.com/microsoft/TypeScript/pull/49089
 * - https://devblogs.microsoft.com/typescript/announcing-typescript-4-8/#decorators-are-placed-on-modifiers-on-typescripts-syntax-trees
 */
function getDecorators(node) {
    if (node == undefined) {
        return undefined;
    }
    // TypeScript 4.7 and below
    // @ts-ignore
    if (node.decorators) {
        return node.decorators;
    }
    // TypeScript 4.8 and above
    // @ts-ignore
    if (ts__namespace.canHaveDecorators && ts__namespace.canHaveDecorators(node)) {
        // @ts-ignore
        const decorators = ts__namespace.getDecorators(node);
        return decorators ? Array.from(decorators) : undefined;
    }
    // @ts-ignore
    return node.modifiers?.filter(ts__namespace.isDecorator);
}

const name$a = "Unity/C#";
const typeMaps$a = {
    "string": "string",
    // JS numbers are float64, and the "number" codec may send them at full width
    "number": "double",
    "boolean": "bool",
    "int8": "sbyte",
    "uint8": "byte",
    "int16": "short",
    "uint16": "ushort",
    "int32": "int",
    "uint32": "uint",
    "int64": "long",
    "uint64": "ulong",
    // float32 only narrows the wire — in memory it's a double, as in JS
    "float32": "double",
    "float64": "double",
};
// SDK types are named through `global::` so that neither the user's namespace
// (`Game.Schema`, `Foo.Colyseus`) nor a generated class can shadow them.
const SDK = "global::Colyseus.Schema";
/**
 * C# reserved keywords — a field with one of these names is emitted
 * `@`-escaped (reflection still reports the bare name the decoder matches on).
 */
const KEYWORDS$1 = new Set([
    "abstract", "as", "base", "bool", "break", "byte", "case", "catch", "char",
    "checked", "class", "const", "continue", "decimal", "default", "delegate",
    "do", "double", "else", "enum", "event", "explicit", "extern", "false",
    "finally", "fixed", "float", "for", "foreach", "goto", "if", "implicit",
    "in", "int", "interface", "internal", "is", "lock", "long", "namespace",
    "new", "null", "object", "operator", "out", "override", "params", "private",
    "protected", "public", "readonly", "ref", "return", "sbyte", "sealed",
    "short", "sizeof", "stackalloc", "static", "string", "struct", "switch",
    "this", "throw", "true", "try", "typeof", "uint", "ulong", "unchecked",
    "unsafe", "ushort", "using", "virtual", "void", "volatile", "while",
]);
const identifier$1 = (name) => KEYWORDS$1.has(name) ? `@${name}` : name;
/**
 * C# Code Generator
 */
const capitalize$1 = (s) => {
    if (typeof s !== 'string')
        return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
};
/**
 * Generate individual files for each class/interface/enum
 */
function generate$b(context, options) {
    // enrich typeMaps with enums
    context.enums.forEach((structure) => {
        typeMaps$a[structure.name] = structure.name;
    });
    return [
        ...context.classes.map(structure => ({
            name: `${structure.name}.cs`,
            content: generateClass$9(structure, options.namespace)
        })),
        ...context.interfaces.map(structure => ({
            name: `${structure.name}.cs`,
            content: generateInterface$2(structure, options.namespace),
        })),
        ...context.enums.filter(structure => structure.name !== 'OPERATION').map((structure) => ({
            name: `${structure.name}.cs`,
            content: generateEnum$2(structure, options.namespace),
        })),
    ];
}
/**
 * Generate a single bundled file containing all classes, interfaces, and enums
 */
function renderBundle$a(context, options) {
    const fileName = options.namespace ? `${options.namespace}.cs` : "Schema.cs";
    const indent = options.namespace ? "\t" : "";
    // enrich typeMaps with enums
    context.enums.forEach((structure) => {
        typeMaps$a[structure.name] = structure.name;
    });
    // Collect all bodies
    const classBodies = context.classes.map(klass => generateClassBody$a(klass, indent));
    const interfaceBodies = context.interfaces.map(iface => generateInterfaceBody$3(iface, indent));
    const enumBodies = context.enums
        .filter(structure => structure.name !== 'OPERATION')
        .map(e => generateEnumBody$3(e, indent));
    const allBodies = [...classBodies, ...interfaceBodies, ...enumBodies].join("\n\n");
    const content = `${getCommentHeader()}
${options.namespace ? `\nnamespace ${options.namespace} {\n` : ""}
${allBodies}
${options.namespace ? "}" : ""}`;
    return { name: fileName, content };
}
/**
 * Generate just the class body (without namespace) for bundling
 */
function generateClassBody$a(klass, indent = "") {
    const base = (klass.extends === "Schema") ? `${SDK}.Schema` : klass.extends;
    return `${indent}public partial class ${klass.name} : ${base} {
#if UNITY_5_3_OR_NEWER
${indent}\t[global::UnityEngine.Scripting.Preserve]
#endif
${indent}\tpublic ${klass.name}() { }
${klass.properties.map((prop) => "\n" + generateProperty$5(prop, indent)).join("\n")}
${indent}}`;
}
/**
 * Generate a complete class file with namespace (for individual file mode)
 */
function generateClass$9(klass, namespace) {
    const indent = (namespace) ? "\t" : "";
    return `${getCommentHeader()}
${namespace ? `\nnamespace ${namespace} {` : ""}
${generateClassBody$a(klass, indent)}
${namespace ? "}" : ""}
`;
}
/**
 * Check if all enum members resolve to non-negative integers,
 * allowing emission as a native C# `enum` (which only supports integral types).
 */
function canUseNativeEnum(_enum) {
    return _enum.properties.every((prop) => {
        if (!prop.type)
            return true;
        const n = Number(prop.type);
        return Number.isInteger(n) && n >= 0;
    });
}
/**
 * Generate just the enum body (without imports/namespace) for bundling
 */
function generateEnumBody$3(_enum, indent = "") {
    if (canUseNativeEnum(_enum)) {
        const members = _enum.properties
            .map((prop, i) => {
            const value = prop.type ? Number(prop.type) : i;
            return `${indent}\t${identifier$1(prop.name)} = ${value},`;
        })
            .join("\n");
        return `${indent}public enum ${_enum.name} : int {
${members}
${indent}}`;
    }
    return `${indent}public struct ${_enum.name} {

${_enum.properties
        .map((prop) => {
        let dataType = "int";
        let value;
        if (prop.type) {
            if (isNaN(Number(prop.type))) {
                value = `"${prop.type}"`;
                dataType = "string";
            }
            else {
                value = Number(prop.type);
                dataType = Number.isInteger(value) ? 'int' : 'float';
            }
        }
        else {
            value = _enum.properties.indexOf(prop);
        }
        return `${indent}\tpublic const ${dataType} ${identifier$1(prop.name)} = ${value};`;
    })
        .join("\n")}
${indent}}`;
}
/**
 * Generate a complete enum file with imports/namespace (for individual file mode)
 */
function generateEnum$2(_enum, namespace) {
    const indent = namespace ? "\t" : "";
    return `${getCommentHeader()}
${namespace ? `\nnamespace ${namespace} {` : ""}
${generateEnumBody$3(_enum, indent)}
${namespace ? "}" : ""}`;
}
function generateProperty$5(prop, indent = "") {
    let typeArgs = `"${prop.type}"`;
    let langType;
    let initializer;
    if (prop.quantized) {
        const q = prop.quantized;
        typeArgs += `, QuantizeMin = ${q.min}, QuantizeMax = ${q.max}, QuantizeBits = ${q.bits}, QuantizeWrap = ${q.wrap}`;
        langType = "double";
        initializer = defaultLiteral$1(prop.defaultValue, langType) ?? "default(double)";
    }
    else if (prop.childType) {
        const isUpcaseFirst = prop.childType.match(/^[A-Z]/);
        langType = getType(prop);
        typeArgs += `, typeof(${langType})`;
        if (!isUpcaseFirst) {
            typeArgs += `, "${prop.childType}"`;
        }
        // collections start empty, as on a JS schema() instance; a child
        // schema stays null until the server sends it
        initializer = (prop.type === "ref") ? "null" : `new ${langType}()`;
    }
    else {
        langType = getType(prop);
        initializer = defaultLiteral$1(prop.defaultValue, langType) ?? `default(${langType})`;
    }
    const obsolete = (prop.deprecated)
        ? `\t${indent}[global::System.Obsolete("field '${prop.name}' is deprecated.", true)]\n`
        : "";
    return `${obsolete}\t${indent}[${SDK}.Type(${prop.index}, ${typeArgs})]
\t${indent}public ${langType} ${identifier$1(prop.name)} = ${initializer};`;
}
const INTEGER_RANGES = {
    "sbyte": [-128, 127],
    "byte": [0, 255],
    "short": [-32768, 32767],
    "ushort": [0, 65535],
    "int": [-2147483648, 2147483647],
    "uint": [0, 4294967295],
    "long": [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    "ulong": [0, Number.MAX_SAFE_INTEGER],
};
// JSON escapes are valid C#, but C# also ends a line at NEL, LS and PS
const CSHARP_LINE_BREAKS = new RegExp(`[${String.fromCharCode(0x85, 0x2028, 0x2029)}]`, "g");
/**
 * A field's statically-known default as a C# literal of `langType`, or
 * undefined when it has none that compiles to the same value.
 */
function defaultLiteral$1(value, langType) {
    if (typeof value === "boolean") {
        return (langType === "bool") ? String(value) : undefined;
    }
    if (typeof value === "string") {
        return (langType === "string")
            ? JSON.stringify(value).replace(CSHARP_LINE_BREAKS, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`)
            : undefined;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return undefined;
    }
    if (langType === "double") {
        return String(value);
    }
    const range = INTEGER_RANGES[langType];
    return (range && Number.isInteger(value) && value >= range[0] && value <= range[1])
        ? String(value)
        : undefined;
}
/**
 * Generate just the interface body (without imports/namespace) for bundling
 */
function generateInterfaceBody$3(struct, indent = "") {
    return `${indent}public class ${struct.name} {
${struct.properties.map(prop => `\t${indent}public ${getInterfaceType$3(prop)} ${identifier$1(prop.name)};`).join("\n")}
${indent}}`;
}
/**
 * Generate a complete interface file with namespace (for individual file mode)
 */
function generateInterface$2(struct, namespace) {
    const indent = (namespace) ? "\t" : "";
    return `${getCommentHeader()}
${namespace ? `\nnamespace ${namespace} {` : ""}
${generateInterfaceBody$3(struct, indent)}
${namespace ? "}" : ""}
`;
}
function getChildType(prop) {
    return typeMaps$a[prop.childType];
}
function getType(prop) {
    if (prop.childType) {
        const isUpcaseFirst = prop.childType.match(/^[A-Z]/);
        let type;
        if (prop.type === "ref") {
            type = (isUpcaseFirst)
                ? prop.childType
                : getChildType(prop);
        }
        else {
            const containerClass = `${SDK}.${capitalize$1(prop.type)}Schema`;
            type = (isUpcaseFirst)
                ? `${containerClass}<${prop.childType}>`
                : `${containerClass}<${getChildType(prop)}>`;
        }
        return type;
    }
    else {
        return typeMaps$a[prop.type];
    }
}
// messages arrive as msgpack, so collections are plain C# ones rather than ArraySchema/MapSchema
function getInterfaceType$3(prop) {
    const child = typeMaps$a[prop.childType] ?? prop.childType;
    switch (prop.type) {
        case "array": return `${child}[]`;
        case "map": return `global::System.Collections.Generic.Dictionary<string, ${child}>`;
        default: return typeMaps$a[prop.type] ?? prop.type;
    }
}

var csharp = /*#__PURE__*/Object.freeze({
    __proto__: null,
    generate: generate$b,
    name: name$a,
    renderBundle: renderBundle$a
});

const name$9 = "C++";
const typeMaps$9 = {
    "string": "string",
    "number": "varint_t",
    "boolean": "bool",
    "int8": "int8_t",
    "uint8": "uint8_t",
    "int16": "int16_t",
    "uint16": "uint16_t",
    "int32": "int32_t",
    "uint32": "uint32_t",
    "int64": "int64_t",
    "uint64": "uint64_t",
    "float32": "float32_t",
    "float64": "float64_t",
};
const typeInitializer$1 = {
    "string": '""',
    "number": "0",
    "boolean": "false",
    "int8": "0",
    "uint8": "0",
    "int16": "0",
    "uint16": "0",
    "int32": "0",
    "uint32": "0",
    "int64": "0",
    "uint64": "0",
    "float32": "0",
    "float64": "0",
};
const COMMON_INCLUDES$1 = `#include "schema.h"
#include <typeinfo>
#include <typeindex>

using namespace colyseus::schema;`;
/**
 * C++ Code Generator
 */
const capitalize = (s) => {
    if (typeof s !== 'string')
        return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
};
const distinct$6 = (value, index, self) => self.indexOf(value) === index;
/**
 * Generate individual files for each class
 */
function generate$a(context, options) {
    return context.classes.map(klass => ({
        name: klass.name + ".hpp",
        content: generateClass$8(klass, options.namespace, context.classes)
    }));
}
/**
 * Generate a single bundled header file containing all classes
 */
function renderBundle$9(context, options) {
    const fileName = options.namespace ? `${options.namespace}.hpp` : "schema.hpp";
    const guardName = `__SCHEMA_CODEGEN_${(options.namespace || "SCHEMA").toUpperCase()}_H__`;
    const classBodies = context.classes.map(klass => generateClassBody$9(klass, context.classes, options.namespace));
    const content = `${getCommentHeader()}
#ifndef ${guardName}
#define ${guardName} 1

${COMMON_INCLUDES$1}

${options.namespace ? `namespace ${options.namespace} {\n` : ""}
${classBodies.join("\n\n")}
${options.namespace ? "}" : ""}

#endif
`;
    return { name: fileName, content };
}
/**
 * Generate just the class body (without includes/guards) for bundling
 */
function generateClassBody$9(klass, allClasses, namespace) {
    const propertiesPerType = {};
    const allRefs = [];
    klass.properties.forEach(property => {
        let type = property.type;
        if (!propertiesPerType[type]) {
            propertiesPerType[type] = [];
        }
        propertiesPerType[type].push(property);
        // keep all refs list
        if ((type === "ref" || type === "array" || type === "map")) {
            allRefs.push(property);
        }
    });
    const allProperties = getAllProperties$1(klass, allClasses);
    const createInstanceMethod = (allRefs.length === 0) ? "" :
        `\tinline Schema* createInstance(std::type_index type) {
\t\t${generateFieldIfElseChain(allRefs, (property) => `type == typeid(${property.childType})`, (property) => `return new ${property.childType}();`, (property) => typeMaps$9[property.childType] === undefined)}
\t\treturn ${klass.extends}::createInstance(type);
\t}`;
    return `class ${klass.name} : public ${klass.extends} {
public:
${klass.properties.map(prop => generateProperty$4(prop)).join("\n")}

\t${klass.name}() {
\t\tthis->_indexes = ${generateAllIndexes(allProperties)};
\t\tthis->_types = ${generateAllTypes(allProperties)};
\t\tthis->_childPrimitiveTypes = ${generateAllChildPrimitiveTypes(allProperties)};
\t\tthis->_childSchemaTypes = ${generateAllChildSchemaTypes(allProperties)};
\t}

\tvirtual ~${klass.name}() {
\t\t${generateDestructors(allProperties).join("\n\t\t")}
\t}

protected:
${Object.keys(propertiesPerType).map(type => generateGettersAndSetters(klass, type, propertiesPerType[type])).
        join("\n")}

${createInstanceMethod}
};`;
}
/**
 * Generate a complete class file with includes/guards (for individual file mode)
 */
function generateClass$8(klass, namespace, allClasses) {
    const allRefs = [];
    klass.properties.forEach(property => {
        let type = property.type;
        // keep all refs list
        if ((type === "ref" || type === "array" || type === "map")) {
            allRefs.push(property);
        }
    });
    const localIncludes = allRefs.
        filter(ref => ref.childType && typeMaps$9[ref.childType] === undefined).
        map(ref => ref.childType).
        concat(getInheritanceTree(klass, allClasses, false).map(klass => klass.name)).
        filter(distinct$6).
        map(childType => `#include "${childType}.hpp"`).
        join("\n");
    return `${getCommentHeader()}
#ifndef __SCHEMA_CODEGEN_${klass.name.toUpperCase()}_H__
#define __SCHEMA_CODEGEN_${klass.name.toUpperCase()}_H__ 1

${COMMON_INCLUDES$1}
${localIncludes}

${namespace ? `namespace ${namespace} {` : ""}
${generateClassBody$9(klass, allClasses)}
${namespace ? "}" : ""}

#endif
`;
}
function generateProperty$4(prop) {
    let property = "";
    let langType;
    let initializer = "";
    let isPropPointer = "";
    if (prop.childType) {
        const isUpcaseFirst = prop.childType.match(/^[A-Z]/);
        if (prop.type === "ref") {
            langType = `${prop.childType}`;
            initializer = `new ${prop.childType}()`;
        }
        else if (prop.type === "array") {
            langType = (isUpcaseFirst)
                ? `ArraySchema<${prop.childType}*>`
                : `ArraySchema<${typeMaps$9[prop.childType]}>`;
            initializer = `new ${langType}()`;
        }
        else if (prop.type === "map") {
            langType = (isUpcaseFirst)
                ? `MapSchema<${prop.childType}*>`
                : `MapSchema<${typeMaps$9[prop.childType]}>`;
            initializer = `new ${langType}()`;
        }
        isPropPointer = "*";
    }
    else {
        langType = typeMaps$9[prop.type];
        initializer = typeInitializer$1[prop.type];
    }
    property += ` ${langType} ${isPropPointer}${prop.name}`;
    return `\t${property} = ${initializer};`;
}
function generateGettersAndSetters(klass, type, properties) {
    let langType = typeMaps$9[type];
    let typeCast = "";
    const getMethodName = `get${capitalize(type)}`;
    const setMethodName = `set${capitalize(type)}`;
    if (type === "ref") {
        langType = "Schema*";
    }
    else if (type === "array") {
        langType = `ArraySchema<char*> *`;
        typeCast = `(ArraySchema<char*> *)`;
    }
    else if (type === "map") {
        langType = `MapSchema<char*> *`;
        typeCast = `(MapSchema<char*> *)`;
    }
    return `\tinline ${langType} ${getMethodName}(const string &field)
\t{
\t\t${generateFieldIfElseChain(properties, (property) => `field == "${property.name}"`, (property) => `return ${typeCast}this->${property.name};`)}
\t\treturn ${klass.extends}::${getMethodName}(field);
\t}

\tinline void ${setMethodName}(const string &field, ${langType} value)
\t{
\t\t${generateFieldIfElseChain(properties, (property) => `field == "${property.name}"`, (property) => {
        const isSchemaType = (typeMaps$9[property.childType] === undefined);
        if (type === "ref") {
            langType = `${property.childType}*`;
            typeCast = (isSchemaType)
                ? `(${property.childType}*)`
                : `/* bug? */`;
        }
        else if (type === "array") {
            typeCast = (isSchemaType)
                ? `(ArraySchema<${property.childType}*> *)`
                : `(ArraySchema<${typeMaps$9[property.childType]}> *)`;
        }
        else if (type === "map") {
            typeCast = (isSchemaType)
                ? `(MapSchema<${property.childType}*> *)`
                : `(MapSchema<${typeMaps$9[property.childType]}> *)`;
        }
        return `this->${property.name} = ${typeCast}value;\n\t\t\treturn;`;
    })}
\t\treturn ${klass.extends}::${setMethodName}(field, value);
\t}`;
}
function generateFieldIfElseChain(properties, ifCallback, callback, filter = (_) => true) {
    let chain = "";
    const uniqueChecks = [];
    properties.filter(filter).forEach((property, i) => {
        const check = ifCallback(property);
        if (uniqueChecks.indexOf(check) === -1) {
            uniqueChecks.push(check);
        }
        else {
            return;
        }
        if (i === 0) {
            chain += "if ";
        }
        else {
            chain += " else if ";
        }
        chain += `(${check})
\t\t{
\t\t\t${callback(property)}\n
\t\t}`;
    });
    return chain;
}
function generateAllIndexes(properties) {
    return `{${properties.map((property, i) => `{${i}, "${property.name}"}`).join(", ")}}`;
}
function generateAllTypes(properties) {
    return `{${properties.map((property, i) => `{${i}, "${property.type}"}`).join(", ")}}`;
}
function generateAllChildSchemaTypes(properties) {
    return `{${properties.map((property, i) => {
        if (property.childType && typeMaps$9[property.childType] === undefined) {
            return `{${i}, typeid(${property.childType})}`;
        }
        else {
            return null;
        }
    }).filter(r => r !== null).join(", ")}}`;
}
function generateAllChildPrimitiveTypes(properties) {
    return `{${properties.map((property, i) => {
        if (typeMaps$9[property.childType] !== undefined) {
            return `{${i}, "${property.childType}"}`;
        }
        else {
            return null;
        }
    }).filter(r => r !== null).join(", ")}}`;
}
function generateDestructors(properties) {
    return properties.map((property, i) => {
        if (property.childType) {
            return `delete this->${property.name};`;
        }
        else {
            return null;
        }
    }).filter(r => r !== null);
}
function getAllProperties$1(klass, allClasses) {
    let properties = [];
    getInheritanceTree(klass, allClasses).reverse().forEach((klass) => {
        properties = properties.concat(klass.properties);
    });
    return properties;
}

var cpp = /*#__PURE__*/Object.freeze({
    __proto__: null,
    generate: generate$a,
    name: name$9,
    renderBundle: renderBundle$9
});

const name$8 = "Haxe";
/**
 * Field types follow what the Haxe SDK's decoder hands back: `number` arrives
 * as an Int or a Float, so it is a `Float`; integers up to 32 bits are `Int`
 * (signed arithmetic, like the number the server holds — a `uint32` above
 * 2^31 reads negative); 64-bit integers decode as `haxe.Int64`.
 */
const typeMaps$8 = {
    "string": "String",
    "number": "Float",
    "boolean": "Bool",
    "int8": "Int",
    "uint8": "Int",
    "int16": "Int",
    "uint16": "Int",
    "int32": "Int",
    "uint32": "Int",
    "int64": "haxe.Int64",
    "uint64": "haxe.Int64",
    "float32": "Float",
    "float64": "Float",
};
/** The value a field without a `.default()` starts at. */
const zeroOf = (langType) => (langType === "String") ? '""' : (langType === "Bool") ? "false" : "0";
/**
 * Haxe reserved words. A field named after one is emitted with a trailing
 * underscore — the SDK matches fields by index on the wire, never by name.
 */
const KEYWORDS = new Set([
    "abstract", "break", "case", "cast", "catch", "class", "continue", "default",
    "do", "dynamic", "else", "enum", "extends", "extern", "false", "final", "for",
    "function", "if", "implements", "import", "in", "inline", "interface", "macro",
    "new", "null", "operator", "overload", "override", "package", "private",
    "public", "return", "static", "switch", "this", "throw", "true", "try",
    "typedef", "untyped", "using", "var", "while",
]);
const identifier = (name) => KEYWORDS.has(name) ? `${name}_` : name;
const COMMON_IMPORTS$6 = `import io.colyseus.serializer.schema.Schema;
import io.colyseus.serializer.schema.types.*;`;
/**
 * Generate individual files for each class
 */
function generate$9(context, options) {
    return context.classes.map(klass => ({
        name: klass.name + ".hx",
        content: generateClass$7(klass, options.namespace, context.classes)
    }));
}
/**
 * Generate a single bundled file containing all classes
 */
function renderBundle$8(context, options) {
    const fileName = options.namespace ? `${options.namespace}.hx` : "Schema.hx";
    const classBodies = context.classes.map(klass => generateClassBody$8(klass));
    const content = `${getCommentHeader()}

${options.namespace ? `package ${options.namespace};` : ""}
${COMMON_IMPORTS$6}

${classBodies.join("\n\n")}
`;
    return { name: fileName, content };
}
/**
 * Generate just the class body (without package/imports) for bundling
 */
function generateClassBody$8(klass) {
    return `class ${klass.name} extends ${klass.extends} {
${klass.properties.map(prop => generateProperty$3(prop)).join("\n")}
}`;
}
/**
 * Generate a complete class file with package/imports (for individual file mode)
 */
function generateClass$7(klass, namespace, allClasses) {
    return `${getCommentHeader()}

${namespace ? `package ${namespace};` : ""}
${COMMON_IMPORTS$6}

${generateClassBody$8(klass)}
`;
}
function generateProperty$3(prop) {
    let langType;
    let initializer = "";
    let typeArgs = `"${prop.type}"`;
    if (prop.quantized) {
        const q = prop.quantized;
        typeArgs += `, {min: ${q.min}, max: ${q.max}, bits: ${q.bits}, mode: ${q.wrap ? 1 : 0}}`;
        langType = "Float";
    }
    else if (prop.childType) {
        const isUpcaseFirst = prop.childType.match(/^[A-Z]/);
        if (isUpcaseFirst) {
            typeArgs += `, ${prop.childType}`;
        }
        else {
            typeArgs += `, "${prop.childType}"`;
        }
        if (prop.type === "ref") {
            langType = `${prop.childType}`;
            initializer = `new ${prop.childType}()`;
        }
        else if (prop.type === "array") {
            langType = (isUpcaseFirst)
                ? `ArraySchema<${prop.childType}>`
                : `ArraySchema<${typeMaps$8[prop.childType]}>`;
            initializer = `new ${langType}()`;
        }
        else if (prop.type === "map") {
            langType = (isUpcaseFirst)
                ? `MapSchema<${prop.childType}>`
                : `MapSchema<${typeMaps$8[prop.childType]}>`;
            initializer = `new ${langType}()`;
        }
    }
    else {
        langType = typeMaps$8[prop.type];
    }
    // collections and refs are constructed above; scalars start at their default
    if (!initializer) {
        initializer = defaultLiteral(prop.defaultValue, langType) ?? zeroOf(langType);
    }
    const name = identifier(prop.name);
    const wireName = (name !== prop.name) ? `\t// "${prop.name}" on the wire (a Haxe keyword)\n` : "";
    return `${wireName}\t@:type(${typeArgs})\n\tpublic var ${name}: ${langType} = ${initializer};\n`;
}
/**
 * A field's statically-known default as a Haxe literal of `langType`, or
 * undefined when there is none (or it doesn't fit the type).
 */
function defaultLiteral(value, langType) {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value === "boolean") {
        return (langType === "Bool") ? String(value) : undefined;
    }
    if (typeof value === "string") {
        return (langType === "String") ? haxeString(value) : undefined;
    }
    if (langType === "Float") {
        if (Number.isNaN(value)) {
            return "Math.NaN";
        }
        if (!Number.isFinite(value)) {
            return (value > 0) ? "Math.POSITIVE_INFINITY" : "Math.NEGATIVE_INFINITY";
        }
        return String(value);
    }
    if (!Number.isInteger(value)) {
        return undefined;
    }
    if (langType === "Int") {
        return String(value);
    }
    if (langType === "haxe.Int64") {
        return (Math.abs(value) <= 0x7fffffff) ? String(value) : `haxe.Int64.fromFloat(${value})`;
    }
    return undefined;
}
/**
 * A double-quoted Haxe string literal (double quotes never interpolate `$`):
 * JSON's escapes, except `\b` and `\f`, which Haxe lacks. Escapes are matched
 * in pairs so an escaped backslash followed by `b` stays as it is.
 */
const haxeString = (value) => JSON.stringify(value).replace(/\\(.)/g, (escape, ch) => (ch === "b") ? "\\x08" : (ch === "f") ? "\\x0c" : escape);

var haxe = /*#__PURE__*/Object.freeze({
    __proto__: null,
    generate: generate$9,
    name: name$8,
    renderBundle: renderBundle$8
});

const name$7 = "TypeScript";
const typeMaps$7 = {
    "string": "string",
    "number": "number",
    "boolean": "boolean",
    "int8": "number",
    "uint8": "number",
    "int16": "number",
    "uint16": "number",
    "int32": "number",
    "uint32": "number",
    "int64": "number",
    "uint64": "number",
    "float32": "number",
    "float64": "number",
};
const COMMON_IMPORTS$5 = `import { Schema, type, ArraySchema, MapSchema, SetSchema, DataChange } from '@colyseus/schema';`;
const distinct$5 = (value, index, self) => self.indexOf(value) === index;
/**
 * Generate individual files for each class/interface
 */
function generate$8(context, options) {
    return [
        ...context.classes.map(structure => ({
            name: structure.name + ".ts",
            content: generateClass$6(structure, options.namespace, context.classes)
        })),
        ...context.interfaces.map(structure => ({
            name: structure.name + ".ts",
            content: generateInterface$1(structure, options.namespace, context.classes),
        }))
    ];
}
/**
 * Generate a single bundled file containing all classes and interfaces
 */
function renderBundle$7(context, options) {
    const fileName = options.namespace ? `${options.namespace}.ts` : "schema.ts";
    // Collect all class bodies
    const classBodies = context.classes.map(klass => generateClassBody$7(klass));
    // Collect all interface bodies
    const interfaceBodies = context.interfaces.map(iface => generateInterfaceBody$2(iface));
    const content = `${getCommentHeader()}

${COMMON_IMPORTS$5}

${classBodies.join("\n\n")}
${interfaceBodies.length > 0 ? "\n" + interfaceBodies.join("\n\n") : ""}`;
    return { name: fileName, content };
}
/**
 * Generate just the class body (without imports) for bundling
 */
function generateClassBody$7(klass) {
    return `export class ${klass.name} extends ${klass.extends} {
${klass.properties.map(prop => `    ${generateProperty$2(prop)}`).join("\n")}
}`;
}
/**
 * Generate just the interface body (without imports) for bundling
 */
function generateInterfaceBody$2(iface) {
    return `export interface ${iface.name} {
${iface.properties.map(prop => `    ${prop.name}: ${getInterfaceType$2(prop)};`).join("\n")}
}`;
}
// Array<T> rather than T[], which would need parentheses around a union element.
// Maps are Record<string, V>: msgpack keys arrive as strings, and a Map arrives as a plain object.
function getInterfaceType$2(prop) {
    switch (prop.type) {
        case "array": return `Array<${prop.childType}>`;
        case "map": return `Record<string, ${prop.childType}>`;
        default: return prop.type;
    }
}
/**
 * Generate a complete class file with imports (for individual file mode)
 */
function generateClass$6(klass, namespace, allClasses) {
    const allRefs = [];
    klass.properties.forEach(property => {
        let type = property.type;
        // keep all refs list
        if ((type === "ref" || type === "array" || type === "map" || type === "set")) {
            allRefs.push(property);
        }
    });
    const localImports = allRefs.
        filter(ref => ref.childType && typeMaps$7[ref.childType] === undefined).
        map(ref => ref.childType).
        concat(getInheritanceTree(klass, allClasses, false).map(klass => klass.name)).
        filter(distinct$5).
        map(childType => `import { ${childType} } from './${childType}'`).
        join("\n");
    return `${getCommentHeader()}

${COMMON_IMPORTS$5}
${localImports}

${generateClassBody$7(klass)}
`;
}
function generateProperty$2(prop) {
    let langType;
    let initializer = "";
    let typeArgs;
    if (prop.childType) {
        const isUpcaseFirst = prop.childType.match(/^[A-Z]/);
        if (isUpcaseFirst) {
            typeArgs += `, ${prop.childType}`;
        }
        else {
            typeArgs += `, "${prop.childType}"`;
        }
        if (prop.type === "ref") {
            langType = `${prop.childType}`;
            initializer = `new ${prop.childType}()`;
            typeArgs = `${prop.childType}`;
        }
        else if (prop.type === "array") {
            langType = (isUpcaseFirst)
                ? `ArraySchema<${prop.childType}>`
                : `ArraySchema<${typeMaps$7[prop.childType]}>`;
            initializer = `new ${langType}()`;
            typeArgs = (isUpcaseFirst)
                ? `[ ${prop.childType} ]`
                : `[ "${prop.childType}" ]`;
        }
        else if (prop.type === "map") {
            langType = (isUpcaseFirst)
                ? `MapSchema<${prop.childType}>`
                : `MapSchema<${typeMaps$7[prop.childType]}>`;
            initializer = `new ${langType}()`;
            typeArgs = (isUpcaseFirst)
                ? `{ map: ${prop.childType} }`
                : `{ map: "${prop.childType}" }`;
        }
        else if (prop.type === "set") {
            langType = (isUpcaseFirst)
                ? `SetSchema<${prop.childType}>`
                : `SetSchema<${typeMaps$7[prop.childType]}>`;
            initializer = `new ${langType}()`;
            typeArgs = (isUpcaseFirst)
                ? `{ set: ${prop.childType} }`
                : `{ set: "${prop.childType}" }`;
        }
    }
    else if (prop.quantized) {
        const q = prop.quantized;
        langType = "number";
        typeArgs = `{ quantized: { min: ${q.min}, max: ${q.max}, bits: ${q.bits}${q.wrap ? `, mode: "wrap"` : ""} } }`;
    }
    else {
        langType = typeMaps$7[prop.type];
        typeArgs = `"${prop.type}"`;
    }
    // TS1263: "Declarations with initializers cannot also have definite assignment assertions"
    const definiteAssertion = initializer ? "" : "!";
    return `@type(${typeArgs}) public ${prop.name}${definiteAssertion}: ${langType}${(initializer) ? ` = ${initializer}` : ""};`;
}
/**
 * Generate a complete interface file with header (for individual file mode)
 */
function generateInterface$1(structure, namespace, allClasses) {
    return `${getCommentHeader()}

${generateInterfaceBody$2(structure)}
`;
}

var ts = /*#__PURE__*/Object.freeze({
    __proto__: null,
    generate: generate$8,
    name: name$7,
    renderBundle: renderBundle$7
});

const name$6 = "JavaScript";
const typeMaps$6 = {
    "string": "string",
    "number": "number",
    "boolean": "boolean",
    "int8": "number",
    "uint8": "number",
    "int16": "number",
    "uint16": "number",
    "int32": "number",
    "uint32": "number",
    "int64": "number",
    "uint64": "number",
    "float32": "number",
    "float64": "number",
};
const COMMON_IMPORTS$4 = `const schema = require("@colyseus/schema");
const Schema = schema.Schema;
const type = schema.type;`;
const distinct$4 = (value, index, self) => self.indexOf(value) === index;
/**
 * Generate individual files for each class
 */
function generate$7(context, options) {
    return context.classes.map(klass => ({
        name: klass.name + ".js",
        content: generateClass$5(klass, options.namespace, context.classes)
    }));
}
/**
 * Generate a single bundled file containing all classes
 */
function renderBundle$6(context, options) {
    const fileName = options.namespace ? `${options.namespace}.js` : "schema.js";
    const classBodies = context.classes.map(klass => generateClassBody$6(klass));
    const classExports = context.classes.map(klass => `    ${klass.name},`).join("\n");
    const content = `${getCommentHeader()}

${COMMON_IMPORTS$4}

${classBodies.join("\n\n")}

module.exports = {
${classExports}
};
`;
    return { name: fileName, content };
}
/**
 * Generate just the class body (without imports) for bundling
 */
function generateClassBody$6(klass) {
    return `class ${klass.name} extends ${klass.extends} {
    constructor () {
        super();
${klass.properties.
        filter(prop => prop.childType !== undefined).
        map(prop => "        " + generatePropertyInitializer(prop)).join("\n")}
    }
}
${klass.properties.map(prop => generatePropertyDeclaration$1(klass.name, prop)).join("\n")}`;
}
/**
 * Generate a complete class file with imports (for individual file mode)
 */
function generateClass$5(klass, namespace, allClasses) {
    const allRefs = [];
    klass.properties.forEach(property => {
        let type = property.type;
        // keep all refs list
        if ((type === "ref" || type === "array" || type === "map")) {
            allRefs.push(property);
        }
    });
    const localImports = allRefs.
        filter(ref => ref.childType && typeMaps$6[ref.childType] === undefined).
        map(ref => ref.childType).
        concat(getInheritanceTree(klass, allClasses, false).map(klass => klass.name)).
        filter(distinct$4).
        map(childType => `const ${childType} = require("./${childType}");`).
        join("\n");
    return `${getCommentHeader()}

${COMMON_IMPORTS$4}
${localImports}

${generateClassBody$6(klass)}

export default ${klass.name};
`;
}
function generatePropertyDeclaration$1(className, prop) {
    let typeArgs;
    if (prop.childType) {
        const isUpcaseFirst = prop.childType.match(/^[A-Z]/);
        if (isUpcaseFirst) {
            typeArgs += `, ${prop.childType}`;
        }
        else {
            typeArgs += `, "${prop.childType}"`;
        }
        if (prop.type === "ref") {
            typeArgs = `${prop.childType}`;
        }
        else if (prop.type === "array") {
            typeArgs = (isUpcaseFirst)
                ? `[ ${prop.childType} ]`
                : `[ "${prop.childType}" ]`;
        }
        else if (prop.type === "map") {
            typeArgs = (isUpcaseFirst)
                ? `{ map: ${prop.childType} }`
                : `{ map: "${prop.childType}" }`;
        }
    }
    else {
        typeArgs = `"${prop.type}"`;
    }
    return `type(${typeArgs})(${className}.prototype, "${prop.name}");`;
}
function generatePropertyInitializer(prop) {
    let initializer = "";
    if (prop.type === "ref") {
        initializer = `new ${prop.childType}()`;
    }
    else if (prop.type === "array") {
        initializer = `new schema.ArraySchema()`;
    }
    else if (prop.type === "map") {
        initializer = `new schema.MapSchema()`;
    }
    return `this.${prop.name} = ${initializer}`;
}

var js = /*#__PURE__*/Object.freeze({
    __proto__: null,
    generate: generate$7,
    name: name$6,
    renderBundle: renderBundle$6
});

const name$5 = "Java";
const typeMaps$5 = {
    "string": "String",
    "number": "float",
    "boolean": "boolean",
    "int8": "byte",
    "uint8": "short",
    "int16": "short",
    "uint16": "int",
    "int32": "int",
    "uint32": "long",
    "int64": "long",
    "uint64": "long",
    "float32": "float",
    "float64": "double",
};
const typeInitializer = {
    "string": '""',
    "number": "0",
    "boolean": "false",
    "int8": "0",
    "uint8": "0",
    "int16": "0",
    "uint16": "0",
    "int32": "0",
    "uint32": "0",
    "int64": "0",
    "uint64": "0",
    "float32": "0",
    "float64": "0",
};
const COMMON_IMPORTS$3 = `import io.colyseus.serializer.schema.Schema;
import io.colyseus.serializer.schema.annotations.SchemaClass;
import io.colyseus.serializer.schema.annotations.SchemaField;`;
/**
 * Java Code Generator
 */
/**
 * Generate individual files for each class
 */
function generate$6(context, options) {
    return context.classes.map(klass => ({
        name: klass.name + ".java",
        content: generateClass$4(klass, options.namespace)
    }));
}
/**
 * Generate a single bundled file containing all classes
 * Note: Java typically requires one public class per file, so bundled mode
 * generates all classes in a single file with package-private visibility
 */
function renderBundle$5(context, options) {
    const fileName = options.namespace ? `Schema.java` : "Schema.java";
    const classBodies = context.classes.map(klass => generateClassBody$5(klass));
    const content = `${getCommentHeader()}
${options.namespace ? `\npackage ${options.namespace};` : ""}

${COMMON_IMPORTS$3}

${classBodies.join("\n\n")}
`;
    return { name: fileName, content };
}
/**
 * Generate just the class body (without package/imports) for bundling
 */
function generateClassBody$5(klass) {
    return `@SchemaClass
class ${klass.name} extends ${klass.extends} {
${klass.properties.map(prop => generateProperty$1(prop, "")).join("\n\n")}
}`;
}
/**
 * Generate a complete class file with package/imports (for individual file mode)
 */
function generateClass$4(klass, namespace) {
    const indent = (namespace) ? "\t" : "";
    return `${getCommentHeader()}
${namespace ? `\npackage ${namespace};` : ""}

${COMMON_IMPORTS$3}

@SchemaClass
${indent}public class ${klass.name} extends ${klass.extends} {
${klass.properties.map(prop => generateProperty$1(prop, indent)).join("\n\n")}
${indent}}
${namespace ? "}" : ""}
`;
}
function generateProperty$1(prop, indent = "") {
    let typeArgs = `${prop.index}/${prop.type}`;
    let property = "public";
    let langType;
    let ctorArgs = "";
    let initializer = "";
    if (prop.childType) {
        const isUpcaseFirst = prop.childType.match(/^[A-Z]/);
        if (prop.type !== "ref" && isUpcaseFirst) {
            ctorArgs = `${prop.childType}.class`;
        }
        if (prop.type === "ref") {
            langType = (isUpcaseFirst)
                ? prop.childType
                : typeMaps$5[prop.childType];
            initializer = `new ${langType}${(prop.type !== "ref" && isUpcaseFirst) ? "<>" : ""}(${ctorArgs})`;
        }
        else if (prop.type === "array") {
            langType = (isUpcaseFirst)
                ? `ArraySchema<${prop.childType}>`
                : `ArraySchema`;
            initializer = `new ArraySchema${(isUpcaseFirst) ? "<>" : ""}(${ctorArgs})`;
        }
        else if (prop.type === "map") {
            langType = (isUpcaseFirst)
                ? `MapSchema<${prop.childType}>`
                : `MapSchema`;
            initializer = `new MapSchema${(isUpcaseFirst) ? "<>" : ""}(${ctorArgs})`;
        }
        if (prop.type !== "ref") {
            typeArgs += (isUpcaseFirst)
                ? `/ref`
                : `/${prop.childType}`;
        }
    }
    else {
        langType = typeMaps$5[prop.type];
        initializer = typeInitializer[prop.type];
    }
    property += ` ${langType} ${prop.name}`;
    return `\t@SchemaField("${typeArgs}")\t${indent}
\t${indent}${property} = ${initializer};`;
}

var java = /*#__PURE__*/Object.freeze({
    __proto__: null,
    generate: generate$6,
    name: name$5,
    renderBundle: renderBundle$5
});

const name$4 = "LUA";
/**
    TODO:
    - Support inheritance
    - Support importing Schema dependencies
*/
const typeMaps$4 = {
    "string": "string",
    "number": "number",
    "boolean": "boolean",
    "int8": "number",
    "uint8": "number",
    "int16": "number",
    "uint16": "number",
    "int32": "number",
    "uint32": "number",
    "int64": "number",
    "uint64": "number",
    "float32": "number",
    "float64": "number",
};
const COMMON_IMPORTS$2 = `local schema = require 'colyseus.serializer.schema.schema'`;
const QUANTIZE_IMPORT = `local quantize = require 'colyseus.serializer.schema.quantize'`;
const distinct$3 = (value, index, self) => self.indexOf(value) === index;
const hasQuantized = (classes) => classes.some(klass => klass.properties.some(prop => prop.quantized));
/**
 * Generate individual files for each class
 */
function generate$5(context, options) {
    return context.classes.map(klass => ({
        name: klass.name + ".lua",
        content: generateClass$3(klass, options.namespace, context.classes)
    }));
}
/**
 * Generate a single bundled file containing all classes
 */
function renderBundle$4(context, options) {
    const fileName = options.namespace ? `${options.namespace}.lua` : "schema.lua";
    const classBodies = context.classes.map(klass => generateClassBody$4(klass));
    const classNames = context.classes.map(klass => `    ${klass.name} = ${klass.name},`).join("\n");
    const content = `${getCommentHeader().replace(/\/\//mg, "--")}

${COMMON_IMPORTS$2}${hasQuantized(context.classes) ? `\n${QUANTIZE_IMPORT}` : ""}

${classBodies.join("\n\n")}

return {
${classNames}
}
`;
    return { name: fileName, content };
}
/**
 * Generate just the class body (without requires) for bundling
 */
function generateClassBody$4(klass) {
    // Inheritance support
    const inherits = (klass.extends !== "Schema")
        ? `, ${klass.extends}`
        : "";
    return `---@class ${klass.name}: ${klass.extends}
${klass.properties.map(prop => `---@field ${prop.name} ${getLUATypeAnnotation(prop)}`).join("\n")}
local ${klass.name} = schema.define({
${klass.properties.map(prop => generatePropertyDeclaration(prop)).join(",\n")},
    ["_fields_by_index"] = { ${klass.properties.map(prop => `"${prop.name}"`).join(", ")} },
}${inherits})`;
}
/**
 * Generate a complete class file with requires (for individual file mode)
 */
function generateClass$3(klass, namespace, allClasses) {
    const allRefs = [];
    klass.properties.forEach(property => {
        let type = property.type;
        // keep all refs list
        if ((type === "ref" || type === "array" || type === "map")) {
            allRefs.push(property);
        }
    });
    const localRequires = allRefs.
        filter(ref => ref.childType && typeMaps$4[ref.childType] === undefined).
        map(ref => ref.childType).
        concat(getInheritanceTree(klass, allClasses, false).map(klass => klass.name)).
        filter(distinct$3).
        map(childType => `local ${childType} = require '${(namespace ? `${namespace}.` : '')}${childType}'`).
        join("\n");
    return `${getCommentHeader().replace(/\/\//mg, "--")}

${COMMON_IMPORTS$2}${hasQuantized([klass]) ? `\n${QUANTIZE_IMPORT}` : ""}
${localRequires}

${generateClassBody$4(klass)}

return ${klass.name}
`;
}
function generatePropertyDeclaration(prop) {
    let typeArgs;
    if (prop.quantized) {
        // resolve at class-definition time — the decoder expects `.wire`/`.span`
        const q = prop.quantized;
        typeArgs = `{ quantized = quantize.resolve({ min = ${q.min}, max = ${q.max}, bits = ${q.bits}, mode = ${q.wrap ? 1 : 0} }) }`;
    }
    else if (prop.childType) {
        const isUpcaseFirst = prop.childType.match(/^[A-Z]/);
        if (isUpcaseFirst) {
            typeArgs += `${prop.childType}`;
        }
        else {
            typeArgs += `"${prop.childType}"`;
        }
        if (prop.type === "ref") {
            typeArgs = (isUpcaseFirst)
                ? `${prop.childType}`
                : `"${prop.childType}"`;
        }
        else {
            typeArgs = (isUpcaseFirst)
                ? `{ ${prop.type} = ${prop.childType} }`
                : `{ ${prop.type} = "${prop.childType}" }`;
        }
    }
    else {
        typeArgs = `"${prop.type}"`;
    }
    return `    ["${prop.name}"] = ${typeArgs}`;
}
function getLUATypeAnnotation(prop) {
    if (prop.type === "quantized") {
        return "number";
    }
    else if (prop.type === "ref") {
        return prop.childType;
    }
    else if (prop.type === "array") {
        return "ArraySchema";
    }
    else if (prop.type === "map") {
        return "MapSchema";
    }
    else {
        return typeMaps$4[prop.type];
    }
}

var lua = /*#__PURE__*/Object.freeze({
    __proto__: null,
    generate: generate$5,
    name: name$4,
    renderBundle: renderBundle$4
});

const name$3 = "C";
/**
 * Type mappings for C
 */
const typeMaps$3 = {
    "string": "char*",
    "number": "double",
    "boolean": "bool",
    "int8": "int8_t",
    "uint8": "uint8_t",
    "int16": "int16_t",
    "uint16": "uint16_t",
    "int32": "int32_t",
    "uint32": "uint32_t",
    "int64": "int64_t",
    "uint64": "uint64_t",
    "float32": "float",
    "float64": "double",
    "quantized": "double",
};
/**
 * Colyseus field type enum mappings
 */
const fieldTypeMaps = {
    "string": "COLYSEUS_FIELD_STRING",
    "number": "COLYSEUS_FIELD_NUMBER",
    "boolean": "COLYSEUS_FIELD_BOOLEAN",
    "int8": "COLYSEUS_FIELD_INT8",
    "uint8": "COLYSEUS_FIELD_UINT8",
    "int16": "COLYSEUS_FIELD_INT16",
    "uint16": "COLYSEUS_FIELD_UINT16",
    "int32": "COLYSEUS_FIELD_INT32",
    "uint32": "COLYSEUS_FIELD_UINT32",
    "int64": "COLYSEUS_FIELD_INT64",
    "uint64": "COLYSEUS_FIELD_UINT64",
    "float32": "COLYSEUS_FIELD_FLOAT32",
    "float64": "COLYSEUS_FIELD_FLOAT64",
    "ref": "COLYSEUS_FIELD_REF",
    "array": "COLYSEUS_FIELD_ARRAY",
    "map": "COLYSEUS_FIELD_MAP",
    "quantized": "COLYSEUS_FIELD_QUANTIZED",
};
const COMMON_INCLUDES = `#include "colyseus/schema/types.h"
#include "colyseus/schema/collections.h"
#include <stdlib.h>
#include <stddef.h>
#include <stdbool.h>`;
/**
 * Native C Code Generator
 */
const toSnakeCase = (s) => {
    return s.replace(/([A-Z])/g, (match, p1, offset) => (offset > 0 ? '_' : '') + p1.toLowerCase());
};
const distinct$2 = (value, index, self) => self.indexOf(value) === index;
/**
 * Generate individual files for each class
 */
function generate$4(context, options) {
    return context.classes.map(klass => ({
        name: toSnakeCase(klass.name) + ".h",
        content: generateClass$2(klass, options.namespace, context.classes)
    }));
}
/**
 * Generate a single bundled header file containing all classes
 */
function renderBundle$3(context, options) {
    const fileName = options.namespace ? `${toSnakeCase(options.namespace)}.h` : "schema.h";
    const guardName = `__SCHEMA_CODEGEN_${(options.namespace || "SCHEMA").toUpperCase()}_H__`;
    const classBodies = context.classes.map(klass => generateClassBody$3(klass, context.classes)).join("\n\n");
    const content = `${getCommentHeader()}
#ifndef ${guardName}
#define ${guardName} 1

${COMMON_INCLUDES}

${classBodies}

#endif
`;
    return { name: fileName, content };
}
/**
 * Generate just the class body (without guards/includes) for bundling
 */
function generateClassBody$3(klass, allClasses) {
    const snakeName = toSnakeCase(klass.name);
    const typeName = `${snakeName}_t`;
    const allProperties = getAllProperties(klass, allClasses);
    return `${generateTypedef(klass, typeName, allClasses)}

${generateFieldsArray(klass, typeName, snakeName, allProperties)}

${generateCreateFunction(snakeName, typeName)}

${generateDestroyFunction(klass, snakeName, typeName, allProperties)}

${generateVtable(klass, snakeName, typeName, allProperties)}`;
}
/**
 * Generate a complete class file with guards/includes (for individual file mode)
 */
function generateClass$2(klass, namespace, allClasses) {
    toSnakeCase(klass.name);
    const guardName = `__SCHEMA_CODEGEN_${klass.name.toUpperCase()}_H__`;
    const allRefs = [];
    klass.properties.forEach(property => {
        if (property.type === "ref" || property.type === "array" || property.type === "map") {
            allRefs.push(property);
        }
    });
    // Generate includes for referenced schema types
    const refIncludes = allRefs
        .filter(ref => ref.childType && typeMaps$3[ref.childType] === undefined)
        .map(ref => ref.childType)
        .concat(getInheritanceTree(klass, allClasses, false).map(k => k.name))
        .filter(distinct$2)
        .map(childType => `#include "${toSnakeCase(childType)}.h"`)
        .join("\n");
    return `${getCommentHeader()}
#ifndef ${guardName}
#define ${guardName} 1

${COMMON_INCLUDES}
${refIncludes ? `\n${refIncludes}\n` : ""}
${generateClassBody$3(klass, allClasses)}

#endif
`;
}
function generateTypedef(klass, typeName, allClasses) {
    const allProperties = getAllProperties(klass, allClasses);
    const fields = allProperties.map(prop => {
        const cType = getCType(prop);
        return `    ${cType} ${prop.name};`;
    }).join("\n");
    return `typedef struct {
    colyseus_schema_t __base;
${fields}
} ${typeName};`;
}
function getCType(prop) {
    if (prop.type === "ref") {
        return `${toSnakeCase(prop.childType)}_t*`;
    }
    else if (prop.type === "array") {
        if (typeMaps$3[prop.childType]) {
            return `colyseus_array_schema_t*`;
        }
        else {
            return `colyseus_array_schema_t*`;
        }
    }
    else if (prop.type === "map") {
        if (typeMaps$3[prop.childType]) {
            return `colyseus_map_schema_t*`;
        }
        else {
            return `colyseus_map_schema_t*`;
        }
    }
    else {
        return typeMaps$3[prop.type] || `${toSnakeCase(prop.type)}_t*`;
    }
}
function getFieldType(prop) {
    return fieldTypeMaps[prop.type] || "COLYSEUS_FIELD_REF";
}
function getFieldTypeString(prop) {
    // Always return the type itself (ref, array, map, string, number, etc.)
    return prop.type;
}
function generateFieldsArray(klass, typeName, snakeName, allProperties) {
    if (allProperties.length === 0) {
        return `static const colyseus_field_t ${snakeName}_fields[] = {};`;
    }
    // one pre-resolved static descriptor per quantized field
    const descriptors = allProperties
        .filter(prop => prop.quantized)
        .map(prop => {
        const q = prop.quantized;
        const { range, span } = resolveQuantized(q);
        return `static const colyseus_quantized_descriptor_t ${snakeName}_${prop.name}_quantized = {${q.min}, ${q.max}, ${range}, ${span}, ${q.bits}, ${q.wrap}};`;
    });
    const fields = allProperties.map((prop, i) => {
        const fieldType = getFieldType(prop);
        const typeString = getFieldTypeString(prop);
        let vtableRef = "NULL";
        let childPrimitiveRef = "NULL";
        let quantizedRef = "NULL";
        if (prop.type === "ref" && prop.childType && !typeMaps$3[prop.childType]) {
            const childSnake = toSnakeCase(prop.childType);
            vtableRef = `&${childSnake}_vtable`;
        }
        else if ((prop.type === "array" || prop.type === "map") && prop.childType && !typeMaps$3[prop.childType]) {
            const childSnake = toSnakeCase(prop.childType);
            vtableRef = `&${childSnake}_vtable`;
        }
        else if ((prop.type === "array" || prop.type === "map") && prop.childType) {
            // collection of primitives — the decoder strcmp()s this to pick the reader
            childPrimitiveRef = `"${prop.childType}"`;
        }
        else if (prop.quantized) {
            quantizedRef = `&${snakeName}_${prop.name}_quantized`;
        }
        return `    {${prop.index}, "${prop.name}", ${fieldType}, "${typeString}", offsetof(${typeName}, ${prop.name}), ${vtableRef}, ${childPrimitiveRef}, ${quantizedRef}}`;
    }).join(",\n");
    return `${descriptors.length ? descriptors.join("\n") + "\n\n" : ""}static const colyseus_field_t ${snakeName}_fields[] = {
${fields}
};`;
}
function generateCreateFunction(snakeName, typeName) {
    return `static ${typeName}* ${snakeName}_create(void) {
    ${typeName}* instance = calloc(1, sizeof(${typeName}));
    return instance;
}`;
}
function generateDestroyFunction(klass, snakeName, typeName, allProperties) {
    const freeStatements = [];
    allProperties.forEach(prop => {
        if (prop.type === "string") {
            freeStatements.push(`    if (instance->${prop.name}) free(instance->${prop.name});`);
        }
        else if (prop.type === "ref") {
            if (typeMaps$3[prop.childType]) {
                freeStatements.push(`    if (instance->${prop.name}) free(instance->${prop.name});`);
            }
            else {
                const childSnake = toSnakeCase(prop.childType);
                freeStatements.push(`    if (instance->${prop.name}) ${childSnake}_destroy((colyseus_schema_t*)instance->${prop.name});`);
            }
        }
        else if (prop.type === "array" || prop.type === "map") ;
    });
    const freeCode = freeStatements.length > 0 ? freeStatements.join("\n") + "\n" : "";
    return `static void ${snakeName}_destroy(colyseus_schema_t* schema) {
    ${typeName}* instance = (${typeName}*)schema;
${freeCode}    free(instance);
}`;
}
function generateVtable(klass, snakeName, typeName, allProperties) {
    const fieldCount = allProperties.length;
    return `static const colyseus_schema_vtable_t ${snakeName}_vtable = {
    "${klass.name}",
    sizeof(${typeName}),
    (colyseus_schema_t* (*)(void))${snakeName}_create,
    ${snakeName}_destroy,
    ${snakeName}_fields,
    ${fieldCount}
};`;
}
function getAllProperties(klass, allClasses) {
    let properties = [];
    getInheritanceTree(klass, allClasses).reverse().forEach((k) => {
        properties = properties.concat(k.properties);
    });
    return properties;
}

var c = /*#__PURE__*/Object.freeze({
    __proto__: null,
    generate: generate$4,
    name: name$3,
    renderBundle: renderBundle$3
});

const name$2 = "GDScript";
/**
 * Type mappings from schema types to GDScript Colyseus.Schema type constants
 */
const typeMaps$2 = {
    "string": "Colyseus.Schema.STRING",
    "number": "Colyseus.Schema.NUMBER",
    "boolean": "Colyseus.Schema.BOOLEAN",
    "int8": "Colyseus.Schema.INT8",
    "uint8": "Colyseus.Schema.UINT8",
    "int16": "Colyseus.Schema.INT16",
    "uint16": "Colyseus.Schema.UINT16",
    "int32": "Colyseus.Schema.INT32",
    "uint32": "Colyseus.Schema.UINT32",
    "int64": "Colyseus.Schema.INT64",
    "uint64": "Colyseus.Schema.UINT64",
    "float32": "Colyseus.Schema.FLOAT32",
    "float64": "Colyseus.Schema.FLOAT64",
};
const containerMaps = {
    "array": "Colyseus.Schema.ARRAY",
    "map": "Colyseus.Schema.MAP",
    "ref": "Colyseus.Schema.REF",
};
const distinct$1 = (value, index, self) => self.indexOf(value) === index;
/**
 * GDScript Code Generator
 */
/**
 * Generate individual files for each class
 */
function generate$3(context, options) {
    // Enrich typeMaps with enums
    context.enums.forEach((structure) => {
        typeMaps$2[structure.name] = structure.name;
    });
    return [
        ...context.classes.map(klass => ({
            name: `${klass.name}.gd`,
            content: generateClass$1(klass, options.namespace, context.classes)
        })),
        ...context.enums.filter(structure => structure.name !== 'OPERATION').map((structure) => ({
            name: `${structure.name}.gd`,
            content: generateEnum$1(structure, options.namespace),
        })),
    ];
}
/**
 * Generate a single bundled file containing all classes and enums
 */
function renderBundle$2(context, options) {
    const fileName = options.namespace ? `${options.namespace}.gd` : "schema.gd";
    // Enrich typeMaps with enums
    context.enums.forEach((structure) => {
        typeMaps$2[structure.name] = structure.name;
    });
    const enumBodies = context.enums
        .filter(structure => structure.name !== 'OPERATION')
        .map(e => generateEnumBody$2(e));
    const classBodies = context.classes.map(klass => generateClassBody$2(klass));
    const content = `${getCommentHeader("#")}

${enumBodies.length > 0 ? enumBodies.join("\n\n") + "\n\n" : ""}${classBodies.join("\n\n")}
`;
    return { name: fileName, content };
}
/**
 * Generate just the class body (without preload) for bundling
 */
function generateClassBody$2(klass) {
    // Determine parent class
    const parentClass = (klass.extends !== "Schema")
        ? klass.extends
        : "Colyseus.Schema";
    const properties = klass.properties;
    const fieldsContent = properties.length > 0
        ? properties.map(prop => generateFieldDefinition(prop)).join(",\n") + ","
        : "";
    // Generate _to_string() method
    const toStringMethod = generateToStringMethod(klass.name, properties);
    return `class ${klass.name} extends ${parentClass}:
	static func definition():
		return [
${fieldsContent}
		]

${toStringMethod}`;
}
/**
 * Generate _to_string() method for the class
 */
function generateToStringMethod(className, properties) {
    const fieldNames = properties.map(prop => prop.name);
    const allFields = ["__ref_id", ...fieldNames];
    const formatParts = allFields.map(name => `${name}: %s`).join(", ");
    const formatString = `${className}(${formatParts})`;
    const selfReferences = allFields.map(name => `self.${name}`).join(", ");
    return `\tfunc _to_string() -> String:
		return "${formatString}" % [${selfReferences}]`;
}
/**
 * Generate a complete class file with preload (for individual file mode)
 */
function generateClass$1(klass, namespace, allClasses) {
    const allRefs = [];
    klass.properties.forEach(property => {
        let type = property.type;
        // Keep all refs list
        if ((type === "ref" || type === "array" || type === "map")) {
            allRefs.push(property);
        }
    });
    // Get required preloads for referenced types
    const preloads = allRefs
        .filter(ref => ref.childType && typeMaps$2[ref.childType] === undefined)
        .map(ref => ref.childType)
        .concat(getInheritanceTree(klass, allClasses, false).map(klass => klass.name))
        .filter(distinct$1)
        .map(childType => `const ${childType} = preload("${childType}.gd")`)
        .join("\n");
    return `${getCommentHeader("#")}

${preloads ? preloads + "\n\n" : ""}${generateClassBody$2(klass)}
`;
}
/**
 * Generate a field definition for the definition() array
 */
function generateFieldDefinition(prop) {
    let args;
    if (prop.childType) {
        const isUpcaseFirst = prop.childType.match(/^[A-Z]/);
        // Array or Map container
        const containerType = containerMaps[prop.type];
        const childTypeRef = isUpcaseFirst ? prop.childType : typeMaps$2[prop.childType] || `"${prop.childType}"`;
        args = [`"${prop.name}"`, containerType, childTypeRef];
    }
    else {
        // Primitive type
        const typeRef = typeMaps$2[prop.type] || `"${prop.type}"`;
        args = [`"${prop.name}"`, typeRef];
    }
    return `\t\t\tColyseus.Schema.Field.new(${args.join(", ")})`;
}
/**
 * Generate just the enum body for bundling
 */
function generateEnumBody$2(_enum) {
    const enumValues = _enum.properties.map((prop, index) => {
        let value;
        if (prop.type) {
            if (isNaN(Number(prop.type))) {
                value = `"${prop.type}"`;
            }
            else {
                value = Number(prop.type);
            }
        }
        else {
            value = index;
        }
        return `\t"${prop.name}": ${value},`;
    }).join("\n");
    return `const ${_enum.name} = {
${enumValues}
}`;
}
/**
 * Generate a complete enum file (for individual file mode)
 */
function generateEnum$1(_enum, _namespace) {
    return `${getCommentHeader("#")}

${generateEnumBody$2(_enum)}
`;
}

var gdscript = /*#__PURE__*/Object.freeze({
    __proto__: null,
    generate: generate$3,
    name: name$2,
    renderBundle: renderBundle$2
});

const name$1 = "Dart/Flutter";
/**
 * Dart types for interface (plain message) properties. Schema scalar getters
 * don't use this table: the `colyseus` package reads every numeric field as
 * `double` through `SchemaView`, so all numeric schema types collapse there.
 */
const typeMaps$1 = {
    "string": "String",
    "number": "double",
    "boolean": "bool",
    "int8": "double",
    "uint8": "double",
    "int16": "double",
    "uint16": "double",
    "int32": "double",
    "uint32": "double",
    "int64": "double",
    "uint64": "double",
    "float32": "double",
    "float64": "double",
};
const enumNames$1 = new Set();
const COMMON_IMPORTS$1 = `import 'package:colyseus/colyseus.dart';`;
// Field names come from the server schema and may not be lowerCamelCase.
const LINT_HEADER = `// ignore_for_file: non_constant_identifier_names, constant_identifier_names`;
const distinct = (value, index, self) => self.indexOf(value) === index;
const isSchemaType$1 = (childType) => childType !== undefined && /^[A-Z]/.test(childType) && !enumNames$1.has(childType);
/**
 * Dart Code Generator
 *
 * Emits typed façades over the `colyseus` Flutter package's runtime: one
 * `SchemaRef` subclass per schema, with typed getters over the shared native
 * handle. Collection getters return `MapSchema<T>` / `ArraySchema<T>`, which
 * also carry the field they came from — that is what
 * `callbacks.onAdd(state.players, ...)` registers against.
 */
/**
 * Generate individual files for each class/interface/enum
 */
function generate$2(context, options) {
    context.enums.forEach((structure) => enumNames$1.add(structure.name));
    return [
        ...context.classes.map(klass => ({
            name: `${klass.name}.dart`,
            content: generateClass(klass, context.classes)
        })),
        ...context.interfaces.map(structure => ({
            name: `${structure.name}.dart`,
            content: generateInterface(structure),
        })),
        ...context.enums.filter(structure => structure.name !== 'OPERATION').map((structure) => ({
            name: `${structure.name}.dart`,
            content: generateEnum(structure),
        })),
    ];
}
/**
 * Generate a single bundled file containing all classes, interfaces, and enums
 */
function renderBundle$1(context, options) {
    const fileName = options.namespace ? `${options.namespace}.dart` : "schema.dart";
    context.enums.forEach((structure) => enumNames$1.add(structure.name));
    const bodies = [
        ...context.classes.map(klass => generateClassBody$1(klass, context.classes)),
        ...context.interfaces.map(iface => generateInterfaceBody$1(iface)),
        ...context.enums
            .filter(structure => structure.name !== 'OPERATION')
            .map(e => generateEnumBody$1(e)),
    ].join("\n\n");
    const content = `${getCommentHeader()}
${LINT_HEADER}

${COMMON_IMPORTS$1}

${bodies}
`;
    return { name: fileName, content };
}
/**
 * Generate just the class body (without imports) for bundling
 */
function generateClassBody$1(klass, allClasses) {
    // `SchemaRef` is a `base` class, so subclasses carry a modifier: `base`
    // when the class is itself extended (extendable from any file), `final`
    // otherwise.
    const isExtended = allClasses.some(other => other.extends === klass.name);
    const modifier = isExtended ? "base" : "final";
    const parent = (klass.extends === "Schema") ? "SchemaRef" : klass.extends;
    const getters = klass.properties
        .map(prop => generateGetter(prop))
        .filter(Boolean)
        .join("\n");
    return `${modifier} class ${klass.name} extends ${parent} {
  ${klass.name}(super.handle);

${getters}
}`;
}
/**
 * Generate a complete class file with imports (for individual file mode)
 */
function generateClass(klass, allClasses) {
    const localRefs = klass.properties
        .filter(prop => isSchemaType$1(prop.childType))
        .map(prop => prop.childType)
        .concat(klass.extends !== "Schema" ? [klass.extends] : [])
        .filter(distinct)
        .filter(ref => ref !== klass.name)
        .map(ref => `import '${ref}.dart';`)
        .join("\n");
    return `${getCommentHeader()}
${LINT_HEADER}

${COMMON_IMPORTS$1}
${localRefs ? localRefs + "\n" : ""}
${generateClassBody$1(klass, allClasses)}
`;
}
/**
 * The Dart type a scalar schema field reads as, or undefined when the field
 * can only be read dynamically (enum-typed and unknown types).
 */
function scalarDartType(type) {
    if (type === "string") {
        return "String";
    }
    if (type === "boolean") {
        return "bool";
    }
    if (typeMaps$1[type] === "double" || type === "quantized" || type === "number") {
        return "double";
    }
    return undefined;
}
function generateGetter(prop) {
    const deprecation = (prop.deprecated)
        ? `  @Deprecated("field '${prop.name}' is deprecated.")\n`
        : '';
    let body;
    if (prop.childType && isSchemaType$1(prop.childType)) {
        if (prop.type === "ref") {
            body = `  ${prop.childType}? get ${prop.name} => refOf('${prop.name}', ${prop.childType}.new);`;
        }
        else if (prop.type === "map") {
            body = `  MapSchema<${prop.childType}> get ${prop.name} => mapOf('${prop.name}', ${prop.childType}.new);`;
        }
        else {
            body = `  ArraySchema<${prop.childType}> get ${prop.name} => arrayOf('${prop.name}', ${prop.childType}.new);`;
        }
    }
    else if (prop.childType) {
        const child = typeMaps$1[prop.childType] ?? "dynamic";
        if (prop.type === "map") {
            body = `  MapSchema<${child}> get ${prop.name} => primitiveMapOf('${prop.name}');`;
        }
        else if (prop.type === "array") {
            body = `  ArraySchema<${child}> get ${prop.name} => primitiveArrayOf('${prop.name}');`;
        }
        else {
            // A "ref" with a primitive child has no typed shape to offer.
            body = `  dynamic get ${prop.name} => this['${prop.name}'];`;
        }
    }
    else {
        const dartType = scalarDartType(prop.type);
        if (dartType === "String") {
            body = `  String get ${prop.name} => view.getString('${prop.name}') ?? '';`;
        }
        else if (dartType === "bool") {
            body = `  bool get ${prop.name} => view.getBool('${prop.name}');`;
        }
        else if (dartType === "double") {
            body = `  double get ${prop.name} => view['${prop.name}'];`;
        }
        else {
            // Enum-typed or unknown: read through the untyped accessor.
            body = `  dynamic get ${prop.name} => this['${prop.name}'];`;
        }
    }
    return deprecation + body;
}
/**
 * Generate just the interface body for bundling
 */
function generateInterfaceBody$1(struct) {
    const fields = struct.properties
        .map(prop => `  ${getInterfaceType$1(prop)}? ${prop.name};`)
        .join("\n");
    return `class ${struct.name} {
${fields}
}`;
}
/**
 * Generate a complete interface file (for individual file mode)
 */
function generateInterface(struct) {
    const localRefs = struct.properties
        .filter(prop => isSchemaType$1(prop.childType ?? (typeMaps$1[prop.type] ? undefined : prop.type)))
        .map(prop => prop.childType ?? prop.type)
        .filter(distinct)
        .map(ref => `import '${ref}.dart';`)
        .join("\n");
    return `${getCommentHeader()}
${LINT_HEADER}
${localRefs ? "\n" + localRefs + "\n" : ""}
${generateInterfaceBody$1(struct)}
`;
}
function getInterfaceType$1(prop) {
    const child = typeMaps$1[prop.childType] ?? prop.childType ?? "dynamic";
    switch (prop.type) {
        case "array": return `List<${child}>`;
        case "map": return `Map<String, ${child}>`;
        default: return typeMaps$1[prop.type] ?? prop.type ?? "dynamic";
    }
}
/**
 * Generate just the enum body for bundling: a namespace of consts, since
 * Colyseus enums may carry string or float values Dart enums can't.
 */
function generateEnumBody$1(_enum) {
    const members = _enum.properties
        .map((prop, i) => {
        let value;
        if (prop.type) {
            value = isNaN(Number(prop.type)) ? `"${prop.type}"` : `${Number(prop.type)}`;
        }
        else {
            value = `${i}`;
        }
        return `  static const ${prop.name} = ${value};`;
    })
        .join("\n");
    return `abstract final class ${_enum.name} {
${members}
}`;
}
/**
 * Generate a complete enum file (for individual file mode)
 */
function generateEnum(_enum) {
    return `${getCommentHeader()}
${LINT_HEADER}

${generateEnumBody$1(_enum)}
`;
}

var dart = /*#__PURE__*/Object.freeze({
    __proto__: null,
    generate: generate$2,
    name: name$1,
    renderBundle: renderBundle$1
});

const name = "Swift";
/**
 * Swift types for interface (plain message) properties. Schema getters do not
 * use this table: the `Colyseus` package reads every numeric field as `Double`
 * through `SchemaView`, so all numeric schema types collapse there.
 */
const typeMaps = {
    "string": "String",
    "number": "Double",
    "boolean": "Bool",
    "int8": "Int",
    "uint8": "Int",
    "int16": "Int",
    "uint16": "Int",
    "int32": "Int",
    "uint32": "Int",
    "int64": "Int",
    "uint64": "Int",
    "float32": "Double",
    "float64": "Double",
};
const enumNames = new Set();
const COMMON_IMPORTS = `import Colyseus`;
const isSchemaType = (childType) => childType !== undefined && /^[A-Z]/.test(childType) && !enumNames.has(childType);
/**
 * Swift Code Generator
 *
 * Emits typed façades over the `Colyseus` package's runtime: one `SchemaRef`
 * subclass per schema, whose properties read through the shared handle on the
 * instance the core decoded. Nothing is copied and nothing is stored, so a
 * generated class stays correct as patches arrive.
 *
 * Collection properties return `MapSchema<T>` / `ArraySchema<T>`, which carry
 * the field they came from — that is what `callbacks.onAdd(state.players, …)`
 * registers against.
 */
/**
 * Generate individual files for each class/interface/enum
 */
function generate$1(context, options) {
    context.enums.forEach((structure) => enumNames.add(structure.name));
    return [
        ...context.classes.map(klass => ({
            name: `${klass.name}.swift`,
            content: generateFile(generateClassBody(klass, context.classes, !!options.namespace), options)
        })),
        ...context.interfaces.map(structure => ({
            name: `${structure.name}.swift`,
            content: generateFile(generateInterfaceBody(structure), options),
        })),
        ...context.enums.filter(structure => structure.name !== 'OPERATION').map((structure) => ({
            name: `${structure.name}.swift`,
            content: generateFile(generateEnumBody(structure), options),
        })),
    ];
}
/**
 * Generate a single bundled file containing all classes, interfaces, and enums
 */
function renderBundle(context, options) {
    const fileName = options.namespace ? `${options.namespace}.swift` : "Schema.swift";
    context.enums.forEach((structure) => enumNames.add(structure.name));
    const bodies = [
        ...context.classes.map(klass => generateClassBody(klass, context.classes, !!options.namespace)),
        ...context.interfaces.map(iface => generateInterfaceBody(iface)),
        ...context.enums
            .filter(structure => structure.name !== 'OPERATION')
            .map(e => generateEnumBody(e)),
    ].join("\n\n");
    return { name: fileName, content: generateFile(bodies, options) };
}
/**
 * Swift has no namespaces, so one stands in as a caseless enum. Declarations
 * go inside it through an extension, which works the same whether they are
 * bundled into one file or split across many.
 */
function generateFile(body, options) {
    const header = `${getCommentHeader()}

${COMMON_IMPORTS}
`;
    if (!options.namespace) {
        return `${header}
${body}
`;
    }
    return `${header}
public enum ${options.namespace} {}

extension ${options.namespace} {
${indent(body)}
}
`;
}
function indent(text) {
    return text
        .split("\n")
        .map(line => (line.length > 0 ? `    ${line}` : line))
        .join("\n");
}
function generateClassBody(klass, allClasses, namespaced) {
    // A class nobody extends is final. One that is extended stays open so a
    // consumer in another module can subclass it — except inside a namespace,
    // where `open` conflicts with the extension's own access level and the
    // subclass is generated alongside it anyway.
    const isExtended = allClasses.some(other => other.extends === klass.name);
    const modifier = isExtended ? (namespaced ? "public" : "open") : "public final";
    const parent = (klass.extends === "Schema") ? "SchemaRef" : klass.extends;
    const properties = klass.properties
        .map(prop => generateProperty(prop))
        .filter(Boolean)
        .join("\n");
    // Swift does not carry an `@unchecked Sendable` conformance across module
    // boundaries, so every subclass has to restate it. What it asserts is the
    // SDK's own contract: decoded state is read where it is pumped.
    return `${modifier} class ${klass.name}: ${parent}, @unchecked Sendable {
${properties}
}`;
}
/**
 * The Swift type a scalar schema field reads as, or undefined when the field
 * can only be read dynamically (enum-typed and unknown types).
 */
function scalarSwiftType(type) {
    if (type === "string") {
        return "String";
    }
    if (type === "boolean") {
        return "Bool";
    }
    if (typeMaps[type] === "Double" || typeMaps[type] === "Int" || type === "quantized" || type === "number") {
        return "Double";
    }
    return undefined;
}
function generateProperty(prop) {
    const deprecation = (prop.deprecated)
        ? `    @available(*, deprecated, message: "field '${prop.name}' is deprecated.")\n`
        : '';
    const escaped = escapeName(prop.name);
    let body;
    if (prop.childType && isSchemaType(prop.childType)) {
        if (prop.type === "ref") {
            body = `    public var ${escaped}: ${prop.childType}? { refOf("${prop.name}") }`;
        }
        else if (prop.type === "map") {
            body = `    public var ${escaped}: MapSchema<${prop.childType}> { mapOf("${prop.name}") }`;
        }
        else {
            body = `    public var ${escaped}: ArraySchema<${prop.childType}> { arrayOf("${prop.name}") }`;
        }
    }
    else if (prop.childType) {
        // A collection of primitives. Everything numeric reads as Double, the
        // same collapse the scalar getters make.
        const child = typeMaps[prop.childType] === "String" ? "String" : "Double";
        if (prop.type === "map") {
            body = `    public var ${escaped}: MapSchema<${child}> { mapOf("${prop.name}") }`;
        }
        else if (prop.type === "array") {
            body = `    public var ${escaped}: ArraySchema<${child}> { arrayOf("${prop.name}") }`;
        }
        else {
            // A "ref" with a primitive child has no typed shape to offer.
            body = `    public var ${escaped}: Double { view["${prop.name}"] }`;
        }
    }
    else {
        const swiftType = scalarSwiftType(prop.type);
        if (swiftType === "String") {
            body = `    public var ${escaped}: String { view.string("${prop.name}") ?? "" }`;
        }
        else if (swiftType === "Bool") {
            body = `    public var ${escaped}: Bool { view.bool("${prop.name}") }`;
        }
        else if (swiftType === "Double") {
            body = `    public var ${escaped}: Double { view["${prop.name}"] }`;
        }
        else {
            // Enum-typed or unknown: read as the number the wire carries.
            body = `    public var ${escaped}: Double { view["${prop.name}"] }`;
        }
    }
    return deprecation + body;
}
/**
 * Message payloads are plain structs rather than façades: they arrive as
 * msgpack, not as decoded schema state.
 */
function generateInterfaceBody(struct) {
    const fields = struct.properties
        .map(prop => `    public var ${escapeName(prop.name)}: ${getInterfaceType(prop)}?`)
        .join("\n");
    return `public struct ${struct.name}: Codable {
${fields}

    public init() {}
}`;
}
function getInterfaceType(prop) {
    const child = typeMaps[prop.childType] ?? prop.childType ?? "Double";
    switch (prop.type) {
        case "array": return `[${child}]`;
        case "map": return `[String: ${child}]`;
        default: return typeMaps[prop.type] ?? prop.type ?? "Double";
    }
}
/**
 * A namespace of constants rather than a Swift enum: Colyseus enums may carry
 * string or floating-point values, and a Swift enum's raw type has to be one
 * or the other.
 */
function generateEnumBody(_enum) {
    const members = _enum.properties
        .map((prop, i) => {
        let value;
        if (prop.type) {
            value = isNaN(Number(prop.type)) ? `"${prop.type}"` : `${Number(prop.type)}`;
        }
        else {
            value = `${i}`;
        }
        return `    public static let ${escapeName(prop.name)} = ${value}`;
    })
        .join("\n");
    return `public enum ${_enum.name} {
${members}
}`;
}
/** Field names come from the server schema and may collide with a keyword. */
const SWIFT_KEYWORDS = new Set([
    "associatedtype", "class", "deinit", "enum", "extension", "fileprivate", "func", "import",
    "init", "inout", "internal", "let", "open", "operator", "private", "precedencegroup",
    "protocol", "public", "rethrows", "static", "struct", "subscript", "typealias", "var",
    "break", "case", "catch", "continue", "default", "defer", "do", "else", "fallthrough",
    "for", "guard", "if", "in", "repeat", "return", "throw", "switch", "where", "while",
    "Any", "as", "await", "false", "is", "nil", "self", "Self", "super", "throws", "true", "try",
]);
function escapeName(name) {
    return SWIFT_KEYWORDS.has(name) ? `\`${name}\`` : name;
}

var swift = /*#__PURE__*/Object.freeze({
    __proto__: null,
    generate: generate$1,
    name: name,
    renderBundle: renderBundle
});

const generators = { csharp, cpp, haxe, ts, js, java, lua, c, gdscript, dart, swift, };
function generate(targetId, options) {
    const generator = generators[targetId];
    if (!generator) {
        throw new Error("You must provide a valid generator as argument, such as: --csharp, --haxe or --cpp");
    }
    if (!fs__namespace.existsSync(options.output)) {
        console.log("Creating", options.output, "directory");
        fs__namespace.mkdirSync(options.output);
    }
    /**
     * Default `@type()` decorator name
     */
    if (!options.decorator) {
        options.decorator = "type";
    }
    // resolve wildcard files
    options.files = options.files.reduce((acc, cur) => {
        if (cur.endsWith("*")) {
            acc.push(...recursiveFiles(cur.slice(0, -1)).filter(filename => /\.(js|ts|mjs)$/.test(filename)));
        }
        else {
            acc.push(cur);
        }
        return acc;
    }, []);
    const structures = parseFiles(options.files, options.decorator, undefined, { tsconfig: options.tsconfig });
    // Post-process classes before generating
    structures.classes.forEach(klass => klass.postProcessing());
    if (options.bundle && generator.renderBundle) {
        // Bundle mode: generate all classes/interfaces/enums into a single file
        const bundled = generator.renderBundle(structures, options);
        const outputPath = path__namespace.resolve(options.output, bundled.name);
        fs__namespace.writeFileSync(outputPath, bundled.content);
        console.log("generated (bundled):", bundled.name);
    }
    else {
        // Standard mode: write individual files
        const generatedFiles = generator.generate(structures, options);
        generatedFiles.forEach((file) => {
            const outputPath = path__namespace.resolve(options.output, file.name);
            fs__namespace.writeFileSync(outputPath, file.content);
            console.log("generated:", file.name);
        });
    }
}
function recursiveFiles(dir) {
    const files = fs__namespace.readdirSync(dir, { withFileTypes: true });
    let collect = [];
    files.forEach(file => {
        const filename = path__namespace.resolve(dir, file.name);
        file.isDirectory() ? collect.push(...recursiveFiles(filename)) : collect.push(filename);
    });
    return collect;
}

function displayHelp(exitCode = 0) {
    console.log(`\nschema-codegen [path/to/Schema.ts]

Usage (C#/Unity)
    schema-codegen src/Schema.ts --output client-side/ --csharp --namespace MyGame.Schema

Valid options:
    --output: the output directory for generated client-side schema files
    --bundle: bundle all generated files into a single file

Generators:
${Object.
        keys(generators).
        map((targetId) => (`    --${targetId}: generate for ${generators[targetId].name}`)).
        join("\n")}

Optional:
    --namespace: generate namespace on output code
    --decorator: custom name for @type decorator to scan for
    --tsconfig: tsconfig.json to resolve import path aliases with
                (default: nearest tsconfig.json/jsconfig.json above each source file)`);
    process.exit(exitCode);
}
const args = argv(process.argv.slice(2));
if (args.help) {
    displayHelp();
}
let targetId;
for (let target in generators) {
    if (args[target]) {
        targetId = target;
    }
}
if (!args.output) {
    console.error("You must provide a valid --output directory.");
    displayHelp(1);
}
try {
    args.files = args._;
    generate(targetId, {
        files: args._,
        decorator: args.decorator,
        output: args.output,
        namespace: args.namespace,
        bundle: args.bundle,
        tsconfig: args.tsconfig,
    });
}
catch (e) {
    console.error(e.message);
    console.error(e.stack);
    displayHelp(1);
}
//# sourceMappingURL=cli.cjs.map
