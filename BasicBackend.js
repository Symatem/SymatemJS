const queryMode = ['M', 'V', 'I'],
      queryMask = {};
for(let i = 0; i < 27; ++i)
    queryMask[queryMode[i % 3] + queryMode[Math.floor(i / 3) % 3] + queryMode[Math.floor(i / 9) % 3]] = i;

const symbolByName = {
    'Encoding': 1,
    'BinaryNumber': 2,
    'TwosComplement': 3,
    'IEEE754': 4,
    'UTF8': 5
};

export default class BasicBackend {
    static get queryMask() {
        return queryMask;
    }

    get symbolByName() {
        return symbolByName;
    }

    static downloadAsFile(dataBytes, fileName) {
        const file = new Blob([dataBytes], {type: 'octet/stream'}),
              url = URL.createObjectURL(file);
        if(navigator.userAgent.toLowerCase().indexOf('firefox') > -1)
            window.open(url, '_blank');
        else {
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
        }
        URL.revokeObjectURL(url);
    }

    static utf8ArrayToString(dataBytes) {
        // return new TextDecoder('utf8').decode(dataBytes);
        let uri = '';
        for(const byte of new Uint8Array(dataBytes))
            uri += '%' + byte.toString(16);
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
        return (new Uint8Array(dataBytes)).buffer;
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
        if(string.length > 2 && string[0] == '"' && string[string.length - 1] == '"')
            return string.substr(1, string.length - 2);
        else if(string.length > 4 && string.substr(0, 4) == 'hex:') {
            const dataValue = new ArrayBuffer(Math.floor((string.length - 4) / 2));
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
              dataView = new DataView(dataBytes);
        if(dataBytes.byteLength === 0)
            return;
        const encoding = this.getSolitary(symbolSpace, symbol, this.symbolByName.Encoding);
        switch(encoding) {
            case this.symbolByName.BinaryNumber:
                return dataView.getUint32(0, true);
            case this.symbolByName.TwosComplement:
                return dataView.getInt32(0, true);
            case this.symbolByName.IEEE754:
                return dataView.getFloat32(0, true);
            case this.symbolByName.UTF8:
                return this.constructor.utf8ArrayToString(dataBytes);
            default:
                return dataBytes;
        }
    }

    setData(symbolSpace, symbol, dataValue) {
        let encoding = 0,
            dataBytes = dataValue;
        switch(typeof dataValue) {
            case 'string':
                dataBytes = this.constructor.stringToUtf8Array(dataValue);
                encoding = this.symbolByName.UTF8;
                break;
            case 'number':
                dataBytes = new ArrayBuffer(4);
                const dataView = new DataView(dataBytes);
                if(!Number.isInteger(dataValue)) {
                    dataView.setFloat32(0, dataValue, true);
                    encoding = this.symbolByName.IEEE754;
                } else if(dataValue < 0) {
                    dataView.setInt32(0, dataValue, true);
                    encoding = this.symbolByName.TwosComplement;
                } else {
                    dataView.setUint32(0, dataValue, true);
                    encoding = this.symbolByName.BinaryNumber;
                }
                break;
        }
        if(dataBytes != undefined) {
            this.setLength(symbolSpace, symbol, dataBytes.byteLength * 8);
            this.writeData(symbolSpace, symbol, 0, dataBytes.byteLength * 8, dataBytes);
        } else
            this.setLength(symbolSpace, symbol, 0);
        this.setSolitary(symbolSpace, [symbol, this.symbolByName.Encoding, encoding]);
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
            this.setTriple(symbolSpace, false, triple);
        for(const triple of this.queryTriples(symbolSpace, queryMask.VMV, [0, symbol, 0]))
            this.setTriple(symbolSpace, false, triple);
        for(const triple of this.queryTriples(symbolSpace, queryMask.VVM, [0, 0, symbol]))
            this.setTriple(symbolSpace, false, triple);
        this.releaseSymbol(symbolSpace, symbol);
    }

    setSolitary(symbolSpace, triple) {
        let needsToBeLinked = true;
        for(const iTriple of this.queryTriples(symbolSpace, queryMask.MMV, triple)) {
            if(iTriple[2] == triple[2])
                needsToBeLinked = false;
            else
                this.setTriple(symbolSpace, false, iTriple);
        }
        if(needsToBeLinked)
            this.setTriple(symbolSpace, true, triple);
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
            this.writeData(symbolSpace, entity[0], 0, entity[1], this.constructor.decodeText(entity[2]));
            const attributes = entity[3];
            for(const i = 0; i < attributes.length; i += 2)
                for(const value of attributes[i*2+1])
                    this.setTriple(symbolSpace, true, entity[0], attributes[i*2], value);
        }
    }
};
