import {Utils, SymbolInternals, SymbolMap} from '../SymatemJS.mjs';

const queryMode = ['M', 'V', 'I'],
      queryMasks = {};
for(let i = 0; i < 27; ++i)
    queryMasks[queryMode[i % 3] + queryMode[Math.floor(i / 3) % 3] + queryMode[Math.floor(i / 9) % 3]] = i;

const symbolByName = {
    'Void': 0,
    'Entity': 0,
    'Attribute': 0,
    'Value': 0,

    'Type': 0,
    'Encoding': 0,
    'BinaryNumber': 0,
    'TwosComplement': 0,
    'IEEE754': 0,
    'UTF8': 0,
    'Composite': 0,
    'Default': 0,
    'SlotSize': 0,
    'Count': 0,
    'Dynamic': 0,

    'ManifestSymbol': 0,
    'ReleaseSymbol': 0,
    'LinkTriple': 0,
    'UnlinkTriple': 0,
    'IncreaseLength': 0,
    'DecreaseLength': 0,
    'DataSource': 0,
    'DataRestore': 0,
    'ReplaceData': 0,
    'RestoreData': 0,
    'Source': 0,
    'Destination': 0,
    'SourceOffset': 0,
    'DestinationOffset': 0,
    'Length': 0,
    'MinimumLength': 0,
    'ForwardLength': 0,
    'ReverseLength': 0,

    'Basics': 2,
    'Index': 2,
    'Namespaces': 2,
};

{
    let namespace, symbol;
    for(const name of Object.getOwnPropertyNames(symbolByName)) {
        if(namespace !== symbolByName[name]) {
            namespace = symbolByName[name];
            symbol = 0;
        }
        symbolByName[name] = SymbolInternals.concatIntoSymbol(namespace, symbol++);
    }
}

/** Abstract super class of all backends */
export default class BasicBackend {
    /** All 27 query masks by their name
      * @enum {Number}
      */
    static get queryMasks() {
        return queryMasks;
    }

    /** Predefined symbols by their name
      * @enum {Symbol}
      */
    static get symbolByName() {
        return symbolByName;
    }

    /**
     * Same as concatIntoSymbol but resolves the namespaceIdentity by name
     * @param {String} namespaceName
     * @param {Identity} identity
     * @return {Symbol} symbol
     */
    static symbolInNamespace(namespaceName, identity) {
        return SymbolInternals.concatIntoSymbol(SymbolInternals.identityOfSymbol(symbolByName[namespaceName]), identity);
    }

    /**
     * Relocates a symbol into another namespace according to a lookup table
     * @param {Symbol} symbol
     * @param {RelocationTable} namespaces relocation table
     * @return {Symbol} relocated symbol
     */
    static relocateSymbol(symbol, namespaces) {
        const namespaceId = namespaces[SymbolInternals.namespaceOfSymbol(symbol)];
        return (namespaceId) ? SymbolInternals.concatIntoSymbol(namespaceId, SymbolInternals.identityOfSymbol(symbol)) : symbol;
    }

    /**
     * Converts JS native data types to text
     * @param {Object} dataValue
     * @return {String} text
     */
    static encodeText(dataValue) {
        switch(typeof dataValue) {
            case 'string':
                return '"' + dataValue + '"';
            case 'object':
                if(dataValue instanceof Array)
                    return '['+dataValue.map(value => this.encodeText(value)).join(', ')+']';
                return 'hex:'+Utils.encodeAsHex(dataValue);
            default:
                return '' + dataValue;
        }
    }

    /**
     * Converts text to JS native data types
     * @param {String} text
     * @return {Object} dataValue
     */
    static decodeText(text) {
        const inner = text.match(/"((?:[^\\"]|\\.)*)"/);
        if(inner != undefined)
            return inner[1];
        if(text.length > 4 && text.substr(0, 4) == 'hex:')
            return Utils.decodeAsHex(text.substr(4));
        else if(text === 'false' || text === 'true')
            return (text === 'true');
        else if(!Number.isNaN(parseFloat(text)))
            return parseFloat(text);
        else if(!Number.isNaN(parseInt(text)))
            return parseInt(text);
        else if(text.toLowerCase() === 'nan')
            return NaN;
    }

    /**
     * Converts bits to JS native data types using the given encoding
     * @param {Symbol} encoding
     * @param {Uint8Array} dataBytes
     * @param {Object} feedback Used to control the length (input and output)
     * @param {Number} feedback.length in bits
     * @return {Object} dataValue
     */
    decodeBinary(encoding, dataBytes, feedback) {
        const dataView = new DataView(dataBytes.buffer);
        switch(encoding) {
            case symbolByName.Void:
                return dataBytes;
            case symbolByName.BinaryNumber:
            if(feedback.length === 1)
                return (dataView.getUint8(0) === 1);
            case symbolByName.TwosComplement:
            case symbolByName.IEEE754:
                console.assert(feedback.length >= 32);
                feedback.length = 32;
                switch(encoding) {
                    case symbolByName.BinaryNumber:
                        return dataView.getUint32(0, true);
                    case symbolByName.TwosComplement:
                        return dataView.getInt32(0, true);
                    case symbolByName.IEEE754:
                        return dataView.getFloat32(0, true);
                }
            case symbolByName.UTF8:
                return Utils.encodeAsUTF8(dataBytes.slice(0, feedback.length/8));
        }
        if(!this.getTriple([encoding, symbolByName.Type, symbolByName.Composite]))
            return dataBytes;
        const dataValue = [],
              defaultEncoding = this.getPairOptionally(encoding, symbolByName.Default);
        let slotSize = this.getPairOptionally(encoding, symbolByName.SlotSize);
        if(slotSize !== symbolByName.Void && slotSize !== symbolByName.Dynamic)
            slotSize = this.getData(slotSize);
        let offset = 0, count = this.getPairOptionally(encoding, symbolByName.Count);
        if(count === symbolByName.Dynamic)
            count = dataView.getUint32((offset++)*4, true);
        else if(count !== symbolByName.Void)
            count = this.getData(count);
        feedback.length = 0;
        for(let i = 0; (count === symbolByName.Void && feedback.length < dataBytes.length*8) || i < count; ++i) {
            let childEncoding = this.getPairOptionally(encoding, this.constructor.symbolInNamespace('Index', i));
            if(childEncoding === symbolByName.Void)
                childEncoding = defaultEncoding;
            const childFeedback = {'length': (slotSize === symbolByName.Dynamic) ? dataView.getUint32((offset+i)*4, true) : slotSize};
            let childDataBytes;
            if(childFeedback.length === symbolByName.Void) {
                childDataBytes = dataBytes.slice(feedback.length/8);
                childFeedback.length = childDataBytes.length*8;
            } else if(feedback.length < dataBytes.length*8)
                childDataBytes = dataBytes.slice(feedback.length/8, (feedback.length+childFeedback.length)/8);
            else
                throw new Error('Expected more children but dataBytes is too short');
            const childDataValue = this.decodeBinary(childEncoding, childDataBytes, childFeedback);
            dataValue.push(childDataValue);
            feedback.length += childFeedback.length;
        }
        return dataValue;
    }

    /**
     * Converts JS native data types to bits using the given encoding
     * @param {Symbol} encoding
     * @param {Object} dataValue
     * @return {Uint8Array} dataBytes
     */
    encodeBinary(encoding, dataValue) {
        let dataBytes = new Uint8Array(4);
        const dataView = new DataView(dataBytes.buffer);
        switch(encoding) {
            case symbolByName.Void:
                return dataValue;
            case symbolByName.BinaryNumber:
                if(typeof dataValue === 'boolean')
                    return new Uint8Array([(dataValue) ? 1 : 0]);
                dataView.setUint32(0, dataValue, true);
                return dataBytes;
            case symbolByName.TwosComplement:
                dataView.setInt32(0, dataValue, true);
                return dataBytes;
            case symbolByName.IEEE754:
                dataView.setFloat32(0, dataValue, true);
                return dataBytes;
            case symbolByName.UTF8:
                return Utils.decodeAsUTF8(dataValue);
        }
        if(!this.getTriple([encoding, symbolByName.Type, symbolByName.Composite]))
            return dataValue;
        const dataBytesArray = [],
              defaultEncoding = this.getPairOptionally(encoding, symbolByName.Default);
        let slotSize = this.getPairOptionally(encoding, symbolByName.SlotSize);
        if(slotSize !== symbolByName.Void && slotSize !== symbolByName.Dynamic)
            slotSize = this.getData(slotSize);
        let offset = 0, count = this.getPairOptionally(encoding, symbolByName.Count);
        if(count === symbolByName.Dynamic)
            dataView.setUint32(offset++, dataValue.length, true);
        else if(count !== symbolByName.Void && dataValue.length !== this.getData(count))
            throw new Error('Provided dataValue array length does not match count specified in the composite encoding');
        let length = 0;
        for(let i = 0; i < dataValue.length; ++i) {
            let childEncoding = this.getPairOptionally(encoding, this.constructor.symbolInNamespace('Index', i));
            if(childEncoding === symbolByName.Void)
                childEncoding = defaultEncoding;
            const childDataBytes = this.encodeBinary(childEncoding, dataValue[i]);
            if(slotSize === symbolByName.Dynamic)
                dataView.setUint32(offset+i, childDataBytes.length*8, true);
            dataBytesArray.push(childDataBytes);
            length += childDataBytes.length*8;
        }
        dataBytes = new Uint8Array(length/8);
        length = 0;
        for(const childDataBytes of dataBytesArray) {
            dataBytes.set(childDataBytes, length/8);
            length += childDataBytes.length*8;
        }
        return dataBytes;
    }



    /**
     * Fills the predefined symbols
     */
    initPredefinedSymbols() {
        const names = Object.getOwnPropertyNames(symbolByName);
        for(const name of names)
            this.manifestSymbol(symbolByName[name]);
        for(const name of names)
            this.setData(symbolByName[name], name);
        for(const entity of [symbolByName.BinaryNumber, symbolByName.TwosComplement, symbolByName.IEEE754, symbolByName.UTF8, symbolByName.Composite])
            this.setTriple([entity, symbolByName.Type, symbolByName.Encoding], true);
    }

    /**
     * Creates a new namespace with the given symbols and adds them to symbolByName
     * @param {String} namespaceName
     * @param {String[]} symbolNames
     * @return {Identity} identity of the new namespace
     */
    registerAdditionalSymbols(namespaceName, symbolNames) {
        const namespaceSymbol = this.createSymbol(SymbolInternals.identityOfSymbol(symbolByName.Namespaces)),
              namespaceIdentity = SymbolInternals.identityOfSymbol(namespaceSymbol);
        symbolByName[namespaceName] = namespaceSymbol;
        this.setData(namespaceSymbol, namespaceName);
        for(const name of symbolNames) {
            const symbol = this.createSymbol(namespaceIdentity);
            symbolByName[name] = symbol;
            this.setData(symbol, name);
        }
        return namespaceIdentity;
    }

    /**
     * Makes sure a symbol exists
     * @param {Symbol} symbol
     * @return {Boolean} False if it already existed
     */
    manifestSymbol(symbol) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Creates a new symbol
     * @param {Identity} namespaceIdentity Identity of the namespace to create the symbol in
     * @return {Symbol} symbol
     */
    createSymbol(namespaceIdentity) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Deletes a symbol
     * @param {Symbol} symbol
     * @return {Boolean} False if it did not exist
     */
    releaseSymbol(symbol) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Unlinks all triples of a symbol and releases it
     * @param {Symbol} symbol
     */
    unlinkSymbol(symbol) {
        for(const triple of this.queryTriples(queryMasks.MVV, [symbol, symbolByName.Void, symbolByName.Void]))
            this.setTriple(triple, false);
        for(const triple of this.queryTriples(queryMasks.VMV, [symbolByName.Void, symbol, symbolByName.Void]))
            this.setTriple(triple, false);
        for(const triple of this.queryTriples(queryMasks.VVM, [symbolByName.Void, symbolByName.Void, symbol]))
            this.setTriple(triple, false);
        this.setLength(symbol, 0);
        this.releaseSymbol(symbol);
        return true;
    }

    /**
     * Returns the length of the symbols virtual space
     * @param {Symbol} symbol
     * @return {Number} length in bits
     */
    getLength(symbol) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Inserts or erases a slice of a symbols virtual space at the given offset and with the given length
     * @param {Symbol} symbol
     * @param {Number} offset in bits
     * @param {Number} length in bits (positive=insert, negative=erase)
     * @return {Boolean} True on success (changes occurred)
     */
    creaseLength(symbol, offset, length) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Increases or deceases the length of a symbols virtual space at the end
     * @param {Symbol} symbol
     * @param {Number} newLength in bits
     */
    setLength(symbol, newLength) {
        const length = this.getLength(symbol);
        if(newLength != length)
            console.assert(this.creaseLength(symbol, Math.min(length, newLength), newLength-length));
        return true;
    }

    /**
     * Returns a slice of copied data starting at the given offset and with the given length
     * @param {Symbol} symbol
     * @param {Number} offset in bits
     * @param {Number} length in bits
     * @return {Uint8Array} dataBytes (undefined on error)
     */
    readData(symbol, offset, length) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Replaces a slice of data starting at the given offset and with the given length by dataBytes
     * @param {Symbol} symbol
     * @param {Number} offset in bits
     * @param {Number} length in bits
     * @param {Uint8Array} dataBytes
     * @return {Boolean} True on success (changes occurred)
     */
    writeData(symbol, offset, length, dataBytes) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Returns a symbols entire data converted to JS native data types
     * @param {Symbol} symbol
     * @param {Uint8Array} dataBytes
     * @param {Number} dataLength in bits
     * @return {Object} dataValue
     */
    getData(symbol, dataBytes, dataLength) {
        if(!dataBytes)
            dataBytes = this.getRawData(symbol);
        if(!dataLength)
            dataLength = this.getLength(symbol);
        if(dataLength > 0) {
            const encoding = this.getPairOptionally(symbol, symbolByName.Encoding);
            return this.decodeBinary(encoding, dataBytes, {'length': dataLength});
        }
    }

    /**
     * Replaces the symbols entire data by JS native data types
     * @param {Symbol} symbol
     * @param {Object} dataValue
     * @return {Uint8Array} dataBytes
     */
    setData(symbol, dataValue) {
        let encoding;
        const isBool = (typeof dataValue === 'boolean');
        switch(typeof dataValue) {
            case 'undefined':
                encoding = symbolByName.Void;
                this.getAndSetPairs(symbol, symbolByName.Encoding, encoding);
                break;
            case 'string':
                encoding = symbolByName.UTF8;
                this.getAndSetPairs(symbol, symbolByName.Encoding, encoding);
                break;
            case 'number':
            case 'boolean':
                if(!Number.isInteger(dataValue) && !isBool)
                    encoding = symbolByName.IEEE754;
                else if(dataValue < 0)
                    encoding = symbolByName.TwosComplement;
                else
                    encoding = symbolByName.BinaryNumber;
                this.getAndSetPairs(symbol, symbolByName.Encoding, encoding);
                break;
            default:
                encoding = this.getPairOptionally(symbol, symbolByName.Encoding);
                break;
        }
        const dataBytes = this.encodeBinary(encoding, dataValue);
        this.setRawData(symbol, dataBytes, (isBool) ? 1 : 0);
        return dataBytes;
    }

    /**
     * Returns the entire data of a symbol
     * @param {Symbol} symbol
     * @return {Uint8Array} dataBytes
     */
    getRawData(symbol) {
        const length = this.getLength(symbol);
        return (length == 0) ? new Uint8Array() : this.readData(symbol, 0, length);
    }

    /**
     * Replaces the entire data of a symbol
     * @param {Symbol} symbol
     * @param {Uint8Array} dataBytes
     * @param {Number} dataLength in bits
     */
    setRawData(symbol, dataBytes, dataLength) {
        if(!dataBytes) {
            this.setLength(symbol, 0);
            return true;
        }
        if(!dataLength)
            dataLength = dataBytes.byteLength * 8;
        this.setLength(symbol, dataLength);
        console.assert(this.writeData(symbol, 0, dataLength, dataBytes));
        return true;
    }

    /**
     * Returns a symbols entire data converted to a string of '0's and '1's
     * @param {Symbol} symbol
     * @return {String} binary
     */
    getBitString(symbol) {
        return Utils.asBitString(this.getRawData(symbol), this.getLength(symbol));
    }

    /**
     * Replaces a slice of a symbols data by another symbols data
     * @param {Symbol} dstSymbol
     * @param {Number} dstOffset in bits
     * @param {Symbol} srcSymbol
     * @param {Number} srcOffset in bits
     * @param {Number} length in bits
     * @return {Boolean} True on success (changes occurred)
     */
    replaceData(dstSymbol, dstOffset, srcSymbol, srcOffset, length) {
        return this.replaceDataSimultaneously([{'dstSymbol': dstSymbol, 'dstOffset': dstOffset, 'srcSymbol': srcSymbol, 'srcOffset': srcOffset, 'length': length}]);
    }

    /**
     * Multiple independent calls to replaceData() without influencing each other. Slices must not overlap at their destinations.
     * @param {ReplaceDataOperation[]} operations
     */
    replaceDataSimultaneously(operations) {
        const byDstSymbol = SymbolMap.create();
        for(const operation of operations) {
            operation.dataBytes = this.readData(operation.srcSymbol, operation.srcOffset, operation.length);
            if(operation.length < 0 || !operation.dataBytes || operation.dstOffset+operation.length > this.getLength(operation.dstSymbol))
                return false;
            SymbolMap.getOrInsert(byDstSymbol, operation.dstSymbol, []).push(operation);
        }
        for(const [dstSymbol, operationsOfDstSymbol] of SymbolMap.entries(byDstSymbol)) {
            operationsOfDstSymbol.sort((a, b) => a.dstOffset-b.dstOffset);
            for(let i = 1; i < operationsOfDstSymbol.length; ++i)
                if(operationsOfDstSymbol[i-1].dstOffset+operationsOfDstSymbol[i-1].length > operationsOfDstSymbol[i].dstOffset)
                    return false;
        }
        for(const [dstSymbol, operationsOfDstSymbol] of SymbolMap.entries(byDstSymbol))
            for(const operation of operationsOfDstSymbol)
                console.assert(this.writeData(operation.dstSymbol, operation.dstOffset, operation.length, operation.dataBytes));
        return true;
    }

    /**
     * Yields all symbols in a namespace
     * @param {Identity} namespaceIdentity
     * @yield {Symbol} symbol
     */
    *querySymbols(namespaceIdentity) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Yields all matching triples according to the given triple and mask. The final .next() returns the count of matches
     * @param {QueryMask} mask
     * @param {Triple} triple
     * @return {Triple} iterator of matches
     */
    queryTriples(mask, triple) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Links or unlinks a triple
     * @param {Triple} triple
     * @param {Boolean} linked
     * @return {Boolean} True on success (changes occurred)
     */
    setTriple(triple, linked) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Tests if the given Triple exists
     * @param {Triple} triple
     * @param {QueryMask} mask
     * @return {Boolean} linked
     */
    getTriple(triple, mask=queryMasks.MMM) {
        switch(mask) {
            case queryMasks.MMM:
            case queryMasks.IMM:
            case queryMasks.MIM:
            case queryMasks.MMI:
            case queryMasks.MII:
            case queryMasks.IMI:
            case queryMasks.IIM:
            case queryMasks.III:
                break;
            default:
                throw new Error('Unsupported query mask');
        }
        const iterator = this.queryTriples(mask, triple);
        return iterator.next().value.length === 3 && iterator.next().value === 1;
    }

    /**
     * Searches and modifes triples based on a pair of matching symbols and varying third
     * @param {Symbol} first Matching symbol pair
     * @param {Symbol} second Matching symbol pair
     * @param {undefined|Symbol|Set<Symbol>} thirds Varying is replaced by these (won't modify anything if undefined)
     * @param {QueryMask} mask
     * @return {Set<Symbol>} Varying search result
     */
    getAndSetPairs(first, second, thirds, mask=queryMasks.MMV) {
        let index, triple;
        switch(mask) {
            case queryMasks.VMM:
            case queryMasks.VIM:
            case queryMasks.VMI:
                index = 0;
                triple = [symbolByName.Void, first, second];
                break;
            case queryMasks.MVM:
            case queryMasks.IVM:
            case queryMasks.MVI:
                index = 1;
                triple = [first, symbolByName.Void, second];
                break;
            case queryMasks.MMV:
            case queryMasks.IMV:
            case queryMasks.MIV:
                index = 2;
                triple = [first, second, symbolByName.Void];
                break;
            default:
                throw new Error('Unsupported query mask');
        }
        const result = new Set();
        for(const queryTriple of this.queryTriples(mask, triple)) {
            if(thirds)
                this.setTriple(queryTriple, false);
            result.add(queryTriple[index]);
        }
        if(SymbolInternals.validateSymbol(thirds)) {
            triple[index] = thirds;
            this.setTriple(triple, true);
        } else if(thirds)
            for(const thrid of thirds) {
                triple[index] = third;
                this.setTriple(triple, true);
            }
        return result;
    }

    /**
     * Returns the third symbol if exactly one triple matches the given pair otherwise Void is returned
     * @param {Symbol} first Matching symbol pair
     * @param {Symbol} second Matching symbol pair
     * @param {QueryMask} mask
     * @return {Symbol} third symbol or Void
     */
    getPairOptionally(first, second, mask=queryMasks.MMV) {
        const thirds = this.getAndSetPairs(first, second, undefined, mask);
        return (thirds.size == 1) ? thirds.values().next().value : symbolByName.Void;
    }

    /**
     * Scan through all internal structures and check their integrity
     * @return {Boolean} True on success
     */
    validateIntegrity() {
        throw new Error('Abstract, not implemented');
    }



    /**
     * @deprecated Use Diff.encodeJson() instead.
     * Exports the specified namespaces as JSON
     * @param {Identity[]} namespaces The namespaces to export
     * @return {String} json
     */
    encodeJson(namespaces) {
        const entities = [];
        for(const namespaceIdentity of namespaces)
            for(const symbol of [...this.querySymbols(namespaceIdentity)].sort(SymbolInternals.compareSymbols)) {
                const attributes = [], betaCollection = [];
                for(const triple of this.queryTriples(queryMasks.MVI, [symbol, symbolByName.Void, symbolByName.Void]))
                    attributes.push(triple[1]);
                attributes.sort(SymbolInternals.compareSymbols);
                for(const attribute of attributes) {
                    const values = [];
                    betaCollection.push(SymbolInternals.symbolToString(attribute));
                    betaCollection.push(values);
                    for(const triple of this.queryTriples(queryMasks.MMV, [symbol, attribute, symbolByName.Void]))
                        values.push(SymbolInternals.symbolToString(triple[2]));
                    values.sort(SymbolInternals.compareSymbols);
                }
                entities.push([
                    SymbolInternals.symbolToString(symbol),
                    this.getLength(symbol),
                    Utils.encodeAsHex(this.getRawData(symbol)),
                    betaCollection
                ]);
            }
        return JSON.stringify({
            'symbols': entities
        }, undefined, '\t');
    }

    /**
     * @deprecated Use Diff.decodeJson() instead.
     * Imports content from JSON
     * @param {String} json
     */
    decodeJson(json) {
        const entities = new Set();
        for(const entry of JSON.parse(json).symbols) {
            const entity = SymbolInternals.symbolFromString(entry[0]);
            entities.add(entity);
            this.manifestSymbol(entity);
            if(entry[1] > 0)
                this.setRawData(entity, Utils.decodeAsHex(entry[2]));
            this.setLength(entity, entry[1]);
            const attributes = entry[3];
            for(let i = 0; i < attributes.length; i += 2) {
                const attribute = SymbolInternals.symbolFromString(attributes[i]);
                for(const value of attributes[i+1])
                    this.setTriple([entity, attribute, SymbolInternals.symbolFromString(value)], true);
            }
        }
        return entities;
    }
};
