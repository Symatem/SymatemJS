import {getTests as IdentityPoolTests} from './IdentityPoolTests.mjs';
import {getTests as SymbolDataTests} from './SymbolDataTests.mjs';
import {getTests as TripleAndQueryTests} from './TripleAndQueryTests.mjs';
import {getTests as NamespaceTests} from './NamespaceTests.mjs';
import {getTests as DiffTests} from './DiffTests.mjs';
const testBundles = [
    IdentityPoolTests,
    SymbolDataTests,
    TripleAndQueryTests,
    NamespaceTests,
    DiffTests
];

import {JavaScriptBackend, RustWasmBackend} from '../SymatemJS.mjs';
import PRNG from './PRNG.mjs';
const rand = new PRNG();
async function runAll(seed) {
    if(!seed)
        seed = rand.buffer[0];
    console.log(`Seed: ${seed}`);
    for(const backend of [await new RustWasmBackend(), new JavaScriptBackend()]) {
        rand.setSeed(seed);
        const tests = {};
        for(let testBundle of testBundles)
            Object.assign(tests, testBundle(backend, rand));
        console.log(`--- ${backend.constructor.name} ---`);
        for(const testName in tests) {
            console.time(testName);
            for(let i = 0; i < tests[testName][0]; ++i)
                await tests[testName][1]();
            console.timeEnd(testName);
        }
    }
}
runAll();
