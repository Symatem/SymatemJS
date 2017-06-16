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
  t.true(sym.setBlob('a text', s1));

  t.is(sym.getBlobSize(s1), 48);
  t.is(sym.getBlob(s1), 'a text');
});

test('number blobs', async t => {
  const sym = new Symatem();
  await sym.initialize();

  const s1 = sym.createSymbol();
  t.true(sym.setBlob(1000, s1));
  t.is(sym.getBlob(s1), 1000);
});

test('triples', async t => {
  const sym = new Symatem();
  await sym.initialize();

  const entity = sym.createSymbol();
  const attribute = sym.createSymbol();
  const value = sym.createSymbol();

  sym.linkTriple(entity, attribute, value);

  const pairs = sym.queryArray(sym.queryMask.MVV, entity, 0, 0);
  t.deepEqual(pairs, [attribute, value]);
});

test('encode/decode', async t => {
  const sym1 = new Symatem();
  await sym1.initialize();

  const s1 = sym1.createSymbol();
  t.true(sym1.setBlob(1000, s1));

  const encoded = sym1.encodeOntologyBinary();
  //console.log(encoded);
  t.is(encoded.byteLength >= 338, true);
  t.is(encoded.byteLength < 1024, true);

  const sym2 = new Symatem();
  await sym2.initialize();
  sym2.decodeOntologyBinary(encoded);

  t.is(sym2.getBlob(s1), 1000);
});
