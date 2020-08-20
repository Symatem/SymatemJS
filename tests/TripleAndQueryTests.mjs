import {SymbolInternals, SymbolMap, TripleMap} from '../SymatemJS.mjs';

export function getTests(backend, rand) {
    const symbolPool = [],
          triplePool = TripleMap.create(),
          maskByIndex = Object.keys(backend.queryMasks),
          namespaceIdentity = SymbolInternals.identityOfSymbol(backend.createSymbol(backend.metaNamespaceIdentity)),
          cloneIdentity = SymbolInternals.identityOfSymbol(backend.createSymbol(backend.metaNamespaceIdentity));
    for(let i = 0; i < 100; ++i)
        symbolPool.push(backend.createSymbol(namespaceIdentity));

    return {
        'setTriple': [5000, () => new Promise((resolve, reject) => {
            const triple = [rand.selectUniformly(symbolPool), rand.selectUniformly(symbolPool), rand.selectUniformly(symbolPool)],
                  tripleExists = TripleMap.get(triplePool, triple) != undefined,
                  linked = rand.selectUniformly([false, true]),
                  expected = (tripleExists != linked),
                  result = backend.setTriple(triple, linked);
            if(expected != result)
                throw new Error('setTriple',
                    triple, '|',
                    [...TripleMap.keys(triplePool)].sort().join(' '), '|',
                    [...backend.queryTriples(backend.queryMasks.VVV, [backend.symbolByName.Void, backend.symbolByName.Void, backend.symbolByName.Void])].sort().join(' '), '|',
                    tripleExists, linked, result, expected
                );
            if(linked)
                TripleMap.set(triplePool, triple, true);
            else
                TripleMap.remove(triplePool, triple);
            resolve();
        })],
        'queryTriples': [100, () => new Promise((resolve, reject) => {
            const queryTriple = [rand.selectUniformly(symbolPool), rand.selectUniformly(symbolPool), rand.selectUniformly(symbolPool)],
                  maskIndex = rand.range(0, 27),
                  mask = maskByIndex[maskIndex],
                  iterator = backend.queryTriples(maskIndex, queryTriple),
                  result = TripleMap.create(), expected = TripleMap.create();
            for(const triple of TripleMap.keys(triplePool)) {
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
                    TripleMap.set(expected, triple, true);
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
                TripleMap.set(result, element.value, true);
                if(!TripleMap.get(expected, element.value))
                    noErrorsOccured = false;
            }
            if(!noErrorsOccured)
                throw new Error('queryTriples',
                    mask, queryTriple, '|',
                    [...TripleMap.keys(triplePool)].sort().join(' '), '|',
                    [...backend.queryTriples(backend.queryMasks.VVV, [backend.symbolByName.Void, backend.symbolByName.Void, backend.symbolByName.Void])].sort().join(' '), '|',
                    [...result].sort().join(' '), '|',
                    [...expected].sort().join(' ')
                );
            resolve();
        })]
    };
}
