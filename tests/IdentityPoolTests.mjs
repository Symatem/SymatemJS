export function getTests(backend, rand) {
    const identities = {},
          maxIdentity = 10000;

    for(let identity = 0; identity < maxIdentity; ++identity)
        identities[identity] = true;

    return {
        'removeIdentity': [100000, () => new Promise((resolve, reject) => {
            const identity = rand.range(0, maxIdentity),
                  expected = identities[identity] == true,
                  result = backend.testIdentityPoolRemove(identity);
            delete identities[identity];
            if(expected != result)
                throw new Error('removeIdentity', identity, expected, result);
            resolve();
        })],
        'addIdentity': [100000, () => new Promise((resolve, reject) => {
            const identity = rand.range(0, maxIdentity),
                  expected = !(identities[identity] == true),
                  result = backend.testIdentityPoolInsert(identity);
            identities[identity] = true;
            if(expected != result)
                throw new Error('addIdentity', identity, expected, result);
            resolve();
        })]
    };
}
