import {Utils, SymbolInternals, SymbolMap} from './SymatemJS.mjs';
import BasicBackend from './BasicBackend.mjs';
import {ES6MapSymbolMap} from './Symbol.mjs';

const indexByName = {
    'EAV': 0, 'AVE': 1, 'VEA': 2,
    'EVA': 3, 'AEV': 4, 'VAE': 5
};

const triplePrioritized = [
    [0, 1, 2, 0, 1, 2],
    [1, 2, 0, 2, 0, 1],
    [2, 0, 1, 1, 2, 0]
];

const tripleNormalized = [
    [0, 2, 1, 0, 1, 2],
    [1, 0, 2, 2, 0, 1],
    [2, 1, 0, 1, 2, 0]
];

const remapSubindexInverse = [3, 4, 5, 0, 1, 2],
      remapSubindexKey = [4, 5, 3, 2, 0, 1];
//    remapSubindexValue = [2, 4, 0, 5, 1, 3];

function reorderTriple(order, index, triple) {
    return [triple[order[0][index]], triple[order[1][index]], triple[order[2][index]]];
}

function* searchMMM(index, triple) {
    const handle = ES6MapSymbolMap.get(this.symbols, triple[0]);
    if(!handle)
        return 0;
    const betaCollection = handle.subIndices[index],
          gammaCollection = SymbolMap.get(betaCollection, triple[1]);
    if(!gammaCollection || !SymbolMap.get(gammaCollection, triple[2]))
        return 0;
    yield reorderTriple(tripleNormalized, index, triple);
    return 1;
}

function* searchMMI(index, triple) {
    const handle = ES6MapSymbolMap.get(this.symbols, triple[0]);
    if(!handle)
        return 0;
    const betaCollection = handle.subIndices[index],
          gammaCollection = SymbolMap.get(betaCollection, triple[1]);
    if(!gammaCollection)
        return 0;
    yield reorderTriple(tripleNormalized, index, triple);
    return 1;
}

function* searchMII(index, triple) {
    const handle = ES6MapSymbolMap.get(this.symbols, triple[0]);
    if(!handle)
        return 0;
    const betaCollection = handle.subIndices[index];
    if(SymbolMap.isEmpty(betaCollection))
        return 0;
    yield reorderTriple(tripleNormalized, index, triple);
    return 1;
}

function* searchIII(index, triple) {
    for(const [symbol, handle] of ES6MapSymbolMap.entries(this.symbols)) {
        const betaCollection = handle.subIndices[index];
        if(SymbolMap.isEmpty(betaCollection))
            continue;
        yield reorderTriple(tripleNormalized, index, triple);
        return 1;
    }
    return 0;
}

function* searchMMV(index, triple) {
    const handle = ES6MapSymbolMap.get(this.symbols, triple[0]);
    if(!handle)
        return 0;
    const betaCollection = handle.subIndices[index],
          gammaCollection = SymbolMap.get(betaCollection, triple[1]);
    if(!gammaCollection)
        return 0;
    let count = 0;
    for(triple[2] of SymbolMap.keys(gammaCollection)) {
        yield reorderTriple(tripleNormalized, index, triple);
        ++count;
    }
    return count;
}

function* searchMVV(index, triple) {
    const handle = ES6MapSymbolMap.get(this.symbols, triple[0]);
    if(!handle)
        return 0;
    const betaCollection = handle.subIndices[index];
    let count = 0;
    for(const [beta, gammaCollection] of SymbolMap.entries(betaCollection)) {
        triple[1] = beta;
        for(triple[2] of SymbolMap.keys(gammaCollection)) {
            yield reorderTriple(tripleNormalized, index, triple);
            ++count;
        }
    }
    return count;
}

/*function* searchMIV(index, triple) {
    const handle = ES6MapSymbolMap.get(this.symbols, triple[0]);
    if(!handle)
        return 0;
    const betaCollection = handle.subIndices[index],
          results = SymbolMap.create();
    for(const [beta, gammaCollection] of SymbolMap.entries(betaCollection))
        for(const gamma of SymbolMap.keys(gammaCollection))
            SymbolMap.set(results, gamma, true);
    let count = 0;
    for(triple[2] of SymbolMap.keys(results)) {
        yield reorderTriple(tripleNormalized, index, triple);
        ++count;
    }
    return count;
}*/

function* searchMVI(index, triple) {
    const handle = ES6MapSymbolMap.get(this.symbols, triple[0]);
    if(!handle)
        return 0;
    const betaCollection = handle.subIndices[index];
    let count = 0;
    for(const [beta, gammaCollection] of SymbolMap.entries(betaCollection)) {
        triple[1] = beta;
        yield reorderTriple(tripleNormalized, index, triple);
        ++count;
    }
    return count;
}

function* searchVII(index, triple) {
    let count = 0;
    for(const [symbol, handle] of ES6MapSymbolMap.entries(this.symbols)) {
        const betaCollection = handle.subIndices[index];
        if(SymbolMap.isEmpty(betaCollection))
            continue;
        triple[0] = symbol;
        yield reorderTriple(tripleNormalized, index, triple);
        ++count;
    }
    return count;
}

function* searchVVI(index, triple) {
    let count = 0;
    for(const [symbol, handle] of ES6MapSymbolMap.entries(this.symbols)) {
        const betaCollection = handle.subIndices[index];
        triple[0] = symbol;
        for(const [beta, gammaCollection] of SymbolMap.entries(betaCollection)) {
            triple[1] = beta;
            yield reorderTriple(tripleNormalized, index, triple);
            ++count;
        }
    }
    return count;
}

function* searchVVV(index, triple) {
    let count = 0;
    for(const [symbol, handle] of ES6MapSymbolMap.entries(this.symbols)) {
        const betaCollection = handle.subIndices[index];
        triple[0] = symbol;
        for(const [beta, gammaCollection] of SymbolMap.entries(betaCollection)) {
            triple[1] = beta;
            for(triple[2] of SymbolMap.keys(gammaCollection)) {
                yield reorderTriple(tripleNormalized, index, triple);
                ++count;
            }
        }
    }
    return count;
}

function operateSubIndex(betaCollection, beta, gamma, linked) {
    if(linked) {
        let gammaCollection = SymbolMap.get(betaCollection, beta);
        if(!gammaCollection) {
            gammaCollection = SymbolMap.create();
            SymbolMap.set(betaCollection, beta, gammaCollection);
        }
        return SymbolMap.set(gammaCollection, gamma, true);
    } else {
        let gammaCollection = SymbolMap.get(betaCollection, beta);
        if(!gammaCollection || !SymbolMap.remove(gammaCollection, gamma))
            return false;
        if(SymbolMap.isEmpty(gammaCollection))
            SymbolMap.remove(betaCollection, beta);
        return true;
    }
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

class IdentityPool {
    static create() {
        return [{'begin': 0}];
    }

    static insert(collection, identity) {
        const rangeIndex = Utils.bisect(collection.length, (index) => (collection[index].begin <= identity)),
              prevRange = collection[rangeIndex-1],
              nextRange = collection[rangeIndex];
        if(prevRange && (rangeIndex == collection.length || identity < prevRange.begin+prevRange.length))
            return false;
        const mergePrevRange = (prevRange && prevRange.begin+prevRange.length == identity),
              mergeNextRange = (nextRange && identity+1 == nextRange.begin);
        if(mergePrevRange && mergeNextRange) {
            nextRange.begin = prevRange.begin;
            if(rangeIndex+1 < collection.length)
                nextRange.length += 1+prevRange.length;
            collection.splice(rangeIndex-1, 1);
        } else if(mergePrevRange) {
            ++prevRange.length;
        } else if(mergeNextRange) {
            --nextRange.begin;
            if(nextRange.length)
                ++nextRange.length;
        } else
            collection.splice(rangeIndex, 0, {'begin': identity, 'length': 1});
        return true;
    }

    static remove(collection, identity) {
        const rangeIndex = Utils.bisect(collection.length, (index) => (collection[index].begin <= identity)),
              range = collection[rangeIndex-1];
        if(!range || identity >= range.begin+range.length)
            return false;
        if(identity == range.begin) {
            ++range.begin;
            if(rangeIndex < collection.length && --range.length == 0)
                collection.splice(rangeIndex-1, 1);
        } else if(rangeIndex < collection.length && identity == range.begin+range.length-1) {
            --range.length;
        } else {
            const count = identity-range.begin;
            collection.splice(rangeIndex-1, 0, {'begin': range.begin, 'length': count});
            range.begin = identity+1;
            if(range.length)
                range.length -= 1+count;
        }
        return true;
    }

    static get(collection) {
        return collection[0].begin;
    }

    static isFull(collection) {
        return collection.length == 1 && collection[0].begin == 0;
    }
};

/** Implements a backend written in JavaScript */
export default class JavaScriptBackend extends BasicBackend {
    constructor() {
        super();
        this.symbols = ES6MapSymbolMap.create();
        this.testIdentityPool = IdentityPool.create();
        this.identityPools = new Map();
        this.initPredefinedSymbols();
    }

    testIdentityPoolRanges() {
        return this.testIdentityPool;
    }

    testIdentityPoolRemove(identity) {
        return IdentityPool.remove(this.testIdentityPool, identity);
    }

    testIdentityPoolInsert(identity) {
        return IdentityPool.insert(this.testIdentityPool, identity);
    }

    manifestSymbol(symbol) {
        let handle = ES6MapSymbolMap.get(this.symbols, symbol);
        if(handle)
            return false;
        const namespaceIdentity = SymbolInternals.namespaceOfSymbol(symbol),
              handleIdentity = SymbolInternals.identityOfSymbol(symbol);
        if(namespaceIdentity == this.metaNamespaceIdentity) {
            console.assert(!this.identityPools.get(handleIdentity));
            this.identityPools.set(handleIdentity, IdentityPool.create());
        }
        handle = {
            dataLength: 0,
            dataBytes: new Uint8Array(),
            subIndices: []
        };
        for(let i = 0; i < 6; ++i)
            handle.subIndices.push(SymbolMap.create());
        ES6MapSymbolMap.set(this.symbols, symbol, handle);
        const identityPools = this.identityPools.get(namespaceIdentity);
        console.assert(IdentityPool.remove(identityPools, handleIdentity));
        return true;
    }

    createSymbol(namespaceIdentity) {
        const identityPool = this.identityPools.get(namespaceIdentity);
        console.assert(identityPool);
        let handleIdentity = IdentityPool.get(identityPool);
        const symbol = SymbolInternals.concatIntoSymbol(namespaceIdentity, handleIdentity);
        console.assert(this.manifestSymbol(symbol));
        return symbol;
    }

    releaseSymbol(symbol) {
        const handle = ES6MapSymbolMap.get(this.symbols, symbol);
        if(!handle || handle.dataLength > 0)
            return false;
        for(let i = 0; i < 6; ++i)
            if(!SymbolMap.isEmpty(handle.subIndices[i]))
                return false;
        const handleIdentity = SymbolInternals.identityOfSymbol(symbol),
              namespaceIdentity = SymbolInternals.namespaceOfSymbol(symbol);
        if(namespaceIdentity == this.metaNamespaceIdentity && !IdentityPool.isFull(this.identityPools.get(handleIdentity)))
            return false;
        ES6MapSymbolMap.remove(this.symbols, symbol);
        console.assert(IdentityPool.insert(this.identityPools.get(namespaceIdentity), handleIdentity));
        if(namespaceIdentity == this.metaNamespaceIdentity)
            this.identityPools.delete(handleIdentity);
        return true;
    }

    getLength(symbol) {
        const handle = ES6MapSymbolMap.get(this.symbols, symbol);
        return (handle) ? handle.dataLength : 0;
    }

    creaseLength(symbol, offset, length) {
        const handle = ES6MapSymbolMap.get(this.symbols, symbol);
        if(!handle || offset+Math.max(0, -length) > handle.dataLength)
            return false;
        const newDataBytes = new Uint8Array(Math.ceil((handle.dataLength+length)/32)*4);
        newDataBytes.set(handle.dataBytes.subarray(0, Math.ceil(offset/8)), 0);
        if(offset%8 == 0 && length%8 == 0 && handle.dataLength%8 == 0) {
            if(length < 0)
                newDataBytes.set(handle.dataBytes.subarray((offset-length)/8, handle.dataLength/8), offset/8);
            else
                newDataBytes.set(handle.dataBytes.subarray(offset/8, handle.dataLength/8), (offset+length)/8);
        } else {
            newDataBytes[Math.floor(offset/8)] &= ~((-1)<<(offset%8));
            if(length < 0)
                Utils.bitwiseCopy(newDataBytes, offset, handle.dataBytes, offset-length, handle.dataLength-offset+length);
            else
                Utils.bitwiseCopy(newDataBytes, offset+length, handle.dataBytes, offset, handle.dataLength-offset);
        }
        handle.dataLength += length;
        handle.dataBytes = newDataBytes;
        return true;
    }

    readData(symbol, offset, length) {
        const handle = ES6MapSymbolMap.get(this.symbols, symbol);
        if(!handle || length < 0 || offset+length > handle.dataLength)
            return;
        console.assert(handle.dataBytes.length%4 == 0);
        if(offset%8 == 0 && length%8 == 0)
            return handle.dataBytes.slice(offset/8, (offset+length)/8);
        const dataBytes = new Uint8Array(Math.ceil(length/32)*4);
        Utils.bitwiseCopy(dataBytes, 0, handle.dataBytes, offset, length);
        return dataBytes;
    }

    writeData(symbol, offset, length, dataBytes) {
        const handle = ES6MapSymbolMap.get(this.symbols, symbol);
        if(!handle || length < 0 || offset+length > handle.dataLength || !dataBytes)
            return false;
        if(offset%8 == 0 && length%8 == 0)
            handle.dataBytes.set(dataBytes.subarray(0, length/8), offset/8);
        else {
            if(dataBytes.byteLength%4 != 0) {
                const prevDataBytes = dataBytes;
                dataBytes = new Uint8Array(Math.ceil(length/32)*4);
                dataBytes.set(prevDataBytes, 0);
            }
            Utils.bitwiseCopy(handle.dataBytes, offset, dataBytes, 0, length);
        }
        console.assert(handle.dataBytes.length%4 == 0);
        return true;
    }

    replaceData(dstSymbol, dstOffset, srcSymbol, srcOffset, length) {
        const dstHandle = ES6MapSymbolMap.get(this.symbols, dstSymbol),
              srcHandle = ES6MapSymbolMap.get(this.symbols, srcSymbol);
        if(!dstHandle || !srcHandle || dstOffset+length > dstHandle.dataLength || srcOffset+length > srcHandle.dataLength)
            return false;
        console.assert(dstHandle.dataBytes.length%4 == 0 && srcHandle.dataBytes.length%4 == 0);
        if(dstOffset%8 == 0 && srcOffset%8 == 0 && length%8 == 0)
            dstHandle.dataBytes.set(srcHandle.dataBytes.subarray(srcOffset/8, (srcOffset+length)/8), dstOffset/8);
        else
            Utils.bitwiseCopy(dstHandle.dataBytes, dstOffset, srcHandle.dataBytes, srcOffset, length);
        return true;
    }

    setTriple(triple, linked) {
        const handles = triple.map(symbol => ES6MapSymbolMap.get(this.symbols, symbol));
        if(!handles[0] || !handles[1] || !handles[2])
            return false;
        let result = false;
        for(let tripleIndex = 0; tripleIndex < 3; ++tripleIndex) {
            if(operateSubIndex(handles[tripleIndex].subIndices[tripleIndex], triple[(tripleIndex+1)%3], triple[(tripleIndex+2)%3], linked))
                result = true;
            if(operateSubIndex(handles[tripleIndex].subIndices[tripleIndex+3], triple[(tripleIndex+2)%3], triple[(tripleIndex+1)%3], linked))
                result = true;
        }
        return result;
    }

    *querySymbols(namespaceIdentity) {
        const namespace = this.symbols.get(namespaceIdentity);
        if(namespace)
            for(const handleIdentity of namespace.keys())
                yield SymbolInternals.concatIntoSymbol(namespaceIdentity, handleIdentity);
    }

    queryTriples(mask, triple) {
        const index = indexLookup[mask];
        return searchLookup[mask].call(this, index, reorderTriple(triplePrioritized, index, triple));
    }

    validateIntegrity() {
        for(const [namespaceIdentity, namespace] of this.symbols.entries()) {
            const identityPool = IdentityPool.create();
            for(let handleIdentity of namespace.keys()) {
                handleIdentity = parseInt(handleIdentity);
                if(!IdentityPool.remove(identityPool, handleIdentity))
                    return false;
                const handle = namespace.get(handleIdentity);
                if(handle.subIndices.length != 6)
                    return false;
                const symbol = SymbolInternals.concatIntoSymbol(namespaceIdentity, handleIdentity);
                for(let i = 0; i < 6; ++i) {
                    const betaCollection = handle.subIndices[i],
                          invertedBetaCollection = handle.subIndices[remapSubindexInverse[i]],
                          betaIndex = remapSubindexKey[i];
                    for(const [beta, gammaCollection] of SymbolMap.entries(betaCollection)) {
                        if(!SymbolMap.get(ES6MapSymbolMap.get(this.symbols, beta).subIndices[betaIndex], symbol))
                            return false;
                        if(SymbolMap.isEmpty(gammaCollection))
                            return false;
                        for(const gamma of SymbolMap.keys(gammaCollection)) {
                            const invertedGammaCollection = SymbolMap.get(invertedBetaCollection, gamma);
                            if(!invertedGammaCollection || !SymbolMap.get(invertedGammaCollection, beta))
                                return false;
                        }
                    }
                }
            }
            const originalFreeIdentityPool = this.identityPools.get(namespaceIdentity);
            if(identityPool.length != originalFreeIdentityPool.length)
                return false;
            for(let i = 0; i < identityPool.length; ++i)
                if(identityPool[i].start != originalFreeIdentityPool[i].start || identityPool[i].count != originalFreeIdentityPool[i].count)
                    return false;
        }
        return true;
    }
};
