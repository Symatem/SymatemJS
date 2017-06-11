import {
  SymatemCore
}
from './core';

const path = require('path');
const fs = require('fs');
const {
  promisify
} = require('util');

export class Symatem extends SymatemCore {

  async initialize() {
    const f = path.join(__dirname, '..', 'Symatem.wasm');
    await super.initialize(new Uint8Array(await promisify(fs.readFile)(f)));
  }
}
