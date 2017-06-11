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

  const b = sym.getBlob(s1);
  t.is(b, 'a text');
});

test('number blobs', async t => {
  const sym = new Symatem();
  await sym.initialize();

  const s1 = sym.createSymbol();
  sym.setBlob(s1, 1000);

  const b = sym.getBlob(s1);
  t.is(b, 1000);
});
