/** General utility functions
 */
export class Utils {
    /**
     * Saves a buffer as download file in browsers
     * @param {Uint8Array} buffer
     * @param {string} fileName
     */
    static downloadAsFile(buffer, fileName) {
        const file = new Blob([buffer], {type: 'octet/stream'}),
              url = URL.createObjectURL(file),
              a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Load a file via fetch or fs
     * @param {string} path
     * @return {Promise<Uint8Array>} file content
     */
    static loadFile(path) {
        path = new URL(path, import.meta.url);
        return ((typeof process === 'undefined')
        ? fetch(path).then(response => response.arrayBuffer())
        : new Promise((resolve, reject) => {
            Promise.all([import('url'), import('fs')]).then(([url, fs]) => {
                fs.readFile(url.fileURLToPath(path), undefined, (err, data) => {
                    err ? reject(err) : resolve(data);
                });
            }).catch(err => reject(err));
        }));
    }

    /**
     * Create a new wasm instance
     * @param {Promise<Uint8Array>} input
     * @return {WebAssembly.Instance} wasm
     */
    static createWasmInstance(input) {
        const imports = {};
        return input
            .then(arrayBuffer => WebAssembly.instantiate(arrayBuffer, imports))
            .then(result => {
                result.instance.cachedMemory = {};
                return result.instance;
            }).catch((err) => console.error(err));
    }

    /**
     * Used to cache typed arrays of a wasm instances memory
     * @param {WebAssembly.Instance} wasm
     * @param {number} bits One of: 8, 16, 32
     * @return {Uint8Array|Uint16Array|Uint32Array} cached memory
     */
    static getCachedMemoryOfWasm(wasm, bits) {
        if(!wasm.cachedMemory[bits] || wasm.cachedMemory[bits].buffer !== wasm.exports.memory.buffer) {
            const constuctor = (bits == 8) ? Uint8Array :
                               (bits == 16) ? Uint16Array :
                               (bits == 32) ? Uint32Array : undefined;
            wasm.cachedMemory[bits] = new constuctor(wasm.exports.memory.buffer);
        }
        return wasm.cachedMemory[bits];
    }

    /**
     * Allocates and writes a buffer into a wasm instances memory
     * @param {WebAssembly.Instance} wasm
     * @param {Uint8Array} buffer The buffer to send
     * @param {number} bitAlignment One of: 8, 16, 32
     * @return {number} pointer
     */
    static sendBufferToWasm(wasm, buffer, bitAlignment) {
        const byteAlignment = bitAlignment/8;
        const pointer = wasm.exports.__wbindgen_malloc(Math.ceil(buffer.length/byteAlignment)*byteAlignment);
        Utils.getCachedMemoryOfWasm(wasm, 8).set(buffer, pointer);
        return pointer;
    }

    /**
     * Reads and deallocates a buffer from a wasm instances memory
     * @param {WebAssembly.Instance} wasm
     * @param {number} slicePtr Pointer to the slice structure
     * @param {number} bitAlignment One of: 8, 16, 32
     * @param {boolean} copy Copy the buffer if true else yield it before deallocation
     * @return {Uint8Array} buffer
     */
    static *receiveBufferFromWasm(wasm, callback, bitAlignment, copy) {
        const stackRestore = wasm.exports.__wbindgen_export_0.value,
              slicePtr = wasm.exports.__wbindgen_export_0.value = stackRestore-16;
        callback(slicePtr);
        const byteAlignment = Math.ceil(bitAlignment/8),
              sliceStructure = Utils.getCachedMemoryOfWasm(wasm, 32),
              sliceBegin = sliceStructure[slicePtr/4],
              elementCount = sliceStructure[slicePtr/4+1];
        let slice;
        if(sliceBegin > 0) {
            slice = Utils.getCachedMemoryOfWasm(wasm, bitAlignment).subarray(sliceBegin/byteAlignment, sliceBegin/byteAlignment+elementCount);
            if(copy)
                slice = slice.slice();
            else
                yield slice;
            wasm.exports.__wbindgen_free(sliceBegin, elementCount*byteAlignment);
        }
        wasm.exports.__wbindgen_export_0.value = stackRestore;
        return slice;
    }

    /**
     * Reads a string from a wasm instances memory
     * @param {WebAssembly.Instance} wasm
     * @param {number} pointer Begin address in bytes
     * @param {number} length String length in bytes
     * @return {string} string
     */
    static getStringFromWasm(wasm, pointer, length) {
        return textDecoder.decode(Utils.getCachedMemoryOfWasm(wasm, 8).subarray(pointer, pointer+length));
    }

    /**
     * Returns the memory usage wasm instance
     * @param {WebAssembly.Instance} wasm
     * @return {number} bytes
     */
    static getMemoryUsageOfWasm(wasm) {
        return Utils.getCachedMemoryOfWasm(wasm, 8).length;
    }

    /**
     * Calculates the SHA hash value of an Uint8Array
     * @param {Uint8Array} buffer
     * @param {string} algorithm One of: 1, 256, 384, 512
     * @return {Promise<Uint8Array>} hash value
     */
    static sha(buffer, algorithm) {
        if(typeof process === 'undefined')
            return crypto.subtle.digest(`SHA-${algorithm}`, buffer).then(arrayBuffer => new Uint8Array(arrayBuffer));
        buffer = buffer.slice(0);
        return import('crypto').then((crypto) => {
            const hash = crypto.createHash(`sha${algorithm}`);
            hash.update(buffer);
            return new Uint8Array(hash.digest());
        });
    }

    /**
     * Calculates the blake2s hash value of an Uint8Array
     * @param {number} outputBytes
     * @param {Uint8Array} input
     * @param {Uint8Array} [key]
     * @return {Uint8Array} hash value
     */
    static blake2s(outputBytes, input, key) {
        const keyPtr = (key) ? Utils.sendBufferToWasm(blake2, key) : 0,
              inputPtr = Utils.sendBufferToWasm(blake2, input);
        return Utils.receiveBufferFromWasm(blake2, (slicePtr) => {
            blake2.exports.blake2s(slicePtr, outputBytes, keyPtr, (key) ? key.length : 0, inputPtr, input.length);
        }, 8, true).next().value;
    }

    /**
     * Converts Uint8Array to binary string of '0's and '1's
     * @param {Uint8Array} buffer
     * @return {string} binary
     */
    static asBitString(buffer, length) {
        const result = [];
        for(let i = 0; i < length; ++i)
            result.push(((buffer[Math.floor(i/8)]>>(i%8))&1) ? '1' : '0');
        return result.join('');
    }

    /**
     * Copies length bits from source at sourceOffset to destination at destinationOffset
     * @param {Uint8Array} destination
     * @param {number} destinationOffset
     * @param {Uint8Array} source
     * @param {number} sourceOffset
     * @param {number} length
     */
    static bitwiseCopy(destination, destinationOffset, source, sourceOffset, length) {
        if(length == 0)
            return;
        if(destinationOffset%8 == 0 && sourceOffset%8 == 0 && length%8 == 0) {
            destination.set(source.subarray(sourceOffset/8, (sourceOffset+length)/8), destinationOffset/8);
            return;
        }
        if(destination == source && sourceOffset < destinationOffset && sourceOffset+length > destinationOffset)
            throw new Error('bitwiseCopy with destination == source is not implemented yet'); // TODO
        const elementLength = 32;
        destination = new DataView(destination.buffer);
        source = new DataView(source.buffer);
        let sourceIndex = Math.floor(sourceOffset/elementLength)*elementLength/8,
            destinationIndex = Math.floor(destinationOffset/elementLength)*elementLength/8;
        const sourceShift = sourceOffset%elementLength,
              destinationShift = destinationOffset%elementLength;
        while(true) {
            const mask = (length < elementLength) ? ~((-1)<<length) : -1,
                  nextSourceIndex = sourceIndex+elementLength/8,
                  nextDestinationIndex = destinationIndex+elementLength/8;
            let element = source.getUint32(sourceIndex, true)>>>sourceShift;
            if(nextSourceIndex < source.byteLength && sourceShift > 0)
                element |= source.getUint32(nextSourceIndex, true)<<(elementLength-sourceShift);
            element &= mask;
            destination.setUint32(destinationIndex, destination.getUint32(destinationIndex, true)&(~(mask<<destinationShift))|(element<<destinationShift), true);
            if(nextDestinationIndex < destination.byteLength && destinationShift > 0)
                destination.setUint32(nextDestinationIndex, destination.getUint32(nextDestinationIndex, true)&(~(mask>>>(elementLength-destinationShift)))|(element>>>(elementLength-destinationShift)), true);
            length -= elementLength;
            if(length <= 0)
                break;
            sourceIndex = nextSourceIndex;
            destinationIndex = nextDestinationIndex;
        }
    }

    /**
     * Compares two Uint8Arrays for equality
     * @param {Uint8Array} a
     * @param {Uint8Array} b
     * @return {boolean} true if equal, false if different
     */
    static equals(a, b) {
        if(typeof process !== 'undefined')
            return Buffer.from(a).equals(b);
        if(a.length != b.length)
            return false;
        for(let i = 0; i < a.length; ++i)
            if(a[i] != b[i])
                return false;
        return true;
    }

    /**
     * Converts a buffer to text in UTF8
     * @param {Uint8Array} buffer
     * @return {string} text
     */
    static encodeAsUTF8(buffer) {
        // return new TextDecoder('utf8').decode(buffer);
        let uri = '';
        for(const byte of new Uint8Array(buffer)) {
            const hex = byte.toString(16);
            uri += '%' + ((hex.length == 1) ? '0' + hex : hex);
        }
        try {
            return decodeURIComponent(uri);
        } catch(error) {
            return buffer;
        }
    }

    /**
     * Converts text to a buffer in UTF8
     * @param {string} text
     * @return {Uint8Array} buffer
     */
    static decodeAsUTF8(text) {
        // return new TextEncoder('utf8').encode(text);
        const uri = encodeURI(text),
              buffer = [];
        for(let i = 0; i < uri.length; ++i) {
            if(uri[i] == '%') {
                buffer.push(parseInt(uri.substr(i + 1, 2), 16));
                i += 2;
            } else
                buffer.push(uri.charCodeAt(i));
        }
        return new Uint8Array(buffer);
    }

    /**
     * Converts a buffer to hex
     * @param {Uint8Array} buffer
     * @return {string} text
     */
    static encodeAsHex(buffer) {
        return Array.from(buffer).map(byte => (byte&0xF).toString(16)+(byte>>4).toString(16)).join('').toUpperCase();
    }

    /**
     * Converts hex to a buffer
     * @param {string} text
     * @return {Uint8Array} buffer
     */
    static decodeAsHex(text) {
        const buffer = new Uint8Array(Math.ceil(text.length/2));
        for(let i = 0; i < buffer.byteLength; ++i)
            buffer[i] = parseInt(text[i*2], 16)|(parseInt(text[i*2+1], 16)<<4);
        return buffer;
    }

    /**
     * Converts a buffer to a BigInt
     * @param {Uint8Array} buffer
     * @param {boolean} enableTwosComplement allow negative numbers with MSB sign
     * @param {number} length total length in bits
     * @return {BigInt} value
     */
    static encodeBigInt(buffer, enableTwosComplement, length) {
        const value = BigInt('0x'+Utils.encodeAsHex(buffer).split('').reverse().join(''));
        return (enableTwosComplement && (buffer[Math.floor((length-1)/8)]>>((length+7)%8))&1 == 1)
            ? value-(BigInt(1)<<BigInt(length))
            : value;
    }

    /**
     * Converts a BigInt to a buffer
     * @param {BigInt} value
     * @return {Uint8Array} buffer
     */
    static decodeBigInt(value) {
        if(value < 0) {
            let bits = (-value).toString(2).length;
            if(-value > BigInt(1)<<BigInt(bits-1))
                ++bits;
            value = (BigInt(1)<<BigInt(Math.ceil(bits/8)*8))+value;
        }
        return Utils.decodeAsHex(value.toString(16).split('').reverse().join(''));
    }

    /**
     * Converts JS native data types to text
     * @param {Object} dataValue
     * @return {string} text
     */
    static encodeText(dataValue) {
        switch(typeof dataValue) {
            case 'string':
                return '"' + dataValue + '"';
            case 'object':
                if(dataValue instanceof Array)
                    return '['+dataValue.map(value => this.encodeText(value)).join(', ')+']';
                return 'hex:'+Utils.encodeAsHex(dataValue);
            default:
                return '' + dataValue;
        }
    }

    /**
     * Converts text to JS native data types
     * @param {string} text
     * @return {Object} dataValue
     */
    static decodeText(text) {
        const inner = text.match(/"((?:[^\\"]|\\.)*)"/);
        if(inner != undefined)
            return inner[1];
        if(text.length > 4 && text.substr(0, 4) == 'hex:')
            return Utils.decodeAsHex(text.substr(4));
        else if(text === 'false' || text === 'true')
            return (text === 'true');
        else if(!Number.isNaN(parseFloat(text)))
            return parseFloat(text);
        else if(!Number.isNaN(parseInt(text)))
            return parseInt(text);
        else if(text.toLowerCase() === 'nan')
            return NaN;
    }

    /**
     * Returns a sorted copy of a map or an object dict
     * @param {Object|Map} src
     * @param {Function} compare compares two keys
     * @return {Object|Map} result
     */
    static sorted(src, compare) {
        return (src instanceof Map)
            ? new Map(Array.from(src.entries()).sort(compare))
            : Object.fromEntries(Array.from(Object.entries(src)).sort(compare));
    }

    /**
     * Returns a shallow copy of an object
     * @param {Object} src
     * @return {Object} result
     */
    static clone(src) {
        return Object.assign(Object.create(Object.getPrototypeOf(src)), src);
    }

    /**
     * Returns an reverse iterator of an array
     * @param {Object} array
     * @return {Object} reversed
     */
    static *reversed(array) {
        for(let i = array.length-1; i >= 0; --i)
            yield array[i];
    }

    /**
     * Finds an element in an array by bisection (binary search)
     * @param {number} high Count of elements in the array
     * @param {Function} compare Compares the element and the current mid index
     * @return {number} index
     */
    static bisect(high, compare) {
        let low = 0;
        while(low < high) {
            const mid = (low+high)>>1;
            if(compare(mid))
                low = mid+1;
            else
                high = mid;
        }
        return low;
    }
};

const textDecoder = new TextDecoder('utf-8');
let blake2;
export const loaded = Utils.createWasmInstance(Utils.loadFile('blake2.wasm')).then((wasm) => {
    blake2 = wasm;
});
