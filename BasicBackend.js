const queryMode = ['M', 'V', 'I'],
      queryMask = {};
for(let i = 0; i < 27; ++i)
    queryMask[queryMode[i % 3] + queryMode[Math.floor(i / 3) % 3] + queryMode[Math.floor(i / 9) % 3]] = i;

const symbolByName = {
    'Void': 0,
    'Encoding': 0,
    'BinaryNumber': 0,
    'TwosComplement': 0,
    'IEEE754': 0,
    'UTF8': 0,

    'Basics': 2,
    'Index': 2,
    'Namespaces': 2,
};

export default class BasicBackend {
    static get queryMask() {
        return queryMask;
    }

    static get symbolByName() {
        return symbolByName;
    }

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

    static utf8ArrayToString(dataBytes) {
        // return new TextDecoder('utf8').decode(dataBytes);
        let uri = '';
        for(const byte of new Uint8Array(dataBytes)) {
            const hex = byte.toString(16);
            uri += '%' + ((hex.length == 1) ? '0' + hex : hex);
        }
        return decodeURIComponent(uri);
    }

    static stringToUtf8Array(string) {
        // return new TextEncoder('utf8').encode(string);
        const uri = encodeURI(string),
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

    static encodeText(dataValue) {
        switch(typeof dataValue) {
            case 'string':
                return '"' + dataValue + '"';
            case 'object':
                if(dataValue instanceof Uint32Array)
                    return BasicBackend.namespaceOfSymbol(dataValue)+':'+BasicBackend.identityOfSymbol(dataValue);
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

    static decodeText(string) {
        const inner = string.match(/"((?:[^\\"]|\\.)*)"/);
        if(inner != undefined)
            return inner[1];
        const split = string.split(':');
        if(split.length === 2 && !isNaN(parseInt(split[0])) && split[1].length > 0)
            return BasicBackend.concatIntoSymbol(parseInt(searchInput[0]), parseInt(searchInput[1]));
        else if(string.length > 4 && string.substr(0, 4) == 'hex:') {
            const dataValue = new Uint8Array(Math.floor((string.length - 4) / 2));
            for(let i = 0; i < dataValue.byteLength; ++i)
                dataValue[i] = parseInt(string[i * 2 + 4], 16) | (parseInt(string[i * 2 + 5], 16) << 4);
            return dataValue;
        } else if(!Number.isNaN(parseFloat(string)))
            return parseFloat(string);
        else if(!Number.isNaN(parseInt(string)))
            return parseInt(string);
    }

    static concatIntoSymbol(namespace, identity) {
        return new Uint32Array([namespace, identity]);
    }

    static namespaceOfSymbol(symbol) {
        return symbol[0];
    }

    static identityOfSymbol(symbol) {
        return symbol[1];
    }



    decodeBinary(encoding, dataBytes) {
        const dataView = new DataView(dataBytes.buffer);
        switch(encoding) {
            case symbolByName.Void:
                return dataBytes;
            case symbolByName.BinaryNumber:
                return dataView.getUint32(0, true);
            case symbolByName.TwosComplement:
                return dataView.getInt32(0, true);
            case symbolByName.IEEE754:
                return dataView.getFloat32(0, true);
            case symbolByName.UTF8:
                return this.constructor.utf8ArrayToString(dataBytes);
        }
    }

    encodeBinary(encoding, dataValue) {
        let dataBytes = new Uint8Array(4);
        const dataView = new DataView(dataBytes.buffer);
        switch(encoding) {
            case symbolByName.Void:
                return dataValue;
            case symbolByName.BinaryNumber:
                dataView.setUint32(0, dataValue, true);
                return dataBytes;
            case symbolByName.TwosComplement:
                dataView.setInt32(0, dataValue, true);
                return dataBytes;
            case symbolByName.IEEE754:
                dataView.setFloat32(0, dataValue, true);
                return dataBytes;
            case symbolByName.UTF8:
                return this.constructor.stringToUtf8Array(dataValue);
        }
    }

    getData(symbol) {
        const dataBytes = this.readData(symbol, 0, this.getLength(symbol));
        if(dataBytes.byteLength === 0)
            return;
        const encoding = this.getSolitary(symbol, symbolByName.Encoding);
        return this.decodeBinary(encoding, dataBytes);
    }

    setData(symbol, dataValue, offset=0) {
        let encoding;
        switch(typeof dataValue) {
            case 'string':
                encoding = symbolByName.UTF8;
                this.setSolitary([symbol, symbolByName.Encoding, encoding]);
                break;
            case 'number':
                if(!Number.isInteger(dataValue))
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
        if(dataBytes != undefined) {
            this.setLength(symbol, dataBytes.byteLength * 8);
            this.writeData(symbol, offset, dataBytes.byteLength * 8, dataBytes);
            return dataBytes.byteLength * 8;
        } else {
            this.setLength(symbol, 0);
            return 0;
        }
    }

    setLength(symbol, newLength) {
        const length = this.getLength(symbol);
        if(newLength > length)
            this.increaseLength(symbol, length, newLength - length);
        else if(newLength < length)
            this.decreaseLength(symbol, newLength, length - newLength);
    }

    unlinkSymbol(symbol) {
        for(const triple of this.queryTriples(queryMask.MVV, [symbol, 0, 0]))
            this.setTriple(triple, false);
        for(const triple of this.queryTriples(queryMask.VMV, [0, symbol, 0]))
            this.setTriple(triple, false);
        for(const triple of this.queryTriples(queryMask.VVM, [0, 0, symbol]))
            this.setTriple(triple, false);
        this.releaseSymbol(symbol);
    }

    setSolitary(triple) {
        let needsToBeLinked = triple[2] != undefined;
        for(const iTriple of this.queryTriples(queryMask.MMV, triple)) {
            if(iTriple[2] == triple[2])
                needsToBeLinked = false;
            else
                this.setTriple(iTriple, false);
        }
        if(needsToBeLinked)
            this.setTriple(triple, true);
    }

    getSolitary(entity, attribute) {
        const iterator = this.queryTriples(queryMask.MMV, [entity, attribute, 0]);
        let triple = iterator.next().value;
        return (iterator.next().value == 1) ? triple[2] : symbolByName.Void;
    }



    encodeJson() {
        const entities = [];
        for(const tripleE of this.queryTriples(queryMask.VII, [0, 0, 0])) {
            const length = this.getLength(tripleE[0]),
                  attributes = [];
            for(const tripleA of this.queryTriples(queryMask.MVI, tripleE)) {
                const values = [];
                for(const tripleV of this.queryTriples(queryMask.MMV, tripleA))
                    values.push(this.constructor.encodeText(tripleV[2]));
                attributes.push(this.constructor.encodeText(tripleA[1]));
                attributes.push(values);
            }
            entities.push([
                this.constructor.encodeText(tripleE[0]),
                length,
                this.constructor.encodeText(this.readData(tripleE[0], 0, length)),
                attributes
            ]);
        }
        return JSON.stringify({
            'symbols': entities
        }, undefined, '\t');
    }

    decodeJson(data) {
        const entities = JSON.parse(data).symbols;
        for(const entity of entities) {
            const entitySymbol = this.constructor.decodeText(entitySymbol);
            this.manifestSymbol(entitySymbol);
            this.setLength(entitySymbol, entity[1]);
            if(entity[1] > 0)
                this.writeData(entitySymbol, 0, entity[1], this.constructor.decodeText(entity[2]));
            const attributes = entity[3];
            for(let i = 0; i < attributes.length; i += 2) {
                const attribute = this.constructor.decodeText(attributes[i*2]);
                for(const value of attributes[i*2+1])
                    this.setTriple([entitySymbol, attribute, this.constructor.decodeText(value)], true);
            }
        }
    }
};

{
    let namespace, symbol;
    for(const name in symbolByName) {
        if(namespace !== symbolByName[name]) {
            namespace = symbolByName[name];
            symbol = 0;
        }
        symbolByName[name] = BasicBackend.concatIntoSymbol(namespace, symbol++);
    }
}
