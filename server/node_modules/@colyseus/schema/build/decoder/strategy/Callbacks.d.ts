import { NonFunctionPropNames, CollectionLike } from "../../types/HelperTypes.js";
import type { IRef, Ref } from "../../encoder/ChangeTree.js";
import { Decoder } from "../Decoder.js";
import { DataChange } from "../DecodeOperation.js";
import { OPERATION } from "../../encoding/spec.js";
import { Schema } from "../../Schema.js";
import { MapSchema } from "../../types/custom/MapSchema.js";
import { ArraySchema } from "../../types/custom/ArraySchema.js";
import { type SchemaCallbackProxy } from "./getDecoderStateCallbacks.js";
type PropertyChangeCallback<K> = (currentValue: K, previousValue: K) => void;
type KeyValueCallback<K, V> = (key: K, value: V) => void;
type ValueKeyCallback<V, K> = (value: V, key: K) => void;
type InstanceChangeCallback = () => void;
type PublicPropNames<T> = NonFunctionPropNames<T> & string;
type CollectionPropNames<T> = {
    [K in keyof T]: T[K] extends CollectionLike<any, any> ? K : never;
}[keyof T] & string;
type CollectionValueType<T, K extends keyof T> = T[K] extends MapSchema<infer V, any> ? V : T[K] extends ArraySchema<infer V> ? V : T[K] extends CollectionLike<any, infer V, any> ? V : never;
type CollectionKeyType<T, K extends keyof T> = T[K] extends MapSchema<any, infer Key> ? Key : T[K] extends ArraySchema<any> ? number : T[K] extends CollectionLike<infer Key, any, any> ? Key : never;
export declare class StateCallbackStrategy<TState extends IRef> {
    protected decoder: Decoder<TState>;
    protected uniqueRefIds: Set<number>;
    protected isTriggering: boolean;
    constructor(decoder: Decoder<TState>);
    protected get callbacks(): {
        [refId: number]: import("../ReferenceTracker.js").SchemaCallbacks;
    };
    protected get state(): TState;
    protected addCallback(refId: number, operationOrProperty: OPERATION | string, handler: Function): () => void;
    protected addCallbackOrWaitCollectionAvailable<TInstance extends IRef, TReturn extends Ref>(instance: TInstance, propertyName: string, operation: OPERATION, handler: Function, immediate?: boolean): () => void;
    /**
     * Listen to property changes on the root state.
     */
    listen<K extends PublicPropNames<TState>>(property: K, handler: PropertyChangeCallback<TState[K]>, immediate?: boolean): () => void;
    /**
     * Listen to property changes on a nested instance.
     */
    listen<TInstance, K extends PublicPropNames<TInstance>>(instance: TInstance, property: K, handler: PropertyChangeCallback<TInstance[K]>, immediate?: boolean): () => void;
    protected listenInstance<TInstance extends IRef>(instance: TInstance, propertyName: string, handler: PropertyChangeCallback<any>, immediate?: boolean): () => void;
    /**
     * Listen to any property change on an instance.
     */
    onChange<TInstance extends object>(instance: TInstance, handler: InstanceChangeCallback): () => void;
    /**
     * Listen to item changes in a collection on root state.
     */
    onChange<K extends CollectionPropNames<TState>>(property: K, handler: KeyValueCallback<CollectionKeyType<TState, K>, CollectionValueType<TState, K>>): () => void;
    /**
     * Listen to item changes in a nested collection.
     */
    onChange<TInstance extends object, K extends CollectionPropNames<TInstance>>(instance: TInstance, property: K, handler: KeyValueCallback<CollectionKeyType<TInstance, K>, CollectionValueType<TInstance, K>>): () => void;
    /**
     * Listen to items added to a collection on root state.
     */
    onAdd<K extends CollectionPropNames<TState>>(property: K, handler: ValueKeyCallback<CollectionValueType<TState, K>, CollectionKeyType<TState, K>>, immediate?: boolean): () => void;
    /**
     * Listen to items added to a nested collection.
     */
    onAdd<TInstance, K extends CollectionPropNames<TInstance>>(instance: TInstance, property: K, handler: ValueKeyCallback<CollectionValueType<TInstance, K>, CollectionKeyType<TInstance, K>>, immediate?: boolean): () => void;
    /**
     * Listen to items removed from a collection on root state.
     */
    onRemove<K extends CollectionPropNames<TState>>(property: K, handler: ValueKeyCallback<CollectionValueType<TState, K>, CollectionKeyType<TState, K>>): () => void;
    /**
     * Listen to items removed from a nested collection.
     */
    onRemove<TInstance, K extends CollectionPropNames<TInstance>>(instance: TInstance, property: K, handler: ValueKeyCallback<CollectionValueType<TInstance, K>, CollectionKeyType<TInstance, K>>): () => void;
    /**
     * Bind properties from a Schema instance to a target object.
     * Changes will be automatically reflected on the target object.
     */
    bindTo<TInstance, TTarget>(from: TInstance, to: TTarget, properties?: string[], immediate?: boolean): () => void;
    protected triggerChanges(allChanges: DataChange[]): void;
}
/**
 * Factory class for retrieving the callbacks API.
 */
export declare const Callbacks: {
    /**
     * Get the new callbacks standard API.
     *
     * Usage:
     * ```ts
     * const callbacks = Callbacks.get(roomOrDecoder);
     *
     * // Listen to property changes
     * callbacks.listen("currentTurn", (currentValue, previousValue) => { ... });
     *
     * // Listen to collection additions
     * callbacks.onAdd("entities", (entity, sessionId) => {
     *     // Nested property listening
     *     callbacks.listen(entity, "hp", (currentHp, previousHp) => { ... });
     * });
     *
     * // Listen to collection removals
     * callbacks.onRemove("entities", (entity, sessionId) => { ... });
     *
     * // Listen to any property change on an instance
     * callbacks.onChange(entity, () => { ... });
     *
     * // Bind properties to another object
     * callbacks.bindTo(player, playerVisual);
     * ```
     *
     * @param roomOrDecoder - Room or Decoder instance to get the callbacks for.
     * @returns the new callbacks standard API.
     */
    get<T extends IRef>(roomOrDecoder: Decoder<T> | {
        serializer: {
            decoder: Decoder<T>;
        };
    } | {
        state: T;
        serializer: object;
    }): StateCallbackStrategy<T>;
    /**
     * Get the legacy callbacks API.
     *
     * We aim to deprecate this API on 1.0, and iterate on improving Callbacks.get() API.
     *
     * @param roomOrDecoder - Room or Decoder instance to get the legacy callbacks for.
     * @returns the legacy callbacks API.
     */
    getLegacy<T extends Schema>(roomOrDecoder: Decoder<T> | {
        serializer: {
            decoder: Decoder<T>;
        };
    } | {
        state: T;
        serializer: object;
    }): SchemaCallbackProxy<T>;
    getRawChanges(decoder: Decoder, callback: (changes: DataChange[]) => void): void;
};
export {};
