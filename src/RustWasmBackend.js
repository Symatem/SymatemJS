import {SymbolInternals, BasicBackend} from '../SymatemJS.js';

let module, wasm;
const imports = {};

export const loaded = ((typeof process === 'undefined')
? fetch('../dist/backend.wasm').then(response => response.arrayBuffer())
: new Promise((resolve, reject) => {
    Promise.all([import('url'), import('path'), import('fs')]).then(([url, path, fs]) => {
        const __filename = url.fileURLToPath(import.meta.url),
              __dirname = path.dirname(__filename);
        fs.readFile(path.join(__dirname, '../backend.wasm'), undefined, (err, data) => {
            err ? reject(err) : resolve(data);
        });
    }).catch(err => reject(err));
}))
.then(arrayBuffer => WebAssembly.instantiate(arrayBuffer, imports))
.then(result => {
    module = result.module;
    wasm = result.instance.exports;
})
.catch((err) => console.error(err));

let cachedUint8Memory = null;
function getUint8Memory() {
    if(cachedUint8Memory === null || cachedUint8Memory.buffer !== wasm.memory.buffer)
        cachedUint8Memory = new Uint8Array(wasm.memory.buffer);
    return cachedUint8Memory;
}

let cachedUint32Memory = null;
function getUint32Memory() {
    if(cachedUint32Memory === null || cachedUint32Memory.buffer !== wasm.memory.buffer)
        cachedUint32Memory = new Uint32Array(wasm.memory.buffer);
    return cachedUint32Memory;
}

const cachedTextDecoder = new TextDecoder('utf-8');
function getStringFromWasm(ptr, len) {
    return cachedTextDecoder.decode(getUint8Memory().subarray(ptr, ptr+len));
}



/** Integrates a backend written in Rust using WebAssembly */
export default class RustWasmBackend extends BasicBackend {
    getMemoryUsage() {
        return getUint8Memory().length;
    }

    manifestSymbol(symbol) {
        return wasm.manifestSymbol(SymbolInternals.namespaceOfSymbol(symbol), SymbolInternals.identityOfSymbol(symbol)) !== 0;
    }

    createSymbol(namespaceIdentity) {
        return SymbolInternals.concatIntoSymbol(namespaceIdentity, wasm.createSymbol(namespaceIdentity) >>> 0);
    }

    releaseSymbol(symbol) {
        return wasm.releaseSymbol(SymbolInternals.namespaceOfSymbol(symbol), SymbolInternals.identityOfSymbol(symbol)) !== 0;
    }

    getLength(symbol) {
        return wasm.getLength(SymbolInternals.namespaceOfSymbol(symbol), SymbolInternals.identityOfSymbol(symbol)) >>> 0;
    }

    creaseLength(symbol, offset, length) {
        return wasm.creaseLength(SymbolInternals.namespaceOfSymbol(symbol), SymbolInternals.identityOfSymbol(symbol), offset, length) !== 0;
    }

    readData(symbol, offset, length) {
        const elementCount = Math.ceil(length/32);
        const dataBytes = new Uint8Array(elementCount*4);
        const ptr = wasm.__wbindgen_malloc(elementCount*4);
        const result = wasm.readData(SymbolInternals.namespaceOfSymbol(symbol), SymbolInternals.identityOfSymbol(symbol), offset, length, ptr, elementCount) !== 0;
        if(result)
            dataBytes.set(getUint8Memory().subarray(ptr, ptr+elementCount*4));
        wasm.__wbindgen_free(ptr, elementCount*4);
        return (result) ? dataBytes : undefined;
    }

    writeData(symbol, offset, length, dataBytes) {
        const elementCount = Math.ceil(length/32);
        const ptr = wasm.__wbindgen_malloc(elementCount*4);
        getUint8Memory().set(dataBytes, ptr);
        return wasm.writeData(SymbolInternals.namespaceOfSymbol(symbol), SymbolInternals.identityOfSymbol(symbol), offset, length, ptr, elementCount) !== 0;
    }

    replaceData(dstSymbol, dstOffset, srcSymbol, srcOffset, length) {
        return wasm.replaceData(
            SymbolInternals.namespaceOfSymbol(dstSymbol), SymbolInternals.identityOfSymbol(dstSymbol), dstOffset,
            SymbolInternals.namespaceOfSymbol(srcSymbol), SymbolInternals.identityOfSymbol(srcSymbol), srcOffset,
            length
        ) !== 0;
    }

    setTriple(triple, linked) {
        return wasm.setTriple(
            SymbolInternals.namespaceOfSymbol(triple[0]), SymbolInternals.identityOfSymbol(triple[0]),
            SymbolInternals.namespaceOfSymbol(triple[1]), SymbolInternals.identityOfSymbol(triple[1]),
            SymbolInternals.namespaceOfSymbol(triple[2]), SymbolInternals.identityOfSymbol(triple[2]),
            linked
        ) !== 0;
    }

    *querySymbols(namespaceIdentity) {
        const slicePtr = 8;
        wasm.querySymbols(slicePtr, namespaceIdentity);
        getUint32Memory();
        const sliceBegin = cachedUint32Memory[slicePtr/4], sliceLength = cachedUint32Memory[slicePtr/4+1],
              slice = cachedUint32Memory.subarray(sliceBegin/4, sliceBegin/4+sliceLength);
        for(let i = 0; i < sliceLength; ++i)
            yield SymbolInternals.concatIntoSymbol(namespaceIdentity, slice[i]);
        wasm.__wbindgen_free(sliceBegin, sliceLength*4);
    }

    *queryTriples(mask, triple) {
        const slicePtr = 8;
        wasm.queryTriples(slicePtr, mask,
            SymbolInternals.namespaceOfSymbol(triple[0]), SymbolInternals.identityOfSymbol(triple[0]),
            SymbolInternals.namespaceOfSymbol(triple[1]), SymbolInternals.identityOfSymbol(triple[1]),
            SymbolInternals.namespaceOfSymbol(triple[2]), SymbolInternals.identityOfSymbol(triple[2])
        );
        getUint32Memory();
        const sliceBegin = cachedUint32Memory[slicePtr/4], sliceLength = cachedUint32Memory[slicePtr/4+1],
              slice = cachedUint32Memory.subarray(sliceBegin/4, sliceBegin/4+sliceLength);
        for(let i = 0; i < sliceLength; i += 6)
            yield [SymbolInternals.concatIntoSymbol(slice[i  ], slice[i+1]),
                   SymbolInternals.concatIntoSymbol(slice[i+2], slice[i+3]),
                   SymbolInternals.concatIntoSymbol(slice[i+4], slice[i+5])];
        wasm.__wbindgen_free(sliceBegin, sliceLength*4);
        return sliceLength/6;
    }
};
