import PRNG from './PRNG.mjs';
import { RelocationTable, SymbolInternals, SymbolMap, Diff, Repository} from '../src/SymatemJS.mjs';

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

function recordState(backend, relocationTable) {
    return {
        'hashSumByNamespace': backend.hashNamespaces(relocationTable),
        'json': backend.encodeJson([...RelocationTable.entries(relocationTable)].map(([materializationNamespace, modalNamespace]) => materializationNamespace))
    };
}

function compareStates(stateA, stateB) {
    if(stateA.hashSumByNamespace) {
        if(stateA.hashSumByNamespace.size != stateB.hashSumByNamespace.size)
            return false;
        for(const [namespaceIdentity, hash] in stateA.hashSumByNamespace)
            if(hash != stateB.hashSumByNamespace.get(namespaceIdentity))
                return false;
    }
    return stateA.json == stateB.json;
}

function testDiff(backend, diff, initialState) {
    const resultOfRecording = recordState(backend, configuration.repository.relocationTable);
    diff.compressData();
    diff.commit();
    if(!diff.validateIntegrity())
        throw new Error('Diff validation failed');
    if(compareStates(diff, resultOfRecording))
        throw new Error('Incremental hashing of recording is wrong', diff.hashSumByNamespace, resultOfRecording.hashSumByNamespace);
    const decodedDiff = new Diff(configuration.repository, diff.encodeJson());
    decodedDiff.link();
    const loadedDiff = new Diff(configuration.repository, decodedDiff.symbol),
          materializationRelocation = RelocationTable.create([[configuration.modalNamespace, configuration.materializationNamespace]]);
    loadedDiff.hashSumByNamespace = diff.hashSumByNamespace;
    if(!loadedDiff.apply(true, materializationRelocation))
        throw new Error('Could not apply reverse');
    const resultOfReverse = recordState(backend, configuration.repository.relocationTable);
    if(!compareStates(initialState, resultOfReverse))
        throw new Error('Apply reverse is wrong', initialState, resultOfReverse);
    if(compareStates(loadedDiff, resultOfReverse))
        throw new Error('Incremental hashing of apply reverse is wrong', loadedDiff.hashSumByNamespace, resultOfReverse.hashSumByNamespace);
    if(!loadedDiff.apply(false, materializationRelocation))
        throw new Error('Could not apply forward');
    const resultOfForward = recordState(backend, configuration.repository.relocationTable);
    if(!compareStates(resultOfRecording, resultOfForward))
        throw new Error('Apply forward is wrong', resultOfRecording, resultOfForward);
    if(compareStates(loadedDiff, resultOfForward))
        throw new Error('Incremental hashing of apply forward is wrong', loadedDiff.hashSumByNamespace, resultOfForward.hashSumByNamespace);
    loadedDiff.unlink();
    return diff;
}

export function getTests(backend, rand) {
    // TODO: Test with multiple namespaces
    const repositoryNamespace = SymbolInternals.identityOfSymbol(backend.createSymbol(backend.metaNamespaceIdentity));
    configuration.materializationNamespace = SymbolInternals.identityOfSymbol(backend.createSymbol(backend.metaNamespaceIdentity));
    configuration.comparisonNamespace = SymbolInternals.identityOfSymbol(backend.createSymbol(backend.metaNamespaceIdentity));
    configuration.modalNamespace = SymbolInternals.identityOfSymbol(backend.createSymbol(backend.metaNamespaceIdentity));
    configuration.comparisonRelocation = RelocationTable.create([[configuration.materializationNamespace, configuration.comparisonNamespace]]);
    configuration.inverseComparisonRelocation = RelocationTable.inverse(configuration.comparisonRelocation);
    configuration.repository = new Repository(backend, backend.createSymbol(repositoryNamespace));
    const concatDiff = new Diff(configuration.repository);
    let concatInitialState;
    return {
        'diffRecording': [100, () => new Promise((resolve, reject) => {
            RelocationTable.set(configuration.repository.relocationTable, configuration.materializationNamespace, configuration.modalNamespace);
            const initialState = recordState(backend, configuration.repository.relocationTable),
                  diff = new Diff(configuration.repository),
                  symbolPool = [...backend.querySymbols(configuration.materializationNamespace)];
            diff.hashSumByNamespace = new Map([[configuration.modalNamespace, initialState.hashSumByNamespace.get(configuration.modalNamespace)]]);
            if(!concatInitialState)
                concatInitialState = initialState;
            for(const description of generateOperations(diff, rand, symbolPool));
            testDiff(backend, diff, initialState);
            if(!diff.apply(false, RelocationTable.create(), concatDiff))
                throw new Error('Could not concat diffs');
            diff.unlink();
            resolve();
        })],
        'diffConcatenation': [1, () => new Promise((resolve, reject) => {
            RelocationTable.set(configuration.repository.relocationTable, configuration.materializationNamespace, configuration.modalNamespace);
            testDiff(backend, concatDiff, concatInitialState);
            concatDiff.unlink();
            resolve();
        })],
        'diffComparison': [10, () => new Promise((resolve, reject) => {
            fillMaterialization(backend, rand);
            RelocationTable.set(configuration.repository.relocationTable, configuration.materializationNamespace, configuration.modalNamespace);
            const initialState = recordState(backend, configuration.repository.relocationTable);
            backend.clearNamespace(configuration.comparisonNamespace);
            backend.cloneNamespaces(configuration.comparisonRelocation);
            const symbolPool = [...backend.querySymbols(configuration.materializationNamespace)];
            for(const description of generateOperations(backend, rand, symbolPool));
            const resultOfRecording = recordState(backend, configuration.repository.relocationTable),
                  diff = new Diff(configuration.repository);
            RelocationTable.set(configuration.repository.relocationTable, configuration.comparisonNamespace, configuration.modalNamespace);
            diff.compare(configuration.inverseComparisonRelocation);
            RelocationTable.removeSource(configuration.repository.relocationTable, configuration.comparisonNamespace);
            testDiff(backend, diff, initialState);
            resolve();
        })]
    };
}
