import test from 'ava';
import {
  Symatem
}
from '../src/main';

test('init', async t => {
  const sym = new Symatem();
  await sym.initialize();

  t.is(sym.superPageByteAddress, 131072);
  t.is(sym.createSymbol(), 16);
});

test('blobs', async t => {
  const sym = new Symatem();
  await sym.initialize();

  const s1 = sym.createSymbol();
  sym.setBlob(s1, 'a text');

  t.is(sym.getBlobSize(s1), 8);

  /*
    const b = sym.getBlob(s1);
    t.is(b, 'a text');
    */
});
