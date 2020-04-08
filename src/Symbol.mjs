/**
 * Base class for all Symbol repesentations
 */
class BasicSymbolInternals {
    /**
     * Validates if the input is a symbol
     * @param {Symbol} symbol
     * @return {boolean}
     */
    static validateSymbol(symbol) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Exports a symbol to a string
     * @param {Symbol} symbol
     * @return {string} string
     */
    static symbolToString(symbol) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Imports a symbol from a string
     * @param {string} string
     * @return {Symbol} symbol
     */
    static symbolFromString(string) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Extracts the namespaceIdentity of a symbol
     * @param {Symbol} symbol
     * @return {Identity} namespaceIdentity
     */
    static namespaceOfSymbol(symbol) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Extracts the identity of a symbol
     * @param {Symbol} symbol
     * @return {Identity} identity
     */
    static identityOfSymbol(symbol) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Concats namespaceIdentity and identity into a symbol
     * @param {Identity} namespaceIdentity
     * @param {Identity} identity
     * @return {Symbol} symbol
     */
    static concatIntoSymbol(namespaceIdentity, identity) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Compares two symbols for equivalence
     * @param {Symbol} symbolA
     * @param {Symbol} symbolB
     * @return {boolean} equal
     */
    static areSymbolsEqual(symbolA, symbolB) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Compares two symbols
     * @param {Symbol} symbolA
     * @param {Symbol} symbolB
     * @return {number} result (negative: a < b, neutral: a == b, positive: a > b)
     */
    static compareSymbols(symbolA, symbolB) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Exports a triple to a string
     * @param {Triple} triple
     * @return {string} string
     */
    static tripleToString(triple) {
        return triple.map(symbol => this.symbolToString(symbol)).join(';');
    }

    /**
     * Imports a triple from a string
     * @param {string} string
     * @return {Triple} triple
     */
    static tripleFromString(string) {
        return string.split(';').map(string => this.symbolFromString(string));
    }
};

/**
 * Symbols are represented using a colon separated string
 */
class SymbolInternalsColonString extends BasicSymbolInternals {
    static validateSymbol(symbol) {
        return typeof symbol == 'string' && /^[0-9]+:[0-9]+$/.test(symbol);
    }

    static symbolToString(symbol) {
        return symbol;
    }

    static symbolFromString(string) {
        return string;
    }

    static namespaceOfSymbol(symbol) {
        return parseInt(symbol.split(':')[0]);
    }

    static identityOfSymbol(symbol) {
        return parseInt(symbol.split(':')[1]);
    }

    static concatIntoSymbol(namespaceIdentity, identity) {
        return [namespaceIdentity, identity].join(':');
    }

    static areSymbolsEqual(symbolA, symbolB) {
        return symbolA == symbolB;
    }

    static compareSymbols(symbolA, symbolB) {
        const splitA = symbolA.split(':'),
              splitB = symbolB.split(':');
        const namespaceIdDiff = splitA[0]-splitB[0];
        return (namespaceIdDiff) ? namespaceIdDiff : splitA[1]-splitB[1];
    }
};

/**
 * Symbols are represented using an Uint32Array
 */
class SymbolInternalsUint32Array extends BasicSymbolInternals {
    static validateSymbol(symbol) {
        return symbol instanceof Uint32Array && symbol.length == 2;
    }

    static symbolToString(symbol) {
        return symbol.join(':');
    }

    static symbolFromString(string) {
        return Uint32Array.from(string.split(':'));
    }

    static namespaceOfSymbol(symbol) {
        return symbol[0];
    }

    static identityOfSymbol(symbol) {
        return symbol[1];
    }

    static concatIntoSymbol(namespaceIdentity, identity) {
        return Uint32Array.from([namespaceIdentity, identity]);
    }

    static areSymbolsEqual(symbolA, symbolB) {
        return symbolA[0] === symbolB[0] && symbolA[1] === symbolB[1];
    }

    static compareSymbols(symbolA, symbolB) {
        const namespaceIdDiff = symbolA[0]-symbolB[0];
        return (namespaceIdDiff) ? namespaceIdDiff : symbolA[1]-symbolB[1];
    }
};

export const SymbolInternals = SymbolInternalsColonString;



/**
 * Base class for all Symbol collections
 */
class BasicSymbolMap {
    /**
     * Creates a new empty SymbolMap
     * @return {SymbolMap} collection
     */
    static create() {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Measures the length / size
     * @param {SymbolMap} collection
     * @return {number} Number of entries in the collection
     */
    static count(collection) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Test if the collection is empty
     * @param {SymbolMap} collection
     * @return {boolean} True if there are no entries in the collection
     */
    static isEmpty(collection) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Inserts or updates an entry to the collection
     * @param {SymbolMap} collection
     * @param {Symbol} symbol The key
     * @param {any} element The value
     * @return {boolean} True if the key did not exist in the collection
     */
    static set(collection, symbol, element) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Removes an entry from the collection
     * @param {SymbolMap} collection
     * @param {Symbol} symbol The key
     * @return {boolean} True if the key did exist in the collection
     */
    static remove(collection, symbol) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Gets a value by its key in the collection
     * @param {SymbolMap} collection
     * @param {Symbol} symbol The key
     * @return {any} The value
     */
    static get(collection, symbol) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Gets a value by its key in the collection or inserts a default value if it the key did not exist
     * @param {SymbolMap} collection
     * @param {Symbol} symbol The key
     * @param {any} defaultElement The value
     * @return {any} The value
     */
    static getOrInsert(collection, symbol, defaultElement) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Iterates over all entries of the collection
     * @param {SymbolMap} collection
     * @yield {[Symbol, any]} [key, value]
     */
    static *entries(collection) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Iterates over all keys of the collection
     * @param {SymbolMap} collection
     * @yield {Symbol} key
     */
    static *symbols(collection) {
        throw new Error('Abstract, not implemented');
    }
};

/**
 * SymbolMap using JS dicts
 */
class SymbolMapJSDict extends BasicSymbolMap {
    static create() {
        return {};
    }

    static count(collection) {
        return Object.keys(collection).length;
    }

    static isEmpty(collection) {
        return Object.keys(collection).length == 0;
    }

    static set(collection, symbol, element) {
        const key = SymbolInternals.symbolToString(symbol),
              result = (collection[key] === undefined);
        collection[key] = element;
        return result;
    }

    static remove(collection, symbol) {
        const key = SymbolInternals.symbolToString(symbol);
        if(collection[key] === undefined)
            return false;
        delete collection[key];
        return true;
    }

    static get(collection, symbol) {
        return collection[SymbolInternals.symbolToString(symbol)];
    }

    static getOrInsert(collection, symbol, defaultElement) {
        const key = SymbolInternals.symbolToString(symbol);
        const element = collection[key];
        return (element !== undefined) ? element : (collection[key] = defaultElement);
    }

    static *entries(collection) {
        for(const [key, element] of Object.entries(collection))
            yield [SymbolInternals.symbolFromString(key), element];
    }

    static *symbols(collection) {
        for(const key of Object.keys(collection))
            yield SymbolInternals.symbolFromString(key);
    }
};

/**
 * SymbolMap using ES6 Maps
 */
class SymbolMapES6Map extends BasicSymbolMap {
    static create() {
        return new Map();
    }

    static count(outerCollection) {
        return outerCollection.size;
    }

    static isEmpty(outerCollection) {
        return outerCollection.size == 0;
    }

    static set(outerCollection, symbol, element) {
        let innerCollection = outerCollection.get(SymbolInternals.namespaceOfSymbol(symbol));
        if(!innerCollection) {
            innerCollection = new Map();
            outerCollection.set(SymbolInternals.namespaceOfSymbol(symbol), innerCollection);
        }
        const result = !innerCollection.has(SymbolInternals.identityOfSymbol(symbol));
        innerCollection.set(SymbolInternals.identityOfSymbol(symbol), element);
        return result;
    }

    static remove(outerCollection, symbol) {
        const innerCollection = outerCollection.get(SymbolInternals.namespaceOfSymbol(symbol));
        if(!innerCollection || !innerCollection.has(SymbolInternals.identityOfSymbol(symbol)))
            return false;
        innerCollection.delete(SymbolInternals.identityOfSymbol(symbol));
        if(innerCollection.size == 0)
            outerCollection.delete(SymbolInternals.namespaceOfSymbol(symbol));
        return true;
    }

    static get(outerCollection, symbol) {
        const innerCollection = outerCollection.get(SymbolInternals.namespaceOfSymbol(symbol));
        if(!innerCollection)
            return;
        return innerCollection.get(SymbolInternals.identityOfSymbol(symbol));
    }

    static getOrInsert(outerCollection, symbol, defaultElement) {
        let innerCollection = outerCollection.get(SymbolInternals.namespaceOfSymbol(symbol));
        if(!innerCollection) {
            innerCollection = new Map();
            outerCollection.set(SymbolInternals.namespaceOfSymbol(symbol), innerCollection);
        }
        if(innerCollection.has(SymbolInternals.identityOfSymbol(symbol)))
            return innerCollection.get(SymbolInternals.identityOfSymbol(symbol));
        innerCollection.set(SymbolInternals.identityOfSymbol(symbol), defaultElement);
        return defaultElement;
    }

    static *entries(outerCollection) {
        for(const [symbol0, innerCollection] of outerCollection.entries())
            for(const [symbol1, element] of innerCollection.entries())
                yield [SymbolInternals.concatIntoSymbol(symbol0, symbol1), element];
    }

    static *symbols(outerCollection) {
        for(const [symbol0, innerCollection] of outerCollection.entries())
            for(const [symbol1, element] of innerCollection.entries())
                yield SymbolInternals.concatIntoSymbol(symbol0, symbol1);
    }
};

export const SymbolMap = SymbolMapJSDict;
