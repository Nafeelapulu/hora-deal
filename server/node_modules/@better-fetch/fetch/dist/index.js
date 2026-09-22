//#region src/error.ts
var BetterFetchError = class extends Error {
	constructor(status, statusText, error) {
		super(statusText || status.toString(), { cause: error });
		this.status = status;
		this.statusText = statusText;
		this.error = error;
		Error.captureStackTrace(this, this.constructor);
	}
};
//#endregion
//#region src/plugins.ts
const initializePlugins = async (url, options) => {
	let opts = options || {};
	const hooks = {
		onRequest: [options === null || options === void 0 ? void 0 : options.onRequest],
		onResponse: [options === null || options === void 0 ? void 0 : options.onResponse],
		onSuccess: [options === null || options === void 0 ? void 0 : options.onSuccess],
		onError: [options === null || options === void 0 ? void 0 : options.onError],
		onRetry: [options === null || options === void 0 ? void 0 : options.onRetry]
	};
	if (!options || !(options === null || options === void 0 ? void 0 : options.plugins)) return {
		url,
		options: opts,
		hooks
	};
	for (const plugin of (options === null || options === void 0 ? void 0 : options.plugins) || []) {
		var _plugin$hooks, _plugin$hooks2, _plugin$hooks3, _plugin$hooks4, _plugin$hooks5;
		if (plugin.init) {
			var _plugin$init;
			const pluginRes = await ((_plugin$init = plugin.init) === null || _plugin$init === void 0 ? void 0 : _plugin$init.call(plugin, url.toString(), opts));
			opts = pluginRes.options || opts;
			url = pluginRes.url;
		}
		hooks.onRequest.push((_plugin$hooks = plugin.hooks) === null || _plugin$hooks === void 0 ? void 0 : _plugin$hooks.onRequest);
		hooks.onResponse.push((_plugin$hooks2 = plugin.hooks) === null || _plugin$hooks2 === void 0 ? void 0 : _plugin$hooks2.onResponse);
		hooks.onSuccess.push((_plugin$hooks3 = plugin.hooks) === null || _plugin$hooks3 === void 0 ? void 0 : _plugin$hooks3.onSuccess);
		hooks.onError.push((_plugin$hooks4 = plugin.hooks) === null || _plugin$hooks4 === void 0 ? void 0 : _plugin$hooks4.onError);
		hooks.onRetry.push((_plugin$hooks5 = plugin.hooks) === null || _plugin$hooks5 === void 0 ? void 0 : _plugin$hooks5.onRetry);
	}
	return {
		url,
		options: opts,
		hooks
	};
};
//#endregion
//#region src/retry.ts
var LinearRetryStrategy = class {
	constructor(options) {
		this.options = options;
	}
	shouldAttemptRetry(attempt, response) {
		if (this.options.shouldRetry) return Promise.resolve(attempt < this.options.attempts && this.options.shouldRetry(response));
		return Promise.resolve(attempt < this.options.attempts);
	}
	getDelay() {
		return this.options.delay;
	}
};
var ExponentialRetryStrategy = class {
	constructor(options) {
		this.options = options;
	}
	shouldAttemptRetry(attempt, response) {
		if (this.options.shouldRetry) return Promise.resolve(attempt < this.options.attempts && this.options.shouldRetry(response));
		return Promise.resolve(attempt < this.options.attempts);
	}
	getDelay(attempt) {
		return Math.min(this.options.maxDelay, this.options.baseDelay * 2 ** attempt);
	}
};
function createRetryStrategy(options) {
	if (typeof options === "number") return new LinearRetryStrategy({
		type: "linear",
		attempts: options,
		delay: 1e3
	});
	switch (options.type) {
		case "linear": return new LinearRetryStrategy(options);
		case "exponential": return new ExponentialRetryStrategy(options);
		default: throw new Error("Invalid retry strategy");
	}
}
//#endregion
//#region src/create-fetch/schema.ts
const methods = [
	"get",
	"post",
	"put",
	"patch",
	"delete"
];
const createSchema = (schema, config) => {
	return {
		schema,
		config
	};
};
//#endregion
//#region src/method.ts
function parseMethodModifier(path) {
	if (!path.startsWith("@")) return {
		method: void 0,
		path
	};
	const separator = path.indexOf("/");
	const method = path.slice(1, separator === -1 ? void 0 : separator);
	if (!methods.includes(method)) return {
		method: void 0,
		path
	};
	return {
		method,
		path: separator === -1 ? path : path.slice(separator + 1)
	};
}
//#endregion
//#region src/url.ts
const isReservedPathSegment = (value) => value === "." || value === "..";
const encodeLiteralPathSegment = (segment) => segment.split(":").map((part) => encodeURIComponent(part)).join(":");
function resolvePathSegment(segment, pathParams) {
	const pathParam = pathParams.get(segment);
	if (pathParam === void 0) return encodeLiteralPathSegment(segment);
	if (isReservedPathSegment(pathParam)) throw new TypeError("Path parameters cannot be reserved path segments");
	return encodeURIComponent(pathParam);
}
/**
* Normalize URL
*/
function getURL$1(url, option) {
	const { baseURL, params, query } = option || {
		query: {},
		params: {},
		baseURL: ""
	};
	let basePath = url.startsWith("http") ? url.split("/").slice(0, 3).join("/") : baseURL || "";
	const { path: requestPath } = parseMethodModifier(url);
	if (requestPath !== url) url = `/${requestPath}`;
	if (!basePath.endsWith("/")) basePath += "/";
	let [path, urlQuery] = url.replace(basePath, "").split("?");
	const queryParams = new URLSearchParams(urlQuery);
	for (const [key, value] of Object.entries(query || {})) {
		if (value == null) continue;
		let serializedValue;
		if (typeof value === "string") serializedValue = value;
		else if (Array.isArray(value)) {
			for (const val of value) queryParams.append(key, val);
			continue;
		} else serializedValue = JSON.stringify(value);
		queryParams.set(key, serializedValue);
	}
	const pathParams = /* @__PURE__ */ new Map();
	if (params) if (Array.isArray(params)) {
		const paramPaths = path.split("/").filter((p) => p.startsWith(":"));
		for (const [index, key] of paramPaths.entries()) {
			const value = params[index];
			pathParams.set(key, String(value));
		}
	} else for (const [key, value] of Object.entries(params)) pathParams.set(`:${key}`, String(value));
	path = path.split("/").map((segment) => resolvePathSegment(segment, pathParams)).join("/");
	path = path.replace(/^\/+/, "");
	let queryParamString = queryParams.toString();
	queryParamString = queryParamString.length > 0 ? `?${queryParamString}`.replace(/\+/g, "%20") : "";
	if (!basePath.startsWith("http")) return `${basePath}${path}${queryParamString}`;
	return new URL(`${path}${queryParamString}`, basePath);
}
//#endregion
//#region src/auth.ts
const getAuthHeader = async (options) => {
	const headers = {};
	const getValue = async (value) => typeof value === "function" ? await value() : value;
	if (options === null || options === void 0 ? void 0 : options.auth) {
		if (options.auth.type === "Bearer") {
			const token = await getValue(options.auth.token);
			if (!token) return headers;
			headers["authorization"] = `Bearer ${token}`;
		} else if (options.auth.type === "Basic") {
			const [username, password] = await Promise.all([getValue(options.auth.username), getValue(options.auth.password)]);
			if (!username || !password) return headers;
			headers["authorization"] = `Basic ${btoa(`${username}:${password}`)}`;
		} else if (options.auth.type === "Custom") {
			const [prefix, value] = await Promise.all([getValue(options.auth.prefix), getValue(options.auth.value)]);
			if (!value) return headers;
			headers["authorization"] = `${prefix !== null && prefix !== void 0 ? prefix : ""} ${value}`;
		}
	}
	return headers;
};
//#endregion
//#region src/utils.ts
const JSON_RE = /^application\/(?:[\w!#$%&*.^`~-]*\+)?json(;.+)?$/i;
function detectResponseType(request) {
	const _contentType = request.headers.get("content-type");
	const textTypes = /* @__PURE__ */ new Set([
		"image/svg",
		"application/xml",
		"application/xhtml",
		"application/html"
	]);
	if (!_contentType) return "json";
	const contentType = _contentType.split(";").shift() || "";
	if (JSON_RE.test(contentType)) return "json";
	if (textTypes.has(contentType) || contentType.startsWith("text/")) return "text";
	return "blob";
}
function isJSONParsable(value) {
	try {
		JSON.parse(value);
		return true;
	} catch (error) {
		return false;
	}
}
function isJSONSerializable(value) {
	if (value === void 0) return false;
	const t = typeof value;
	if (t === "string" || t === "number" || t === "boolean" || t === null) return true;
	if (t !== "object") return false;
	if (Array.isArray(value)) return true;
	if (value.buffer) return false;
	return value.constructor && value.constructor.name === "Object" || typeof value.toJSON === "function";
}
function jsonParse(text) {
	try {
		return JSON.parse(text);
	} catch (error) {
		return text;
	}
}
function isFunction(value) {
	return typeof value === "function";
}
function getFetch(options) {
	if (options === null || options === void 0 ? void 0 : options.customFetchImpl) return options.customFetchImpl;
	if (typeof globalThis !== "undefined" && isFunction(globalThis.fetch)) return globalThis.fetch;
	if (typeof window !== "undefined" && isFunction(window.fetch)) return window.fetch;
	throw new Error("No fetch implementation found");
}
function isPayloadMethod(method) {
	if (!method) return false;
	return [
		"POST",
		"PUT",
		"PATCH",
		"DELETE"
	].includes(method.toUpperCase());
}
function isRouteMethod(method) {
	const routeMethod = [
		"GET",
		"POST",
		"PUT",
		"PATCH",
		"DELETE"
	];
	if (!method) return false;
	return routeMethod.includes(method.toUpperCase());
}
function mergeHeaders(...sources) {
	const merged = {};
	for (const source of sources) {
		if (!source) continue;
		if (source instanceof Headers) source.forEach((value, key) => {
			merged[key] = value;
		});
		else {
			const entries = Array.isArray(source) ? source : Object.entries(source);
			for (const [key, value] of entries) if (value !== null && value !== void 0) merged[key] = value;
		}
	}
	return merged;
}
async function getHeaders(opts) {
	const headers = new Headers(mergeHeaders(opts === null || opts === void 0 ? void 0 : opts.headers, await getAuthHeader(opts)));
	if (!headers.has("content-type")) {
		const contentType = detectContentType(opts === null || opts === void 0 ? void 0 : opts.body);
		if (contentType) headers.set("content-type", contentType);
	}
	return headers;
}
function getURL(url, options) {
	const { path } = parseMethodModifier(url);
	if (path !== url) url = `/${path}`;
	let _url;
	try {
		if (url.startsWith("http")) _url = url;
		else {
			let baseURL = options === null || options === void 0 ? void 0 : options.baseURL;
			if (baseURL && !(baseURL === null || baseURL === void 0 ? void 0 : baseURL.endsWith("/"))) baseURL = baseURL + "/";
			if (url.startsWith("/")) _url = new URL(url.substring(1), baseURL);
			else _url = new URL(url, options === null || options === void 0 ? void 0 : options.baseURL);
		}
	} catch (e) {
		if (e instanceof TypeError) {
			if (!(options === null || options === void 0 ? void 0 : options.baseURL)) throw TypeError(`Invalid URL ${url}. Are you passing in a relative url but not setting the baseURL?`);
			throw TypeError(`Invalid URL ${url}. Please validate that you are passing the correct input.`);
		}
		throw e;
	}
	/**
	* Dynamic Parameters.
	*/
	if (options === null || options === void 0 ? void 0 : options.params) if (Array.isArray(options === null || options === void 0 ? void 0 : options.params)) {
		const params = (options === null || options === void 0 ? void 0 : options.params) ? Array.isArray(options.params) ? `/${options.params.join("/")}` : `/${Object.values(options.params).join("/")}` : "";
		_url = _url.toString().split("/:")[0];
		_url = `${_url.toString()}${params}`;
	} else for (const [key, value] of Object.entries(options === null || options === void 0 ? void 0 : options.params)) _url = _url.toString().replace(`:${key}`, String(value));
	const __url = new URL(_url);
	/**
	* Query Parameters
	*/
	const queryParams = options === null || options === void 0 ? void 0 : options.query;
	if (queryParams) for (const [key, value] of Object.entries(queryParams)) __url.searchParams.append(key, String(value));
	return __url;
}
function detectContentType(body) {
	if (isJSONSerializable(body)) return "application/json";
	return null;
}
function getMediaType(headers) {
	const contentType = headers.get("content-type");
	return contentType ? contentType.split(";")[0].trim().toLowerCase() : null;
}
function getBody(options, headers) {
	const { body } = options;
	if (!body) return null;
	if (!isJSONSerializable(body)) return body;
	if (typeof body === "string") return body;
	if (getMediaType(headers) === "application/x-www-form-urlencoded") return new URLSearchParams(body).toString();
	return JSON.stringify(body);
}
function getMethod(url, options) {
	if (options === null || options === void 0 ? void 0 : options.method) return options.method.toUpperCase();
	const { method } = parseMethodModifier(url);
	if (method) return method.toUpperCase();
	return (options === null || options === void 0 ? void 0 : options.body) ? "POST" : "GET";
}
function getTimeout(options, controller) {
	let abortTimeout;
	if (!(options === null || options === void 0 ? void 0 : options.signal) && (options === null || options === void 0 ? void 0 : options.timeout)) abortTimeout = setTimeout(() => controller === null || controller === void 0 ? void 0 : controller.abort(), options === null || options === void 0 ? void 0 : options.timeout);
	return {
		abortTimeout,
		clearTimeout: () => {
			if (abortTimeout) clearTimeout(abortTimeout);
		}
	};
}
function bodyParser(data, responseType) {
	if (responseType === "json") return JSON.parse(data);
	return data;
}
var ValidationError = class ValidationError extends Error {
	constructor(issues, message) {
		super(message || JSON.stringify(issues, null, 2));
		this.issues = issues;
		Object.setPrototypeOf(this, ValidationError.prototype);
	}
};
async function parseStandardSchema(schema, input) {
	const result = await schema["~standard"].validate(input);
	if (result.issues) throw new ValidationError(result.issues);
	return result.value;
}
//#endregion
//#region \0@oxc-project+runtime@0.140.0/helpers/esm/typeof.js
function _typeof(o) {
	"@babel/helpers - typeof";
	return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
		return typeof o;
	} : function(o) {
		return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
	}, _typeof(o);
}
//#endregion
//#region \0@oxc-project+runtime@0.140.0/helpers/esm/toPrimitive.js
function toPrimitive(t, r) {
	if ("object" != _typeof(t) || !t) return t;
	var e = t[Symbol.toPrimitive];
	if (void 0 !== e) {
		var i = e.call(t, r || "default");
		if ("object" != _typeof(i)) return i;
		throw new TypeError("@@toPrimitive must return a primitive value.");
	}
	return ("string" === r ? String : Number)(t);
}
//#endregion
//#region \0@oxc-project+runtime@0.140.0/helpers/esm/toPropertyKey.js
function toPropertyKey(t) {
	var i = toPrimitive(t, "string");
	return "symbol" == _typeof(i) ? i : i + "";
}
//#endregion
//#region \0@oxc-project+runtime@0.140.0/helpers/esm/defineProperty.js
function _defineProperty(e, r, t) {
	return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
		value: t,
		enumerable: !0,
		configurable: !0,
		writable: !0
	}) : e[r] = t, e;
}
//#endregion
//#region \0@oxc-project+runtime@0.140.0/helpers/esm/objectSpread2.js
function ownKeys(e, r) {
	var t = Object.keys(e);
	if (Object.getOwnPropertySymbols) {
		var o = Object.getOwnPropertySymbols(e);
		r && (o = o.filter(function(r) {
			return Object.getOwnPropertyDescriptor(e, r).enumerable;
		})), t.push.apply(t, o);
	}
	return t;
}
function _objectSpread2(e) {
	for (var r = 1; r < arguments.length; r++) {
		var t = null != arguments[r] ? arguments[r] : {};
		r % 2 ? ownKeys(Object(t), !0).forEach(function(r) {
			_defineProperty(e, r, t[r]);
		}) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function(r) {
			Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r));
		});
	}
	return e;
}
//#endregion
//#region src/fetch.ts
const betterFetch = async (url, options) => {
	var _opts$signal, _options$body, _options$jsonParser;
	const { hooks, url: __url, options: opts } = await initializePlugins(url, options);
	const fetch = getFetch(opts);
	const controller = new AbortController();
	const signal = (_opts$signal = opts.signal) !== null && _opts$signal !== void 0 ? _opts$signal : controller.signal;
	const _url = getURL$1(__url, opts);
	const headers = await getHeaders(opts);
	const body = getBody(opts, headers);
	const method = getMethod(__url, opts);
	const context = _objectSpread2(_objectSpread2({}, opts), {}, {
		url: _url,
		headers,
		body,
		method,
		signal
	});
	/**
	* Run all on request hooks
	*/
	for (const onRequest of hooks.onRequest) if (onRequest) {
		const res = await onRequest(context);
		if (typeof res === "object" && res !== null) Object.assign(context, res);
	}
	if ("pipeTo" in context && typeof context.pipeTo === "function" || typeof (options === null || options === void 0 || (_options$body = options.body) === null || _options$body === void 0 ? void 0 : _options$body.pipe) === "function") {
		if (!("duplex" in context)) context.duplex = "half";
	}
	const { clearTimeout } = getTimeout(opts, controller);
	let response = await fetch(context.url, context);
	clearTimeout();
	const responseContext = {
		response,
		request: context
	};
	for (const onResponse of hooks.onResponse) if (onResponse) {
		var _options$hookOptions;
		const r = await onResponse(_objectSpread2(_objectSpread2({}, responseContext), {}, { response: (options === null || options === void 0 || (_options$hookOptions = options.hookOptions) === null || _options$hookOptions === void 0 ? void 0 : _options$hookOptions.cloneResponse) ? response.clone() : response }));
		if (r instanceof Response) response = r;
		else if (typeof r === "object" && r !== null) response = r.response;
	}
	/**
	* OK Branch
	*/
	if (response.ok) {
		if (!(context.method !== "HEAD")) return {
			data: "",
			error: null
		};
		const responseType = detectResponseType(response);
		const successContext = {
			data: null,
			response,
			request: context
		};
		if (responseType === "json" || responseType === "text") {
			var _context$jsonParser;
			const text = await response.text();
			successContext.data = await ((_context$jsonParser = context.jsonParser) !== null && _context$jsonParser !== void 0 ? _context$jsonParser : jsonParse)(text);
		} else successContext.data = await response[responseType]();
		/**
		* Parse the data if the output schema is defined
		*/
		if (context === null || context === void 0 ? void 0 : context.output) {
			if (context.output && !context.disableValidation) successContext.data = await parseStandardSchema(context.output, successContext.data);
		}
		for (const onSuccess of hooks.onSuccess) if (onSuccess) {
			var _options$hookOptions2;
			await onSuccess(_objectSpread2(_objectSpread2({}, successContext), {}, { response: (options === null || options === void 0 || (_options$hookOptions2 = options.hookOptions) === null || _options$hookOptions2 === void 0 ? void 0 : _options$hookOptions2.cloneResponse) ? response.clone() : response }));
		}
		if (options === null || options === void 0 ? void 0 : options.throw) return successContext.data;
		return {
			data: successContext.data,
			error: null
		};
	}
	const parser = (_options$jsonParser = options === null || options === void 0 ? void 0 : options.jsonParser) !== null && _options$jsonParser !== void 0 ? _options$jsonParser : jsonParse;
	const responseText = await response.text();
	const isJSONResponse = isJSONParsable(responseText);
	const errorObject = isJSONResponse ? await parser(responseText) : null;
	/**
	* Error Branch
	*/
	const errorContext = {
		response,
		responseText,
		request: context,
		error: _objectSpread2(_objectSpread2({}, errorObject), {}, {
			status: response.status,
			statusText: response.statusText
		})
	};
	for (const onError of hooks.onError) if (onError) {
		var _options$hookOptions3;
		await onError(_objectSpread2(_objectSpread2({}, errorContext), {}, { response: (options === null || options === void 0 || (_options$hookOptions3 = options.hookOptions) === null || _options$hookOptions3 === void 0 ? void 0 : _options$hookOptions3.cloneResponse) ? response.clone() : response }));
	}
	if (options === null || options === void 0 ? void 0 : options.retry) {
		var _options$retryAttempt;
		const retryStrategy = createRetryStrategy(options.retry);
		const _retryAttempt = (_options$retryAttempt = options.retryAttempt) !== null && _options$retryAttempt !== void 0 ? _options$retryAttempt : 0;
		if (await retryStrategy.shouldAttemptRetry(_retryAttempt, response)) {
			for (const onRetry of hooks.onRetry) if (onRetry) await onRetry(responseContext);
			const delay = retryStrategy.getDelay(_retryAttempt);
			await new Promise((resolve) => setTimeout(resolve, delay));
			return await betterFetch(url, _objectSpread2(_objectSpread2({}, options), {}, { retryAttempt: _retryAttempt + 1 }));
		}
	}
	if (options === null || options === void 0 ? void 0 : options.throw) throw new BetterFetchError(response.status, response.statusText, isJSONResponse ? errorObject : responseText);
	return {
		data: null,
		error: _objectSpread2(_objectSpread2({}, errorObject), {}, {
			status: response.status,
			statusText: response.statusText
		})
	};
};
//#endregion
//#region src/create-fetch/index.ts
const applySchemaPlugin = (config) => ({
	id: "apply-schema",
	name: "Apply Schema",
	version: "1.0.0",
	async init(url, options) {
		var _config$plugins;
		let opts = _objectSpread2(_objectSpread2({}, options), config.query !== void 0 && { query: _objectSpread2(_objectSpread2({}, config.query), options === null || options === void 0 ? void 0 : options.query) });
		const schema = ((_config$plugins = config.plugins) === null || _config$plugins === void 0 || (_config$plugins = _config$plugins.find((plugin) => {
			var _plugin$schema;
			return ((_plugin$schema = plugin.schema) === null || _plugin$schema === void 0 ? void 0 : _plugin$schema.config) ? url.startsWith(plugin.schema.config.baseURL || "") || url.startsWith(plugin.schema.config.prefix || "") : false;
		})) === null || _config$plugins === void 0 ? void 0 : _config$plugins.schema) || config.schema;
		if (schema) {
			var _schema$config, _schema$config2;
			let urlKey = url;
			if ((_schema$config = schema.config) === null || _schema$config === void 0 ? void 0 : _schema$config.prefix) {
				if (urlKey.startsWith(schema.config.prefix)) {
					urlKey = urlKey.replace(schema.config.prefix, "");
					if (schema.config.baseURL) url = url.replace(schema.config.prefix, schema.config.baseURL);
				}
			}
			if ((_schema$config2 = schema.config) === null || _schema$config2 === void 0 ? void 0 : _schema$config2.baseURL) {
				if (urlKey.startsWith(schema.config.baseURL)) urlKey = urlKey.replace(schema.config.baseURL, "");
			}
			if (urlKey.startsWith("/") && urlKey.charAt(1) === "@") urlKey = urlKey.substring(1);
			const keySchema = schema.schema[urlKey];
			if (keySchema) {
				var _keySchema$method;
				const { method: schemaMethod, path } = parseMethodModifier(urlKey);
				if (schemaMethod) url = url.slice(0, url.length - urlKey.length) + path;
				let validatedHeaders = options === null || options === void 0 ? void 0 : options.headers;
				if (keySchema.headers && !(options === null || options === void 0 ? void 0 : options.disableValidation)) {
					const normalizedHeaders = {};
					if (options === null || options === void 0 ? void 0 : options.headers) {
						if (options.headers instanceof Headers) options.headers.forEach((value, key) => {
							normalizedHeaders[key.toLowerCase()] = value;
						});
						else if (typeof options.headers === "object") {
							for (const [key, value] of Object.entries(options.headers)) if (value !== null && value !== void 0) normalizedHeaders[key.toLowerCase()] = value;
						}
					}
					const validated = await parseStandardSchema(keySchema.headers, normalizedHeaders);
					const finalHeaders = {};
					for (const [key, value] of Object.entries(validated)) finalHeaders[key.toLowerCase()] = value;
					validatedHeaders = finalHeaders;
				}
				const method = (_keySchema$method = keySchema.method) !== null && _keySchema$method !== void 0 ? _keySchema$method : schemaMethod;
				opts = _objectSpread2(_objectSpread2(_objectSpread2(_objectSpread2({}, opts), method !== void 0 && { method }), keySchema.output !== void 0 && { output: keySchema.output }), validatedHeaders !== void 0 && { headers: validatedHeaders });
				if (!(options === null || options === void 0 ? void 0 : options.disableValidation)) {
					if (keySchema.query) {
						opts.query = await parseStandardSchema(keySchema.query, options === null || options === void 0 ? void 0 : options.query);
						if (opts.query !== null && typeof opts.query === "object") {
							const defaults = _objectSpread2({}, config.query);
							for (const key of Object.keys(defaults)) if ((options === null || options === void 0 ? void 0 : options.query) && Object.prototype.hasOwnProperty.call(options.query, key)) defaults[key] = options.query[key];
							opts.query = _objectSpread2(_objectSpread2({}, defaults), opts.query);
						}
					}
					opts = _objectSpread2(_objectSpread2({}, opts), {}, {
						body: keySchema.input ? await parseStandardSchema(keySchema.input, options === null || options === void 0 ? void 0 : options.body) : options === null || options === void 0 ? void 0 : options.body,
						params: keySchema.params ? await parseStandardSchema(keySchema.params, options === null || options === void 0 ? void 0 : options.params) : options === null || options === void 0 ? void 0 : options.params
					});
				}
				return {
					url,
					options: opts
				};
			}
		}
		return _objectSpread2({ url }, (options !== void 0 || config.query !== void 0) && { options: opts });
	}
});
const createFetch = (config) => {
	async function $fetch(url, options) {
		const opts = _objectSpread2(_objectSpread2(_objectSpread2({}, config), options), {}, {
			headers: mergeHeaders(config === null || config === void 0 ? void 0 : config.headers, options === null || options === void 0 ? void 0 : options.headers),
			plugins: [
				...(config === null || config === void 0 ? void 0 : config.plugins) || [],
				applySchemaPlugin(config || {}),
				...(options === null || options === void 0 ? void 0 : options.plugins) || []
			]
		});
		if (config === null || config === void 0 ? void 0 : config.catchAllError) try {
			return await betterFetch(url, opts);
		} catch (error) {
			return {
				data: null,
				error: {
					status: 500,
					statusText: "Fetch Error",
					message: "Fetch related error. Captured by catchAllError option. See error property for more details.",
					error
				}
			};
		}
		return await betterFetch(url, opts);
	}
	return $fetch;
};
//#endregion
export { BetterFetchError, ValidationError, applySchemaPlugin, betterFetch, bodyParser, createFetch, createRetryStrategy, createSchema, detectContentType, detectResponseType, getBody, getFetch, getHeaders, getMethod, getTimeout, getURL, initializePlugins, isFunction, isJSONParsable, isJSONSerializable, isPayloadMethod, isRouteMethod, jsonParse, mergeHeaders, methods, parseStandardSchema };

//# sourceMappingURL=index.js.map