import {Utils, IdentityPool} from './src/Utils.mjs';
import {SymbolInternals, SymbolMap} from './src/Symbol.mjs';
import BasicBackend from './src/BasicBackend.mjs';
import JavaScriptBackend from './src/JavaScriptBackend.mjs';
import RustWasmBackend, { loaded } from './src/RustWasmBackend.mjs';
import Diff from './src/Diff.mjs';
import Repository from './src/Repository.mjs';

export {loaded, Utils, SymbolInternals, IdentityPool, SymbolMap, BasicBackend, JavaScriptBackend, RustWasmBackend, Diff, Repository};

/**
 * @typedef {number} Identity
 */

/**
 * @typedef {string} Symbol
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
 * @property {number} dstOffset in bits
 * @property {Symbol} srcSymbol
 * @property {number} srcOffset in bits
 * @property {number} length in bits
 */

/**
 * @typedef {Object.<Identity, Identity>} RelocationTable
 */
