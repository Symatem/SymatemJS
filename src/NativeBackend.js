import {Utils, SymbolInternals, IdentityPool, SymbolMap, BasicBackend} from '../SymatemJS.js';

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

function* searchMIV(index, triple) {
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
}

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

/** Implements a backend in JS */
export default class NativeBackend extends BasicBackend {
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
                // 'identity': namespaceIdentity,
                'freeIdentityPool': IdentityPool.create(),
                'handles': {}
            };
            this.namespaces[namespaceIdentity] = namespace;
            this.manifestSymbol(BasicBackend.symbolInNamespace('Namespaces', namespaceIdentity));
        }
        return namespace;
    }

    unlinkNamespace(namespaceIdentity) {
        const namespace = this.namespaces[namespaceIdentity];
        if(!namespace)
            return false;
        const triple = [];
        for(const handleIdentity in namespace.handles) {
            triple[0] = SymbolInternals.concatIntoSymbol(namespaceIdentity, handleIdentity);
            const handle = namespace.handles[handleIdentity];
            for(let i = 0; i < 3; ++i) {
                const betaCollection = handle.subIndices[i];
                for(const [beta, gammaCollection] of SymbolMap.entries(betaCollection)) {
                    triple[1] = beta;
                    if(SymbolInternals.namespaceOfSymbol(triple[1]) != namespaceIdentity) {
                        for(triple[2] of SymbolMap.symbols(gammaCollection))
                            this.setTriple(triple, false);
                    } else {
                        for(triple[2] of SymbolMap.symbols(gammaCollection))
                            if(SymbolInternals.namespaceOfSymbol(triple[2]) != namespaceIdentity)
                                this.setTriple(triple, false);
                    }
                }
            }
        }
        delete this.namespaces[namespaceIdentity];
        return true;
    }

    manifestSymbol(symbol) {
        const namespaceIdentity = SymbolInternals.namespaceOfSymbol(symbol),
              namespace = this.manifestNamespace(namespaceIdentity),
              handleIdentity = SymbolInternals.identityOfSymbol(symbol);
        let handle = namespace.handles[handleIdentity];
        if(handle)
            return handle;
        console.assert(IdentityPool.remove(namespace.freeIdentityPool, handleIdentity));
        handle = namespace.handles[handleIdentity] = {
            // namespace: namespace,
            // handleIdentity: handleIdentity,
            dataLength: 0,
            dataBytes: new Uint8Array(),
            subIndices: []
        };
        for(let i = 0; i < 6; ++i)
            handle.subIndices.push(SymbolMap.create());
        return handle;
    }

    createSymbol(namespaceIdentity) {
        const namespace = this.manifestNamespace(namespaceIdentity);
        let handleIdentity = IdentityPool.get(namespace.freeIdentityPool);
        const symbol = SymbolInternals.concatIntoSymbol(namespaceIdentity, handleIdentity);
        this.manifestSymbol(symbol);
        return symbol;
    }

    releaseSymbol(symbol) {
        const namespaceIdentity = SymbolInternals.namespaceOfSymbol(symbol),
              namespace = this.namespaces[namespaceIdentity],
              handleIdentity = SymbolInternals.identityOfSymbol(symbol);
        if(!namespace || !namespace.handles[handleIdentity])
            return false;
        for(let i = 0; i < 3; ++i)
            if(!SymbolMap.isEmpty(namespace.handles[handleIdentity].subIndices[i]))
                return false;
        delete namespace.handles[handleIdentity];
        if(Object.keys(namespace.handles).length == 0)
            delete this.namespaces[namespaceIdentity];
        else
            console.assert(IdentityPool.insert(namespace.freeIdentityPool, handleIdentity));
        return (namespaceIdentity == SymbolInternals.identityOfSymbol(this.constructor.symbolByName.Namespaces))
            ? this.unlinkNamespace(handleIdentity)
            : true;
    }

    getLength(symbol) {
        const handle = this.getHandle(symbol);
        return (handle) ? handle.dataLength : 0;
    }

    creaseLength(symbol, offset, length) {
        const handle = (offset == 0 && length > 0) ? this.manifestSymbol(symbol) : this.getHandle(symbol);
        if(!handle)
            return false;
        if(length < 0) {
            if(offset-length > handle.dataLength)
                return false;
        } else if(offset > handle.dataLength)
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
        const handle = this.manifestSymbol(symbol);
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
        function operateSubIndex(betaCollection, beta, gamma) {
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
        if(linked) {
            this.manifestSymbol(triple[0]);
            this.manifestSymbol(triple[1]);
            this.manifestSymbol(triple[2]);
        }
        const entityHandle = this.getHandle(triple[0]),
              attributeHandle = this.getHandle(triple[1]),
              valueHandle = this.getHandle(triple[2]);
        if(!linked && !(entityHandle && attributeHandle && valueHandle))
            return true;
        operateSubIndex(entityHandle.subIndices[indexByName.EAV], triple[1], triple[2]);
        operateSubIndex(attributeHandle.subIndices[indexByName.AVE], triple[2], triple[0]);
        operateSubIndex(valueHandle.subIndices[indexByName.VEA], triple[0], triple[1]);
        operateSubIndex(entityHandle.subIndices[indexByName.EVA], triple[2], triple[1]);
        operateSubIndex(attributeHandle.subIndices[indexByName.AEV], triple[0], triple[2]);
        return operateSubIndex(valueHandle.subIndices[indexByName.VAE], triple[1], triple[0]);
    }

    moveTriples(translationTable) {
        const subIndexUpdatesBySymbol = SymbolMap.create();
        for(const [srcSymbol, dstSymbol] of SymbolMap.entries(translationTable)) {
            const handle = this.getHandle(srcSymbol);
            for(let i = 0; i < 6; ++i)
                for(const beta of SymbolMap.symbols(handle.subIndices[i])) {
                    let subIndexUpdates = SymbolMap.get(subIndexUpdatesBySymbol, beta);
                    if(!subIndexUpdates) {
                        subIndexUpdates = [];
                        SymbolMap.insert(subIndexUpdatesBySymbol, beta, subIndexUpdates);
                    }
                    subIndexUpdates.push({'srcSymbol': srcSymbol, 'alphaIndex': i});
                }
        }
        for(const [symbol, updates] of SymbolMap.entries(subIndexUpdatesBySymbol)) {
            const handle = this.getHandle(symbol);
            for(const update of updates) {
                update.betaIndex = remapSubindexKey[update.alphaIndex];
                update.gammaIndex = remapSubindexInverse[update.betaIndex];
                update.betaSubIndex = handle.subIndices[update.betaIndex];
                update.gammaSubIndex = handle.subIndices[update.gammaIndex];
                update.betaSet = SymbolMap.get(update.betaSubIndex, update.srcSymbol);
                update.gammaSets = [];
                for(const gamma of SymbolMap.symbols(update.betaSet))
                    update.gammaSets.push(SymbolMap.get(update.gammaSubIndex, gamma));
            }
            for(const update of updates) {
                for(const gammaSet of update.gammaSets)
                    SymbolMap.remove(gammaSet, update.srcSymbol);
                SymbolMap.remove(update.betaSubIndex, update.srcSymbol);
            }
            for(const update of updates) {
                const dstSymbol = SymbolMap.get(translationTable, update.srcSymbol);
                for(const gammaSet of update.gammaSets)
                    SymbolMap.insert(gammaSet, dstSymbol, true);
                SymbolMap.insert(update.betaSubIndex, dstSymbol, update.betaSet);
            }
            SymbolMap.remove(subIndexUpdatesBySymbol, symbol);
        }
        const subIndicesToMerge = SymbolMap.create();
        for(const [srcSymbol, dstSymbol] of SymbolMap.entries(translationTable)) {
            const srcHandle = this.getHandle(srcSymbol);
            SymbolMap.insert(subIndicesToMerge, srcSymbol, srcHandle.subIndices);
            srcHandle.subIndices = [];
            for(let i = 0; i < 6; ++i)
                srcHandle.subIndices.push(SymbolMap.create());
        }
        for(const [srcSymbol, srcSubIndices] of SymbolMap.entries(subIndicesToMerge)) {
            const dstHandle = this.manifestSymbol(SymbolMap.get(translationTable, srcSymbol));
            for(let i = 0; i < 6; ++i) {
                const srcSubIndex = srcSubIndices[i],
                      dstSubIndex = dstHandle.subIndices[i];
                for(const [beta, srcSet] of SymbolMap.entries(srcSubIndex)) {
                    const dstSet = SymbolMap.get(dstSubIndex, beta);
                    if(!dstSet) {
                        SymbolMap.insert(dstSubIndex, beta, srcSet);
                        continue;
                    }
                    for(const gamma of SymbolMap.symbols(srcSet))
                        SymbolMap.insert(dstSet, gamma, true);
                }
            }
        }
        return true;
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
