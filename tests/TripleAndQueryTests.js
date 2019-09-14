import {SymbolInternals, SymbolMap, BasicBackend} from '../SymatemJS.js';

export function getTests(backend, rand) {
    let triplePool = new Set();
    const symbolPool = [], maskByIndex = Object.keys(BasicBackend.queryMasks);
    for(let i = 0; i < 100; ++i)
        symbolPool.push(backend.createSymbol(4));

    function tripleFromTag(tag) {
        return tag.split(';').map(string => SymbolInternals.symbolFromString(string));
    }

    function tagFromTriple(triple) {
        return triple.map(symbol => SymbolInternals.symbolToString(symbol)).join(';');
    }

    return {
        'setTriple': [5000, () => {
            const triple = [rand.selectUniformly(symbolPool), rand.selectUniformly(symbolPool), rand.selectUniformly(symbolPool)],
                  tripleTag = tagFromTriple(triple),
                  tripleExists = triplePool.has(tripleTag),
                  linked = rand.selectUniformly([false, true]),
                  expected = (tripleExists != linked),
                  result = backend.setTriple(triple, linked);
            if(linked)
                triplePool.add(tripleTag);
            else
                triplePool.delete(tripleTag);
            if(expected != result) {
                console.warn('setTriple',
                    [...triplePool].sort().join(' '), triple,
                    tripleExists, linked, result, expected
                );
                return false;
            }
            return true;
        }],
        'queryTriples': [100, () => {
            const queryTriple = [rand.selectUniformly(symbolPool), rand.selectUniformly(symbolPool), rand.selectUniformly(symbolPool)],
                  maskIndex = rand.range(0, 27),
                  mask = maskByIndex[maskIndex],
                  iterator = backend.queryTriples(maskIndex, queryTriple),
                  result = new Set(), expected = new Set();
            for(const tripleTag of triplePool) {
                const triple = tripleFromTag(tripleTag);
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
                    expected.add(tagFromTriple(triple));
            }
            let noErrorsOccured = true;
            while(true) {
                const element = iterator.next();
                if(element.done) {
                    if(element.value != result.size || element.value != expected.size)
                        noErrorsOccured = false;
                    break;
                }
                const tripleTag = tagFromTriple(element.value);
                result.add(tripleTag);
                if(!expected.has(tripleTag))
                    noErrorsOccured = false;
            }
            if(!noErrorsOccured)
                console.warn('queryTriples',
                    queryTriple, mask,
                    [...triplePool].sort(), [...backend.queryTriples(BasicBackend.queryMasks.VVV, queryTriple)].map(triple => tagFromTriple(triple)).sort(),
                    [...result].sort(), [...expected].sort()
                );
            return noErrorsOccured;
        }]
    };
}
