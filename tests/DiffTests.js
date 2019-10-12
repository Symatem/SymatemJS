import PRNG from './PRNG.js';
import {Utils, SymbolInternals, SymbolMap, BasicBackend, Diff} from '../SymatemJS.js';

export const repositoryNamespace = 3,
             checkoutNamespace = 4,
             configuration = {
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

export function fillCheckout(backend, rand, symbolPool) {
    backend.unlinkSymbol(BasicBackend.symbolInNamespace('Namespaces', checkoutNamespace));
    let nextSymbol = 0;
    symbolPool.length = 0;
    for(let i = 0; i < configuration.minSymbolCount; ++i) {
        const symbol = SymbolInternals.concatIntoSymbol(checkoutNamespace, nextSymbol++),
              length = rand.range(configuration.dataLength/2, configuration.dataLength),
              dataBytes = rand.bytes(Math.ceil(length/32)*4);
        backend.setRawData(symbol, dataBytes, length);
        symbolPool.push(symbol);
    }
    for(let i = 0; i < configuration.minTripleCount; ++i) {
        const triple = [rand.selectUniformly(symbolPool), rand.selectUniformly(symbolPool), rand.selectUniformly(symbolPool)];
        backend.setTriple(triple, true);
    }
}

export function makeDiffSnapshot(diff, description) {
    const diffSnapshot = {
        'description': description,
        'dataSource': diff.dataSource,
        'dataRestore': diff.dataRestore,
        'preCommitStructure': SymbolMap.create()
    };
    for(const [symbol, operationsOfSymbol] of SymbolMap.entries(diff.preCommitStructure)) {
        const operationsOfSymbolCopy = Object.assign({}, operationsOfSymbol);
        for(const type of ['copyOperations', 'replaceOperations', 'creaseLengthOperations'])
            if(operationsOfSymbol[type])
                operationsOfSymbolCopy[type] = operationsOfSymbol[type].map(operation => Object.assign({}, operation));
        if(operationsOfSymbol.tripleOperations) {
            operationsOfSymbolCopy.tripleOperations = SymbolMap.create();
            for(const [beta, gammaCollection] of SymbolMap.entries(operationsOfSymbol.tripleOperations)) {
                const gammaCollectionCopy = SymbolMap.create();
                SymbolMap.insert(operationsOfSymbolCopy.tripleOperations, beta, gammaCollectionCopy);
                for(const [gamma, link] of SymbolMap.entries(gammaCollection))
                    SymbolMap.insert(gammaCollectionCopy, gamma, link);
            }
        }
        SymbolMap.insert(diffSnapshot.preCommitStructure, symbol, operationsOfSymbolCopy);
    }
    return diffSnapshot;
}

export function generateOperations(backend, rand, callback) {
    const symbolPool = [...backend.querySymbols(checkoutNamespace)];
    for(let iteration = 0; iteration < configuration.operationCount; ++iteration) {
        const operationType = (symbolPool.length < configuration.minSymbolCount)
                              ? 'manifestSymbol'
                              : rand.selectByDistribution(configuration.operationProbabilities);
        switch(operationType) {
            case 'manifestSymbol': {
                const symbol = backend.createSymbol(checkoutNamespace),
                      length = configuration.dataLength,
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
                      length = rand.range(configuration.minCreaseLength, configuration.maxCreaseLength);
                callback(`${iteration}: Increase '${dstSymbol}'[${dstOffset}] by ${length} bits`, 'creaseLength', [dstSymbol, dstOffset, length]);
                callback(`${iteration}: Initialize ${length} bits at '${dstSymbol}'[${dstOffset}] as zeros`, 'writeData', [dstSymbol, dstOffset, length, rand.bytes(Math.ceil(length/32)*4)]);
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
                    for(const triple of backend.queryTriples(BasicBackend.queryMasks.VVV, [BasicBackend.symbolByName.Void, BasicBackend.symbolByName.Void, BasicBackend.symbolByName.Void]))
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

export function getTests(backend, rand) {
    return {
        'diffRecording': [100, () => {
            const resultOfNothing = backend.encodeJson([checkoutNamespace]),
                  encodedDiff = new Diff(backend, {}, repositoryNamespace);
            generateOperations(backend, rand, (description, method, args) => {
                encodedDiff[method](...args);
            });
            encodedDiff.compressData();
            if(!encodedDiff.validateIntegrity())
                return false;
            encodedDiff.commit();
            const decodedDiff = new Diff(backend, {}, repositoryNamespace);
            decodedDiff.decodeJson(encodedDiff.encodeJson());
            const resultOfJournal = backend.encodeJson([checkoutNamespace]);
            if(!decodedDiff.apply(true)) {
                console.warn('Could not apply reverse');
                return false;
            }
            const resultOfRevert = backend.encodeJson([checkoutNamespace]);
            if(!decodedDiff.apply(false)) {
                console.warn('Could not apply forward');
                return false;
            }
            const resultOfDiff = backend.encodeJson([checkoutNamespace]);
            if(resultOfNothing != resultOfRevert) {
                console.warn('Reverse failed', resultOfNothing, resultOfRevert);
                return false;
            }
            if(resultOfJournal != resultOfDiff) {
                console.warn('Forward failed', resultOfJournal, resultOfDiff);
                return false;
            }
            return true;
        }]
    };
}
