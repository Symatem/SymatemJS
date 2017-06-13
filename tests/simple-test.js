import test from 'ava';
import {
  Symatem
}
from '../src/node-interface';

test('initialize', async t => {
  const sym = new Symatem();
  await sym.initialize();

  t.is(sym.superPageByteAddress, 131072);
  t.is(sym.createSymbol(), 152);
});

test('double initialize', async t => {
  const sym = new Symatem();
  await sym.initialize();
  await sym.initialize();
  t.is(sym.superPageByteAddress, 131072);
});

test('string blobs', async t => {
  const sym = new Symatem();
  await sym.initialize();

  const s1 = sym.createSymbol();
  sym.setBlob(s1, 'a text');

  t.is(sym.getBlobSize(s1), 48);
  t.is(sym.getBlob(s1), 'a text');
});

test('number blobs', async t => {
  const sym = new Symatem();
  await sym.initialize();

  const s1 = sym.createSymbol();
  sym.setBlob(s1, 1000);
  t.is(sym.getBlob(s1), 1000);
});


test('encode/decode', async t => {
  const sym1 = new Symatem();
  await sym1.initialize();

  const s1 = sym1.createSymbol();
  sym1.setBlob(s1, 1000);

  const encoded = sym1.encodeOntologyBinary();
  //console.log(encoded);
  t.is(encoded.byteLength >= 338, true);
  t.is(encoded.byteLength < 1024, true);

  const sym2 = new Symatem();
  await sym2.initialize();
  sym2.decodeOntologyBinary(encoded);

  t.is(sym2.getBlob(s1), 1000);
});
