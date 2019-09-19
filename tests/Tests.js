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

import {loaded, JavaScriptBackend, RustWasmBackend} from '../SymatemJS.js';
import PRNG from './PRNG.js';
function runAll(seed) {
    if(!seed)
        seed = Math.floor(Math.random()*(0x80000000-1));
    console.log(`Seed: ${seed}`);
    for(const backend of [new JavaScriptBackend(), new RustWasmBackend()]) {
        const rand = new PRNG(seed),
              tests = {};
        for(let testBundle of testBundles)
            Object.assign(tests, testBundle(backend, rand));
        console.log(`--- ${backend.constructor.name} ---`);
        for(const testName in tests) {
            console.time(testName);
            for(let i = 0; i < tests[testName][0]; ++i)
                if(!tests[testName][1]())
                    throw new Error('Test case failed');
            console.timeEnd(testName);
        }
    }
}
loaded.then(runAll);
