import {getTests as IdentityPoolTests} from './IdentityPoolTests.js';
import {getTests as SymbolDataTests} from './SymbolDataTests.js';
import {getTests as TripleAndQueryTests} from './TripleAndQueryTests.js';
import {getTests as DiffTests} from './DiffTests.js';
const testBundles = [
    IdentityPoolTests,
    SymbolDataTests,
    TripleAndQueryTests,
    DiffTests
];

import {loaded, JavaScriptBackend, RustWasmBackend} from '../SymatemJS.js';
import PRNG from './PRNG.js';
const rand = new PRNG();
function runAll(seed) {
    if(!seed)
        seed = rand.buffer[0];
    console.log(`Seed: ${seed}`);
    for(const backend of [new JavaScriptBackend(), new RustWasmBackend()]) {
        rand.setSeed(seed);
        const tests = {};
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
