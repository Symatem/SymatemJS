import PRNG from './PRNG.js';
import {Utils, SymbolInternals, BasicBackend, Differential} from '../SymatemJS.js';

export const repositoryNamespace = 3,
             checkoutNamespace = 4,
randomizationOptions = {
    'minSymbolCount': 8,
    'minTripleCount': 8,
    'dataLength': 32,
    'minCreaseLength': 6,
    'maxCreaseLength': 12,
    'operationCount': 100,
    'operationProbabilities': PRNG.cumulateDistribution({
        'manifestSymbol': 1,
        'unlinkSymbol': 1,
        'increaseLength': 1,
        'decreaseLength': 1,
        'replaceData': 1,
        'writeData': 1,
        'setTriple': 1
    })
};

export function generateJournal(backend, rand, callback) {
    const symbolPool = [...backend.querySymbols(checkoutNamespace)];
    for(let iteration = 0; iteration < randomizationOptions.operationCount; ++iteration) {
        const operationType = (symbolPool.length < randomizationOptions.minSymbolCount)
                              ? 'manifestSymbol'
                              : rand.selectByDistribution(randomizationOptions.operationProbabilities);
        switch(operationType) {
            case 'manifestSymbol': {
                const symbol = backend.createSymbol(checkoutNamespace),
                      length = randomizationOptions.dataLength,
                      dataBytes = rand.bytes(Math.ceil(length/32)*4);
                symbolPool.push(symbol);
                callback(`${iteration}: Manifested the symbol ${symbol}`, 'manifestSymbol', [symbol]);
            } break;
            case 'unlinkSymbol': {
                const symbol = rand.selectUniformly(symbolPool);
                symbolPool.splice(symbolPool.indexOf(symbol), 1);
                callback(`${iteration}: Unlink the symbol ${symbol}`, 'unlinkSymbol', [symbol]);
            } break;
            case 'increaseLength': {
                const dstSymbol = rand.selectUniformly(symbolPool),
                      dstLength = backend.getLength(dstSymbol),
                      dstOffset = rand.range(0, dstLength),
                      length = rand.range(randomizationOptions.minCreaseLength, randomizationOptions.maxCreaseLength);
                callback(`${iteration}: Increase '${dstSymbol}'[${dstOffset}] by ${length} bits`, 'creaseLength', [dstSymbol, dstOffset, length]);
                callback(`${iteration}: Initialize ${length} bits at '${dstSymbol}'[${dstOffset}] as zeros`, 'writeData', [dstSymbol, dstOffset, length, new Uint8Array(4)]);
            } break;
            case 'decreaseLength': {
                const dstSymbol = rand.selectUniformly(symbolPool),
                      dstLength = backend.getLength(dstSymbol),
                      endOffset = rand.range(0, dstLength),
                      dstOffset = rand.range(0, endOffset),
                      length = endOffset-dstOffset;
                if(length == 0)
                    continue;
                callback(`${iteration}: Decrease '${dstSymbol}'[${dstOffset}] by ${length} bits`, 'creaseLength', [dstSymbol, dstOffset, -length]);
            } break;
            case 'replaceData': {
                // TODO: Test multiple replaces
                const dstSymbol = rand.selectUniformly(symbolPool),
                      dstLength = backend.getLength(dstSymbol),
                      dstOffset = rand.range(0, dstLength),
                      srcSymbol = rand.selectUniformly(symbolPool),
                      srcLength = backend.getLength(srcSymbol),
                      srcOffset = rand.range(0, srcLength),
                      maxLength = Math.min(dstLength-dstOffset, srcLength-srcOffset),
                      length = rand.range(Math.ceil(maxLength*0.5), maxLength);
                if(length == 0)
                    continue;
                callback(`${iteration}: Replace ${length} bits at '${dstSymbol}'[${dstOffset}] by '${srcSymbol}'[${srcOffset}]`, 'replaceData', [dstSymbol, dstOffset, srcSymbol, srcOffset, length]);
            } break;
            case 'writeData': {
                const dstSymbol = rand.selectUniformly(symbolPool),
                      dstLength = backend.getLength(dstSymbol),
                      dstOffset = rand.range(0, dstLength),
                      maxLength = dstLength-dstOffset,
                      length = rand.range(0, maxLength),
                      dataBytes = rand.bytes(Math.ceil(length/32)*4);
                if(length == 0)
                    continue;
                callback(`${iteration}: Replace ${length} bits at '${dstSymbol}'[${dstOffset}] by ${dataBytes}`, 'writeData', [dstSymbol, dstOffset, length, dataBytes]);
            } break;
            case 'setTriple': {
                let triple;
                const linked = rand.selectUniformly([false, true]);
                if(linked)
                    triple = [rand.selectUniformly(symbolPool), rand.selectUniformly(symbolPool), rand.selectUniformly(symbolPool)];
                else {
                    const triplePool = [];
                    for(const triple of backend.queryTriples(BasicBackend.queryMasks.VVV, [0, 0, 0]))
                        if(SymbolInternals.namespaceOfSymbol(triple[0]) == checkoutNamespace)
                            triplePool.push(triple);
                    if(triplePool.length == 0)
                        continue;
                    triple = rand.selectUniformly(triplePool);
                }
                callback(`${iteration}: ${(linked) ? 'Linked' : 'Unlinked'} the triple ${triple[0]} ${triple[1]} ${triple[2]}`, 'setTriple', [triple, linked]);
            } break;
        }
    }
}

export function stringifyCheckout(backend) {
    const namespace = backend.namespaces[checkoutNamespace];
    namespace.handles = Utils.sorted(namespace.handles);
    for(const handleIdentity in namespace.handles) {
        const handle = namespace.handles[handleIdentity];
        for(let i = 0; i < 6; ++i) {
            const subIndex = handle.subIndices[i] = Utils.sorted(handle.subIndices[i]);
            for(const symbol in subIndex)
                subIndex[symbol] = Utils.sorted(subIndex[symbol]);
        }
    }
    return JSON.stringify(namespace, undefined, 4);
}

export function getTests(backend, rand) {
    return {
        'differential': [100, () => {
            const resultOfNothing = stringifyCheckout(backend),
                  diff = new Differential(backend, {}, repositoryNamespace);
            generateJournal(backend, rand, (description, method, args) => {
                diff[method](...args);
            });
            diff.compressData();
            if(!diff.validateIntegrity())
                return false;
            diff.commit();
            const resultOfJournal = stringifyCheckout(backend);
            if(!diff.apply(true)) {
                console.warn('Could not apply reverse');
                return false;
            }
            const resultOfRevert = stringifyCheckout(backend);
            if(!diff.apply(false)) {
                console.warn('Could not apply forward');
                return false;
            }
            const resultOfDifferential = stringifyCheckout(backend);
            if(resultOfNothing != resultOfRevert) {
                console.warn(resultOfNothing, resultOfRevert);
                return false;
            }
            if(resultOfJournal != resultOfDifferential) {
                console.warn(resultOfJournal, resultOfDifferential);
                return false;
            }
            return true;
        }]
    };
}
