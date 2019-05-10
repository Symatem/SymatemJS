Object.clone = function(obj) {
    return Object.assign(Object.create(Object.getPrototypeOf(obj)), obj);
};

String.prototype.repeat = function(count) {
    if(count < 1)
        return '';
    let result = '', pattern = this.valueOf();
    while(count > 1) {
        if(count & 1)
            result += pattern;
        count >>= 1;
        pattern += pattern;
    }
    return result+pattern;
};

Map.prototype.sorted = function(callback) {
    return new Map(Array.from(this.entries()).sort(callback));
};

DataView.prototype.djb2Hash = function() {
    let result = 5381;
    for(let i = 0; i < this.byteLength; ++i)
        result = ((result<<5)+result+this.getUint8(i))>>>0;
    return result; // ('0000000'+result.toString(16).toUpperCase()).substr(-8);
}

const queryMode = ['M', 'V', 'I'],
      queryMask = {};
for(let i = 0; i < 27; ++i)
    queryMask[queryMode[i % 3] + queryMode[Math.floor(i / 3) % 3] + queryMode[Math.floor(i / 9) % 3]] = i;

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
    'UnlinkSymbol': 0,
    'IncreaseLength': 0,
    'DecreaseLength': 0,
    'Draft': 0,
    'ReplaceData': 0,
    'MoveTriples': 0,
    'LinkTriple': 0,
    'UnlinkTriple': 0,
    'Source': 0,
    'Destination': 0,
    'SourceOffset': 0,
    'DestinationOffset': 0,
    'Length': 0,

    'Basics': 2,
    'Index': 2,
    'Namespaces': 2,
};

/**
 * @typedef {Object} Symbol
 * @property {Number} namespaceIdentity
 * @property {Number} identity
 */

/**
 * @typedef {Object} Triple
 * @property {Symbol} entity
 * @property {Symbol} attribute
 * @property {Symbol} value
 */

/**
 * @typedef {Object} ReplaceDataOperation
 * @property {Symbol} dstOffset
 * @property {Number} dstOffset in bits
 * @property {Symbol} srcSymbol
 * @property {Number} srcOffset in bits
 * @property {Number} length in bits
 */

export default class BasicBackend {
    static get queryMask() {
        return queryMask;
    }

    static get symbolByName() {
        return symbolByName;
    }

    /**
     * Saves dataBytes as download file in browsers
     * @param {Uint8Array} dataBytes
     * @param {String} fileName
     */
    static downloadAsFile(dataBytes, fileName) {
        const file = new Blob([dataBytes], {type: 'octet/stream'}),
              url = URL.createObjectURL(file),
              a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Converts UTF8 encoded Uint8Array to text
     * @param {Uint8Array} utf8
     * @return {String} text
     */
    static utf8ArrayToText(utf8) {
        // return new TextDecoder('utf8').decode(utf8);
        let uri = '';
        for(const byte of new Uint8Array(utf8)) {
            const hex = byte.toString(16);
            uri += '%' + ((hex.length == 1) ? '0' + hex : hex);
        }
        try {
            return decodeURIComponent(uri);
        } catch(error) {
            return utf8;
        }
    }

    /**
     * Converts text to UTF8 encoded Uint8Array
     * @param {String} text
     * @return {Uint8Array} utf8
     */
    static textToUtf8Array(text) {
        // return new TextEncoder('utf8').encode(text);
        const uri = encodeURI(text),
              dataBytes = [];
        for(let i = 0; i < uri.length; ++i) {
            if(uri[i] == '%') {
                dataBytes.push(parseInt(uri.substr(i + 1, 2), 16));
                i += 2;
            } else
                dataBytes.push(uri.charCodeAt(i));
        }
        return new Uint8Array(dataBytes);
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
                let string = '';
                for(let i = 0; i < dataValue.byteLength; ++i) {
                    const byte = dataValue[i];
                    string += (byte & 0xF).toString(16) + (byte >> 4).toString(16);
                }
                return 'hex:' + string.toUpperCase();
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
        if(text.length > 4 && text.substr(0, 4) == 'hex:') {
            const dataValue = new Uint8Array(Math.floor((text.length - 4) / 2));
            for(let i = 0; i < dataValue.byteLength; ++i)
                dataValue[i] = parseInt(text[i * 2 + 4], 16) | (parseInt(text[i * 2 + 5], 16) << 4);
            return dataValue;
        } else if(text === 'false' || text === 'true')
            return (text === 'true');
        else if(!Number.isNaN(parseFloat(text)))
            return parseFloat(text);
        else if(!Number.isNaN(parseInt(text)))
            return parseInt(text);
        else if(text.toLowerCase() === 'nan')
            return NaN;
    }

    /**
     * Concats namespaceIdentity and identity into a symbol
     * @param {Number} namespaceIdentity
     * @param {Number} identity
     * @return {Symbol} symbol
     */
    static concatIntoSymbol(namespaceIdentity, identity) {
        return `${namespaceIdentity}:${identity}`;
    }

    /**
     * Same as concatIntoSymbol but resolves the namespaceIdentity by name
     * @param {Number} namespaceName
     * @param {Number} identity
     * @return {Symbol} symbol
     */
    static symbolInNamespace(namespaceName, identity) {
        return BasicBackend.concatIntoSymbol(BasicBackend.identityOfSymbol(symbolByName[namespaceName]), identity);
    }

    /**
     * Extracts the namespaceIdentity of a symbol
     * @param {Symbol} symbol
     * @return {Number} namespaceIdentity
     */
    static namespaceOfSymbol(symbol) {
        return parseInt(symbol.split(':')[0]);
    }

    /**
     * Extracts the identity of a symbol
     * @param {Symbol} symbol
     * @return {Number} identity
     */
    static identityOfSymbol(symbol) {
        return parseInt(symbol.split(':')[1]);
    }

    /**
     * Relocates a symbol into another namespace according to a lookup table
     * @param {Symbol} symbol
     * @param {Object} namespaces relocation table
     * @return {Symbol} relocated symbol
     */
    static relocateSymbol(symbol, namespaces) {
        const namespaceId = namespaces[BasicBackend.namespaceOfSymbol(symbol)];
        return (namespaceId) ? BasicBackend.concatIntoSymbol(namespaceId, BasicBackend.identityOfSymbol(symbol)) : symbol;
    }



    /**
     * Fills the ontology with the predefined symbols
     */
    initBasicOntology() {
        for(const name of Object.getOwnPropertyNames(symbolByName))
            this.setData(symbolByName[name], name);
        for(const entity of [symbolByName.BinaryNumber, symbolByName.TwosComplement, symbolByName.IEEE754, symbolByName.UTF8, symbolByName.Composite])
            this.setTriple([entity, symbolByName.Type, symbolByName.Encoding], true);
    }

    /**
     * Creates a new namespace with the given symbols and adds them to symbolByName
     * @param {String} namespaceName
     * @param {String[]} symbolNames
     * @return {Number} identity of the new namespace
     */
    registerAdditionalSymbols(namespaceName, symbolNames) {
        const namespace = this.createSymbol(BasicBackend.identityOfSymbol(BasicBackend.symbolByName.Namespaces)),
              namespaceIdentity = BasicBackend.identityOfSymbol(namespace);
        symbolByName[namespaceName] = namespace;
        this.setData(namespace, namespaceName);
        for(const name of symbolNames) {
            const symbol = this.createSymbol(namespaceIdentity);
            symbolByName[name] = symbol;
            this.setData(symbol, name);
        }
        return namespaceIdentity;
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
            case symbolByName.TwosComplement:
            case symbolByName.IEEE754:
                if(length === 1 && encoding === symbolByName.BinaryNumber)
                    return (dataView.getUint8(0) === 1);
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
                return this.constructor.utf8ArrayToText(dataBytes);
        }
        if(!this.getTriple([encoding, symbolByName.Type, symbolByName.Composite]))
            return dataBytes;

        const dataValue = [],
              defaultEncoding = this.getSolitary(encoding, symbolByName.Default);

        let slotSize = this.getSolitary(encoding, symbolByName.SlotSize);
        if(slotSize !== symbolByName.Void && slotSize !== symbolByName.Dynamic)
            slotSize = this.getData(slotSize);

        let offset = 0, count = this.getSolitary(encoding, symbolByName.Count);
        if(count === symbolByName.Dynamic)
            count = dataView.getUint32((offset++)*4, true);
        else if(count !== symbolByName.Void)
            count = this.getData(count);

        feedback.length = 0;
        for(let i = 0; (count === symbolByName.Void && feedback.length < dataBytes.length*8) || i < count; ++i) {
            let childEncoding = this.getSolitary(encoding, this.constructor.symbolInNamespace('Index', i));
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
                return this.constructor.textToUtf8Array(dataValue);
        }
        if(!this.getTriple([encoding, symbolByName.Type, symbolByName.Composite]))
            return dataValue;

        const dataBytesArray = [],
              defaultEncoding = this.getSolitary(encoding, symbolByName.Default);

        let slotSize = this.getSolitary(encoding, symbolByName.SlotSize);
        if(slotSize !== symbolByName.Void && slotSize !== symbolByName.Dynamic)
            slotSize = this.getData(slotSize);

        let offset = 0, count = this.getSolitary(encoding, symbolByName.Count);
        if(count === symbolByName.Dynamic)
            dataView.setUint32(offset++, dataValue.length, true);
        else if(count !== symbolByName.Void && dataValue.length !== this.getData(count))
            throw new Error('Provided dataValue array length does not match count specified in the composite encoding');

        let length = 0;
        for(let i = 0; i < dataValue.length; ++i) {
            let childEncoding = this.getSolitary(encoding, this.constructor.symbolInNamespace('Index', i));
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
            const encoding = this.getSolitary(symbol, symbolByName.Encoding);
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
                this.setSolitary([symbol, symbolByName.Encoding, encoding]);
                break;
            case 'string':
                encoding = symbolByName.UTF8;
                this.setSolitary([symbol, symbolByName.Encoding, encoding]);
                break;
            case 'number':
            case 'boolean':
                if(!Number.isInteger(dataValue) && !isBool)
                    encoding = symbolByName.IEEE754;
                else if(dataValue < 0)
                    encoding = symbolByName.TwosComplement;
                else
                    encoding = symbolByName.BinaryNumber;
                this.setSolitary([symbol, symbolByName.Encoding, encoding]);
                break;
            default:
                encoding = this.getSolitary(symbol, symbolByName.Encoding);
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
            return;
        }
        if(!dataLength)
            dataLength = dataBytes.byteLength * 8;
        this.setLength(symbol, dataLength);
        this.writeData(symbol, 0, dataLength, dataBytes);
    }

    /**
     * Replaces a slice of a symbols data by another symbols data
     * @param {Symbol} dstOffset
     * @param {number} dstOffset in bits
     * @param {Symbol} srcSymbol
     * @param {number} srcOffset in bits
     * @param {number} length in bits
     */
    replaceData(dstSymbol, dstOffset, srcSymbol, srcOffset, length) {
        const dataBytes = this.readData(srcSymbol, srcOffset, length);
        this.writeData(dstSymbol, dstOffset, length, dataBytes);
        return true;
    }

    /**
     * Multiple independent calls to replaceData() without influencing each other
     * @param {ReplaceDataOperation[]} operations
     */
    replaceDataSimultaneously(operations) {
        for(const operation of operations)
            operation.dataBytes = this.readData(operation.srcSymbol, operation.srcOffset, operation.length);
        for(const operation of operations)
            if(!this.writeData(operation.dstSymbol, operation.dstOffset, operation.length, operation.dataBytes))
                return false;
        return true;
    }

    /**
     * Increases or deceases the length of a symbols virtual space at the end
     * @param {Symbol} symbol
     * @param {Number} newLength in bits
     */
    setLength(symbol, newLength) {
        const length = this.getLength(symbol);
        if(newLength != length)
            this.creaseLength(symbol, Math.min(length, newLength), newLength-length);
    }

    /**
     * Unlinks all triples of a symbol and releases it
     * @param {Symbol} symbol
     */
    unlinkSymbol(symbol) {
        for(const triple of this.queryTriples(queryMask.MVV, [symbol, 0, 0]))
            this.setTriple(triple, false);
        for(const triple of this.queryTriples(queryMask.VMV, [0, symbol, 0]))
            this.setTriple(triple, false);
        for(const triple of this.queryTriples(queryMask.VVM, [0, 0, symbol]))
            this.setTriple(triple, false);
        this.releaseSymbol(symbol);
    }

    /**
     * Tests if the given Triple exists
     * @param {Triple} triple
     * @return {Boolean} linked
     */
    getTriple(triple) {
        const iterator = this.queryTriples(queryMask.MMM, triple);
        return iterator.next().value.length === 3 && iterator.next().value === 1;
    }

    /**
     * Does the same as setTriple (linked = true) but also unlinks all triples with different values and returns nothing
     * @param {Triple} triple
     */
    setSolitary(triple) {
        let needsToBeLinked = (triple[2] !== symbolByName.Void);
        for(const iTriple of this.queryTriples(queryMask.MMV, triple)) {
            if(iTriple[2] == triple[2])
                needsToBeLinked = false;
            else
                this.setTriple(iTriple, false);
        }
        if(needsToBeLinked)
            this.setTriple(triple, true);
    }

    /**
     * Returns the value if exactly one triple matches with the given pair
     * @param {Symbol} first symbol
     * @param {Symbol} second symbol
     * @param {Number} index 0, 1, 2 search for Entity, Attribute or Value
     * @return {Symbol} third symbol or Void
     */
    getSolitary(first, second, index=2) {
        let iterator;
        switch(index) {
            case 0:
                iterator = this.queryTriples(queryMask.VMM, [symbolByName.Void, first, second]);
                break;
            case 1:
                iterator = this.queryTriples(queryMask.MVM, [first, symbolByName.Void, second]);
                break;
            case 2:
                iterator = this.queryTriples(queryMask.MMV, [first, second, symbolByName.Void]);
                break;
        }
        const triple = iterator.next().value;
        return (iterator.next().value == 1) ? triple[index] : symbolByName.Void;
    }



    /**
     * Stores the ontology as JSON format
     * @return {String} json
     */
    encodeJson() {
        const entities = [];
        for(const tripleE of this.queryTriples(queryMask.VII, [0, 0, 0])) {
            const length = this.getLength(tripleE[0]),
                  data = this.readData(tripleE[0], 0, length),
                  attributes = [];
            if(symbolByName[this.constructor.utf8ArrayToText(data)] === tripleE[0])
                continue;
            for(const tripleA of this.queryTriples(queryMask.MVI, tripleE)) {
                const values = [];
                for(const tripleV of this.queryTriples(queryMask.MMV, tripleA))
                    values.push(tripleV[2]);
                attributes.push(tripleA[1]);
                attributes.push(values);
            }
            entities.push([
                tripleE[0],
                length,
                this.constructor.encodeText(data),
                attributes
            ]);
        }
        return JSON.stringify({
            'symbols': entities
        }, undefined, '\t');
    }

    /**
     * Loads the ontology from JSON format
     * @param {String} json
     */
    decodeJson(json) {
        const entities = new Set();
        for(const entity of JSON.parse(json).symbols) {
            const entitySymbol = entity[0];
            entities.add(entitySymbol);
            this.setLength(entitySymbol, entity[1]);
            if(entity[1] > 0)
                this.writeData(entitySymbol, 0, entity[1], this.constructor.decodeText(entity[2]));
            const attributes = entity[3];
            for(let i = 0; i < attributes.length; i += 2) {
                const attribute = attributes[i];
                for(const value of attributes[i+1])
                    this.setTriple([entitySymbol, attribute, value], true);
            }
        }
        return entities;
    }
};

{
    let namespace, symbol;
    for(const name of Object.getOwnPropertyNames(symbolByName)) {
        if(namespace !== symbolByName[name]) {
            namespace = symbolByName[name];
            symbol = 0;
        }
        symbolByName[name] = BasicBackend.concatIntoSymbol(namespace, symbol++);
    }
}
