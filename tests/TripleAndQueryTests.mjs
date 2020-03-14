import {SymbolInternals, SymbolMap, BasicBackend} from '../SymatemJS.mjs';

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
            if(expected != result) {
                console.warn('setTriple',
                    tagFromTriple(triple),
                    [...triplePool].sort().join(' '), '|',
                    [...backend.queryTriples(BasicBackend.queryMasks.VVV, [BasicBackend.symbolByName.Void, BasicBackend.symbolByName.Void, BasicBackend.symbolByName.Void])].map(triple => tagFromTriple(triple)).sort().join(' '),
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
                    if(result.size != expected.size)
                        noErrorsOccured = false;
                    break;
                }
                if(element.value.reduce((value, symbol) => {
                    if(SymbolInternals.namespaceOfSymbol(symbol) == namespaceIdentity)
                        ++value;
                    return value;
                }, 0) < 3)
                    continue;
                const tripleTag = tagFromTriple(element.value);
                result.add(tripleTag);
                if(!expected.has(tripleTag))
                    noErrorsOccured = false;
            }
            if(!noErrorsOccured)
                console.warn('queryTriples',
                    mask, tagFromTriple(queryTriple),
                    [...triplePool].sort().join(' '), '|',
                    [...backend.queryTriples(BasicBackend.queryMasks.VVV, [BasicBackend.symbolByName.Void, BasicBackend.symbolByName.Void, BasicBackend.symbolByName.Void])].map(triple => tagFromTriple(triple)).sort().join(' '), '|',
                    [...result].sort().join(' '), '|',
                    [...expected].sort().join(' ')
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
                console.warn('unlinkNamespace', 'querySymbols', symbolsResult.sort().join(' '));
                return false;
            }
            const triplesResult = [...backend.queryTriples(BasicBackend.queryMasks.VVV, [BasicBackend.symbolByName.Void, BasicBackend.symbolByName.Void, BasicBackend.symbolByName.Void])].filter((triple) => {
                for(const symbol of triple)
                    if(SymbolInternals.namespaceOfSymbol(symbol) != namespaceIdentity)
                        return false;
                return true;
            });
            if(!triplesResult.length == 0) {
                console.warn('unlinkNamespace', 'queryTriples', triplesResult.sort().join(' '));
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
