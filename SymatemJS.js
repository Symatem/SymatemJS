import Utils from './src/Utils.js';
import {IdentityPool, SymbolMap} from './src/Collections.js';
import BasicBackend from './src/BasicBackend.js';
import NativeBackend from './src/NativeBackend.js';
import Differential from './src/Differential.js';
import Repository from './src/Repository.js';

export {Utils, IdentityPool, SymbolMap, BasicBackend, NativeBackend, Differential, Repository};

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
