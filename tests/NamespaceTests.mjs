import {SymbolInternals, SymbolMap, BasicBackend} from '../SymatemJS.mjs';
import {configuration, fillCheckout} from './DiffTests.mjs';

export function getTests(backend, rand) {
    return {
        'clearNamespace': [10, () => {
            fillCheckout(backend, rand);
            backend.clearNamespace(configuration.checkoutNamespace);
            const symbolsResult = [...backend.querySymbols(configuration.checkoutNamespace)];
            if(!symbolsResult.length == 0) {
                console.warn('clearNamespace', 'querySymbols', symbolsResult.sort().join(' '));
                return false;
            }
            const triplesResult = [...backend.queryTriples(BasicBackend.queryMasks.VVV, [backend.symbolByName.Void, backend.symbolByName.Void, backend.symbolByName.Void])].filter((triple) => {
                for(const symbol of triple)
                    if(SymbolInternals.namespaceOfSymbol(symbol) != configuration.checkoutNamespace)
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
            fillCheckout(backend, rand);
            const original = backend.encodeJson([configuration.checkoutNamespace]);
            backend.cloneNamespaces({[configuration.checkoutNamespace]: configuration.compassionNamespace});
            backend.clearNamespace(configuration.checkoutNamespace);
            backend.cloneNamespaces({[configuration.compassionNamespace]: configuration.checkoutNamespace});
            backend.clearNamespace(configuration.compassionNamespace);
            const clone = backend.encodeJson([configuration.checkoutNamespace]);
            backend.clearNamespace(configuration.checkoutNamespace);
            if(clone != original) {
                console.warn('cloneNamespace', original, clone);
                return false;
            }
            return true;
        }]
    };
}
