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

function reorderTriple(order, index, triple) {
    return [triple[order[0][index]], triple[order[1][index]], triple[order[2][index]]];
}

function* searchMMM(index, triple) {
    const handle = this.getHandle(triple[0]);
    if(!handle)
        return 0;
    const subIndex = handle.subIndices[index];
    if(!subIndex.has(triple[1]))
        return 0;
    const set = subIndex.get(triple[1]);
    if(!set.has(triple[2]))
        return 0;
    yield reorderTriple(tripleNormalized, index, triple);
    return 1;
}

function* searchMMI(index, triple) {
    const handle = this.getHandle(triple[0]);
    if(!handle)
        return 0;
    const subIndex = handle.subIndices[index];
    if(!subIndex.has(triple[1]))
        return 0;
    yield reorderTriple(tripleNormalized, index, triple);
    return 1;
}

function* searchMII(index, triple) {
    const handle = this.getHandle(triple[0]);
    if(!handle)
        return 0;
    yield reorderTriple(tripleNormalized, index, triple);
    return 1;
}

function* searchIII(index, triple) {
    return 0;
}

function* searchMMV(index, triple) {
    const handle = this.getHandle(triple[0]);
    if(!handle)
        return 0;
    const subIndex = handle.subIndices[index];
    if(!subIndex.has(triple[1]))
        return 0;
    const set = subIndex.get(triple[1]);
    for(triple[2] of set)
        yield reorderTriple(tripleNormalized, index, triple);
    return set.size;
}

function* searchMVV(index, triple) {
    const handle = this.getHandle(triple[0]);
    if(!handle)
        return 0;
    const subIndex = handle.subIndices[index];
    let count = 0;
    for(const [beta, set] of subIndex) {
        triple[1] = beta;
        for(triple[2] of set)
            yield reorderTriple(tripleNormalized, index, triple);
        count += set.size;
    }
    return count;
}

function* searchMIV(index, triple) {
    const handle = this.getHandle(triple[0]);
    if(!handle)
        return 0;
    const subIndex = handle.subIndices[index],
          results = new Set();
    for(const set of subIndex.values())
        for(const result of set)
            results.add(result);
    for(triple[2] of results)
        yield reorderTriple(tripleNormalized, index, triple);
    return results.size;
}

function* searchMVI(index, triple) {
    const handle = this.getHandle(triple[0]);
    if(!handle)
        return 0;
    const subIndex = handle.subIndices[index];
    for(const beta of subIndex.keys()) {
        triple[1] = beta;
        yield reorderTriple(tripleNormalized, index, triple);
    }
    return subIndex.size;
}

function* searchVII(index, triple) {
    let count = 0;
    for(const [namespaceIdentity, namespace] of this.namespaces) {
        for(const [alphaIdentity, alpha] of namespace.handles) {
            triple[0] = this.constructor.concatIntoSymbol(namespaceIdentity, alphaIdentity);
            yield reorderTriple(tripleNormalized, index, triple);
        }
        count += namespace.handles.size;
    }
    return count;
}

function* searchVVI(index, triple) {
    let count = 0;
    for(const [namespaceIdentity, namespace] of this.namespaces)
        for(const [alphaIdentity, alpha] of namespace.handles) {
            triple[0] = this.constructor.concatIntoSymbol(namespaceIdentity, alphaIdentity);
            const subIndex = alpha.subIndices[index];
            for(const [beta, set] of subIndex) {
                triple[1] = beta;
                yield reorderTriple(tripleNormalized, index, triple);
            }
            count += subIndex.size;
        }
    return count;
}

function* searchVVV(index, triple) {
    let count = 0;
    for(const [namespaceIdentity, namespace] of this.namespaces)
        for(const [alphaIdentity, alpha] of namespace.handles) {
            triple[0] = this.constructor.concatIntoSymbol(namespaceIdentity, alphaIdentity);
            const subIndex = alpha.subIndices[index];
            for(const [beta, set] of subIndex) {
                triple[1] = beta;
                for(triple[2] of set)
                    yield reorderTriple(tripleNormalized, index, triple);
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
        this.namespaces = new Map();
        this.initBasicOntology();
    }

    getHandle(symbol) {
        const namespace = this.namespaces.get(this.constructor.namespaceOfSymbol(symbol));
        return (namespace) ? namespace.handles.get(this.constructor.identityOfSymbol(symbol)) : undefined;
    }

    manifestNamespace(namespaceIdentity) {
        let namespace = this.namespaces.get(namespaceIdentity);
        if(!namespace) {
            namespace = {
                // 'identity': namespaceIdentity,
                'nextIdentity': 0,
                'freeIdentities': new Set(),
                'handles': new Map()
            };
            this.namespaces.set(namespaceIdentity, namespace);
        }
        return namespace;
    }

    /**
     * Reserves the identity of a symbol in its namespace
     * @param {Symbol} symbol
     * @return {Symbol} symbol
     */
    manifestSymbol(symbol) {
        const namespaceIdentity = this.constructor.namespaceOfSymbol(symbol),
              namespace = this.manifestNamespace(namespaceIdentity),
              identity = this.constructor.identityOfSymbol(symbol);
        if(namespace.handles.has(identity))
            return symbol;
        namespace.freeIdentities.delete(identity);
        while(namespace.nextIdentity < identity)
            namespace.freeIdentities.add(namespace.nextIdentity++);
        namespace.nextIdentity = Math.max(namespace.nextIdentity, identity+1);
        const handle = {};
        // handle.namespace = namespace;
        // handle.identity = identity;
        handle.dataLength = 0;
        handle.dataBytes = new Uint8Array();
        handle.subIndices = [];
        for(let i = 0; i < 6; ++i)
            handle.subIndices.push(new Map());
        namespace.handles.set(identity, handle);
        return symbol;
    }

    /**
     * Creates a new symbol
     * @param {number} namespaceIdentity Identity of the namespace to create the symbol in
     * @return {Symbol} symbol
     */
    createSymbol(namespaceIdentity) {
        const namespace = this.manifestNamespace(namespaceIdentity);
        let identity;
        if(namespace.freeIdentities.size == 0)
            identity = namespace.nextIdentity++;
        else {
            identity = namespace.freeIdentities.values().next().value;
            namespace.freeIdentities.delete(identity);
        }
        return this.manifestSymbol(this.constructor.concatIntoSymbol(namespaceIdentity, identity));
    }

    /**
     * Releases the identity of a symbol in its namespace
     * @param {Symbol} symbol
     */
    releaseSymbol(symbol) {
        const namespaceIdentity = this.constructor.namespaceOfSymbol(symbol),
              namespace = this.namespaces.get(namespaceIdentity),
              identity = this.constructor.identityOfSymbol(symbol);
        namespace.handles.delete(identity);
        if(namespace.handles.size == 0)
            this.namespaces.delete(namespaceIdentity);
        else {
            if(identity == namespace.nextIdentity - 1)
                --namespace.nextIdentity;
            else if(identity < namespace.nextIdentity - 1)
                namespace.freeIdentities.add(identity);
        }
    }



    /**
     * Returns the length of the symbols virtual space
     * @param {Symbol} symbol
     * @return {number} length in bits
     */
    getLength(symbol) {
        const handle = this.getHandle(symbol);
        return handle.dataLength;
    }

    /**
     * Erases a slice of a symbols virtual space at the given offset and with the given length
     * @param {Symbol} symbol
     * @param {number} offset in bits
     * @param {number} length in bits
     */
    decreaseLength(symbol, offset, length) {
        const handle = this.getHandle(symbol);
        handle.dataBytes.copyWithin(offset / 8, (offset + length) / 8);
        handle.dataBytes = handle.dataBytes.slice(0, (handle.dataLength - length) / 8);
        handle.dataLength -= length;
    }

    /**
     * Inserts a slice of a symbols virtual space at the given offset and with the given length
     * @param {Symbol} symbol
     * @param {number} offset in bits
     * @param {number} length in bits
     */
    increaseLength(symbol, offset, length) {
        const handle = this.getHandle(symbol);
        const dataBytes = new Uint8Array((handle.dataLength + length) / 8);
        dataBytes.set(handle.dataBytes, 0);
        dataBytes.copyWithin((offset + length) / 8, offset / 8);
        handle.dataBytes = dataBytes;
        handle.dataLength += length;
    }

    /**
     * Returns a slice of data starting at the given offset and with the given length
     * @param {Symbol} symbol
     * @param {number} offset in bits
     * @param {number} length in bits
     * @return {Uint8Array} dataSlice Do not modify the return value as it might be used internally
     */
    readData(symbol, offset, length) {
        const handle = this.getHandle(symbol);
        if(offset == 0 && length == handle.dataLength)
            return handle.dataBytes;
        return handle.dataBytes.slice(offset / 8, (offset + length) / 8);
    }

    /**
     * Replaces a slice of data starting at the given offset and with the given length by dataBytes
     * @param {Symbol} symbol
     * @param {number} offset in bits
     * @param {number} length in bits
     * @param {Uint8Array} dataBytes
     */
    writeData(symbol, offset, length, dataBytes) {
        const handle = this.getHandle(symbol);
        if(offset == 0 && length == handle.dataLength) {
            handle.dataBytes = dataBytes;
            handle.dataLength = dataBytes.byteLength * 8;
        } else
            handle.dataBytes.set(dataBytes, offset / 8);
    }



    /**
     * Links or unlinks a triple
     * @param {Triple} triple
     * @param {boolean} linked
     * @return {boolean} success Returns false if no changes were made
     */
    setTriple(triple, linked) {
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
            this.manifestSymbol(triple[0]);
            this.manifestSymbol(triple[1]);
            this.manifestSymbol(triple[2]);
        }
        const entityHandle = this.getHandle(triple[0]),
              attributeHandle = this.getHandle(triple[1]),
              valueHandle = this.getHandle(triple[2]);
        operateSubIndex(entityHandle.subIndices[indexByName.EAV], triple[1], triple[2]);
        operateSubIndex(attributeHandle.subIndices[indexByName.AVE], triple[2], triple[0]);
        operateSubIndex(valueHandle.subIndices[indexByName.VEA], triple[0], triple[1]);
        operateSubIndex(entityHandle.subIndices[indexByName.EVA], triple[2], triple[1]);
        operateSubIndex(attributeHandle.subIndices[indexByName.AEV], triple[0], triple[2]);
        operateSubIndex(valueHandle.subIndices[indexByName.VAE], triple[1], triple[0]);
    }

    /**
     * Yields all matching triples according to the given triple and mask. The final .next() returns the count of matches
     * @param {QueryMask} mask
     * @param {Triple} triple
     * @return {Triple} iterator of matches
     */
    queryTriples(mask, triple) {
        const index = indexLookup[mask];
        return searchLookup[mask].call(this, index, reorderTriple(triplePrioritized, index, triple));
    }
};
