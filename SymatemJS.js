import BasicBackend from './BasicBackend.js';
import NativeBackend from './NativeBackend.js';
import Differential from './Differential.js';
import Repository from './Repository.js';

export {BasicBackend, NativeBackend, Differential, Repository};

/**
 * @typedef {Number} Identity
 */

/**
 * @typedef {String} Symbol
 * @property {Identity} namespaceIdentity
 * @property {Identity} identity
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
