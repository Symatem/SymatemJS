const indexByName = {
    'EAV': 0, 'AVE': 1, 'VEA': 2,
    'EVA': 3, 'AEV': 4, 'VAE': 5
};

const tripleReordered = [
    [0, 1, 2, 0, 1, 2],
    [1, 2, 0, 2, 0, 1],
    [2, 0, 1, 1, 2, 0]
];

const tripleNormalized = [
    [0, 2, 1, 0, 1, 2],
    [1, 0, 2, 2, 0, 1],
    [2, 1, 0, 1, 2, 0]
];

function normalizedTriple(index, triple) {
    return [triple[tripleNormalized[0][index]], triple[tripleNormalized[1][index]], triple[tripleNormalized[2][index]]];
}

function* searchMMM(symbolSpace, index, triple) {
    if(!symbolSpace.handles.has(triple[0]))
        return 0;
    const subIndex = symbolSpace.handles.get(triple[0]).subIndices[index];
    if(!subIndex.has(triple[1]))
        return 0;
    const set = subIndex.get(triple[1]);
    if(!set.has(triple[2]))
        return 0;
    yield normalizedTriple(index, triple);
    return 1;
}

function* searchMMI(symbolSpace, index, triple) {
    if(!symbolSpace.handles.has(triple[0]))
        return 0;
    const subIndex = symbolSpace.handles.get(triple[0]).subIndices[index];
    if(!subIndex.has(triple[1]))
        return 0;
    yield normalizedTriple(index, triple);
    return 1;
}

function* searchMII(symbolSpace, index, triple) {
    if(!symbolSpace.handles.has(triple[0]))
        return 0;
    yield normalizedTriple(index, triple);
    return 1;
}

function* searchIII(symbolSpace, index, triple) {
    return 0;
}

function* searchMMV(symbolSpace, index, triple) {
    if(!symbolSpace.handles.has(triple[0]))
        return 0;
    const subIndex = symbolSpace.handles.get(triple[0]).subIndices[index];
    if(!subIndex.has(triple[1]))
        return 0;
    const set = subIndex.get(triple[1]);
    for(triple[2] of set)
        yield normalizedTriple(index, triple);
    return set.size;
}

function* searchMVV(symbolSpace, index, triple) {
    if(!symbolSpace.handles.has(triple[0]))
        return 0;
    const subIndex = symbolSpace.handles.get(triple[0]).subIndices[index];
    let count = 0;
    for(const [beta, set] of subIndex) {
        triple[1] = beta;
        for(triple[2] of set)
            yield normalizedTriple(index, triple);
        count += set.size;
    }
    return count;
}

function* searchMIV(symbolSpace, index, triple) {
    if(!symbolSpace.handles.has(triple[0]))
        return 0;
    const subIndex = symbolSpace.handles.get(triple[0]).subIndices[index],
          results = new Set();
    for(const set of subIndex.values())
        for(const result of set)
            results.add(result);
    for(triple[2] of results)
        yield normalizedTriple(index, triple);
    return results.size;
}

function* searchMVI(symbolSpace, index, triple) {
    if(!symbolSpace.handles.has(triple[0]))
        return 0;
    const subIndex = symbolSpace.handles.get(triple[0]).subIndices[index];
    for(const beta of subIndex.keys()) {
        triple[1] = beta;
        yield normalizedTriple(index, triple);
    }
    return subIndex.size;
}

function* searchVII(symbolSpace, index, triple) {
    if(symbolSpace.handles.size > 0)
        yield normalizedTriple(index, triple);
    return symbolSpace.handles.size;
}

function* searchVVI(symbolSpace, index, triple) {
    let count = 0;
    for(const alpha of symbolSpace.handles.values()) {
        triple[0] = alpha.symbol;
        const subIndex = alpha.subIndices[index];
        for(const [beta, set] of subIndex) {
            triple[1] = beta;
            yield normalizedTriple(index, triple);
        }
        count += subIndex.size;
    }
    return count;
}

function* searchVVV(symbolSpace, index, triple) {
    let count = 0;
    for(const alpha of symbolSpace.handles.values()) {
        triple[0] = alpha.symbol;
        const subIndex = alpha.subIndices[index];
        for(const [beta, set] of subIndex) {
            triple[1] = beta;
            for(triple[2] of set)
                yield normalizedTriple(index, triple);
            count += set.size;
        }
    }
    return count;
}

const indexLookup = [
    indexByName.EAV, indexByName.AVE, indexByName.AVE,
    indexByName.VEA, indexByName.VEA, indexByName.VAE,
    indexByName.VEA, indexByName.VEA, indexByName.VEA,
    indexByName.EAV, indexByName.AVE, indexByName.AVE,
    indexByName.EAV, indexByName.EAV, indexByName.AVE,
    indexByName.EVA, indexByName.VEA, indexByName.VEA,
    indexByName.EAV, indexByName.AEV, indexByName.AVE,
    indexByName.EAV, indexByName.EAV, indexByName.AVE,
    indexByName.EAV, indexByName.EAV, indexByName.EAV
];

const searchLookup = [
    searchMMM, searchMMV, searchMMI,
    searchMMV, searchMVV, searchMVI,
    searchMMI, searchMVI, searchMII,
    searchMMV, searchMVV, searchMVI,
    searchMVV, searchVVV, searchVVI,
    searchMVI, searchVVI, searchVII,
    searchMMI, searchMVI, searchMII,
    searchMVI, searchVVI, searchVII,
    searchMII, searchVII, searchIII
];

import BasicBackend from './BasicBackend.js';
export default class NativeBackend extends BasicBackend {
    constructor() {
        super();
    }

    createSymbolSpace(symbol) {
        const symbolSpace = {
            'symbol': symbol,
            'nextSymbol': 0,
            'freeSymbols': new Set(),
            'handles': new Map()
        };
        for(const name in this.constructor.symbolByName)
            this.setData(symbolSpace, this.createSymbol(symbolSpace, this.constructor.symbolByName[name]), name);
        return symbolSpace;
    }

    createSymbol(symbolSpace, symbol) {
        const handle = {};
        if(symbol == undefined) {
            if(symbolSpace.freeSymbols.size == 0)
                handle.symbol = symbolSpace.nextSymbol++;
            else {
                handle.symbol = symbolSpace.freeSymbols.values().next().value;
                symbolSpace.freeSymbols.delete(handle.symbol);
            }
        } else {
            if(symbolSpace.handles.has(symbol))
                return symbol;
            handle.symbol = symbol;
            symbolSpace.freeSymbols.delete(handle.symbol);
            while(symbolSpace.nextSymbol < handle.symbol)
                symbolSpace.freeSymbols.add(symbolSpace.nextSymbol++);
            symbolSpace.nextSymbol = Math.max(symbolSpace.nextSymbol, handle.symbol+1);
        }
        handle.dataLength = 0;
        handle.dataBytes = new Uint8Array();
        handle.subIndices = [];
        for(let i = 0; i < 6; ++i)
            handle.subIndices.push(new Map());
        symbolSpace.handles.set(handle.symbol, handle);
        return handle.symbol;
    }

    releaseSymbol(symbolSpace, symbol) {
        symbolSpace.handles.delete(symbol);
        if(symbol == symbolSpace.nextSymbol - 1)
            --symbolSpace.nextSymbol;
        else
            symbolSpace.freeSymbols.add(symbol);
    }



    getLength(symbolSpace, symbol) {
        const handle = symbolSpace.handles.get(symbol);
        return handle.dataLength;
    }

    decreaseLength(symbolSpace, symbol, offset, length) {
        const handle = symbolSpace.handles.get(symbol);
        handle.dataBytes.copyWithin(offset / 8, (offset + length) / 8);
        handle.dataBytes = handle.dataBytes.slice(0, (handle.dataLength - length) / 8);
        handle.dataLength -= length;
    }

    increaseLength(symbolSpace, symbol, offset, length) {
        const handle = symbolSpace.handles.get(symbol);
        const dataBytes = new Uint8Array((handle.dataLength + length) / 8);
        dataBytes.set(handle.dataBytes, 0);
        dataBytes.copyWithin((offset + length) / 8, offset / 8);
        handle.dataBytes = dataBytes;
        handle.dataLength += length;
    }

    readData(symbolSpace, symbol, offset, length) {
        const handle = symbolSpace.handles.get(symbol);
        if(offset == 0 && length == handle.dataLength)
            return handle.dataBytes;
        return handle.dataBytes.slice(offset / 8, (offset + length) / 8);
    }

    writeData(symbolSpace, symbol, offset, length, dataBytes) {
        const handle = symbolSpace.handles.get(symbol);
        if(offset == 0 && length == handle.dataLength) {
            handle.dataBytes = dataBytes;
            handle.dataLength = dataBytes.byteLength * 8;
        } else
            handle.dataBytes.set(dataBytes, offset / 8);
    }



    setTriple(symbolSpace, triple, linked) {
        function operateSubIndex(subIndex, beta, gamma) {
            if(linked) {
                let set;
                if(!subIndex.has(beta)) {
                    set = new Set();
                    subIndex.set(beta, set);
                } else {
                    set = subIndex.get(beta);
                    if(set.has(gamma))
                        return false;
                }
                set.add(gamma);
            } else {
                if(!subIndex.has(beta))
                    return false;
                const set = subIndex.get(beta);
                if(!set.has(gamma))
                    return false;
                set.delete(gamma);
                if(set.size == 0)
                    subIndex.delete(beta);
            }
            return true;
        }
        if(linked) {
            this.createSymbol(symbolSpace, triple[0]);
            this.createSymbol(symbolSpace, triple[1]);
            this.createSymbol(symbolSpace, triple[2]);
        }
        const entityHandle = symbolSpace.handles.get(triple[0]),
              attributeHandle = symbolSpace.handles.get(triple[1]),
              valueHandle = symbolSpace.handles.get(triple[2]);
        operateSubIndex(entityHandle.subIndices[indexByName.EAV], triple[1], triple[2]);
        operateSubIndex(attributeHandle.subIndices[indexByName.AVE], triple[2], triple[0]);
        operateSubIndex(valueHandle.subIndices[indexByName.VEA], triple[0], triple[1]);
        operateSubIndex(entityHandle.subIndices[indexByName.EVA], triple[2], triple[1]);
        operateSubIndex(attributeHandle.subIndices[indexByName.AEV], triple[0], triple[2]);
        operateSubIndex(valueHandle.subIndices[indexByName.VAE], triple[1], triple[0]);
    }

    queryTriples(symbolSpace, mask, triple) {
        const index = indexLookup[mask];
        return searchLookup[mask](symbolSpace, index, [triple[tripleReordered[0][index]], triple[tripleReordered[1][index]], triple[tripleReordered[2][index]]]);
    }



    encodeJsonFromSymbolSpace(symbolSpace) {
        const entities = [];
        for(const [entity, entityHandle] of symbolSpace.handles) {
            const length = entityHandle.dataLength,
                  attributes = [...entityHandle.subIndices[indexByName.EAV]],
                  attributeValues = [];
            if(length == 0 && attributes.length == 0)
                continue;
            attributes.sort(function(a, b) {
                return a[0] > b[0];
            });
            for(const [attribute, valuesSet] of attributes) {
                const values = [...valuesSet];
                values.sort();
                attributeValues.push(attribute);
                attributeValues.push(values);
            }
            entities.push([
                entity,
                length,
                this.constructor.encodeText(this.readData(symbolSpace, entity, 0, length)),
                attributeValues
            ]);
        }
        entities.sort(function(a, b) {
            return a[0] > b[0];
        });
        return JSON.stringify({
            "entities": entities
        }, undefined, '\t');
    }
};
