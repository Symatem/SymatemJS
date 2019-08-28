import {IdentityPool, NativeBackend} from '../SymatemJS.js';

export function getTests(backend, rand) {
    const identityPool = [{'start': 0}],
          identities = {},
          maxIdentity = 10000;

    for(let identity = 0; identity < maxIdentity; ++identity)
        identities[identity] = true;

    return {
        'removeIdentity': [100000, () => {
            const identity = rand.range(0, maxIdentity),
                  expected = identities[identity] == true,
                  result = IdentityPool.remove(identityPool, identity);
            delete identities[identity];
            if(expected != result) {
                console.warn(identity, expected, result);
                return false;
            }
            return true;
        }],
        'addIdentity': [100000, () => {
            const identity = rand.range(0, maxIdentity),
                  expected = !(identities[identity] == true),
                  result = IdentityPool.insert(identityPool, identity);
            identities[identity] = true;
            if(expected != result) {
                console.warn(identity, expected, result);
                return false;
            }
            return true;
        }]
    };
}
