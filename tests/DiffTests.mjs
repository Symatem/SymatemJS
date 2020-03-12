import PRNG from './PRNG.mjs';
import {Utils, SymbolInternals, SymbolMap, BasicBackend, Diff} from '../SymatemJS.mjs';

export const repositoryNamespace = 3,
             modalNamespace = 4,
             checkoutNamespace = 5,
             recordingRelocation = {[checkoutNamespace]: modalNamespace},
             checkoutRelocation = {[modalNamespace]: checkoutNamespace},
             configuration = {
    'minSymbolCount': 10,
    'minTripleCount': 100,
    'minDataLength': 10,
    'maxDataLength': 50,
    'minCreaseLength': 1,
    'maxCreaseLength': 10,
    'operationCount': 100,
    'operationProbabilities': PRNG.cumulateDistribution({
        'createSymbol': 1,
        'unlinkSymbol': 0.5,
        'increaseLength': 1,
        'decreaseLength': 1,
        'replaceData': 1,
        'writeData': 1,
        'setTriple': 1
    })
};

export function fillCheckout(backend, rand) {
    backend.unlinkSymbol(BasicBackend.symbolInNamespace('Namespaces', checkoutNamespace));
    const symbolPool = [];
    for(let i = 0; i < configuration.minSymbolCount*2; ++i) {
        const symbol = backend.createSymbol(checkoutNamespace),
              length = rand.range(configuration.minDataLength, configuration.maxDataLength),
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

export function *generateOperations(backend, rand, symbolPool) {
    for(let iteration = 0; iteration < configuration.operationCount; ++iteration) {
        const operationType = (symbolPool.length < configuration.minSymbolCount)
                              ? 'createSymbol'
                              : rand.selectByDistribution(configuration.operationProbabilities);
        switch(operationType) {
            case 'createSymbol': {
                const symbol = backend.createSymbol(checkoutNamespace);
                symbolPool.push(symbol);
                yield `${iteration}: Create a symbol ${symbol}`;
            } break;
            case 'unlinkSymbol': {
                const index = rand.range(0, symbolPool.length),
                      symbol = symbolPool[index];
                symbolPool.splice(index, 1);
                backend.unlinkSymbol(symbol);
                yield `${iteration}: Unlink the symbol ${symbol}`;
            } break;
            case 'increaseLength': {
                const dstSymbol = rand.selectUniformly(symbolPool),
                      dstLength = backend.getLength(dstSymbol),
                      dstOffset = rand.range(0, dstLength),
                      length = rand.range(configuration.minCreaseLength, configuration.maxCreaseLength);
                backend.creaseLength(dstSymbol, dstOffset, length);
                yield `${iteration}: Increase '${dstSymbol}'[${dstOffset}] by ${length} bits`;
                backend.writeData(dstSymbol, dstOffset, length, rand.bytes(Math.ceil(length/32)*4));
                yield `${iteration}: Initialize ${length} bits at '${dstSymbol}'[${dstOffset}] as zeros`;
            } break;
            case 'decreaseLength': {
                const dstSymbol = rand.selectUniformly(symbolPool),
                      dstLength = backend.getLength(dstSymbol),
                      endOffset = rand.range(0, dstLength),
                      dstOffset = rand.range(0, endOffset),
                      length = endOffset-dstOffset;
                if(length > 0) {
                    backend.creaseLength(dstSymbol, dstOffset, -length);
                    yield `${iteration}: Decrease '${dstSymbol}'[${dstOffset}] by ${length} bits`;
                }
            } break;
            case 'replaceData': {
                const descriptions = [], replaceOperations = [];
                for(let i = 0; i < 1; ++i) {
                    // TODO: Test multiple replaces, avoid overlapping ranges in dst
                    const dstSymbol = rand.selectUniformly(symbolPool),
                          dstLength = backend.getLength(dstSymbol),
                          dstOffset = rand.range(0, dstLength),
                          srcSymbol = rand.selectUniformly(symbolPool),
                          srcLength = backend.getLength(srcSymbol),
                          srcOffset = rand.range(0, srcLength),
                          maxLength = Math.min(dstLength-dstOffset, srcLength-srcOffset),
                          length = rand.range(Math.ceil(maxLength*0.5), maxLength);
                    if(length > 0) {
                        descriptions.push(`Replace ${length} bits at '${dstSymbol}'[${dstOffset}] by '${srcSymbol}'[${srcOffset}]`);
                        replaceOperations.push({'dstSymbol': dstSymbol, 'dstOffset': dstOffset, 'srcSymbol': srcSymbol, 'srcOffset': srcOffset, 'length': length});
                    }
                }
                if(replaceOperations.length > 0) {
                    backend.replaceDataSimultaneously(replaceOperations);
                    yield `${iteration}: ${descriptions.join('\n')}`;
                }
            } break;
            case 'writeData': {
                const dstSymbol = rand.selectUniformly(symbolPool),
                      dstLength = backend.getLength(dstSymbol),
                      dstOffset = rand.range(0, dstLength),
                      maxLength = dstLength-dstOffset,
                      length = rand.range(0, maxLength),
                      dataBytes = rand.bytes(Math.ceil(length/32)*4);
                if(length > 0) {
                    backend.writeData(dstSymbol, dstOffset, length, dataBytes);
                    yield `${iteration}: Replace ${length} bits at '${dstSymbol}'[${dstOffset}] by ${dataBytes}`;
                }
            } break;
            case 'setTriple': {
                const linked = rand.selectUniformly([false, true]),
                      triple = [rand.selectUniformly(symbolPool), rand.selectUniformly(symbolPool), rand.selectUniformly(symbolPool)];
                backend.setTriple(triple, linked);
                yield `${iteration}: ${(linked) ? 'Linked' : 'Unlinked'} the triple ${triple[0]} ${triple[1]} ${triple[2]}`;
            } break;
        }
    }
}

function testDiff(backend, diff, initialState) {
    diff.compressData();
    if(!diff.validateIntegrity())
        return false;
    diff.commit();
    const originalJson = diff.encodeJson(),
          decodedDiff = new Diff(backend, recordingRelocation, repositoryNamespace);
    decodedDiff.decodeJson(originalJson);
    decodedDiff.link();
    const loadedDiff = new Diff(backend, recordingRelocation, repositoryNamespace, decodedDiff.symbol),
          loadedJson = loadedDiff.encodeJson(),
          resultOfRecording = backend.encodeJson([checkoutNamespace]);
    if(!loadedDiff.apply(true, checkoutRelocation)) {
        console.warn('Could not apply reverse');
        return false;
    }
    const resultOfReverse = backend.encodeJson([checkoutNamespace]);
    if(!loadedDiff.apply(false, checkoutRelocation)) {
        console.warn('Could not apply forward');
        return false;
    }
    const resultOfForward = backend.encodeJson([checkoutNamespace]);
    loadedDiff.unlink();
    if(initialState != resultOfReverse) {
        console.warn('Reverse failed', initialState, resultOfReverse);
        return false;
    }
    if(resultOfRecording != resultOfForward) {
        console.warn('Forward failed', resultOfRecording, resultOfForward);
        return false;
    }
    return true;
}

export function getTests(backend, rand) {
    const concatDiff = new Diff(backend, recordingRelocation, repositoryNamespace);
    let concatInitialState;
    return {
        'diffRecording': [100, () => {
            const initialState = backend.encodeJson([checkoutNamespace]),
                  diff = new Diff(backend, recordingRelocation, repositoryNamespace),
                  symbolPool = [...backend.querySymbols(checkoutNamespace)];
            if(!concatInitialState)
                concatInitialState = initialState;
            for(const description of generateOperations(diff, rand, symbolPool));
            if(!testDiff(backend, diff, initialState))
                return false;
            if(!diff.apply(false, {}, concatDiff)) {
                console.warn('Could not concat diffs');
                return false;
            }
            diff.unlink();
            return true;
        }],
        'diffConcatenation': [1, () => {
            if(!testDiff(backend, concatDiff, concatInitialState))
                return false;
            concatDiff.unlink();
            return true;
        }]
    };
}