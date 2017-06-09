import test from 'ava';
import {
  Symatem
}
from '../src/main';

const path = require('path');
const fs = require('fs');

test('init', async t => {
  const sym = new Symatem();

  const aFile = path.join(__dirname, '..', 'Symatem.wasm');

  await sym.initialize(new Uint8Array(fs.readFileSync(aFile)));

  t.is(sym.superPageByteAddress, 131072);
  t.is(sym.createSymbol(), 16);
});
