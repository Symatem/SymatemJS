/* global describe, it, xit, before, after */
/* jslint node: true, esnext: true */
'use strict';

const chai = require('chai'),
  assert = chai.assert,
  expect = chai.expect,
  should = chai.should(),
  path = require('path'),
  fs = require('fs'),
  { nametoBeFound } = require('../dist/main');

describe('wasm', () => {
  it('init', () => {
    const aFile = path.join(__dirname, '..','Symatem.wasm');

    nametoBeFound(fs.readFileSync(aFile));
    //return scheme.get('file://' + aFile).then(s => assert.isDefined(s));
  });
});
