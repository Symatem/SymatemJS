/**
 * Symbols are internally represented using a colon separated string.
 */
export class SymbolInternals {
    /**
     * Validates if the input is a symbol
     * @param {Symbol} symbol
     * @return {Boolean}
     */
    static validateSymbol(symbol) {
        return typeof symbol == 'string' && symbol.split(':').length == 2;
    }

    /**
     * Exports a symbol to a string
     * @param {Symbol} symbol
     * @return {String} string
     */
    static symbolToString(string) {
        return string;
    }

    /**
     * Imports a symbol from a string
     * @param {String} string
     * @return {Symbol} symbol
     */
    static symbolFromString(string) {
        return string;
    }

    /**
     * Extracts the namespaceIdentity of a symbol
     * @param {Symbol} symbol
     * @return {Identity} namespaceIdentity
     */
    static namespaceOfSymbol(symbol) {
        return parseInt(symbol.split(':')[0]);
    }

    /**
     * Extracts the identity of a symbol
     * @param {Symbol} symbol
     * @return {Identity} identity
     */
    static identityOfSymbol(symbol) {
        return parseInt(symbol.split(':')[1]);
    }

    /**
     * Concats namespaceIdentity and identity into a symbol
     * @param {Identity} namespaceIdentity
     * @param {Identity} identity
     * @return {Symbol} symbol
     */
    static concatIntoSymbol(namespaceIdentity, identity) {
        return [namespaceIdentity, identity].join(':');
    }
};

/**
 * SymbolMap of string symbols (colon notation) using JS dicts
 */
export class SymbolMap {
    static create() {
        return {};
    }

    static isEmpty(collection) {
        return Object.keys(collection).length == 0;
    }

    static insert(collection, symbol, element) {
        if(collection[symbol] !== undefined)
            return false;
        collection[symbol] = element;
        return true;
    }

    static remove(collection, symbol) {
        if(collection[symbol] === undefined)
            return false;
        delete collection[symbol];
        return true;
    }

    static get(collection, symbol) {
        return collection[symbol];
    }

    static getOrInsert(collection, symbol, defaultElement) {
        const element = collection[symbol];
        return (element !== undefined) ? element : (collection[symbol] = defaultElement);
    }

    static entries(collection) {
        return Object.entries(collection);
    }

    static symbols(collection) {
        return Object.keys(collection);
    }
};
