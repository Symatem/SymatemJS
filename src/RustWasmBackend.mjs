import {SymbolInternals, Utils} from '../SymatemJS.mjs';
import BasicBackend from './BasicBackend.mjs';

const binary = Utils.loadFile('backend.wasm');

/** Integrates a backend written in Rust using WebAssembly */
export default class RustWasmBackend extends BasicBackend {
    /** The constructor returns a promise to the new backend instance, because WASM loading is async
      * @return {Promise<RustWasmBackend>}
      */
    constructor() {
        super();
        return Utils.createWasmInstance(binary).then((wasm) => {
            this.wasm = wasm;
            this.initPredefinedSymbols();
            return this;
        });
    }

    *testIdentityPoolRanges() {
        const slicePtr = 8;
        this.wasm.exports.testIdentityPoolRanges(slicePtr);
        this.getUint32Memory(this.wasm);
        const sliceBegin = this.memory[slicePtr/4], sliceLength = this.memory[slicePtr/4+1],
              slice = this.memory.subarray(sliceBegin/4, sliceBegin/4+sliceLength);
        for(let i = 0; i < sliceLength; i += 2)
            yield {'begin': slice[i], 'length': slice[i+1]};
        this.wasm.exports.__wbindgen_free(sliceBegin, sliceLength*4);
        return sliceLength/2;
    }

    testIdentityPoolRemove(identity) {
        return this.wasm.exports.testIdentityPoolRemove(identity) !== 0;
    }

    testIdentityPoolInsert(identity) {
        return this.wasm.exports.testIdentityPoolInsert(identity) !== 0;
    }

    manifestSymbol(symbol) {
        return this.wasm.exports.manifestSymbol(SymbolInternals.namespaceOfSymbol(symbol), SymbolInternals.identityOfSymbol(symbol)) !== 0;
    }

    createSymbol(namespaceIdentity) {
        return SymbolInternals.concatIntoSymbol(namespaceIdentity, this.wasm.exports.createSymbol(namespaceIdentity) >>> 0);
    }

    releaseSymbol(symbol) {
        return this.wasm.exports.releaseSymbol(SymbolInternals.namespaceOfSymbol(symbol), SymbolInternals.identityOfSymbol(symbol)) !== 0;
    }

    getLength(symbol) {
        return this.wasm.exports.getLength(SymbolInternals.namespaceOfSymbol(symbol), SymbolInternals.identityOfSymbol(symbol)) >>> 0;
    }

    creaseLength(symbol, offset, length) {
        return this.wasm.exports.creaseLength(SymbolInternals.namespaceOfSymbol(symbol), SymbolInternals.identityOfSymbol(symbol), offset, length) !== 0;
    }

    readData(symbol, offset, length) {
        const generator = Utils.receiveBufferFromWasm(this.wasm, (slicePtr) => {
            this.wasm.exports.readData(slicePtr, SymbolInternals.namespaceOfSymbol(symbol), SymbolInternals.identityOfSymbol(symbol), offset, length);
        }, 8, true),
              dataBytes = generator.next().value;
        generator.next();
        return dataBytes;
    }

    writeData(symbol, offset, length, dataBytes) {
        const ptr = Utils.sendBufferToWasm(this.wasm, dataBytes, 32);
        return this.wasm.exports.writeData(SymbolInternals.namespaceOfSymbol(symbol), SymbolInternals.identityOfSymbol(symbol), offset, length, ptr, Math.ceil(length/32)) !== 0;
    }

    replaceData(dstSymbol, dstOffset, srcSymbol, srcOffset, length) {
        return this.wasm.exports.replaceData(
            SymbolInternals.namespaceOfSymbol(dstSymbol), SymbolInternals.identityOfSymbol(dstSymbol), dstOffset,
            SymbolInternals.namespaceOfSymbol(srcSymbol), SymbolInternals.identityOfSymbol(srcSymbol), srcOffset,
            length
        ) !== 0;
    }

    setTriple(triple, linked) {
        return this.wasm.exports.setTriple(
            SymbolInternals.namespaceOfSymbol(triple[0]), SymbolInternals.identityOfSymbol(triple[0]),
            SymbolInternals.namespaceOfSymbol(triple[1]), SymbolInternals.identityOfSymbol(triple[1]),
            SymbolInternals.namespaceOfSymbol(triple[2]), SymbolInternals.identityOfSymbol(triple[2]),
            linked
        ) !== 0;
    }

    *querySymbols(namespaceIdentity) {
        const generator = Utils.receiveBufferFromWasm(this.wasm, (slicePtr) => {
            this.wasm.exports.querySymbols(slicePtr, namespaceIdentity);
        }, 32, true),
              buffer = generator.next().value;
        for(let i = 0; i < buffer.length; ++i)
            yield SymbolInternals.concatIntoSymbol(namespaceIdentity, buffer[i]);
        generator.next();
    }

    *queryTriples(mask, triple) {
        const generator = Utils.receiveBufferFromWasm(this.wasm, (slicePtr) => {
            this.wasm.exports.queryTriples(slicePtr, mask,
                SymbolInternals.namespaceOfSymbol(triple[0]), SymbolInternals.identityOfSymbol(triple[0]),
                SymbolInternals.namespaceOfSymbol(triple[1]), SymbolInternals.identityOfSymbol(triple[1]),
                SymbolInternals.namespaceOfSymbol(triple[2]), SymbolInternals.identityOfSymbol(triple[2])
            );
        }, 32, true),
              buffer = generator.next().value;
        for(let i = 0; i < buffer.length; i += 6)
            yield [SymbolInternals.concatIntoSymbol(buffer[i  ], buffer[i+1]),
                   SymbolInternals.concatIntoSymbol(buffer[i+2], buffer[i+3]),
                   SymbolInternals.concatIntoSymbol(buffer[i+4], buffer[i+5])];
        generator.next();
        return buffer.length/6;
    }
};
