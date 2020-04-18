import {Utils, SymbolInternals, SymbolMap} from '../SymatemJS.mjs';

const queryMode = ['M', 'V', 'I'],
      queryMasks = {};
for(let i = 0; i < 27; ++i)
    queryMasks[queryMode[i % 3] + queryMode[Math.floor(i / 3) % 3] + queryMode[Math.floor(i / 9) % 3]] = i;

const PredefinedSymbols = {
    'Namespaces': [],
    'Index': [],
    'Basics': [
        'Void',
        'Entity',
        'Attribute',
        'Value',
        'Type',
        'Encoding',
        'BinaryNumber',
        'TwosComplement',
        'IEEE754',
        'UTF8',
        'Composite',
        'Default',
        'SlotSize',
        'Count',
        'Dynamic',
    ],
    'VersionControl': [
        'ManifestSymbol',
        'ReleaseSymbol',
        'LinkTriple',
        'UnlinkTriple',
        'IncreaseLength',
        'DecreaseLength',
        'DataSource',
        'DataRestore',
        'ReplaceData',
        'Source',
        'Destination',
        'SourceOffset',
        'DestinationOffset',
        'Length',
        'MinimumLength',
        'ForwardLength',
        'ReverseLength',
        'Version',
        'Materialization',
        'Edge',
        'Diff',
        'Parent',
        'Child'
    ]
};



/** Abstract super class of all backends */
export default class BasicBackend {
    /** The identity of the namespace which lists all namespaces
      * @return {Identity}
      */
    static get metaNamespaceIdentity() {
        return 0;
    }

    /** All 27 query masks by their name
      * @enum {number}
      */
    static get queryMasks() {
        return queryMasks;
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
     * @return {string} text
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
     * @param {string} text
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
     * @param {number} feedback.length in bits
     * @return {Object} dataValue
     */
    decodeBinary(encoding, dataBytes, feedback) {
        const dataView = new DataView(dataBytes.buffer);
        switch(SymbolInternals.symbolToString(encoding)) {
            case SymbolInternals.symbolToString(this.symbolByName.Void):
                return dataBytes;
            case SymbolInternals.symbolToString(this.symbolByName.BinaryNumber):
            if(feedback.length === 1)
                return (dataView.getUint8(0) === 1);
            case SymbolInternals.symbolToString(this.symbolByName.TwosComplement):
            case SymbolInternals.symbolToString(this.symbolByName.IEEE754):
                console.assert(feedback.length >= 32);
                feedback.length = 32;
                switch(SymbolInternals.symbolToString(encoding)) {
                    case SymbolInternals.symbolToString(this.symbolByName.BinaryNumber):
                        return dataView.getUint32(0, true);
                    case SymbolInternals.symbolToString(this.symbolByName.TwosComplement):
                        return dataView.getInt32(0, true);
                    case SymbolInternals.symbolToString(this.symbolByName.IEEE754):
                        return dataView.getFloat32(0, true);
                }
            case SymbolInternals.symbolToString(this.symbolByName.UTF8):
                return Utils.encodeAsUTF8(dataBytes.slice(0, feedback.length/8));
        }
        if(!this.getTriple([encoding, this.symbolByName.Type, this.symbolByName.Composite]))
            return dataBytes;
        const dataValue = [],
              defaultEncoding = this.getPairOptionally(encoding, this.symbolByName.Default);
        let slotSize = this.getPairOptionally(encoding, this.symbolByName.SlotSize);
        if(!SymbolInternals.areSymbolsEqual(slotSize, this.symbolByName.Void) && !SymbolInternals.areSymbolsEqual(slotSize, this.symbolByName.Dynamic))
            slotSize = this.getData(slotSize);
        let offset = 0, count = this.getPairOptionally(encoding, this.symbolByName.Count);
        if(SymbolInternals.areSymbolsEqual(count, this.symbolByName.Dynamic))
            count = dataView.getUint32((offset++)*4, true);
        else if(!SymbolInternals.areSymbolsEqual(count, this.symbolByName.Void))
            count = this.getData(count);
        feedback.length = 0;
        for(let i = 0; (SymbolInternals.areSymbolsEqual(count, this.symbolByName.Void) && feedback.length < dataBytes.length*8) || i < count; ++i) {
            let childEncoding = this.getPairOptionally(encoding, this.constructor.symbolInNamespace('Index', i));
            if(SymbolInternals.areSymbolsEqual(childEncoding, this.symbolByName.Void))
                childEncoding = defaultEncoding;
            const childFeedback = {'length': (SymbolInternals.areSymbolsEqual(slotSize, this.symbolByName.Dynamic)) ? dataView.getUint32((offset+i)*4, true) : slotSize};
            let childDataBytes;
            if(SymbolInternals.areSymbolsEqual(childFeedback.length, this.symbolByName.Void)) {
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
        switch(SymbolInternals.symbolToString(encoding)) {
            case SymbolInternals.symbolToString(this.symbolByName.Void):
                return dataValue;
            case SymbolInternals.symbolToString(this.symbolByName.BinaryNumber):
                if(typeof dataValue === 'boolean')
                    return new Uint8Array([(dataValue) ? 1 : 0]);
                dataView.setUint32(0, dataValue, true);
                return dataBytes;
            case SymbolInternals.symbolToString(this.symbolByName.TwosComplement):
                dataView.setInt32(0, dataValue, true);
                return dataBytes;
            case SymbolInternals.symbolToString(this.symbolByName.IEEE754):
                dataView.setFloat32(0, dataValue, true);
                return dataBytes;
            case SymbolInternals.symbolToString(this.symbolByName.UTF8):
                return Utils.decodeAsUTF8(dataValue);
        }
        if(!this.getTriple([encoding, this.symbolByName.Type, this.symbolByName.Composite]))
            return dataValue;
        const dataBytesArray = [],
              defaultEncoding = this.getPairOptionally(encoding, this.symbolByName.Default);
        let slotSize = this.getPairOptionally(encoding, this.symbolByName.SlotSize);
        if(slotSize !== this.symbolByName.Void && slotSize !== this.symbolByName.Dynamic)
            slotSize = this.getData(slotSize);
        let offset = 0, count = this.getPairOptionally(encoding, this.symbolByName.Count);
        if(SymbolInternals.areSymbolsEqual(count, this.symbolByName.Dynamic))
            dataView.setUint32(offset++, dataValue.length, true);
        else if(count !== this.symbolByName.Void && dataValue.length !== this.getData(count))
            throw new Error('Provided dataValue array length does not match count specified in the composite encoding');
        let length = 0;
        for(let i = 0; i < dataValue.length; ++i) {
            let childEncoding = this.getPairOptionally(encoding, this.constructor.symbolInNamespace('Index', i));
            if(SymbolInternals.areSymbolsEqual(childEncoding, this.symbolByName.Void))
                childEncoding = defaultEncoding;
            const childDataBytes = this.encodeBinary(childEncoding, dataValue[i]);
            if(SymbolInternals.areSymbolsEqual(slotSize, this.symbolByName.Dynamic))
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
     * Manifests a namespace with the given symbols and adds them to symbolByName
     * @param {Identity} namespaceIdentity
     * @param {string[]} symbolNames
     * @param {boolean} assignNames If false the symbols names will not be assigned (stored in the data field)
     */
    registerSymbolsInNamespace(namespaceIdentity, symbolNames, assignNames=true) {
        if(symbolNames.length == 0)
            return;
        for(const name of symbolNames)
            if(!this.symbolByName[name])
                this.symbolByName[name] = null;
        if(!this.manifestSymbol(SymbolInternals.concatIntoSymbol(this.constructor.metaNamespaceIdentity, namespaceIdentity)))
            for(const symbol of this.querySymbols(namespaceIdentity)) {
                const name = this.getData(symbol);
                if(this.symbolByName[name] === null)
                    this.symbolByName[name] = symbol;
            }
        for(const name of symbolNames)
            if(this.symbolByName[name] === null) {
                const symbol = this.createSymbol(namespaceIdentity);
                this.symbolByName[name] = symbol;
                if(assignNames)
                    this.setData(symbol, name);
            }
    }

    /**
     * Manifests namespaces with the given names and adds them to symbolByName
     * @param {string[]} symbolNamesByNamespace
     * @param {boolean} assignNames If false the symbols names will not be assigned (stored in the data field)
     * @return {Object} Namespace identities can be used as input parameter for createSymbol
     */
    registerNamespaces(symbolNamesByNamespace, assignNames=true) {
        this.registerSymbolsInNamespace(this.constructor.metaNamespaceIdentity, Object.keys(symbolNamesByNamespace), assignNames);
        const namespaceIdentityByName = {};
        for(const [namespaceName, symbolNames] of Object.entries(symbolNamesByNamespace)) {
            namespaceIdentityByName[namespaceName] = SymbolInternals.identityOfSymbol(this.symbolByName[namespaceName]);
            this.registerSymbolsInNamespace(namespaceIdentityByName[namespaceName], symbolNames, assignNames);
        }
        return namespaceIdentityByName;
    }

    /**
     * Fills the predefined symbols
     */
    initPredefinedSymbols() {
        this.symbolByName = {};
        this.symbolByName.Namespaces = SymbolInternals.concatIntoSymbol(this.constructor.metaNamespaceIdentity, this.constructor.metaNamespaceIdentity);
        this.registerNamespaces(PredefinedSymbols, false);
        for(const [name, symbol] of Object.entries(this.symbolByName))
            this.setData(symbol, name);
        for(const entity of [this.symbolByName.BinaryNumber, this.symbolByName.TwosComplement, this.symbolByName.IEEE754, this.symbolByName.UTF8, this.symbolByName.Composite])
            this.setTriple([entity, this.symbolByName.Type, this.symbolByName.Encoding], true);
    }

    /**
     * Same as concatIntoSymbol but resolves the namespaceIdentity by name
     * @param {string} namespaceName
     * @param {Identity} identity
     * @return {Symbol} symbol
     */
    symbolInNamespace(namespaceName, identity) {
        return SymbolInternals.concatIntoSymbol(SymbolInternals.identityOfSymbol(this.symbolByName[namespaceName]), identity);
    }

    /**
     * Makes sure a symbol exists
     * @param {Symbol} symbol
     * @return {boolean} False if it already existed
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
     * @return {boolean} False if it did not exist
     */
    releaseSymbol(symbol) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Returns all triples a symbol is taking part in
     * @param {Symbol} symbol
     * @param {Set} [result] Optionally, an existing set chained from other calls (union of sets)
     * @return {Set} result
     */
    getTriplesOfSymbol(symbol, result) {
        if(!result)
            result = new Set();
        for(const triple of this.queryTriples(queryMasks.MVV, [symbol, this.symbolByName.Void, this.symbolByName.Void]))
            result.add(SymbolInternals.tripleToString(triple));
        for(const triple of this.queryTriples(queryMasks.VMV, [this.symbolByName.Void, symbol, this.symbolByName.Void]))
            result.add(SymbolInternals.tripleToString(triple));
        for(const triple of this.queryTriples(queryMasks.VVM, [this.symbolByName.Void, this.symbolByName.Void, symbol]))
            result.add(SymbolInternals.tripleToString(triple));
        return result;
    }

    /**
     * Unlinks all triples of a symbol, empties its data field and releases it
     * @param {Symbol} symbol
     */
    unlinkSymbol(symbol) {
        for(const triple of this.getTriplesOfSymbol(symbol))
            this.setTriple(SymbolInternals.tripleFromString(triple), false);
        this.setLength(symbol, 0);
        this.releaseSymbol(symbol);
        return true;
    }

    /**
     * Unlinks all symbols and triples of a namespace, but does not release the namespace
     * @param {Identity} namespaceIdentity
     */
    clearNamespace(namespaceIdentity) {
        for(const symbol of this.querySymbols(namespaceIdentity))
            this.unlinkSymbol(symbol);
    }

    /**
     * Clones all symbols and triples of a namespace and their connections to other namespaces
     * @param {RelocationTable} namespaces Relocate from source (key) to destination (value)
     */
    cloneNamespaces(namespaces) {
        const triples = new Set();
        for(const [srcNamespaceIdentity, dstNamespaceIdentity] of Object.entries(namespaces))
            for(const srcSymbol of this.querySymbols(srcNamespaceIdentity)) {
                const dstSymbol = this.constructor.relocateSymbol(srcSymbol, namespaces),
                      length = this.getLength(srcSymbol);
                console.assert(this.manifestSymbol(dstSymbol));
                console.assert(this.setLength(dstSymbol, length));
                console.assert(this.writeData(dstSymbol, 0, length, this.readData(srcSymbol, 0, length)));
                this.getTriplesOfSymbol(srcSymbol, triples);
            }
        for(const tripleString of triples) {
            const triple = SymbolInternals.tripleFromString(tripleString);
            for(let i = 0; i < 3; ++i)
                triple[i] = this.constructor.relocateSymbol(triple[i], namespaces);
            console.assert(this.setTriple(triple, true));
        }
    }

    /**
     * Returns the length of the symbols virtual space
     * @param {Symbol} symbol
     * @return {number} length in bits
     */
    getLength(symbol) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Inserts or erases a slice of a symbols virtual space at the given offset and with the given length
     * @param {Symbol} symbol
     * @param {number} offset in bits
     * @param {number} length in bits (positive=insert, negative=erase)
     * @return {boolean} True on success (changes occurred)
     */
    creaseLength(symbol, offset, length) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Increases or deceases the length of a symbols virtual space at the end
     * @param {Symbol} symbol
     * @param {number} newLength in bits
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
     * @param {number} offset in bits
     * @param {number} length in bits
     * @return {Uint8Array} dataBytes (undefined on error)
     */
    readData(symbol, offset, length) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Replaces a slice of data starting at the given offset and with the given length by dataBytes
     * @param {Symbol} symbol
     * @param {number} offset in bits
     * @param {number} length in bits
     * @param {Uint8Array} dataBytes
     * @return {boolean} True on success (changes occurred)
     */
    writeData(symbol, offset, length, dataBytes) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Returns a symbols entire data converted to JS native data types
     * @param {Symbol} symbol
     * @param {Uint8Array} dataBytes
     * @param {number} dataLength in bits
     * @return {Object} dataValue
     */
    getData(symbol, dataBytes, dataLength) {
        if(!dataBytes)
            dataBytes = this.getRawData(symbol);
        if(!dataLength)
            dataLength = this.getLength(symbol);
        if(dataLength > 0) {
            const encoding = this.getPairOptionally(symbol, this.symbolByName.Encoding);
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
                encoding = this.symbolByName.Void;
                this.getAndSetPairs(symbol, this.symbolByName.Encoding, [encoding]);
                break;
            case 'string':
                encoding = this.symbolByName.UTF8;
                this.getAndSetPairs(symbol, this.symbolByName.Encoding, [encoding]);
                break;
            case 'number':
            case 'boolean':
                if(!Number.isInteger(dataValue) && !isBool)
                    encoding = this.symbolByName.IEEE754;
                else if(dataValue < 0)
                    encoding = this.symbolByName.TwosComplement;
                else
                    encoding = this.symbolByName.BinaryNumber;
                this.getAndSetPairs(symbol, this.symbolByName.Encoding, [encoding]);
                break;
            default:
                encoding = this.getPairOptionally(symbol, this.symbolByName.Encoding);
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
     * @param {number} dataLength in bits
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
     * @return {string} binary
     */
    getBitString(symbol) {
        return Utils.asBitString(this.getRawData(symbol), this.getLength(symbol));
    }

    /**
     * Replaces a slice of a symbols data by another symbols data
     * @param {Symbol} dstSymbol
     * @param {number} dstOffset in bits
     * @param {Symbol} srcSymbol
     * @param {number} srcOffset in bits
     * @param {number} length in bits
     * @return {boolean} True on success (changes occurred)
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
     * @param {boolean} linked
     * @return {boolean} True on success (changes occurred)
     */
    setTriple(triple, linked) {
        throw new Error('Abstract, not implemented');
    }

    /**
     * Tests if the given Triple exists
     * @param {Triple} triple
     * @param {QueryMask} mask
     * @return {boolean} linked
     */
    getTriple(triple, mask=queryMasks.MMM) {
        const iterator = this.queryTriples(mask, triple);
        return iterator.next().value.length === 3 && iterator.next().value === 1;
    }

    /**
     * Searches and modifes triples based on a pair of matching symbols and varying third
     * @param {Symbol} first Matching symbol pair
     * @param {Symbol} second Matching symbol pair
     * @param {undefined|Symbol[]} thirds Varying is replaced by these (won't modify anything if undefined)
     * @param {QueryMask} mask
     * @return {SymbolMap} Varying search result
     */
    getAndSetPairs(first, second, thirds, mask=queryMasks.MMV) {
        let index, triple;
        switch(mask) {
            case queryMasks.VMM:
            case queryMasks.VIM:
            case queryMasks.VMI:
                index = 0;
                triple = [this.symbolByName.Void, first, second];
                break;
            case queryMasks.MVM:
            case queryMasks.IVM:
            case queryMasks.MVI:
                index = 1;
                triple = [first, this.symbolByName.Void, second];
                break;
            case queryMasks.MMV:
            case queryMasks.IMV:
            case queryMasks.MIV:
                index = 2;
                triple = [first, second, this.symbolByName.Void];
                break;
            default:
                throw new Error('Unsupported query mask');
        }
        const result = SymbolMap.create();
        for(const queryTriple of this.queryTriples(mask, triple)) {
            if(thirds)
                this.setTriple(queryTriple, false);
            SymbolMap.set(result, queryTriple[index], true);
        }
        if(thirds)
            for(const third of thirds) {
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
        return (SymbolMap.count(thirds) == 1) ? [...SymbolMap.symbols(thirds)][0] : this.symbolByName.Void;
    }

    /**
     * Scan through all internal structures and check their integrity
     * @return {boolean} True on success
     */
    validateIntegrity() {
        throw new Error('Abstract, not implemented');
    }



    /**
     * @deprecated Use Diff.encodeJson() instead.
     * Exports the specified namespaces as JSON
     * @param {Identity[]} namespaceIdentities The namespaces to export
     * @return {string} json
     */
    encodeJson(namespaceIdentities) {
        const namespaces = {};
        for(const namespaceIdentity of namespaceIdentities) {
            const entries = namespaces[namespaceIdentity] = [];
            for(const symbol of [...this.querySymbols(namespaceIdentity)].sort(SymbolInternals.compareSymbols)) {
                const attributes = [], betaCollection = [];
                for(const triple of this.queryTriples(queryMasks.MVI, [symbol, this.symbolByName.Void, this.symbolByName.Void]))
                    attributes.push(triple[1]);
                attributes.sort(SymbolInternals.compareSymbols);
                for(const attribute of attributes) {
                    const values = [];
                    betaCollection.push(SymbolInternals.symbolToString(attribute));
                    for(const triple of this.queryTriples(queryMasks.MMV, [symbol, attribute, this.symbolByName.Void]))
                        values.push(triple[2]);
                    values.sort(SymbolInternals.compareSymbols);
                    betaCollection.push(values.map(symbol => SymbolInternals.symbolToString(symbol)));
                }
                const length = this.getLength(symbol);
                entries.push([
                    SymbolInternals.identityOfSymbol(symbol),
                    length,
                    Utils.encodeAsHex(new Uint8Array(this.getRawData(symbol).buffer, 0, Math.ceil(length/8))),
                    betaCollection
                ]);
            }
        }
        return JSON.stringify(namespaces, undefined, '\t');
    }

    /**
     * @deprecated Use Diff.decodeJson() instead.
     * Imports content from JSON
     * @param {string} json
     */
    decodeJson(json) {
        const entities = new Set();
        for(const [namespaceIdentity, entries] of Object.entries(JSON.parse(json)))
            for(const entry of entries) {
                const entity = SymbolInternals.concatIntoSymbol(namespaceIdentity, entry[0]);
                entities.add(entity);
                this.manifestSymbol(this.symbolInNamespace('Namespaces', SymbolInternals.namespaceOfSymbol(entity)));
                this.manifestSymbol(entity);
                if(entry[1] > 0)
                    this.setRawData(entity, Utils.decodeAsHex(entry[2]));
                this.setLength(entity, entry[1]);
                const attributes = entry[3];
                for(let i = 0; i < attributes.length; i += 2) {
                    const attribute = SymbolInternals.symbolFromString(attributes[i]);
                    this.manifestSymbol(this.symbolInNamespace('Namespaces', SymbolInternals.namespaceOfSymbol(attribute)));
                    this.manifestSymbol(attribute);
                    for(const valueStr of attributes[i+1]) {
                        const value = SymbolInternals.symbolFromString(valueStr);
                        this.manifestSymbol(this.symbolInNamespace('Namespaces', SymbolInternals.namespaceOfSymbol(value)));
                        this.manifestSymbol(value);
                        this.setTriple([entity, attribute, value], true);
                    }
                }
            }
        return entities;
    }
};
