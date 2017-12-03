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
};

{
    let symbol = 0;
    for(const name in symbolByName)
        symbolByName[name] = symbol++;
}

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



    getData(symbolSpace, symbol) {
        const dataBytes = this.readData(symbolSpace, symbol, 0, this.getLength(symbolSpace, symbol)),
              dataView = new DataView(dataBytes.buffer);
        if(dataBytes.byteLength === 0)
            return;
        const encoding = this.getSolitary(symbolSpace, symbol, symbolByName.Encoding);
        switch(encoding) {
            case symbolByName.BinaryNumber:
                return dataView.getUint32(0, true);
            case symbolByName.TwosComplement:
                return dataView.getInt32(0, true);
            case symbolByName.IEEE754:
                return dataView.getFloat32(0, true);
            case symbolByName.UTF8:
                return this.constructor.utf8ArrayToString(dataBytes);
            default:
                return dataBytes;
        }
    }

    setData(symbolSpace, symbol, dataValue) {
        let encoding, dataBytes = dataValue;
        switch(typeof dataValue) {
            case 'string':
                dataBytes = this.constructor.stringToUtf8Array(dataValue);
                encoding = symbolByName.UTF8;
                break;
            case 'number':
                dataBytes = new Uint8Array(4);
                const dataView = new DataView(dataBytes.buffer);
                if(!Number.isInteger(dataValue)) {
                    dataView.setFloat32(0, dataValue, true);
                    encoding = symbolByName.IEEE754;
                } else if(dataValue < 0) {
                    dataView.setInt32(0, dataValue, true);
                    encoding = symbolByName.TwosComplement;
                } else {
                    dataView.setUint32(0, dataValue, true);
                    encoding = symbolByName.BinaryNumber;
                }
                break;
        }
        if(dataBytes != undefined) {
            this.setLength(symbolSpace, symbol, dataBytes.byteLength * 8);
            this.writeData(symbolSpace, symbol, 0, dataBytes.byteLength * 8, dataBytes);
        } else
            this.setLength(symbolSpace, symbol, 0);
        this.setSolitary(symbolSpace, [symbol, symbolByName.Encoding, encoding]);
    }

    setLength(symbolSpace, symbol, newLength) {
        const length = this.getLength(symbolSpace, symbol);
        if(newLength > length)
            this.increaseLength(symbolSpace, symbol, length, newLength - length);
        else if(newLength < length)
            this.decreaseLength(symbolSpace, symbol, newLength, length - newLength);
    }

    unlinkSymbol(symbolSpace, symbol) {
        for(const triple of this.queryTriples(symbolSpace, queryMask.MVV, [symbol, 0, 0]))
            this.setTriple(symbolSpace, triple, false);
        for(const triple of this.queryTriples(symbolSpace, queryMask.VMV, [0, symbol, 0]))
            this.setTriple(symbolSpace, triple, false);
        for(const triple of this.queryTriples(symbolSpace, queryMask.VVM, [0, 0, symbol]))
            this.setTriple(symbolSpace, triple, false);
        this.releaseSymbol(symbolSpace, symbol);
    }

    setSolitary(symbolSpace, triple) {
        let needsToBeLinked = triple[2] != undefined;
        for(const iTriple of this.queryTriples(symbolSpace, queryMask.MMV, triple)) {
            if(iTriple[2] == triple[2])
                needsToBeLinked = false;
            else
                this.setTriple(symbolSpace, iTriple, false);
        }
        if(needsToBeLinked)
            this.setTriple(symbolSpace, triple, true);
    }

    getSolitary(symbolSpace, entity, attribute) {
        const iterator = this.queryTriples(symbolSpace, queryMask.MMV, [entity, attribute, 0]);
        let triple = iterator.next().value;
        return (iterator.next().value == 1) ? triple[2] : undefined;
    }



    encodeJsonFromSymbolSpace(symbolSpace) {
        const entities = [];
        for(const tripleE of this.queryTriples(symbolSpace, queryMask.VII, [0, 0, 0])) {
            const length = this.getLength(symbolSpace, tripleE[0]),
                  attributes = [];
            for(const tripleA of this.queryTriples(symbolSpace, queryMask.MVI, tripleE)) {
                const values = [];
                for(const tripleV of this.queryTriples(symbolSpace, queryMask.MMV, tripleA))
                    values.push(tripleV[2]);
                attributes.push(tripleA[1]);
                attributes.push(values);
            }
            entities.push([
                tripleE[0],
                length,
                this.constructor.encodeText(this.readData(symbolSpace, tripleE[0], 0, length)),
                attributes
            ]);
        }
        return JSON.stringify({
            'entities': entities
        }, undefined, '\t');
    }

    decodeJsonIntoSymbolSpace(symbolSpace, data) {
        const entities = JSON.parse(data).entities;
        for(const entity of entities) {
            this.createSymbol(symbolSpace, entity[0]);
            this.setLength(symbolSpace, entity[0], entity[1]);
            if(entity[1] > 0)
                this.writeData(symbolSpace, entity[0], 0, entity[1], this.constructor.decodeText(entity[2]));
            const attributes = entity[3];
            for(let i = 0; i < attributes.length; i += 2)
                for(const value of attributes[i*2+1])
                    this.setTriple(symbolSpace, [entity[0], attributes[i*2], value], true);
        }
    }
};
