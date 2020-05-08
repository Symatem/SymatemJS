/**
 * Used to define a mapping of symbols between namespaces
 */
export class RelocationTable {
    /**
     * Creates a new relocation table
     * @param {[Identity, Identity][]} iterable Fill the collection with these mappings
     * @return {RelocationTable} relocation table
     */
    static create(iterable) {
        const relocationTable = new Map();
        if(iterable)
            for(const [source, destination] of iterable)
                this.set(relocationTable, source, destination);
        return relocationTable;
    }

    /**
     * Creates a mapping from a source namespace to a destination namespace
     * @param {RelocationTable} relocationTable relocation table
     * @param {Identity} source namespace identity
     * @param {Identity} destination namespace identity
     */
    static set(relocationTable, source, destination) {
        relocationTable.set(source, destination);
    }

    /**
     * Retrieve a mapping of a source namespace
     * @param {RelocationTable} relocationTable relocation table
     * @param {Identity} source namespace identity
     * @return {Identity} destination namespace identity
     */
    static get(relocationTable, source, destination) {
        return relocationTable.get(source);
    }

    /**
     * Relocates a symbol into another namespace according to the relocation table
     * @param {RelocationTable} relocationTable relocation table
     * @param {Symbol} symbol
     * @return {Symbol} relocated symbol
     */
    static relocateSymbol(relocationTable, symbol) {
        const namespaceId = relocationTable.get(SymbolInternals.namespaceOfSymbol(symbol));
        return (namespaceId) ? SymbolInternals.concatIntoSymbol(namespaceId, SymbolInternals.identityOfSymbol(symbol)) : symbol;
    }

    /**
     * Iterates over all mappings of the relocation table
     * @param {RelocationTable} relocationTable relocation table
     * @yield {[Identity, Identity]} [source, destination]
     */
    static entries(relocationTable) {
        return relocationTable.entries();
    }

    /**
     * Returns the relocation table of inverse direction
     * @param {RelocationTable} relocationTable relocation table
     * @return {RelocationTable} inverse
     */
    static inverse(relocationTable) {
        const result = RelocationTable.create();
        for(const [srcNamespaceIdentity, dstNamespaceIdentity] of RelocationTable.entries(relocationTable))
            result.set(dstNamespaceIdentity, srcNamespaceIdentity);
        return result;
    }
}

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
export class ColonStringSymbolInternals extends BasicSymbolInternals {
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
export class Uint32ArraySymbolInternals extends BasicSymbolInternals {
    static validateSymbol(symbol) {
        return symbol instanceof Uint32Array && symbol.length == 2;
    }

    static symbolToString(symbol) {
        return symbol.join(':');
    }

    static symbolFromString(string) {
        return Uint32Array.from(string.split(':').map(x => parseInt(x)));
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

export const SymbolInternals = ColonStringSymbolInternals;



/**
 * Base class for all Symbol collections
 */
class BasicSymbolMap {
    /**
     * Creates a new empty SymbolMap
     * @param {[Symbol, any][]} iterable Fill the collection with these key element pairs
     * @return {SymbolMap} collection
     */
    static create(iterable) {
        const collection = this.factory();
        if(iterable)
            for(const [key, element] of iterable)
                this.set(collection, key, element);
        return collection;
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
        return this.count(collection) == 0;
    }

    /**
     * Inserts or updates an entry to the collection
     * @param {SymbolMap} collection
     * @param {Symbol} key
     * @param {any} element
     * @return {boolean} True if the key did not exist in the collection
     */
    static set(collection, key, element) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Removes an entry from the collection
     * @param {SymbolMap} collection
     * @param {Symbol} key
     * @return {boolean} True if the key did exist in the collection
     */
    static remove(collection, key) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Gets an element by its key in the collection
     * @param {SymbolMap} collection
     * @param {Symbol} key
     * @return {any} element
     */
    static get(collection, key) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Gets an element by its key in the collection or inserts a default element if it the key did not exist
     * @param {SymbolMap} collection
     * @param {Symbol} key
     * @param {any} defaultElement
     * @return {any} element
     */
    static getOrInsert(collection, key, defaultElement) {
        const element = this.get(collection, key);
        if(element)
            return element;
        this.set(collection, key, defaultElement);
        return defaultElement;
    }

    /**
     * Iterates over all entries of the collection
     * @param {SymbolMap} collection
     * @yield {[Symbol, any]} [key, element]
     */
    static *entries(collection) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Iterates over all keys of the collection
     * @param {SymbolMap} collection
     * @yield {Symbol} key
     */
    static *keys(collection) {
        throw new Error('Abstract, not implemented');
    }
};

/**
 * SymbolMap using JS dicts
 */
export class JSDictSymbolMap extends BasicSymbolMap {
    static factory() {
        return {};
    }

    static count(collection) {
        return Object.keys(collection).length;
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

    static *keys(collection) {
        for(const key of Object.keys(collection))
            yield SymbolInternals.symbolFromString(key);
    }
};

/**
 * SymbolMap using ES6 Maps
 */
export class ES6MapSymbolMap extends BasicSymbolMap {
    static factory() {
        return new Map();
    }

    static count(outerCollection) {
        return outerCollection.size;
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
        for(const [namespaceIdentity, innerCollection] of outerCollection.entries())
            for(const [symbolIdentity, element] of innerCollection.entries())
                yield [SymbolInternals.concatIntoSymbol(namespaceIdentity, symbolIdentity), element];
    }

    static *keys(outerCollection) {
        for(const [namespaceIdentity, innerCollection] of outerCollection.entries())
            for(const [symbolIdentity, element] of innerCollection.entries())
                yield SymbolInternals.concatIntoSymbol(namespaceIdentity, symbolIdentity);
    }
};

export const SymbolMap = JSDictSymbolMap;



/**
 * TripleMap using JS dicts
 */
export class JSDictTripleMap extends BasicSymbolMap {
    static factory() {
        return {};
    }

    static count(collection) {
        return Object.keys(collection).length;
    }

    static set(collection, triple, element) {
        const key = SymbolInternals.tripleToString(triple),
              result = (collection[key] === undefined);
        collection[key] = element;
        return result;
    }

    static remove(collection, triple) {
        const key = SymbolInternals.tripleToString(triple);
        if(collection[key] === undefined)
            return false;
        delete collection[key];
        return true;
    }

    static get(collection, triple) {
        return collection[SymbolInternals.tripleToString(triple)];
    }

    static getOrInsert(collection, triple, defaultElement) {
        const key = SymbolInternals.tripleToString(triple);
        const element = collection[key];
        return (element !== undefined) ? element : (collection[key] = defaultElement);
    }

    static *entries(collection) {
        for(const [key, element] of Object.entries(collection))
            yield [SymbolInternals.tripleFromString(key), element];
    }

    static *keys(collection) {
        for(const key of Object.keys(collection))
            yield SymbolInternals.tripleFromString(key);
    }
};

/**
 * TripleMap using SymbolMap
 */
export class SymbolMapTripleMap extends BasicSymbolMap {
    static factory() {
        const collection = SymbolMap.factory();
        Object.defineProperty(collection, 'count', {'value': 0, 'writable': true, 'enumerable': false});
        return collection;
    }

    static count(collection) {
        return collection.count;
    }

    static set(collection, triple, element) {
        const betaCollection = SymbolMap.getOrInsert(collection, triple[0], SymbolMap.create()),
              gammaCollection = SymbolMap.getOrInsert(betaCollection, triple[1], SymbolMap.create());
        if(SymbolMap.set(gammaCollection, triple[2], element)) {
            ++collection.count;
            return true;
        }
        return false;
    }

    static remove(collection, triple) {
        const betaCollection = SymbolMap.get(collection, triple[0]);
        if(!betaCollection)
            return false;
        const gammaCollection = SymbolMap.get(betaCollection, triple[1]);
        if(!gammaCollection || !SymbolMap.remove(gammaCollection, triple[2]))
            return false;
        if(SymbolMap.isEmpty(gammaCollection)) {
            SymbolMap.remove(betaCollection, triple[1]);
            if(SymbolMap.isEmpty(betaCollection))
                SymbolMap.remove(collection, triple[0]);
        }
        --collection.count;
        return true;
    }

    static get(collection, triple) {
        for(let i = 0; i < 3 && collection; ++i)
            collection = SymbolMap.get(collection, triple[i]);
        return collection;
    }

    static getOrInsert(collection, triple, defaultElement) {
        const betaCollection = SymbolMap.getOrInsert(collection, triple[0], SymbolMap.create()),
              gammaCollection = SymbolMap.getOrInsert(betaCollection, triple[1], SymbolMap.create());
        const element = SymbolMap.get(gammaCollection, triple[2]);
        if(element)
            return element;
        ++collection.count;
        SymbolMap.set(collection, triple[2], defaultElement);
        return defaultElement;
    }

    static *entries(collection) {
        for(const [alpha, betaCollection] of SymbolMap.entries(collection))
            for(const [beta, gammaCollection] of SymbolMap.entries(betaCollection))
                for(const [gamma, element] of SymbolMap.entries(gammaCollection))
                    yield [[alpha, beta, gamma], element];
    }

    static *keys(collection) {
        for(const [alpha, betaCollection] of SymbolMap.entries(collection))
            for(const [beta, gammaCollection] of SymbolMap.entries(betaCollection))
                for(const gamma of SymbolMap.keys(gammaCollection))
                    yield [alpha, beta, gamma];
    }
};

export const TripleMap = JSDictTripleMap;
