import {SymbolInternals} from '../SymatemJS.mjs';
import BasicBackend from './BasicBackend.mjs';

const filepath = import.meta.url.replace(/src\/\w*\.mjs$/, 'dist/backend.wasm'),
      file = ((typeof process === 'undefined')
? fetch(filepath).then(response => response.arrayBuffer())
: new Promise((resolve, reject) => {
    Promise.all([import('url'), import('fs')]).then(([url, fs]) => {
        fs.readFile(url.fileURLToPath(filepath), undefined, (err, data) => {
            err ? reject(err) : resolve(data);
        });
    }).catch(err => reject(err));
}));

const imports = {};

/** Integrates a backend written in Rust using WebAssembly */
export default class RustWasmBackend extends BasicBackend {
    /** The constructor returns a promise to the new backend instance, because WASM loading is async
      * @return {Promise<RustWasmBackend>}
      */
    constructor() {
        super();
        return file
            .then(arrayBuffer => WebAssembly.instantiate(arrayBuffer, imports))
            .then(result => {
                this.wasm = result.instance.exports;
                return this;
            })
            .catch((err) => console.error(err));
    }

    getUint8Memory() {
        if(!this.cachedUint8Memory || this.cachedUint8Memory.buffer !== this.wasm.memory.buffer)
            this.cachedUint8Memory = new Uint8Array(this.wasm.memory.buffer);
        return this.cachedUint8Memory;
    }

    getUint32Memory() {
        if(!this.cachedUint32Memory || this.cachedUint32Memory.buffer !== this.wasm.memory.buffer)
            this.cachedUint32Memory = new Uint32Array(this.wasm.memory.buffer);
        return this.cachedUint32Memory;
    }

    manifestSymbol(symbol) {
        return this.wasm.manifestSymbol(SymbolInternals.namespaceOfSymbol(symbol), SymbolInternals.identityOfSymbol(symbol)) !== 0;
    }

    createSymbol(namespaceIdentity) {
        return SymbolInternals.concatIntoSymbol(namespaceIdentity, this.wasm.createSymbol(namespaceIdentity) >>> 0);
    }

    releaseSymbol(symbol) {
        return this.wasm.releaseSymbol(SymbolInternals.namespaceOfSymbol(symbol), SymbolInternals.identityOfSymbol(symbol)) !== 0;
    }

    getLength(symbol) {
        return this.wasm.getLength(SymbolInternals.namespaceOfSymbol(symbol), SymbolInternals.identityOfSymbol(symbol)) >>> 0;
    }

    creaseLength(symbol, offset, length) {
        return this.wasm.creaseLength(SymbolInternals.namespaceOfSymbol(symbol), SymbolInternals.identityOfSymbol(symbol), offset, length) !== 0;
    }

    readData(symbol, offset, length) {
        const elementCount = Math.ceil(length/32);
        const dataBytes = new Uint8Array(elementCount*4);
        const ptr = this.wasm.__wbindgen_malloc(elementCount*4);
        const result = this.wasm.readData(SymbolInternals.namespaceOfSymbol(symbol), SymbolInternals.identityOfSymbol(symbol), offset, length, ptr, elementCount) !== 0;
        if(result)
            dataBytes.set(this.getUint8Memory().subarray(ptr, ptr+elementCount*4));
        this.wasm.__wbindgen_free(ptr, elementCount*4);
        return (result) ? dataBytes : undefined;
    }

    writeData(symbol, offset, length, dataBytes) {
        const elementCount = Math.ceil(length/32);
        const ptr = this.wasm.__wbindgen_malloc(elementCount*4);
        this.getUint8Memory().set(dataBytes, ptr);
        return this.wasm.writeData(SymbolInternals.namespaceOfSymbol(symbol), SymbolInternals.identityOfSymbol(symbol), offset, length, ptr, elementCount) !== 0;
    }

    replaceData(dstSymbol, dstOffset, srcSymbol, srcOffset, length) {
        return this.wasm.replaceData(
            SymbolInternals.namespaceOfSymbol(dstSymbol), SymbolInternals.identityOfSymbol(dstSymbol), dstOffset,
            SymbolInternals.namespaceOfSymbol(srcSymbol), SymbolInternals.identityOfSymbol(srcSymbol), srcOffset,
            length
        ) !== 0;
    }

    setTriple(triple, linked) {
        return this.wasm.setTriple(
            SymbolInternals.namespaceOfSymbol(triple[0]), SymbolInternals.identityOfSymbol(triple[0]),
            SymbolInternals.namespaceOfSymbol(triple[1]), SymbolInternals.identityOfSymbol(triple[1]),
            SymbolInternals.namespaceOfSymbol(triple[2]), SymbolInternals.identityOfSymbol(triple[2]),
            linked
        ) !== 0;
    }

    *querySymbols(namespaceIdentity) {
        const slicePtr = 8;
        this.wasm.querySymbols(slicePtr, namespaceIdentity);
        this.getUint32Memory();
        const sliceBegin = this.cachedUint32Memory[slicePtr/4], sliceLength = this.cachedUint32Memory[slicePtr/4+1],
              slice = this.cachedUint32Memory.subarray(sliceBegin/4, sliceBegin/4+sliceLength);
        for(let i = 0; i < sliceLength; ++i)
            yield SymbolInternals.concatIntoSymbol(namespaceIdentity, slice[i]);
        this.wasm.__wbindgen_free(sliceBegin, sliceLength*4);
    }

    *queryTriples(mask, triple) {
        const slicePtr = 8;
        this.wasm.queryTriples(slicePtr, mask,
            SymbolInternals.namespaceOfSymbol(triple[0]), SymbolInternals.identityOfSymbol(triple[0]),
            SymbolInternals.namespaceOfSymbol(triple[1]), SymbolInternals.identityOfSymbol(triple[1]),
            SymbolInternals.namespaceOfSymbol(triple[2]), SymbolInternals.identityOfSymbol(triple[2])
        );
        this.getUint32Memory();
        const sliceBegin = this.cachedUint32Memory[slicePtr/4], sliceLength = this.cachedUint32Memory[slicePtr/4+1],
              slice = this.cachedUint32Memory.subarray(sliceBegin/4, sliceBegin/4+sliceLength);
        for(let i = 0; i < sliceLength; i += 6)
            yield [SymbolInternals.concatIntoSymbol(slice[i  ], slice[i+1]),
                   SymbolInternals.concatIntoSymbol(slice[i+2], slice[i+3]),
                   SymbolInternals.concatIntoSymbol(slice[i+4], slice[i+5])];
        this.wasm.__wbindgen_free(sliceBegin, sliceLength*4);
        return sliceLength/6;
    }
};
