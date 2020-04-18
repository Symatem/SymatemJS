import PRNG from './PRNG.mjs';
import {Utils, SymbolInternals, SymbolMap, BasicBackend, Diff} from '../SymatemJS.mjs';

export const configuration = {
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

export function fillMaterialization(backend, rand) {
    backend.clearNamespace(configuration.materializationNamespace);
    const symbolPool = [];
    for(let i = 0; i < configuration.minSymbolCount*2; ++i) {
        const symbol = backend.createSymbol(configuration.materializationNamespace),
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
                SymbolMap.set(operationsOfSymbolCopy.tripleOperations, beta, gammaCollectionCopy);
                for(const [gamma, link] of SymbolMap.entries(gammaCollection))
                    SymbolMap.set(gammaCollectionCopy, gamma, link);
            }
        }
        SymbolMap.set(diffSnapshot.preCommitStructure, symbol, operationsOfSymbolCopy);
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
                const symbol = backend.createSymbol(configuration.materializationNamespace);
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
    const resultOfRecording = backend.encodeJson([configuration.materializationNamespace]);
    diff.compressData();
    diff.commit();
    if(!diff.validateIntegrity())
        return false;
    const decodedDiff = new Diff(backend, configuration.repositoryNamespace, configuration.recordingRelocation, diff.encodeJson());
    decodedDiff.link();
    const loadedDiff = new Diff(backend, configuration.repositoryNamespace, configuration.recordingRelocation, decodedDiff.symbol);
    if(!loadedDiff.apply(true, configuration.materializationRelocation)) {
        console.warn('Could not apply reverse');
        return false;
    }
    const resultOfReverse = backend.encodeJson([configuration.materializationNamespace]);
    if(!loadedDiff.apply(false, configuration.materializationRelocation)) {
        console.warn('Could not apply forward');
        return false;
    }
    const resultOfForward = backend.encodeJson([configuration.materializationNamespace]);
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
    configuration.repositoryNamespace = SymbolInternals.identityOfSymbol(backend.createSymbol(BasicBackend.metaNamespaceIdentity));
    configuration.modalNamespace = SymbolInternals.identityOfSymbol(backend.createSymbol(BasicBackend.metaNamespaceIdentity));
    configuration.materializationNamespace = SymbolInternals.identityOfSymbol(backend.createSymbol(BasicBackend.metaNamespaceIdentity));
    configuration.comparisonNamespace = SymbolInternals.identityOfSymbol(backend.createSymbol(BasicBackend.metaNamespaceIdentity));
    configuration.recordingRelocation = {[configuration.materializationNamespace]: configuration.modalNamespace};
    configuration.materializationRelocation = {[configuration.modalNamespace]: configuration.materializationNamespace};
    const concatDiff = new Diff(backend, configuration.repositoryNamespace, configuration.recordingRelocation);
    let concatInitialState;
    return {
        'diffRecording': [100, () => {
            const initialState = backend.encodeJson([configuration.materializationNamespace]),
                  diff = new Diff(backend, configuration.repositoryNamespace, configuration.recordingRelocation),
                  symbolPool = [...backend.querySymbols(configuration.materializationNamespace)];
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
        }],
        'diffComparison': [10, () => {
            fillMaterialization(backend, rand);
            const initialState = backend.encodeJson([configuration.materializationNamespace]);
            backend.clearNamespace(configuration.comparisonNamespace);
            backend.cloneNamespaces({[configuration.materializationNamespace]: configuration.comparisonNamespace});
            const symbolPool = [...backend.querySymbols(configuration.materializationNamespace)];
            for(const description of generateOperations(backend, rand, symbolPool));
            const resultOfRecording = backend.encodeJson([configuration.materializationNamespace]),
                  diff = new Diff(backend, configuration.repositoryNamespace, {[configuration.materializationNamespace]: configuration.modalNamespace, [configuration.comparisonNamespace]: configuration.modalNamespace});
            diff.compare({[configuration.comparisonNamespace]: configuration.materializationNamespace});
            if(!testDiff(backend, diff, initialState))
                return false;
            // TODO: Test multiple namespaces
            return true;
        }]
    };
}
