import {SymbolInternals, SymbolMap} from '../SymatemJS.mjs';

export function getTests(backend, rand) {
    const symbolPool = [],
          triplePool = new Set(),
          maskByIndex = Object.keys(backend.queryMasks),
          namespaceIdentity = SymbolInternals.identityOfSymbol(backend.createSymbol(backend.metaNamespaceIdentity)),
          cloneIdentity = SymbolInternals.identityOfSymbol(backend.createSymbol(backend.metaNamespaceIdentity));
    for(let i = 0; i < 100; ++i)
        symbolPool.push(backend.createSymbol(namespaceIdentity));

    return {
        'setTriple': [5000, () => {
            const triple = [rand.selectUniformly(symbolPool), rand.selectUniformly(symbolPool), rand.selectUniformly(symbolPool)],
                  tripleTag = SymbolInternals.tripleToString(triple),
                  tripleExists = triplePool.has(tripleTag),
                  linked = rand.selectUniformly([false, true]),
                  expected = (tripleExists != linked),
                  result = backend.setTriple(triple, linked);
            if(expected != result) {
                console.warn('setTriple',
                    SymbolInternals.tripleToString(triple),
                    [...triplePool].sort().join(' '), '|',
                    [...backend.queryTriples(backend.queryMasks.VVV, [backend.symbolByName.Void, backend.symbolByName.Void, backend.symbolByName.Void])].map(triple => SymbolInternals.tripleToString(triple)).sort().join(' '),
                    tripleExists, linked, result, expected
                );
                return false;
            }
            if(linked)
                triplePool.add(tripleTag);
            else
                triplePool.delete(tripleTag);
            return true;
        }],
        'queryTriples': [100, () => {
            const queryTriple = [rand.selectUniformly(symbolPool), rand.selectUniformly(symbolPool), rand.selectUniformly(symbolPool)],
                  maskIndex = rand.range(0, 27),
                  mask = maskByIndex[maskIndex],
                  iterator = backend.queryTriples(maskIndex, queryTriple),
                  result = new Set(), expected = new Set();
            for(const tripleTag of triplePool) {
                const triple = SymbolInternals.tripleFromString(tripleTag);
                let select = true;
                for(let j = 0; j < 3; ++j) {
                    if(mask[j] == 'I')
                        triple[j] = queryTriple[j];
                    else if(mask[j] == 'M' && !SymbolInternals.areSymbolsEqual(triple[j], queryTriple[j])) {
                        select = false;
                        break;
                    }
                }
                if(select)
                    expected.add(SymbolInternals.tripleToString(triple));
            }
            let noErrorsOccured = true;
            while(true) {
                const element = iterator.next();
                if(element.done) {
                    if(result.size != expected.size)
                        noErrorsOccured = false;
                    break;
                }
                // TODO: Namespace mask in queryTriples
                if(element.value.reduce((value, symbol) => {
                    if(SymbolInternals.namespaceOfSymbol(symbol) == namespaceIdentity)
                        ++value;
                    return value;
                }, 0) < 3)
                    continue;
                const tripleTag = SymbolInternals.tripleToString(element.value);
                result.add(tripleTag);
                if(!expected.has(tripleTag))
                    noErrorsOccured = false;
            }
            if(!noErrorsOccured)
                console.warn('queryTriples',
                    mask, SymbolInternals.tripleToString(queryTriple),
                    [...triplePool].sort().join(' '), '|',
                    [...backend.queryTriples(backend.queryMasks.VVV, [backend.symbolByName.Void, backend.symbolByName.Void, backend.symbolByName.Void])].map(triple => SymbolInternals.tripleToString(triple)).sort().join(' '), '|',
                    [...result].sort().join(' '), '|',
                    [...expected].sort().join(' ')
                );
            return noErrorsOccured;
        }]
    };
}
