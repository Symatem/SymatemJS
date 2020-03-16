import {Utils, SymbolInternals, IdentityPool, SymbolMap, BasicBackend} from '../SymatemJS.mjs';

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
    const handle = this.getHandle(triple[0]);
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
    const handle = this.getHandle(triple[0]);
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
    const handle = this.getHandle(triple[0]);
    if(!handle)
        return 0;
    const betaCollection = handle.subIndices[index];
    if(SymbolMap.isEmpty(betaCollection))
        return 0;
    yield reorderTriple(tripleNormalized, index, triple);
    return 1;
}

function* searchIII(index, triple) {
    for(const namespaceIdentity in this.namespaces)
        for(const handleIdentity in this.namespaces[namespaceIdentity].handles) {
            const betaCollection = this.namespaces[namespaceIdentity].handles[handleIdentity].subIndices[index];
            if(SymbolMap.isEmpty(betaCollection))
                continue;
            yield reorderTriple(tripleNormalized, index, triple);
            return 1;
        }
    return 0;
}

function* searchMMV(index, triple) {
    const handle = this.getHandle(triple[0]);
    if(!handle)
        return 0;
    const betaCollection = handle.subIndices[index],
          gammaCollection = SymbolMap.get(betaCollection, triple[1]);
    if(!gammaCollection)
        return 0;
    let count = 0;
    for(triple[2] of SymbolMap.symbols(gammaCollection)) {
        yield reorderTriple(tripleNormalized, index, triple);
        ++count;
    }
    return count;
}

function* searchMVV(index, triple) {
    const handle = this.getHandle(triple[0]);
    if(!handle)
        return 0;
    const betaCollection = handle.subIndices[index];
    let count = 0;
    for(const [beta, gammaCollection] of SymbolMap.entries(betaCollection)) {
        triple[1] = beta;
        for(triple[2] of SymbolMap.symbols(gammaCollection)) {
            yield reorderTriple(tripleNormalized, index, triple);
            ++count;
        }
    }
    return count;
}

/*function* searchMIV(index, triple) {
    const handle = this.getHandle(triple[0]);
    if(!handle)
        return 0;
    const betaCollection = handle.subIndices[index],
          results = SymbolMap.create();
    for(const [beta, gammaCollection] of SymbolMap.entries(betaCollection))
        for(const gamma of SymbolMap.symbols(gammaCollection))
            SymbolMap.insert(results, gamma, true);
    let count = 0;
    for(triple[2] of SymbolMap.symbols(results)) {
        yield reorderTriple(tripleNormalized, index, triple);
        ++count;
    }
    return count;
}*/

function* searchMVI(index, triple) {
    const handle = this.getHandle(triple[0]);
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
    for(const namespaceIdentity in this.namespaces)
        for(const handleIdentity in this.namespaces[namespaceIdentity].handles) {
            const betaCollection = this.namespaces[namespaceIdentity].handles[handleIdentity].subIndices[index];
            if(SymbolMap.isEmpty(betaCollection))
                continue;
            triple[0] = SymbolInternals.concatIntoSymbol(namespaceIdentity, handleIdentity);
            yield reorderTriple(tripleNormalized, index, triple);
            ++count;
        }
    return count;
}

function* searchVVI(index, triple) {
    let count = 0;
    for(const namespaceIdentity in this.namespaces)
        for(const handleIdentity in this.namespaces[namespaceIdentity].handles) {
            const betaCollection = this.namespaces[namespaceIdentity].handles[handleIdentity].subIndices[index];
            triple[0] = SymbolInternals.concatIntoSymbol(namespaceIdentity, handleIdentity);
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
    for(const namespaceIdentity in this.namespaces)
        for(const handleIdentity in this.namespaces[namespaceIdentity].handles) {
            const betaCollection = this.namespaces[namespaceIdentity].handles[handleIdentity].subIndices[index];
            triple[0] = SymbolInternals.concatIntoSymbol(namespaceIdentity, handleIdentity);
            for(const [beta, gammaCollection] of SymbolMap.entries(betaCollection)) {
                triple[1] = beta;
                for(triple[2] of SymbolMap.symbols(gammaCollection)) {
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
            SymbolMap.insert(betaCollection, beta, gammaCollection);
        }
        return SymbolMap.insert(gammaCollection, gamma, true);
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

/** Implements a backend written in JavaScript */
export default class JavaScriptBackend extends BasicBackend {
    constructor() {
        super();
        this.namespaces = {};
    }

    getHandle(symbol) {
        const namespace = this.namespaces[SymbolInternals.namespaceOfSymbol(symbol)];
        return (namespace) ? namespace.handles[SymbolInternals.identityOfSymbol(symbol)] : undefined;
    }

    manifestNamespace(namespaceIdentity) {
        let namespace = this.namespaces[namespaceIdentity];
        if(!namespace) {
            namespace = {
                'freeIdentityPool': IdentityPool.create(),
                'handles': {}
            };
            this.namespaces[namespaceIdentity] = namespace;
        }
        return namespace;
    }

    manifestSymbol(symbol) {
        const namespaceIdentity = SymbolInternals.namespaceOfSymbol(symbol),
              handleIdentity = SymbolInternals.identityOfSymbol(symbol);
        if(namespaceIdentity == this.constructor.metaNamespaceIdentity && handleIdentity == this.constructor.metaNamespaceIdentity)
            this.manifestNamespace(this.constructor.metaNamespaceIdentity);
        const namespace = this.namespaces[namespaceIdentity];
        console.assert(namespace);
        let handle = namespace.handles[handleIdentity];
        if(handle)
            return false;
        console.assert(IdentityPool.remove(namespace.freeIdentityPool, handleIdentity));
        handle = namespace.handles[handleIdentity] = {
            dataLength: 0,
            dataBytes: new Uint8Array(),
            subIndices: []
        };
        for(let i = 0; i < 6; ++i)
            handle.subIndices.push(SymbolMap.create());
        if(namespaceIdentity == this.constructor.metaNamespaceIdentity)
            this.manifestNamespace(handleIdentity);
        return true;
    }

    createSymbol(namespaceIdentity) {
        const namespace = this.namespaces[namespaceIdentity];
        console.assert(namespace);
        let handleIdentity = IdentityPool.get(namespace.freeIdentityPool);
        const symbol = SymbolInternals.concatIntoSymbol(namespaceIdentity, handleIdentity);
        console.assert(this.manifestSymbol(symbol));
        return symbol;
    }

    releaseSymbol(symbol) {
        const namespaceIdentity = SymbolInternals.namespaceOfSymbol(symbol),
              namespace = this.namespaces[namespaceIdentity],
              handleIdentity = SymbolInternals.identityOfSymbol(symbol),
              handle = namespace.handles[handleIdentity];
        if(!namespace || !handle)
            return false;
        if(namespaceIdentity == SymbolInternals.identityOfSymbol(this.symbolByName.Namespaces))
            console.assert(this.namespaces[handleIdentity] && Object.keys(this.namespaces[handleIdentity].handles).length == 0);
        console.assert(handle.dataLength == 0);
        for(let i = 0; i < 6; ++i)
            console.assert(SymbolMap.isEmpty(handle.subIndices[i]));
        delete namespace.handles[handleIdentity];
        console.assert(IdentityPool.insert(namespace.freeIdentityPool, handleIdentity));
        if(namespaceIdentity == SymbolInternals.identityOfSymbol(this.symbolByName.Namespaces))
            console.assert(this.namespaces[handleIdentity]);
        return true;
    }

    getLength(symbol) {
        const handle = this.getHandle(symbol);
        return (handle) ? handle.dataLength : 0;
    }

    creaseLength(symbol, offset, length) {
        const handle = this.getHandle(symbol);
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
        const handle = this.getHandle(symbol);
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
        const handle = this.getHandle(symbol);
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
        const dstHandle = this.getHandle(dstSymbol),
              srcHandle = this.getHandle(srcSymbol);
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
        const handles = triple.map(symbol => this.getHandle(symbol));
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
        const namespace = this.namespaces[namespaceIdentity];
        if(namespace)
            for(const handleIdentity in namespace.handles)
                yield SymbolInternals.concatIntoSymbol(namespaceIdentity, handleIdentity);
    }

    queryTriples(mask, triple) {
        const index = indexLookup[mask];
        return searchLookup[mask].call(this, index, reorderTriple(triplePrioritized, index, triple));
    }

    validateIntegrity() {
        for(const namespaceIdentity in this.namespaces) {
            const namespace = this.namespaces[namespaceIdentity],
                  freeIdentityPool = IdentityPool.create();
            for(let handleIdentity in namespace.handles) {
                handleIdentity = parseInt(handleIdentity);
                if(!IdentityPool.remove(freeIdentityPool, handleIdentity))
                    return false;
                const handle = namespace.handles[handleIdentity];
                if(handle.subIndices.length != 6)
                    return false;
                const symbol = SymbolInternals.concatIntoSymbol(namespaceIdentity, handleIdentity);
                for(let i = 0; i < 6; ++i) {
                    const betaCollection = handle.subIndices[i],
                          invertedBetaCollection = handle.subIndices[remapSubindexInverse[i]],
                          betaIndex = remapSubindexKey[i];
                    for(const [beta, gammaCollection] of SymbolMap.entries(betaCollection)) {
                        if(!SymbolMap.get(this.getHandle(beta).subIndices[betaIndex], symbol))
                            return false;
                        if(SymbolMap.isEmpty(gammaCollection))
                            return false;
                        for(const gamma of SymbolMap.symbols(gammaCollection)) {
                            const invertedGammaCollection = SymbolMap.get(invertedBetaCollection, gamma);
                            if(!invertedGammaCollection || !SymbolMap.get(invertedGammaCollection, beta))
                                return false;
                        }
                    }
                }
            }
            if(freeIdentityPool.length != namespace.freeIdentityPool.length)
                return false;
            for(let i = 0; i < freeIdentityPool.length; ++i)
                if(freeIdentityPool[i].start != namespace.freeIdentityPool[i].start || freeIdentityPool[i].count != namespace.freeIdentityPool[i].count)
                    return false;
        }
        return true;
    }
};
