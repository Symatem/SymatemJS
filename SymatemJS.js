import {Utils, IdentityPool} from './src/Utils.js';
import {SymbolInternalsColonString as SymbolInternals, SymbolMapString as SymbolMap} from './src/Symbol.js';
import BasicBackend from './src/BasicBackend.js';
import JavaScriptBackend from './src/JavaScriptBackend.js';
import RustWasmBackend, { loaded } from './src/RustWasmBackend.js';
import Diff from './src/Diff.js';
import Repository from './src/Repository.js';

export {loaded, Utils, SymbolInternals, IdentityPool, SymbolMap, BasicBackend, JavaScriptBackend, RustWasmBackend, Diff, Repository};

/**
 * @typedef {Number} Identity
 */

/**
 * @typedef {String} Symbol
 * @property {Identity} namespaceIdentity
 * @property {Identity} handleIdentity
 */

/**
 * @typedef {Object} Triple
 * @property {Symbol} entity
 * @property {Symbol} attribute
 * @property {Symbol} value
 */

/**
 * @typedef {Object} ReplaceDataOperation
 * @property {Symbol} dstOffset
 * @property {Number} dstOffset in bits
 * @property {Symbol} srcSymbol
 * @property {Number} srcOffset in bits
 * @property {Number} length in bits
 */

/**
 * @typedef {Object.<Identity, Identity>} RelocationTable
 */
