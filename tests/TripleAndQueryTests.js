import {SymbolInternals, SymbolMap, BasicBackend} from '../SymatemJS.js';

export function getTests(backend, rand) {
    const symbolPool = [],
          triplePool = new Set(),
          maskByIndex = Object.keys(BasicBackend.queryMasks),
          namespaceIdentity = 4;
    for(let i = 0; i < 100; ++i)
        symbolPool.push(backend.createSymbol(namespaceIdentity));

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
                    tagFromTriple(triple),
                    [...triplePool].sort().join(' '),
                    [...backend.queryTriples(BasicBackend.queryMasks.VVV, [BasicBackend.symbolByName.Void, BasicBackend.symbolByName.Void, BasicBackend.symbolByName.Void])].map(triple => tagFromTriple(triple)).sort().join(' '),
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
                    tagFromTriple(queryTriple),
                    [...triplePool].sort().join(' '),
                    [...backend.queryTriples(BasicBackend.queryMasks.VVV, [BasicBackend.symbolByName.Void, BasicBackend.symbolByName.Void, BasicBackend.symbolByName.Void])].map(triple => tagFromTriple(triple)).sort().join(' '),
                    [...result].sort(), [...expected].sort()
                );
            return noErrorsOccured;
        }],
        'unlinkNamespace': [10, () => {
            for(let i = 0; i < 100; ++i)
                backend.setTriple([BasicBackend.symbolByName.Void, rand.selectUniformly(symbolPool), SymbolInternals.concatIntoSymbol(1, rand.range(0, 100))], true);
            if(!backend.unlinkSymbol(BasicBackend.symbolInNamespace('Namespaces', namespaceIdentity))) {
                console.warn('unlinkNamespace', 'unlinkSymbol');
                return false;
            }
            const symbolsResult = [...backend.querySymbols(namespaceIdentity)];
            if(!symbolsResult.length == 0) {
                console.warn('unlinkNamespace', 'querySymbols', symbolsResult.sort());
                return false;
            }
            const triplesResult = [...backend.queryTriples(BasicBackend.queryMasks.VVV, [BasicBackend.symbolByName.Void, BasicBackend.symbolByName.Void, BasicBackend.symbolByName.Void])];
            for(const triple of triplesResult)
                for(let i = 0; i < 3; ++i)
                    if(SymbolInternals.namespaceOfSymbol(triple[i]) == namespaceIdentity) {
                        console.warn('unlinkNamespace', 'queryTriples', triple);
                        return false;
                    }
            for(let i = 0; i < 100; ++i) {
                const symbol = backend.createSymbol(namespaceIdentity);
                if(SymbolInternals.identityOfSymbol(symbol) != i) {
                    console.warn('unlinkNamespace', 'createSymbol', symbol);
                    return false;
                }
            }
            return true;
        }]
    };
}
