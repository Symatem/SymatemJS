/* global WebAssembly */

function utf8ArrayToString(array) {
  let data = '';
  for (let i = 0; i < array.length; ++i) {
    data += '%' + array[i].toString(16);
  }
  return decodeURIComponent(data);
}

function stringToUtf8Array(string) {
  const data = encodeURI(string),
    array = [];
  for (let i = 0; i < data.length; ++i) {
    if (data[i] === '%') {
      array.push(parseInt(data.substr(i + 1, 2), 16));
      i += 2;
    } else {
      array.push(data.charCodeAt(i));
    }
  }
  return new Uint8Array(array);
}

const queryMode = ['M', 'V', 'I'];
const queryMask = {};

for (let i = 0; i < 27; ++i) {
  queryMask[queryMode[i % 3] + queryMode[Math.floor(
    i / 3) % 3] + queryMode[Math.floor(i / 9) % 3]] = i;
}

const initializerFunction = '_GLOBAL__sub_I_';
const chunkSize = 65536;
const blobBufferSize = 4096;
const symbolByName = {
  Void: 0,
  PosX: 13,
  PosY: 14,
  BlobType: 15,
  Natural: 16,
  Integer: 17,
  Float: 18,
  UTF8: 19,
  BinaryOntologyCodec: 22
};

export class SymatemCore {

  get queryMask() {
    return queryMask;
  }

  async initialize(wasmBlob) {
    if (this.wasmModule) {
      return;
    }

    this.wasmModule = await WebAssembly.compile(wasmBlob);

    const self = this;
    this.wasmInstance = new WebAssembly.Instance(this.wasmModule, {
      env: {
        consoleLogString(basePtr, length) {
            console.log(utf8ArrayToString(self.getMemorySlice(basePtr, length)));
          },
          consoleLogInteger(value) {
            console.log(value);
          },
          consoleLogFloat(value) {
            console.log(value);
          }
      }
    });

    this.superPageByteAddress = this.wasmInstance.exports.memory.buffer.byteLength;
    this.wasmInstance.exports.memory.grow(1);

    this.resetImage();
  }

  encodeOntologyBinary() {
    this.call('encodeOntologyBinary');
    const data = this.getBlob(symbolByName.BinaryOntologyCodec);
    this.setBlobSize(symbolByName.BinaryOntologyCodec, 0);
    return data;
  }

  decodeOntologyBinary(data) {
    this.setBlob(data, symbolByName.BinaryOntologyCodec);
    this.call('decodeOntologyBinary');
    this.setBlobSize(symbolByName.BinaryOntologyCodec, 0);
  }

  getMemorySlice(begin, length) {
    return new Uint8Array(this.wasmInstance.exports.memory.buffer.slice(begin, begin + length));
  }

  setMemorySlice(slice, begin) {
    new Uint8Array(this.wasmInstance.exports.memory.buffer).set(slice, begin);
  }

  saveImage() {
    return this.wasmInstance.exports.memory.buffer.slice(this.superPageByteAddress);
  }

  loadImage(image) {
    const currentSize = this.wasmInstance.exports.memory.buffer.byteLength,
      newSize = this.superPageByteAddress + image.byteLength;
    if (currentSize < newSize) {
      this.wasmInstance.exports.memory.grow(Math.ceil((newSize - currentSize) / chunkSize));
    }
    this.setMemorySlice(image, this.superPageByteAddress);
  }

  resetImage() {
    this.setMemorySlice(new Uint8Array(chunkSize), this.superPageByteAddress);
    this.call(initializerFunction + 'WASM.cpp');
  }

  readSymbolBlob(symbol) {
    const buffer = this.readBlob(symbol).buffer;
    return Array.prototype.slice.call(new Uint32Array(buffer));
  }

  call(name, ...params) {
    return this.wasmInstance.exports[name](...params);
  }

  deserializeHRL(inputString, packageSymbol = 0) {
    const inputSymbol = this.createSymbol();
    const outputSymbol = this.createSymbol();
    this.setBlob(inputString, inputSymbol);
    const exception = this.call('deserializeHRL', inputSymbol, outputSymbol, packageSymbol);
    const result = this.readSymbolBlob(outputSymbol);
    this.unlinkSymbol(inputSymbol);
    this.unlinkSymbol(outputSymbol);
    return exception ? exception : result;
  }

  getBlob(symbol) {
    const blob = this.readBlob(symbol);
    if (blob.length === 0) {
      return;
    }

    const dataView = new DataView(blob.buffer);
    const type = this.getBlobType(symbol);

    switch (type) {
      case symbolByName.Natural:
        return dataView.getUint32(0, true);
      case symbolByName.Integer:
        return dataView.getInt32(0, true);
      case symbolByName.Float:
        return dataView.getFloat32(0, true);
      case symbolByName.UTF8:
        return utf8ArrayToString(blob);
    }
    return blob;
  }

  readBlob(symbol, offset = 0, length = undefined) {
    let sliceOffset = 0;
    const bufferByteAddress = this.call('getStackPointer') - blobBufferSize,
      size = this.getBlobSize(symbol);
    if (!length) {
      length = size - offset;
    }
    if (length < 0 || offset < 0 || length + offset > size) {
      return false;
    }
    const data = new Uint8Array(Math.ceil(length / 8));
    while (length > 0) {
      const sliceLength = Math.min(length, blobBufferSize * 8);
      this.call('readBlob', symbol, offset + sliceOffset * 8, sliceLength);
      const bufferSlice = this.getMemorySlice(bufferByteAddress, Math.ceil(sliceLength / 8));
      data.set(bufferSlice, sliceOffset);
      length -= sliceLength;
      sliceOffset += Math.ceil(sliceLength / 8);
    }
    return data;
  }

  writeBlob(data, symbol, offset = 0, padding = 0) {
    if (padding < 0 || padding > 7) {
      return false;
    }

    let sliceOffset = 0;
    const bufferByteAddress = this.call('getStackPointer') - blobBufferSize,
      size = this.getBlobSize(symbol);
    let length = ((data === undefined) ? 0 : data.length * 8) - padding;
    if (length < 0 || offset < 0 || length + offset > size) {
      return false;
    }
    while (length > 0) {
      const sliceLength = Math.min(length, blobBufferSize * 8),
        bufferSlice = new Uint8Array(data.slice(sliceOffset, sliceOffset + Math.ceil(sliceLength / 8)));
      this.setMemorySlice(bufferSlice, bufferByteAddress);
      this.call('writeBlob', symbol, offset + sliceOffset * 8, sliceLength);
      length -= sliceLength;
      sliceOffset += Math.ceil(sliceLength / 8);
    }
    return true;
  }

  cryptBlob(symbol, key, nonce) {
    const blockSymbol = this.createSymbol();
    const block = new Uint8Array(64);
    //const view = DataView(block.buffer);
    const str = 'expand 32-byte k';
    for (let i = 0; i < str.length; ++i) {
      block[i] = str.charCodeAt(i);
    }
    block.set(key, 16);
    block.set(nonce, 48);
    this.setBlob(block, blockSymbol);
    this.call('chaCha20', symbol, blockSymbol);
    this.releaseSymbol(blockSymbol);
  }

  getBlobSize(symbol) {
    return this.call('getBlobSize', symbol);
  }

  setBlobSize(symbol, size) {
    this.call('setBlobSize', symbol, size);
  }

  decreaseBlobSize(symbol, offset, length) {
    return this.call('decreaseBlobSize', symbol, offset, length);
  }

  increaseBlobSize(symbol, offset, length) {
    return this.call('increaseBlobSize', symbol, offset, length);
  }

  getBlobType(symbol) {
    const result = this.queryArray(queryMask.MMV, symbol, symbolByName.BlobType, 0);
    return result.length === 1 ? result[0] : 0;
  }

  setBlob(data, symbol) {
    let type;
    let buffer;
    switch (typeof data) {
      case 'string':
        buffer = stringToUtf8Array(data);
        type = symbolByName.UTF8;
        break;
      case 'number':
        buffer = new Uint8Array(4);
        const view = new DataView(buffer.buffer);
        if (!Number.isInteger(data)) {
          view.setFloat32(0, data, true);
          type = symbolByName.Float;
        } else if (data < 0) {
          view.setInt32(0, data, true);
          type = symbolByName.Integer;
        } else {
          view.setUint32(0, data, true);
          type = symbolByName.Natural;
        }
        break;
      default:
        type = 0;
        buffer = data;
    }
    const size = buffer ? buffer.length * 8 : 0;
    this.setBlobSize(symbol, size);

    if (size > 0 && !this.writeBlob(buffer, symbol)) {
      return false;
    }

    //console.log(`setBlob: ${data} ${symbol} -> ${type} ${size} ${buffer}`);

    this.setSolitary(symbol, symbolByName.BlobType, type);
    return true;
  }

  deserializeBlob(string) {
    if (string.length > 2 && string[0] === '"' && string[string.length - 1] === '"') {
      return string.substr(1, string.length - 2);
    } else if (string.length > 4 && string.substr(0, 4) === 'hex:') {
      const blob = new Uint8Array(Math.floor((string.length - 4) / 2));
      for (let i = 0; i < blob.length; ++i) {
        blob[i] = parseInt(string[i * 2 + 4], 16) | (parseInt(string[i * 2 + 5], 16) << 4);
      }
      return blob;
    } else if (!Number.isNaN(parseFloat(string))) {
      return parseFloat(string);
    } else if (!Number.isNaN(parseInt(string, 10))) {
      return parseInt(string, 10);
    }
  }

  serializeBlob(symbol) {
    const blob = this.getBlob(symbol);
    switch (typeof blob) {
      case 'undefined':
        return '#' + symbol;
      case 'string':
        return '"' + blob + '"';
      case 'object':
        {
          let string = '';
          for (let i = 0; i < blob.length; ++i) {
            const byte = blob[i];
            string += (byte & 0xF).toString(16) + (byte >> 4).toString(16);
          }
          return 'hex:' + string.toUpperCase();
        }
      default:
        return String(blob);
    }
  }

  linkTriple(entity, attribute, value) {
    return this.call('link', entity, attribute, value);
  }

  unlinkTriple(entity, attribute, value) {
    if (!this.call('unlink', entity, attribute, value)) {
      return false;
    }
    const referenceCount =
      this.queryCount(queryMask.MVV, entity, 0, 0) +
      this.queryCount(queryMask.VMV, 0, entity, 0) +
      this.queryCount(queryMask.VVM, 0, 0, entity);
    if (referenceCount === 0) {
      this.releaseSymbol(entity);
    }
    return true;
  }

  setSolitary(entity, attribute, newValue) {
    const result = this.queryArray(queryMask.MMV, entity, attribute, 0);
    let needsToBeLinked = true;
    for (const oldValue of result) {
      if (oldValue === newValue) {
        needsToBeLinked = false;
      } else {
        this.unlinkTriple(entity, attribute, oldValue);
      }
    }
    if (needsToBeLinked) {
      this.linkTriple(entity, attribute, newValue);
    }
  }

  createSymbol() {
    return this.call('_createSymbol');
  }

  releaseSymbol(symbol) {
    this.call('_releaseSymbol', symbol);
  }

  unlinkSymbol(symbol) {
    let pairs = this.queryArray(queryMask.MVV, symbol, 0, 0);
    for (let i = 0; i < pairs.length; i += 2) {
      this.unlinkTriple(symbol, pairs[i], pairs[i + 1]);
    }
    pairs = this.queryArray(queryMask.VMV, 0, symbol, 0);
    for (let i = 0; i < pairs.length; i += 2) {
      this.unlinkTriple(pairs[i], symbol, pairs[i + 1]);
    }
    pairs = this.queryArray(queryMask.VVM, 0, 0, symbol);
    for (let i = 0; i < pairs.length; i += 2) {
      this.unlinkTriple(pairs[i], pairs[i + 1], symbol);
    }
    this.releaseSymbol(symbol);
  }

  queryArray(mask, entity, attribute, value) {
    const resultSymbol = this.createSymbol();
    this.call('query', mask, entity, attribute, value, resultSymbol);
    const result = this.readSymbolBlob(resultSymbol);
    this.releaseSymbol(resultSymbol);
    return result;
  }

  queryCount(mask, entity, attribute, value) {
    return this.call('query', mask, entity, attribute, value, 0);
  }
}
