import {Utils, loaded} from './Utils.mjs';
import {RelocationTable, SymbolInternals, SymbolMap, TripleMap} from './Symbol.mjs';
import JavaScriptBackend from './JavaScriptBackend.mjs';
import RustWasmBackend from './RustWasmBackend.mjs';
import Diff from './Diff.mjs';
import Repository from './Repository.mjs';

export {Utils, loaded, RelocationTable, SymbolInternals, SymbolMap, TripleMap, JavaScriptBackend, RustWasmBackend, Diff, Repository};

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
