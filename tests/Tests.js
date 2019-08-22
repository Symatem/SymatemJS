import {getTests as IdentityPoolTests} from './IdentityPoolTests.js';
import {getTests as SymbolDataTests} from './SymbolDataTests.js';
import {getTests as TripleAndQueryTests} from './TripleAndQueryTests.js';
import {getTests as DifferentialTests} from './DifferentialTests.js';
const testBundles = [
    IdentityPoolTests,
    SymbolDataTests,
    TripleAndQueryTests,
    DifferentialTests
];

import NativeBackend from '../NativeBackend.js';
import PRNG from './PRNG.js';
function runAll(seed) {
    const backend = new NativeBackend(),
          rand = new PRNG(seed || Math.floor(Math.random()*(0x80000000-1))),
          tests = {};
    for(let testBundle of testBundles)
        Object.assign(tests, testBundle(backend, rand));
    for(const testName in tests) {
        console.time(testName);
        for(let i = 0; i < tests[testName][0]; ++i)
            if(!tests[testName][1]())
                throw new Error('Test case failed');
        console.timeEnd(testName);
    }
}
runAll();
