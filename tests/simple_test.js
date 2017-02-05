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

    const aFile = path.join(__dirname, '..','Symatem.wasm');


    nametoBeFound(new Uint8Array(fs.readFileSync(aFile)));
