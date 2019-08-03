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
    const subIndex = handle.subIndices[index],
          set = subIndex[triple[1]];
    if(!set || !set[triple[2]])
        return 0;
    yield reorderTriple(tripleNormalized, index, triple);
    return 1;
}

function* searchMMI(index, triple) {
    const handle = this.getHandle(triple[0]);
    if(!handle)
        return 0;
    const subIndex = handle.subIndices[index],
          set = subIndex[triple[1]];
    if(!set)
        return 0;
    yield reorderTriple(tripleNormalized, index, triple);
    return 1;
}

function* searchMII(index, triple) {
    const handle = this.getHandle(triple[0]);
    if(!handle)
        return 0;
    const subIndex = handle.subIndices[index];
    if(Object.keys(subIndex).length == 0)
        return 0;
    yield reorderTriple(tripleNormalized, index, triple);
    return 1;
}

function* searchIII(index, triple) {
    for(const namespaceIdentity in this.namespaces)
        for(const handleIdentity in this.namespaces[namespaceIdentity].handles) {
            const subIndex = this.namespaces[namespaceIdentity].handles[handleIdentity].subIndices[index];
            if(Object.keys(subIndex).length == 0)
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
    const subIndex = handle.subIndices[index],
          set = subIndex[triple[1]];
    if(!set)
        return 0;
    let count = 0;
    for(triple[2] in set) {
        yield reorderTriple(tripleNormalized, index, triple);
        ++count;
    }
    return count;
}

function* searchMVV(index, triple) {
    const handle = this.getHandle(triple[0]);
    if(!handle)
        return 0;
    const subIndex = handle.subIndices[index];
    let count = 0;
    for(triple[1] in subIndex) {
        const set = subIndex[triple[1]];
        for(triple[2] in set) {
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
    const subIndex = handle.subIndices[index],
          results = {};
    for(const beta in subIndex)
        for(const result of subIndex[beta])
            results[result] = true;
    let count = 0;
    for(triple[2] in results) {
        yield reorderTriple(tripleNormalized, index, triple);
        ++count;
    }
    return count;
}

function* searchMVI(index, triple) {
    const handle = this.getHandle(triple[0]);
    if(!handle)
        return 0;
    const subIndex = handle.subIndices[index];
    let count = 0;
    for(triple[1] in subIndex) {
        yield reorderTriple(tripleNormalized, index, triple);
        ++count;
    }
    return count;
}

function* searchVII(index, triple) {
    let count = 0;
    for(const namespaceIdentity in this.namespaces)
        for(const handleIdentity in this.namespaces[namespaceIdentity].handles) {
            const subIndex = this.namespaces[namespaceIdentity].handles[handleIdentity].subIndices[index];
            if(Object.keys(subIndex).length == 0)
                continue;
            triple[0] = this.constructor.concatIntoSymbol(namespaceIdentity, handleIdentity);
            yield reorderTriple(tripleNormalized, index, triple);
            ++count;
        }
    return count;
}

function* searchVVI(index, triple) {
    let count = 0;
    for(const namespaceIdentity in this.namespaces)
        for(const handleIdentity in this.namespaces[namespaceIdentity].handles) {
            const subIndex = this.namespaces[namespaceIdentity].handles[handleIdentity].subIndices[index];
            triple[0] = this.constructor.concatIntoSymbol(namespaceIdentity, handleIdentity);
            for(triple[1] in subIndex) {
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
            const subIndex = this.namespaces[namespaceIdentity].handles[handleIdentity].subIndices[index];
            triple[0] = this.constructor.concatIntoSymbol(namespaceIdentity, handleIdentity);
            for(triple[1] in subIndex) {
                const set = subIndex[triple[1]];
                for(triple[2] in set) {
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

function bitwiseCopy(destination, destinationOffset, source, sourceOffset, length) {
    if(length == 0)
        return;
    if(destinationOffset%8 == 0 && sourceOffset%8 == 0 && length%8 == 0) {
        destination.set(source.subarray(sourceOffset/8, (sourceOffset+length)/8), destinationOffset/8);
        return;
    }
    if(destination == source && sourceOffset < destinationOffset && sourceOffset+length > destinationOffset)
        throw new Error('bitwiseCopy with destination == source is not implemented yet'); // TODO
    const elementLength = 32;
    destination = new DataView(destination.buffer);
    source = new DataView(source.buffer);
    let sourceIndex = Math.floor(sourceOffset/elementLength)*elementLength/8,
        destinationIndex = Math.floor(destinationOffset/elementLength)*elementLength/8;
    const sourceShift = sourceOffset%elementLength,
          destinationShift = destinationOffset%elementLength;
    while(true) {
        const mask = (length < elementLength) ? ~((-1)<<length) : -1,
              nextSourceIndex = sourceIndex+elementLength/8,
              nextDestinationIndex = destinationIndex+elementLength/8;
        let element = source.getUint32(sourceIndex, true)>>>sourceShift;
        if(nextSourceIndex < source.byteLength && sourceShift > 0)
            element |= source.getUint32(nextSourceIndex, true)<<(elementLength-sourceShift);
        element &= mask;
        destination.setUint32(destinationIndex, destination.getUint32(destinationIndex, true)&(~(mask<<destinationShift))|(element<<destinationShift), true);
        if(nextDestinationIndex < destination.byteLength && destinationShift > 0)
            destination.setUint32(nextDestinationIndex, destination.getUint32(nextDestinationIndex, true)&(~(mask>>>(elementLength-destinationShift)))|(element>>>(elementLength-destinationShift)), true);
        length -= elementLength;
        if(length <= 0)
            break;
        sourceIndex = nextSourceIndex;
        destinationIndex = nextDestinationIndex;
    }
}

import BasicBackend from './BasicBackend.js';

/** Implements a backend in JS */
export default class NativeBackend extends BasicBackend {
    constructor() {
        super();
        this.namespaces = {};
    }

    static addIdentityToPool(ranges, identity) {
        const indexOfRange = Array.bisect(ranges.length, (index) => (ranges[index].start <= identity));
        const prevRange = ranges[indexOfRange-1],
              nextRange = ranges[indexOfRange];
        if(prevRange && (indexOfRange == ranges.length || identity < prevRange.start+prevRange.count))
            return false;
        const mergePrevRange = (prevRange && prevRange.start+prevRange.count == identity),
              mergePostRange = (nextRange && identity+1 == nextRange.start);
        if(mergePrevRange && mergePostRange) {
            nextRange.start = prevRange.start;
            if(nextRange.count)
                nextRange.count += 1+prevRange.count;
            ranges.splice(indexOfRange-1, 1);
        } else if(mergePrevRange) {
            ++prevRange.count;
        } else if(mergePostRange) {
            --nextRange.start;
            if(nextRange.count)
                ++nextRange.count;
        } else
            ranges.splice(indexOfRange, 0, {'start': identity, 'count': 1});
        return true;
    }

    static removeIdentityFromPool(ranges, identity) {
        const indexOfRange = Array.bisect(ranges.length, (index) => (ranges[index].start <= identity));
        const range = ranges[indexOfRange-1];
        if(!range || identity >= range.start+range.count)
            return false;
        if(identity == range.start) {
            ++range.start;
            if(range.count && --range.count == 0)
                ranges.splice(indexOfRange-1, 1);
        } else if(identity == range.start+range.count-1)
            --range.count;
        else {
            const count = identity-range.start;
            ranges.splice(indexOfRange-1, 0, {'start': range.start, 'count': count});
            range.start = identity+1;
            if(range.count)
                range.count -= 1+count;
        }
        return true;
    }

    static getIdentityFromPool(ranges) {
        return ranges[0].start;
    }

    getHandle(symbol) {
        const namespace = this.namespaces[this.constructor.namespaceOfSymbol(symbol)];
        return (namespace) ? namespace.handles[this.constructor.identityOfSymbol(symbol)] : undefined;
    }

    manifestNamespace(namespaceIdentity) {
        let namespace = this.namespaces[namespaceIdentity];
        if(!namespace) {
            namespace = {
                // 'identity': namespaceIdentity,
                'freeIdentityPool': [{'start': 0}],
                'handles': {}
            };
            this.namespaces[namespaceIdentity] = namespace;
            this.manifestSymbol(this.constructor.symbolInNamespace('Namespaces', namespaceIdentity));
        }
        return namespace;
    }

    unlinkNamespace(namespaceIdentity) {
        const namespace = this.namespaces[namespaceIdentity];
        if(!namespace)
            return false;
        const triple = [];
        for(const handleIdentity in namespace.handles) {
            triple[0] = this.constructor.concatIntoSymbol(namespaceIdentity, handleIdentity);
            const handle = namespace.handles[handleIdentity];
            for(let i = 0; i < 3; ++i) {
                const subIndex = handle.subIndices[i];
                for(triple[1] in subIndex)
                    if(this.constructor.namespaceOfSymbol(triple[1]) != namespaceIdentity)
                        for(triple[2] in subIndex[triple[1]])
                            this.setTriple(triple, false);
                    else for(triple[2] in subIndex[triple[1]])
                        if(this.constructor.namespaceOfSymbol(triple[2]) != namespaceIdentity)
                            this.setTriple(triple, false);
            }
        }
        delete this.namespaces[namespaceIdentity];
        return true;
    }

    manifestSymbol(symbol) {
        const namespaceIdentity = this.constructor.namespaceOfSymbol(symbol),
              namespace = this.manifestNamespace(namespaceIdentity),
              handleIdentity = this.constructor.identityOfSymbol(symbol);
        let handle = namespace.handles[handleIdentity];
        if(handle)
            return handle;
        console.assert(this.constructor.removeIdentityFromPool(namespace.freeIdentityPool, handleIdentity));
        handle = namespace.handles[handleIdentity] = {
            // namespace: namespace,
            // handleIdentity: handleIdentity,
            dataLength: 0,
            dataBytes: new Uint8Array(),
            subIndices: []
        };
        for(let i = 0; i < 6; ++i)
            handle.subIndices.push({});
        return handle;
    }

    createSymbol(namespaceIdentity) {
        const namespace = this.manifestNamespace(namespaceIdentity);
        let handleIdentity = this.constructor.getIdentityFromPool(namespace.freeIdentityPool);
        const symbol = this.constructor.concatIntoSymbol(namespaceIdentity, handleIdentity);
        this.manifestSymbol(symbol);
        return symbol;
    }

    releaseSymbol(symbol) {
        const namespaceIdentity = this.constructor.namespaceOfSymbol(symbol),
              namespace = this.namespaces[namespaceIdentity],
              handleIdentity = this.constructor.identityOfSymbol(symbol);
        if(!namespace || !namespace.handles[handleIdentity])
            return false;
        for(let i = 0; i < 3; ++i)
            if(Object.keys(namespace.handles[handleIdentity].subIndices[i]) > 0)
                return false;
        delete namespace.handles[handleIdentity];
        if(Object.keys(namespace.handles).length == 0)
            delete this.namespaces[namespaceIdentity];
        else
            console.assert(this.constructor.addIdentityToPool(namespace.freeIdentityPool, handleIdentity));
        return (namespaceIdentity == this.constructor.identityOfSymbol(this.constructor.symbolByName.Namespaces))
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
        const newDataBytes = new Uint8Array(Math.ceil((handle.dataLength+length)/32)*4);
        if(length < 0) {
            if(offset-length > handle.dataLength)
                return false;
        } else if(offset > handle.dataLength)
            return false;
        newDataBytes.set(handle.dataBytes.subarray(0, Math.ceil(offset/8)), 0);
        if(offset%8 == 0 && length%8 == 0 && handle.dataLength%8 == 0) {
            if(length < 0)
                newDataBytes.set(handle.dataBytes.subarray((offset-length)/8, handle.dataLength/8), offset/8);
            else
                newDataBytes.set(handle.dataBytes.subarray(offset/8, handle.dataLength/8), (offset+length)/8);
        } else {
            newDataBytes[Math.floor(offset/8)] &= ~((-1)<<(offset%8));
            if(length < 0)
                bitwiseCopy(newDataBytes, offset, handle.dataBytes, offset-length, handle.dataLength-offset+length);
            else
                bitwiseCopy(newDataBytes, offset+length, handle.dataBytes, offset, handle.dataLength-offset);
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
            return (offset == 0 && length == handle.dataLength)
                   ? handle.dataBytes.slice()
                   : handle.dataBytes.slice(offset/8, (offset+length)/8);
        const dataBytes = new Uint8Array(Math.ceil(length/32)*4);
        bitwiseCopy(dataBytes, 0, handle.dataBytes, offset, length);
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
            bitwiseCopy(handle.dataBytes, offset, dataBytes, 0, length);
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
            bitwiseCopy(dstHandle.dataBytes, dstOffset, srcHandle.dataBytes, srcOffset, length);
        return true;
    }

    setTriple(triple, linked) {
        function operateSubIndex(subIndex, beta, gamma) {
            if(linked) {
                let set;
                if(!subIndex[beta]) {
                    set = {};
                    subIndex[beta] = set;
                } else {
                    set = subIndex[beta];
                    if(set[gamma])
                        return false;
                }
                set[gamma] = true;
            } else {
                const set = subIndex[beta];
                if(!set || !set[gamma])
                    return false;
                delete set[gamma];
                if(Object.keys(set).length === 0)
                    delete subIndex[beta];
            }
            return true;
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
        const dstSymbols = {}, subIndexUpdatesBySymbol = {};
        for(const srcSymbol in translationTable) {
            const dstSymbol = translationTable[srcSymbol],
                  handle = this.getHandle(srcSymbol);
            dstSymbols[dstSymbol] = true;
            for(let i = 0; i < 6; ++i) {
                const subIndex = handle.subIndices[i];
                for(const beta in subIndex) {
                    let subIndexUpdates = subIndexUpdatesBySymbol[beta];
                    if(!subIndexUpdates)
                        subIndexUpdates = subIndexUpdatesBySymbol[beta] = [];
                    subIndexUpdates.push({'srcSymbol': srcSymbol, 'alphaIndex': i});
                }
            }
        }
        for(const symbol in subIndexUpdatesBySymbol) {
            const updates = subIndexUpdatesBySymbol[symbol],
                  handle = this.getHandle(symbol);
            for(const update of updates) {
                update.betaIndex = remapSubindexKey[update.alphaIndex];
                update.gammaIndex = remapSubindexInverse[update.betaIndex];
                update.betaSubIndex = handle.subIndices[update.betaIndex];
                update.gammaSubIndex = handle.subIndices[update.gammaIndex];
                update.betaSet = update.betaSubIndex[update.srcSymbol];
                update.gammaSets = [];
                for(const gamma in update.betaSet)
                    update.gammaSets.push(update.gammaSubIndex[gamma]);
            }
            for(const update of updates) {
                for(const gammaSet of update.gammaSets)
                    delete gammaSet[update.srcSymbol];
                delete update.betaSubIndex[update.srcSymbol];
            }
            for(const update of updates) {
                const dstSymbol = translationTable[update.srcSymbol];
                for(const gammaSet of update.gammaSets)
                    gammaSet[dstSymbol] = true;
                update.betaSubIndex[dstSymbol] = update.betaSet;
            }
            delete subIndexUpdatesBySymbol[symbol];
        }
        const subIndicesToMerge = {};
        for(const srcSymbol in translationTable) {
            const dstSymbol = translationTable[srcSymbol],
                  srcHandle = this.getHandle(srcSymbol);
            subIndicesToMerge[srcSymbol] = srcHandle.subIndices;
            srcHandle.subIndices = [];
            for(let i = 0; i < 6; ++i)
                srcHandle.subIndices.push({});
        }
        for(const srcSymbol in subIndicesToMerge) {
            const srcSubIndices = subIndicesToMerge[srcSymbol],
                  dstHandle = this.manifestSymbol(translationTable[srcSymbol]);
            for(let i = 0; i < 6; ++i) {
                const srcSubIndex = srcSubIndices[i],
                      dstSubIndex = dstHandle.subIndices[i];
                for(const beta in srcSubIndex) {
                    const srcSet = srcSubIndex[beta],
                          dstSet = dstSubIndex[beta];
                    if(!dstSet) {
                        dstSubIndex[beta] = srcSet;
                        continue;
                    }
                    for(const gamma in srcSet)
                        dstSet[gamma] = true;
                }
            }
        }
        return true;
    }

    *querySymbols(namespaceIdentity) {
        const namespace = this.namespaces[namespaceIdentity];
        if(namespace)
            for(const handleIdentity in namespace.handles)
                yield BasicBackend.concatIntoSymbol(namespaceIdentity, handleIdentity);
    }

    queryTriples(mask, triple) {
        const index = indexLookup[mask];
        return searchLookup[mask].call(this, index, reorderTriple(triplePrioritized, index, triple));
    }

    validateIntegrity() {
        for(const namespaceIdentity in this.namespaces) {
            const namespace = this.namespaces[namespaceIdentity],
                  freeIdentityPool = [{'start': 0}];
            for(let handleIdentity in namespace.handles) {
                handleIdentity = parseInt(handleIdentity);
                if(!this.constructor.removeIdentityFromPool(freeIdentityPool, handleIdentity))
                    return false;
                const handle = namespace.handles[handleIdentity];
                if(handle.subIndices.length != 6)
                    return false;
                const symbol = this.constructor.concatIntoSymbol(namespaceIdentity, handleIdentity);
                for(let i = 0; i < 6; ++i) {
                    const subIndex = handle.subIndices[i],
                          invertedSubIndex = handle.subIndices[remapSubindexInverse[i]],
                          betaIndex = remapSubindexKey[i];
                    for(const beta in subIndex) {
                        if(!this.getHandle(beta).subIndices[betaIndex][symbol])
                            return false;
                        const set = subIndex[beta];
                        if(set.size == 0)
                            return false;
                        for(const gamma in set)
                            if(!invertedSubIndex[gamma] || !invertedSubIndex[gamma][beta])
                                return false;
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
