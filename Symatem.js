'use strict';

function stringToArray(string) {
    const array = [];
    for(var i = 0; i < string.length; ++i)
        array.push(string[i].charCodeAt(0));
    return new Uint8Array(array);
}

function arrayToString(array) {
    return String.fromCharCode.apply(null, array);
}

const Symatem = {};
Symatem.initializerFunction = '_GLOBAL__sub_I_';
Symatem.chunkSize = 65536;
Symatem.blobBufferSize = 4096;

Symatem.imports = {
    "env": {
        "consoleLog": function(basePtr, length) {
            const bufferSlice = wasmInstance.exports.memory.buffer.slice(basePtr, basePtr+length);
            const string = arrayToString(new Uint8Array(bufferSlice));
            console.log(string);
        }
    }
};

Symatem.call = function(name, ...params) {
    try {
        return Symatem.wasmInstance.exports[name](...params);
    } catch(error) {
        console.log(error);
    }
};

Symatem.readBlob = function(symbol, offset, length) {
    if(!offset)
        offset = 0;
    if(!length)
        length = Symatem.call('getBlobSize', symbol)-offset;
    if(length < 0)
        return;
    let sliceOffset = 0;
    const bufferByteAddress = Symatem.call('getStackPointer')-Symatem.blobBufferSize,
          data = new Uint8Array(Math.ceil(length/8));
    while(length > 0) {
        const sliceLength = Math.min(length, Symatem.blobBufferSize*8);
        Symatem.call('readBlob', symbol, offset+sliceOffset*8, sliceLength);
        const bufferSlice = new Uint8Array(Symatem.wasmInstance.exports.memory.buffer.slice(bufferByteAddress+sliceOffset, bufferByteAddress+sliceOffset+Math.ceil(sliceLength/8)));
        data.set(bufferSlice, sliceOffset);
        length -= sliceLength;
        sliceOffset += sliceLength;
    }
    return data;
};

Symatem.writeBlob = function(data, symbol, offset) {
    const memory = new Uint8Array(Symatem.wasmInstance.exports.memory.buffer),
          bufferByteAddress = Symatem.call('getStackPointer')-Symatem.blobBufferSize;
    let length = Symatem.call('getBlobSize', symbol), sliceOffset = 0;
    if(!offset) {
        offset = 0;
        Symatem.call('setBlobSize', symbol, data.length*8);
    } else if(offset+data.length*8 > length)
        return;
    length = data.length*8;
    while(length > 0) {
        const sliceLength = Math.min(length, Symatem.blobBufferSize*8);
        const bufferSlice = new Uint8Array(data.slice(sliceOffset, sliceOffset+Math.ceil(sliceLength/8)));
        memory.set(bufferSlice, bufferByteAddress+sliceOffset);
        Symatem.call('writeBlob', symbol, offset+sliceOffset*8, sliceLength);
        length -= sliceLength;
        sliceOffset += sliceLength;
    }
};

Symatem.queryMode = ['M', 'V', 'I'];
Symatem.queryMask = {};
for(let i = 0; i < 27; ++i)
    Symatem.queryMask[Symatem.queryMode[i%3] + Symatem.queryMode[Math.floor(i/3)%3] + Symatem.queryMode[Math.floor(i/9)%3]] = i;

Symatem.query = function(mask, entity, attribute, value, countOnly) {
    const resultSymbol = (countOnly) ? 0 : Symatem.call('createSymbol');
    let result = Symatem.call('query', mask, entity, attribute, value, resultSymbol);
    if(!countOnly) {
        result = new Uint32Array(Symatem.readBlob(resultSymbol).buffer);
        Symatem.call('releaseSymbol', resultSymbol);
    }
    return result;
};

Symatem.initImage = function(code) {
    return WebAssembly.compile(code).then(function(result) {
        Symatem.wasmModule = result;
        Symatem.wasmInstance = new WebAssembly.Instance(Symatem.wasmModule, Symatem.imports);
        Symatem.superPageByteAddress = Symatem.wasmInstance.exports.memory.buffer.byteLength;
        Symatem.call(Symatem.initializerFunction+'WASM.cpp');
    }, function(error) {
        console.log(error);
    });
};

Symatem.saveImage = function() {
    return Symatem.wasmInstance.exports.memory.buffer.slice(Symatem.superPageByteAddress);
};

Symatem.loadImage = function(image) {
    const currentSize = Symatem.wasmInstance.exports.memory.buffer.byteLength,
          newSize = Symatem.superPageByteAddress+image.byteLength;
    if(currentSize < newSize)
        Symatem.wasmInstance.exports.memory.grow(math.ceil((newSize-currentSize)/Symatem.chunkSize));
    new Uint8Array(Symatem.wasmInstance.exports.memory.buffer).set(image, Symatem.superPageByteAddress);
};
