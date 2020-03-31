import {SymbolInternals, SymbolMap, BasicBackend} from '../SymatemJS.mjs';
import {configuration, fillMaterialization} from './DiffTests.mjs';

export function getTests(backend, rand) {
    return {
        'clearNamespace': [10, () => {
            fillMaterialization(backend, rand);
            backend.clearNamespace(configuration.materializationNamespace);
            const symbolsResult = [...backend.querySymbols(configuration.materializationNamespace)];
            if(!symbolsResult.length == 0) {
                console.warn('clearNamespace', 'querySymbols', symbolsResult.sort().join(' '));
                return false;
            }
            // TODO: Namespace mask in queryTriples
            const triplesResult = [...backend.queryTriples(BasicBackend.queryMasks.VVV, [backend.symbolByName.Void, backend.symbolByName.Void, backend.symbolByName.Void])].filter((triple) => {
                for(const symbol of triple)
                    if(SymbolInternals.namespaceOfSymbol(symbol) != configuration.materializationNamespace)
                        return false;
                return true;
            });
            if(!triplesResult.length == 0) {
                console.warn('clearNamespace', 'queryTriples', triplesResult.sort().join(' '));
                return false;
            }
            return true;
        }],
        'cloneNamespace': [10, () => {
            fillMaterialization(backend, rand);
            const original = backend.encodeJson([configuration.materializationNamespace]);
            backend.cloneNamespaces({[configuration.materializationNamespace]: configuration.comparisonNamespace});
            backend.clearNamespace(configuration.materializationNamespace);
            backend.cloneNamespaces({[configuration.comparisonNamespace]: configuration.materializationNamespace});
            backend.clearNamespace(configuration.comparisonNamespace);
            const clone = backend.encodeJson([configuration.materializationNamespace]);
            backend.clearNamespace(configuration.materializationNamespace);
            if(clone != original) {
                console.warn('cloneNamespace', original, clone);
                return false;
            }
            return true;
        }]
    };
}
