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
                  result = backend.setTriple(triple, linked);
            if(linked)
                triplePool.add(tripleTag);
            else
                triplePool.delete(tripleTag);
            if((tripleExists != linked) != result) {
                console.warn([...triplePool].sort().join(' '), triple, tripleExists, linked, result);
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
                console.warn(
                    queryTriple, mask,
                    [...triplePool].sort(), [...backend.queryTriples(BasicBackend.queryMasks.VVV, queryTriple)].map(triple => tagFromTriple(triple)).sort(),
                    [...result].sort(), [...expected].sort()
                );
            return noErrorsOccured;
        }],
        'moveTriples': [1, () => {
            const translationTable = SymbolMap.create(),
                  dstSymbols = [],
                  srcSymbols = new Set(symbolPool);
            for(let i = 0; i < 5; ++i) {
                const srcSymbol = rand.selectUniformly([...srcSymbols]),
                      dstSymbol = backend.createSymbol(4);
                SymbolMap.insert(translationTable, srcSymbol, dstSymbol);
                srcSymbols.delete(srcSymbol);
                dstSymbols.push(dstSymbol);
            }
            symbolPool.length = 0;
            for(const srcSymbol of srcSymbols)
                symbolPool.push(srcSymbol);
            for(const dstSymbol of dstSymbols)
                symbolPool.push(dstSymbol);
            const renamedTriplePool = new Set();
            for(const tripleTag of triplePool) {
                const triple = tripleFromTag(tripleTag);
                for(let i = 0; i < 3; ++i) {
                    const srcSymbol = triple[i],
                          dstSymbol = SymbolMap.get(translationTable, srcSymbol);
                    triple[i] = (dstSymbol) ? dstSymbol : srcSymbol;
                }
                renamedTriplePool.add(tagFromTriple(triple));
            }
            triplePool = renamedTriplePool;
            backend.moveTriples(translationTable);
            const expected = [...triplePool].sort(),
                  result = [...backend.queryTriples(BasicBackend.queryMasks.VVV, [])].map(triple => tagFromTriple(triple)).sort();
            let noErrorsOccured = (expected.length == result.length) && backend.validateIntegrity();
            for(let i = 0; i < expected.length && noErrorsOccured; ++i)
                if(expected[i] != result[i])
                    noErrorsOccured = false;
            if(!noErrorsOccured)
                console.warn(result, expected);
            return noErrorsOccured;
        }]
    };
}
