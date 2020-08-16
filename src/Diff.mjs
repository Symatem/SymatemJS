import {Utils, RelocationTable, SymbolInternals, SymbolMap, TripleMap} from '../SymatemJS.mjs';
import BasicBackend from './BasicBackend.mjs';
import {diffOfSequences} from './DiffOfSequences.mjs';

function getOrCreateEntry(dict, key, value) {
    const entry = dict[key];
    return (entry) ? entry : (dict[key] = value);
}

/** A transaction defining the transformation from one version to another and back.
 * To record the actions, use the diff as backend and then call commit.
 */
export default class Diff extends BasicBackend {
    /**
     * @param {Repository} repository
     * @param {string|Symbol} [source] Optionally a JSON string or symbol to load the diff from. If none is provided the diff will be setup for recording instead
     */
    constructor(repository, source) {
        super();
        this.repository = repository;
        this.operationsBySymbol = SymbolMap.create();
        if(source) {
            if(SymbolInternals.validateSymbol(source))
                this.load(source);
            else
                this.decodeJson(source);
        } else {
            this.isRecordingFromBackend = true;
            this.nextTrackingId = 0;
            // TODO: Combine dataSource and dataRestore into one (dataStore)?
            this.dataSource = this.repository.backend.createSymbol(this.repository.namespaceIdentity);
            this.dataRestore = this.repository.backend.createSymbol(this.repository.namespaceIdentity);
        }
    }

    get symbolByName() {
        return this.repository.backend.symbolByName;
    }

    static getIntermediateOffset(creaseLengthOperations, intermediateOffset) {
        // TODO: Derivative integration?
        for(let operationIndex = 0; operationIndex < creaseLengthOperations.length; ++operationIndex) {
            const operation = creaseLengthOperations[operationIndex];
            if(intermediateOffset < operation.dstOffset)
                return [intermediateOffset, operationIndex];
            if(operation.length < 0)
                intermediateOffset -= operation.length;
        }
        return [intermediateOffset, creaseLengthOperations.length];
    }

    static getOperationIndex(operations, key, intermediateOffset) {
        return Utils.bisect(operations.length, (index) => (operations[index][key] < intermediateOffset));
    }

    addCopyReplaceOperation(mode, operation, operations, operationIndex) {
        if(operations === undefined) {
            const operationsOfSymbol = SymbolMap.getOrInsert(this.operationsBySymbol, operation[mode+'Symbol'], {});
            operations = getOrCreateEntry(operationsOfSymbol, (mode == 'src') ? 'copyOperations' : 'replaceOperations', []);
            operationIndex = this.constructor.getOperationIndex(operations, mode+'Offset', operation[mode+'Offset']);
        }
        operations.splice(operationIndex, 0, operation);
    }

    removeCopyReplaceOperation(mode, operation, dirtySymbols, operations, operationIndex) {
        if(operations === undefined) {
            const operationsOfSymbol = SymbolMap.get(this.operationsBySymbol, operation[mode+'Symbol']);
            operations = operationsOfSymbol[(mode == 'src') ? 'copyOperations' : 'replaceOperations'];
            operationIndex = operations.indexOf(operation);
        }
        operations.splice(operationIndex, 1);
        if(dirtySymbols && operations.length == 0)
            dirtySymbols.add(operation[mode+'Symbol']);
    }

    removeEmptyOperationsOfSymbol(symbol, operationsOfSymbol) {
        if(Object.keys(operationsOfSymbol).length > 0)
            return false;
        SymbolMap.remove(this.operationsBySymbol, symbol);
        return true;
    }

    removeEmptyCopyReplaceOperations(symbols) {
        for(const symbol of symbols) {
            const operationsOfSymbol = SymbolMap.get(this.operationsBySymbol, symbol);
            for(const type of ['copyOperations', 'replaceOperations'])
                if(operationsOfSymbol[type] && operationsOfSymbol[type].length == 0)
                    delete operationsOfSymbol[type];
            this.removeEmptyOperationsOfSymbol(symbol, operationsOfSymbol);
        }
    }

    cutAndShiftCopyReplaceOperations(mode, operations, dirtySymbols, intermediateOffset, decreaseLength, shift) {
        const complementaryMode = (mode == 'dst') ? 'src' : 'dst';
        if(!operations)
            return;
        const intermediateEndOffset = intermediateOffset+decreaseLength,
              addCopyReplaceOperations = [];
        for(let operationIndex = 0; operationIndex < operations.length; ++operationIndex) {
            const operation = operations[operationIndex],
                  operationEndOffset = operation[mode+'Offset']+operation.length;
            if(operationEndOffset <= intermediateOffset)
                continue;
            const endLength = operationEndOffset-intermediateEndOffset;
            if(operation[mode+'Offset'] < intermediateOffset && intermediateEndOffset < operationEndOffset) {
                const secondPart = {
                    'trackingId': this.nextTrackingId++,
                    'dstSymbol': operation.dstSymbol,
                    'srcSymbol': operation.srcSymbol,
                    'length': endLength,
                    [mode+'Offset']: intermediateEndOffset+shift,
                    [complementaryMode+'Offset']: operation[complementaryMode+'Offset']+operation.length-endLength
                };
                addCopyReplaceOperations.push(secondPart);
                operation.length = intermediateOffset-operation[mode+'Offset'];
            } else {
                const operationsBeginIsInside = (intermediateOffset <= operation[mode+'Offset'] && operation[mode+'Offset'] <= intermediateEndOffset),
                      operationsEndIsInside = (intermediateOffset <= operationEndOffset && operationEndOffset <= intermediateEndOffset);
                if(operationsBeginIsInside || operationsEndIsInside) {
                    if(operationsBeginIsInside) {
                        if(operationsEndIsInside) {
                            this.removeCopyReplaceOperation(mode, operation, dirtySymbols, operations, operationIndex--);
                            this.removeCopyReplaceOperation(complementaryMode, operation, dirtySymbols);
                        } else {
                            operation[mode+'Offset'] = intermediateEndOffset+shift;
                            operation[complementaryMode+'Offset'] += operation.length-endLength;
                            operation.length = endLength;
                            if(complementaryMode == 'src') {
                                const copyOperations = SymbolMap.get(this.operationsBySymbol, operation.srcSymbol).copyOperations,
                                      srcIndex = copyOperations.indexOf(operation);
                                let dstIndex = srcIndex;
                                while(dstIndex+1 < copyOperations.length && copyOperations[dstIndex+1].srcOffset < operation.srcOffset)
                                    ++dstIndex;
                                if(dstIndex > srcIndex)
                                    copyOperations.splice(dstIndex, 0, copyOperations.splice(srcIndex, 1)[0]);
                            }
                        }
                    } else
                        operation.length = intermediateOffset-operation[mode+'Offset'];
                } else if(intermediateEndOffset <= operation[mode+'Offset'])
                    operation[mode+'Offset'] += shift;
            }
        }
        for(const operation of addCopyReplaceOperations) {
            this.addCopyReplaceOperation('dst', operation);
            this.addCopyReplaceOperation('src', operation);
        }
    }

    mergeCopyReplaceOperations(mode, operations, intermediateOffset) {
        console.assert(mode == 'dst');
        const complementaryMode = (mode == 'dst') ? 'src' : 'dst';
        if(!operations)
            return false;
        for(let operationIndex = 1; operationIndex < operations.length; ++operationIndex) {
            const secondOperation = operations[operationIndex];
            if(secondOperation[mode+'Offset'] < intermediateOffset)
                continue;
            const firstOperation = operations[operationIndex-1];
            if(secondOperation[mode+'Offset'] == intermediateOffset &&
               firstOperation[mode+'Offset']+firstOperation.length == secondOperation[mode+'Offset'] &&
               SymbolInternals.areSymbolsEqual(firstOperation[mode+'Symbol'], secondOperation[mode+'Symbol']) &&
               firstOperation[complementaryMode+'Offset']+firstOperation.length == secondOperation[complementaryMode+'Offset'] &&
               SymbolInternals.areSymbolsEqual(firstOperation[complementaryMode+'Symbol'], secondOperation[complementaryMode+'Symbol'])) {
                firstOperation.length += secondOperation.length;
                firstOperation.trackingId = Math.min(firstOperation.trackingId, secondOperation.trackingId);
                this.removeCopyReplaceOperation(mode, secondOperation, undefined, operations, operationIndex--);
                this.removeCopyReplaceOperation(complementaryMode, secondOperation, undefined);
                return true;
            } else
                return false;
        }
    }

    shiftIntermediateOffsets(creaseLengthOperations, operationIndex, shift) {
        if(shift != 0)
            for(let i = operationIndex; i < creaseLengthOperations.length; ++i)
                creaseLengthOperations[i].dstOffset += shift;
    }

    saveDataToRestore(srcSymbolRecording, srcSymbolModal, srcOffset, length, dataRestoreOperation) {
        if(this.isRecordingFromBackend)
            console.assert(srcOffset+length <= this.repository.backend.getLength(srcSymbolRecording));
        const operationsOfSymbol = SymbolMap.getOrInsert(this.operationsBySymbol, srcSymbolModal, {}),
              creaseLengthOperations = operationsOfSymbol.creaseLengthOperations || [],
              mergeCopyReplaceOperations = new Set();
        if(operationsOfSymbol.manifestOrRelease == 'manifest')
            return;
        let operationsOfDataRestore = SymbolMap.get(this.operationsBySymbol, this.dataRestore),
            [intermediateOffset, operationIndex] = this.constructor.getIntermediateOffset(creaseLengthOperations, srcOffset),
            decreaseAccumulator = intermediateOffset-srcOffset;
        const addSlice = (length) => {
            if(length <= 0)
                return;
            const dstOffset = (operationsOfDataRestore && replaceOperationIndex < operationsOfDataRestore.replaceOperations.length)
                             ? operationsOfDataRestore.replaceOperations[replaceOperationIndex].dstOffset
                             : this.repository.backend.getLength(this.dataRestore);
            let srcOffset = intermediateOffset-decreaseAccumulator;
            if(dataRestoreOperation)
                srcOffset += dataRestoreOperation.dstOffset-dataRestoreOperation.srcOffset;
            console.assert(this.repository.backend.creaseLength(this.dataRestore, dstOffset, length));
            console.assert(this.repository.backend.writeData(this.dataRestore, dstOffset, length, this.repository.backend.readData(srcSymbolRecording, srcOffset, length)));
            const operation = {
                'trackingId': this.nextTrackingId++,
                'dstSymbol': this.dataRestore,
                'dstOffset': dstOffset,
                'srcSymbol': srcSymbolModal,
                'srcOffset': intermediateOffset,
                'length': length
            };
            if(!operationsOfDataRestore) {
                operationsOfDataRestore = {'replaceOperations': []};
                SymbolMap.set(this.operationsBySymbol, this.dataRestore, operationsOfDataRestore);
            }
            this.addCopyReplaceOperation('src', operation);
            this.addCopyReplaceOperation('dst', operation, operationsOfDataRestore.replaceOperations, replaceOperationIndex++);
            mergeCopyReplaceOperations.add(operation.dstOffset);
            mergeCopyReplaceOperations.add(operation.dstOffset+operation.length);
            for(let i = replaceOperationIndex; i < operationsOfDataRestore.replaceOperations.length; ++i)
                operationsOfDataRestore.replaceOperations[i].dstOffset += length;
        };
        let replaceOperationIndex = 0;
        const avoidRestoreOperations = (length) => {
            if(length <= 0)
                return;
            if(operationsOfDataRestore)
                for(replaceOperationIndex = Math.max(0, replaceOperationIndex-1); length > 0 && replaceOperationIndex < operationsOfDataRestore.replaceOperations.length; ++replaceOperationIndex) {
                    const operation = operationsOfDataRestore.replaceOperations[replaceOperationIndex];
                    if(SymbolInternals.compareSymbols(operation.srcSymbol, srcSymbolModal) < 0 || (SymbolInternals.areSymbolsEqual(operation.srcSymbol, srcSymbolModal) && operation.srcOffset+operation.length <= intermediateOffset))
                        continue;
                    if(SymbolInternals.compareSymbols(operation.srcSymbol, srcSymbolModal) > 0 || intermediateOffset+length <= operation.srcOffset)
                        break;
                    const sliceLength = operation.srcOffset-intermediateOffset;
                    addSlice(sliceLength);
                    length -= sliceLength+operation.length;
                    intermediateOffset = operation.srcOffset+operation.length;
                }
            addSlice(length);
        };
        if(operationIndex > 0 && intermediateOffset < creaseLengthOperations[operationIndex-1].dstOffset+creaseLengthOperations[operationIndex-1].length)
            --operationIndex;
        for(; operationIndex < creaseLengthOperations.length && length > 0; ++operationIndex) {
            const operation = creaseLengthOperations[operationIndex];
            if(intermediateOffset+length <= operation.dstOffset)
                break;
            const sliceLength = Math.min(length, operation.dstOffset-intermediateOffset);
            avoidRestoreOperations(sliceLength);
            length -= sliceLength+Math.max(0, operation.length);
            intermediateOffset = operation.dstOffset+Math.abs(operation.length);
            if(operation.length < 0)
                decreaseAccumulator -= operation.length;
        }
        avoidRestoreOperations(length);
        for(const dstOffset of mergeCopyReplaceOperations)
            this.mergeCopyReplaceOperations('dst', operationsOfDataRestore.replaceOperations, dstOffset);
    }



    querySymbols(namespaceIdentity) {
        return this.repository.backend.querySymbols(namespaceIdentity);
    }

    queryTriples(queryMask, triple) {
        return this.repository.backend.queryTriples(queryMask, triple);
    }

    getLength(symbol) {
        return this.repository.backend.getLength(symbol);
    }

    readData(symbol, offset, length) {
        return this.repository.backend.readData(symbol, offset, length);
    }

    manifestSymbol(symbol, created) {
        if(this.isRecordingFromBackend && !created && !this.repository.backend.manifestSymbol(symbol))
            return false;
        symbol = RelocationTable.relocateSymbol(this.repository.relocationTable, symbol);
        const operationsOfSymbol = SymbolMap.getOrInsert(this.operationsBySymbol, symbol, {});
        if(operationsOfSymbol.manifestOrRelease == 'release') {
            delete operationsOfSymbol.manifestOrRelease;
            this.removeEmptyOperationsOfSymbol(symbol, operationsOfSymbol);
        } else
            operationsOfSymbol.manifestOrRelease = 'manifest';
        return true;
    }

    createSymbol(namespaceIdentity) {
        console.assert(this.isRecordingFromBackend);
        const symbol = this.repository.backend.createSymbol(namespaceIdentity);
        console.assert(this.manifestSymbol(symbol, true));
        return symbol;
    }

    releaseSymbol(symbol) {
        if(this.isRecordingFromBackend && !this.repository.backend.releaseSymbol(symbol))
            return false;
        symbol = RelocationTable.relocateSymbol(this.repository.relocationTable, symbol);
        const operationsOfSymbol = SymbolMap.getOrInsert(this.operationsBySymbol, symbol, {});
        if(operationsOfSymbol.manifestOrRelease == 'manifest') {
            delete operationsOfSymbol.manifestOrRelease;
            this.removeEmptyOperationsOfSymbol(symbol, operationsOfSymbol);
        } else
            operationsOfSymbol.manifestOrRelease = 'release';
        return true;
    }

    setTriple(triple, link) {
        if(this.isRecordingFromBackend && !this.repository.backend.setTriple(triple, link))
            return false;
        triple = triple.map(symbol => RelocationTable.relocateSymbol(this.repository.relocationTable, symbol));
        const operationsOfSymbol = SymbolMap.getOrInsert(this.operationsBySymbol, triple[0], {}),
              betaCollection = getOrCreateEntry(operationsOfSymbol, 'tripleOperations', SymbolMap.create()),
              gammaCollection = SymbolMap.getOrInsert(betaCollection, triple[1], SymbolMap.create()),
              isLinked = SymbolMap.get(gammaCollection, triple[2]);
        if(isLinked === link)
            return false;
        if(isLinked === undefined)
            SymbolMap.set(gammaCollection, triple[2], link);
        else {
            SymbolMap.remove(gammaCollection, triple[2]);
            if(SymbolMap.isEmpty(gammaCollection)) {
                SymbolMap.remove(betaCollection, triple[1]);
                if(SymbolMap.isEmpty(betaCollection)) {
                    delete operationsOfSymbol.tripleOperations;
                    this.removeEmptyOperationsOfSymbol(triple[0], operationsOfSymbol);
                }
            }
        }
        return true;
    }

    creaseLength(dstSymbolRecording, dstOffset, length) {
        if(length == 0)
            return true;
        if(this.isRecordingFromBackend) {
            const dataLength = this.repository.backend.getLength(dstSymbolRecording);
            if(length < 0) {
                if(dstOffset-length > dataLength)
                    return false;
            } else if(dstOffset > dataLength)
                return false;
        }
        const originalLength = length,
              dstSymbolModal = RelocationTable.relocateSymbol(this.repository.relocationTable, dstSymbolRecording),
              operationsOfSymbol = SymbolMap.getOrInsert(this.operationsBySymbol, dstSymbolModal, {}),
              creaseLengthOperations = getOrCreateEntry(operationsOfSymbol, 'creaseLengthOperations', []),
              dirtySymbols = new Set();
        let trackingId,
            operationAtIntermediateOffset,
            [intermediateOffset, operationIndex] = this.constructor.getIntermediateOffset(creaseLengthOperations, dstOffset);
        if(operationIndex > 0) {
            operationAtIntermediateOffset = creaseLengthOperations[operationIndex-1];
            if(operationAtIntermediateOffset.dstOffset+Math.abs(operationAtIntermediateOffset.length) < intermediateOffset)
                operationAtIntermediateOffset = undefined;
        }
        if(length < 0) {
            let decreaseAccumulator = -length,
                increaseAccumulator = 0;
            if(operationAtIntermediateOffset) {
                if(operationAtIntermediateOffset.length < 0)
                    intermediateOffset = operationAtIntermediateOffset.dstOffset;
                --operationIndex;
            }
            const increaseLengthOperations = [];
            let creaseLengthOperationsToDelete = 0;
            for(let i = operationIndex; i < creaseLengthOperations.length; ++i) {
                const operation = creaseLengthOperations[i];
                if(intermediateOffset+decreaseAccumulator < operation.dstOffset)
                    break;
                if(operation.length < 0)
                    decreaseAccumulator -= operation.length;
                else {
                    increaseAccumulator += operation.length;
                    increaseLengthOperations.push(operation);
                }
                trackingId = operation.trackingId;
                ++creaseLengthOperationsToDelete;
            }
            this.saveDataToRestore(dstSymbolRecording, dstSymbolModal, dstOffset, -length);
            length = increaseAccumulator-decreaseAccumulator;
            increaseAccumulator = 0;
            let copyOperationIndex = 0;
            const copyOperations = operationsOfSymbol.copyOperations || [],
                  firstOperation = (operationAtIntermediateOffset) ? operationAtIntermediateOffset : creaseLengthOperations[operationIndex],
                  nextIntermediateOffset = (length > 0 && firstOperation && firstOperation.length > 0) ? firstOperation.dstOffset : intermediateOffset;
            for(let i = -1; i < increaseLengthOperations.length; ++i) {
                let srcOffset = nextIntermediateOffset;
                if(i >= 0) {
                    const operation = increaseLengthOperations[i];
                    increaseAccumulator += operation.length;
                    srcOffset = operation.dstOffset;
                }
                for(; copyOperationIndex < copyOperations.length; ++copyOperationIndex) {
                    const copyOperation = copyOperations[copyOperationIndex];
                    if(copyOperation.srcOffset+copyOperation.length <= srcOffset)
                        continue;
                    if(i+1 < increaseLengthOperations.length && increaseLengthOperations[i+1].dstOffset <= copyOperation.srcOffset)
                        break;
                    if(copyOperation.srcOffset < srcOffset) {
                        const endLength = copyOperation.srcOffset+copyOperation.length-srcOffset,
                              secondPart = {
                            'trackingId': this.nextTrackingId++,
                            'dstSymbol': copyOperation.dstSymbol,
                            'srcSymbol': copyOperation.srcSymbol,
                            'length': endLength,
                            'srcOffset': srcOffset,
                            'dstOffset': copyOperation.dstOffset+copyOperation.length-endLength
                        };
                        copyOperation.length -= endLength;
                        this.addCopyReplaceOperation('dst', secondPart);
                        this.addCopyReplaceOperation('src', secondPart);
                    } else {
                        copyOperation.srcOffset += Math.max(0, length)-increaseAccumulator;
                        const replaceOperations = SymbolMap.get(this.operationsBySymbol, copyOperation.dstSymbol).replaceOperations;
                        if(this.mergeCopyReplaceOperations('dst', replaceOperations, copyOperation.dstOffset))
                            --copyOperationIndex;
                    }
                }
            }
            creaseLengthOperations.splice(operationIndex, creaseLengthOperationsToDelete);
            const annihilated = increaseAccumulator-Math.max(0, length);
            this.shiftIntermediateOffsets(creaseLengthOperations, operationIndex, -annihilated);
            this.cutAndShiftCopyReplaceOperations('dst', operationsOfSymbol.replaceOperations, dirtySymbols, intermediateOffset, decreaseAccumulator, -annihilated);
            this.mergeCopyReplaceOperations('dst', operationsOfSymbol.replaceOperations, intermediateOffset);
            this.removeEmptyCopyReplaceOperations(dirtySymbols);
            intermediateOffset = nextIntermediateOffset;
        } else {
            if(operationAtIntermediateOffset) {
                if(operationAtIntermediateOffset.length < 0) {
                    if(length >= -operationAtIntermediateOffset.length)
                        intermediateOffset = operationAtIntermediateOffset.dstOffset;
                    const annihilate = Math.min(-operationAtIntermediateOffset.length, length);
                    operationAtIntermediateOffset.length += length;
                    if(operationAtIntermediateOffset.length == 0)
                        creaseLengthOperations.splice(--operationIndex, 1);
                    length -= annihilate;
                } else
                    operationAtIntermediateOffset.length += length;
            }
            if(length > 0) {
                this.shiftIntermediateOffsets(creaseLengthOperations, operationIndex, length);
                this.cutAndShiftCopyReplaceOperations('src', operationsOfSymbol.copyOperations, undefined, intermediateOffset, 0, length);
                this.cutAndShiftCopyReplaceOperations('dst', operationsOfSymbol.replaceOperations, undefined, intermediateOffset, 0, length);
            }
            if(operationAtIntermediateOffset)
                length = 0;
        }
        if(length != 0)
            creaseLengthOperations.splice(operationIndex, 0, {
                'trackingId': (trackingId != undefined) ? trackingId : this.nextTrackingId++,
                'dstSymbol': dstSymbolModal,
                'dstOffset': intermediateOffset,
                'length': length
            });
        if(creaseLengthOperations.length == 0) {
            delete operationsOfSymbol.creaseLengthOperations;
            this.removeEmptyOperationsOfSymbol(dstSymbolModal, operationsOfSymbol);
        }
        console.assert(!this.isRecordingFromBackend || this.repository.backend.creaseLength(dstSymbolRecording, dstOffset, originalLength));
        return true;
    }

    replaceDataSimultaneously(replaceOperations) {
        if(this.isRecordingFromBackend)
            for(const operation of replaceOperations)
                if(operation.length < 0 ||
                   operation.dstOffset+operation.length > this.repository.backend.getLength(operation.dstSymbol) ||
                   operation.srcOffset+operation.length > this.repository.backend.getLength(operation.srcSymbol))
                    return false;
        const context = {},
              dirtySymbols = new Set(),
              cutReplaceOperations = [],
              addCopyReplaceOperations = [],
              mergeCopyReplaceOperations = [],
              addSlice = (srcSymbol, srcOffset, length) => {
            const operationsOfSymbol = SymbolMap.get(this.operationsBySymbol, srcSymbol) || {},
                  srcCreaseLengthOperations = operationsOfSymbol.creaseLengthOperations || [];
            for(let operationIndex = 0; operationIndex < srcCreaseLengthOperations.length; ++operationIndex) {
                const operation = srcCreaseLengthOperations[operationIndex];
                if(operation.dstOffset+Math.abs(operation.length) <= srcOffset)
                    continue;
                if(operation.dstOffset >= srcOffset+length)
                    break;
                if(operation.length > 0)
                    throw new Error('Tried to copy data from uninitialized increased slice');
            }
            if(context.dstSymbol != srcSymbol || context.dstIntermediateOffset != srcOffset)
                addCopyReplaceOperations.push({
                    'trackingId': this.nextTrackingId++,
                    'dstSymbol': context.dstSymbol,
                    'dstOffset': context.dstIntermediateOffset,
                    'srcSymbol': srcSymbol,
                    'srcOffset': srcOffset,
                    'length': length
                });
            context.dstIntermediateOffset += length;
            context.srcIntermediateOffset += length;
        }, backTrackSrc = (length) => {
            cutReplaceOperations.push({'dstSymbol': context.dstSymbol, 'dstOffset': context.dstIntermediateOffset, 'length': length});
            for(; context.srcReplaceOperationIndex < context.srcReplaceOperations.length; ++context.srcReplaceOperationIndex) {
                const operation = context.srcReplaceOperations[context.srcReplaceOperationIndex];
                if(context.srcIntermediateOffset <= operation.dstOffset+operation.length)
                    break;
            }
            while(length > 0 && context.srcReplaceOperationIndex < context.srcReplaceOperations.length) {
                const operation = context.srcReplaceOperations[context.srcReplaceOperationIndex];
                if(context.srcIntermediateOffset+length <= operation.dstOffset)
                    break;
                if(context.srcIntermediateOffset < operation.dstOffset) {
                    const sliceLength = operation.dstOffset-context.srcIntermediateOffset;
                    addSlice(context.srcSymbol, context.srcIntermediateOffset, sliceLength);
                    length -= sliceLength;
                }
                const sliceStartOffset = Math.max(context.srcIntermediateOffset, operation.dstOffset),
                      sliceEndOffset = Math.min(context.srcIntermediateOffset+length, operation.dstOffset+operation.length);
                if(sliceStartOffset < sliceEndOffset) {
                    const sliceLength = sliceEndOffset-sliceStartOffset;
                    addSlice(operation.srcSymbol, operation.srcOffset+context.srcIntermediateOffset-operation.dstOffset, sliceLength);
                    length -= sliceLength;
                }
                if(operation.dstOffset+operation.length <= context.srcIntermediateOffset)
                    ++context.srcReplaceOperationIndex;
            }
            if(length > 0)
                addSlice(context.srcSymbol, context.srcIntermediateOffset, length);
        }, skipDecreaseOperations = (contextSlot, handleSlice, length) => {
            const creaseLengthOperations = context[contextSlot+'CreaseLengthOperations'];
            for(let operationIndex = context[contextSlot+'OperationIndex']; operationIndex < creaseLengthOperations.length && length > 0; ++operationIndex) {
                const operation = creaseLengthOperations[operationIndex];
                if(operation.dstOffset+Math.abs(operation.length) <= context[contextSlot+'IntermediateOffset'])
                    continue;
                if(context[contextSlot+'IntermediateOffset']+length <= operation.dstOffset)
                    break;
                if(operation.length < 0) {
                    const sliceLength = Math.min(length, operation.dstOffset-context[contextSlot+'IntermediateOffset']);
                    handleSlice(sliceLength);
                    length -= sliceLength;
                    context[contextSlot+'IntermediateOffset'] = operation.dstOffset-operation.length;
                }
            }
            if(length > 0)
                handleSlice(length);
        }, skipSrcDecreaseOperations = skipDecreaseOperations.bind(this, 'src', backTrackSrc),
           skipDstDecreaseOperations = skipDecreaseOperations.bind(this, 'dst', skipSrcDecreaseOperations);
        for(const operation of replaceOperations) {
            if(operation.length <= 0 || (SymbolInternals.areSymbolsEqual(operation.dstSymbol, operation.srcSymbol) && operation.dstOffset == operation.srcOffset))
                continue;
            for(const mode of ['dst', 'src']) {
                context[mode+'Symbol'] = RelocationTable.relocateSymbol(this.repository.relocationTable, operation[mode+'Symbol']);
                context[mode+'OperationsOfSymbol'] = SymbolMap.getOrInsert(this.operationsBySymbol, context[mode+'Symbol'], {});
                context[mode+'CreaseLengthOperations'] = context[mode+'OperationsOfSymbol'].creaseLengthOperations || [];
                [context[mode+'IntermediateOffset'], context[mode+'OperationIndex']] = this.constructor.getIntermediateOffset(context[mode+'CreaseLengthOperations'], operation[mode+'Offset']);
            }
            context.srcReplaceOperations = context.srcOperationsOfSymbol.replaceOperations || [];
            context.srcReplaceOperationIndex = 0;
            mergeCopyReplaceOperations.push({'dstSymbol': context.dstSymbol, 'dstOffset': context.dstIntermediateOffset});
            skipDstDecreaseOperations(operation.length);
            mergeCopyReplaceOperations.push({'dstSymbol': context.dstSymbol, 'dstOffset': context.dstIntermediateOffset});
            this.saveDataToRestore(operation.dstSymbol, context.dstSymbol, operation.dstOffset, operation.length);
        }
        for(const operation of cutReplaceOperations)
            this.cutAndShiftCopyReplaceOperations('dst', SymbolMap.get(this.operationsBySymbol, operation.dstSymbol).replaceOperations, dirtySymbols, operation.dstOffset, operation.length, 0);
        for(const operation of addCopyReplaceOperations) {
            this.addCopyReplaceOperation('dst', operation);
            this.addCopyReplaceOperation('src', operation);
        }
        for(const operation of mergeCopyReplaceOperations)
            this.mergeCopyReplaceOperations('dst', SymbolMap.get(this.operationsBySymbol, operation.dstSymbol).replaceOperations, operation.dstOffset);
        this.removeEmptyCopyReplaceOperations(dirtySymbols);
        console.assert(!this.isRecordingFromBackend || this.repository.backend.replaceDataSimultaneously(replaceOperations));
        return true;
    }

    writeData(dstSymbolRecording, dstOffset, length, dataBytes) {
        const srcOffset = this.repository.backend.getLength(this.dataSource);
        console.assert(this.repository.backend.creaseLength(this.dataSource, srcOffset, length));
        console.assert(this.repository.backend.writeData(this.dataSource, srcOffset, length, dataBytes));
        return this.replaceData(dstSymbolRecording, dstOffset, this.dataSource, srcOffset, length);
    }

    /**
     * Compare two materialized versions (from src to dst) to create a diff. Both (src and dst) must also be mapped to the same modal namespaces in the relocationTable of the repository.
     * @param {RelocationTable} forwardRelocation Relocate from source to destination
     */
    compare(forwardRelocation) {
        const reverseRelocation = RelocationTable.inverse(forwardRelocation);
        this.isRecordingFromBackend = false;
        const setTriples = (symbol, linked) => {
            for(let triple of this.repository.backend.queryTriples(this.repository.backend.queryMasks.MVV, [symbol, this.repository.backend.symbolByName.Void, this.repository.backend.symbolByName.Void])) {
                triple = triple.map(symbol => RelocationTable.relocateSymbol(this.repository.relocationTable, symbol));
                this.setTriple(triple, linked);
            }
        }, context = {
            'dataSourceOffset': this.repository.backend.getLength(this.dataSource),
            'dataSourceOperations': getOrCreateEntry(SymbolMap.getOrInsert(this.operationsBySymbol, this.dataSource, {}), 'copyOperations', []),
            'dataRestoreOffset': this.repository.backend.getLength(this.dataRestore),
            'dataRestoreOperations': getOrCreateEntry(SymbolMap.getOrInsert(this.operationsBySymbol, this.dataRestore, {}), 'replaceOperations', [])
        }, compareData = (context, modalSymbol, dstSymbol, srcSymbol) => {
            const srcLength = this.repository.backend.getLength(srcSymbol),
                  dstLength = this.repository.backend.getLength(dstSymbol),
                  srcData = this.repository.backend.readData(srcSymbol, 0, srcLength),
                  dstData = this.repository.backend.readData(dstSymbol, 0, dstLength);
            if(srcLength == dstLength && Utils.equals(srcData, dstData))
                return;
            let intermediateOffset = 0;
            const operationsOfSymbol = SymbolMap.getOrInsert(this.operationsBySymbol, modalSymbol, {}),
                  equal = (x, y) => (this.repository.backend.readData(srcSymbol, x, 1)[0] == this.repository.backend.readData(dstSymbol, y, 1)[0]);
            for(const entry of diffOfSequences(equal, srcLength, dstLength)) {
                const creaseLength = entry.insert-entry.remove;
                if(creaseLength != 0)
                    getOrCreateEntry(operationsOfSymbol, 'creaseLengthOperations', []).push({
                        'trackingId': this.nextTrackingId++,
                        'dstSymbol': modalSymbol,
                        'dstOffset': intermediateOffset,
                        'length': creaseLength
                    });
                const addCopyReplaceOperation = (dataStoreName, operationsName, readSymbol, readOffset, length) => {
                    if(length == 0)
                        return;
                    const operation = {
                        'trackingId': this.nextTrackingId++,
                        'dstSymbol': modalSymbol,
                        'srcSymbol': this[dataStoreName],
                        'length': length,
                        'dstOffset': intermediateOffset,
                        'srcOffset': context[dataStoreName+'Offset']
                    };
                    if(dataStoreName == 'dataRestore') {
                        operation.dstOffset += Math.max(0, creaseLength);
                        [operation.dstSymbol, operation.srcSymbol] = [operation.srcSymbol, operation.dstSymbol];
                        [operation.dstOffset, operation.srcOffset] = [operation.srcOffset, operation.dstOffset];
                    } else
                        operation.dstOffset += Math.max(0, -creaseLength);
                    getOrCreateEntry(operationsOfSymbol, operationsName, []).push(operation);
                    context[dataStoreName+'Operations'].push(operation);
                    this.repository.backend.creaseLength(this[dataStoreName], context[dataStoreName+'Offset'], length);
                    this.repository.backend.writeData(this[dataStoreName], context[dataStoreName+'Offset'], length, this.repository.backend.readData(readSymbol, readOffset, length));
                    context[dataStoreName+'Offset'] += length;
                };
                addCopyReplaceOperation('dataRestore', 'copyOperations', srcSymbol, entry.offsetA, entry.remove);
                addCopyReplaceOperation('dataSource', 'replaceOperations', dstSymbol, entry.offsetB, entry.insert);
                intermediateOffset += entry.keep+Math.max(entry.remove, entry.insert);
            }
        };
        for(const [srcNamespace, dstNamespace] of RelocationTable.entries(forwardRelocation)) {
            const srcSymbols = SymbolMap.create(),
                  dstSymbols = SymbolMap.create(),
                  dstSymbolsToSort = [...this.repository.backend.querySymbols(dstNamespace)],
                  srcSymbolsToUnlink = [];
            dstSymbolsToSort.sort(SymbolInternals.compareSymbols);
            for(const dstSymbol of dstSymbolsToSort)
                SymbolMap.set(dstSymbols, dstSymbol, true);
            for(const srcSymbol of this.repository.backend.querySymbols(srcNamespace)) {
                SymbolMap.set(srcSymbols, srcSymbol, true);
                const dstSymbol = RelocationTable.relocateSymbol(forwardRelocation, srcSymbol);
                if(SymbolMap.get(dstSymbols, dstSymbol)) {
                    compareData(context, RelocationTable.relocateSymbol(this.repository.relocationTable, dstSymbol), dstSymbol, srcSymbol);
                    setTriples(srcSymbol, false);
                } else
                    srcSymbolsToUnlink.push(srcSymbol);
            }
            for(const srcSymbols of srcSymbolsToUnlink)
                this.unlinkSymbol(srcSymbols);
            for(const dstSymbol of SymbolMap.keys(dstSymbols)) {
                if(!SymbolMap.get(srcSymbols, RelocationTable.relocateSymbol(reverseRelocation, dstSymbol))) {
                    this.manifestSymbol(dstSymbol);
                    const dataLength = this.repository.backend.getLength(dstSymbol);
                    this.creaseLength(dstSymbol, 0, dataLength);
                    this.writeData(dstSymbol, 0, dataLength, this.repository.backend.readData(dstSymbol, 0, dataLength));
                }
                setTriples(dstSymbol, true);
            }
        }
    }

    /**
     * Checks if this diff makes no difference.
     * @return {boolean}
     */
    isEmpty() {
        return [...SymbolMap.keys(this.operationsBySymbol)].length == 0;
    }

    /**
     * Scan through all internal structures and check their integrity
     * @return {boolean} True on success
     */
    validateIntegrity() {
        function checkOperations(operations, location, key, negativeAllowed, overlapAllowed) {
            if(operations)
                for(let i = 0; i < operations.length; ++i) {
                    if(operations[i].length == 0) {
                        console.warn(`Empty entry in ${location}`);
                        return false;
                    }
                    if(!negativeAllowed && operations[i].length < 0) {
                        console.warn(`Negative entry in ${location}`);
                        return false;
                    }
                    if(i > 0 && operations[i-1][key] > operations[i][key]) {
                        console.warn(`Wrong order in ${location}`);
                        return false;
                    }
                    if(!overlapAllowed && i > 0 && operations[i-1][key]+operations[i-1].length > operations[i][key]) {
                        console.warn(`Overlap in ${location}`);
                        return false;
                    }
                }
            return true;
        }
        for(const [symbol, operationsOfSymbol] of SymbolMap.entries(this.operationsBySymbol)) {
            if(Object.keys(operationsOfSymbol) == 0) {
                console.warn(`Empty entry operationsBySymbol['${symbol}']`);
                return false;
            }
            if(!SymbolInternals.areSymbolsEqual(symbol, this.dataSource) && !SymbolInternals.areSymbolsEqual(symbol, this.dataRestore))
                for(const type of ['copyOperations', 'replaceOperations', 'creaseLengthOperations'])
                    if(operationsOfSymbol[type] && operationsOfSymbol[type].length == 0) {
                        console.warn(`Empty entry operationsBySymbol['${symbol}']['${type}']`);
                        return false;
                    }
            if(operationsOfSymbol.tripleOperations) {
                if(SymbolMap.isEmpty(operationsOfSymbol.tripleOperations)) {
                    console.warn(`Empty entry operationsBySymbol['${symbol}'].tripleOperations`);
                    return false;
                }
                for(const [beta, gammaCollection] of SymbolMap.entries(operationsOfSymbol.tripleOperations))
                    if(SymbolMap.isEmpty(gammaCollection)) {
                        console.warn(`Empty entry operationsBySymbol['${symbol}'].tripleOperations['${beta}']`);
                        return false;
                    }
            }
            if(!checkOperations(operationsOfSymbol.copyOperations, `operationsOfSymbol['${symbol}'].copyOperations`, 'srcOffset', false, true))
                return false;
            if(!checkOperations(operationsOfSymbol.replaceOperations, `operationsOfSymbol['${symbol}'].replaceOperations`, 'dstOffset', false, false))
                return false;
            if(!checkOperations(operationsOfSymbol.creaseLengthOperations, `operationsOfSymbol['${symbol}'].creaseLengthOperations`, 'dstOffset', true, false))
                return false;
            if(operationsOfSymbol.manifestOrRelease && operationsOfSymbol.creaseLengthOperations) {
                if(operationsOfSymbol.creaseLengthOperations.length != 1) {
                    console.warn(`operationsBySymbol['${symbol}'].creaseLengthOperations.length > 1 but symbol was manifested or released`);
                    return false;
                }
                if(operationsOfSymbol.creaseLengthOperations[0].dstOffset != 0) {
                    console.warn(`operationsBySymbol['${symbol}'].dstOffset != 0 but symbol was manifested or released`);
                    return false;
                }
            }
            // TODO: Check increases covered by replaces and free of copyOperations
            // TODO: Check decreases free of replaceOperations and covered by copyOperations (to dataRestore)
        }
        return true;
    }

    /**
     * Optimizes data source and restore
     */
    compressData() {
        const operationsOfSymbol = SymbolMap.get(this.operationsBySymbol, this.dataSource) || {},
              copyOperations = operationsOfSymbol.copyOperations || [];
        let lastOffset = 0, decreaseAccumulator = 0;
        for(let i = 0; i < copyOperations.length; ++i) {
            const operation = copyOperations[i],
                  gapLength = operation.srcOffset-lastOffset,
                  nextOffset = operation.srcOffset+operation.length;
            if(gapLength > 0) {
                console.assert(this.repository.backend.creaseLength(this.dataSource, lastOffset-decreaseAccumulator, -gapLength));
                decreaseAccumulator += gapLength;
            }
            operation.srcOffset -= decreaseAccumulator;
            lastOffset = Math.max(lastOffset, nextOffset);
        }
        console.assert(this.repository.backend.setLength(this.dataSource, lastOffset-decreaseAccumulator));
        // TODO: Compress redundancy in data source and restore by finding equal slices and map them to the same place
    }

    /**
     * After recording this method must be called before the Diff can be applied.
     */
    commit() {
        for(const [symbol, operationsOfSymbol] of SymbolMap.entries(this.operationsBySymbol)) {
            let minimumLengths = [0, 0], creaseAccumulators = [0, 0];
            function maximizeMinimumLength(operation, key, slot) {
                if(operation instanceof Array)
                    operation = operation[operation.length-1];
                minimumLengths[slot] = Math.max(minimumLengths[slot], operation[key]+Math.abs(operation.length)-creaseAccumulators[slot]);
            }
            if(operationsOfSymbol.creaseLengthOperations && !operationsOfSymbol.manifestOrRelease) {
                const increaseLengthOperations = operationsOfSymbol.creaseLengthOperations.filter(operation => operation.length > 0),
                      decreaseLengthOperations = operationsOfSymbol.creaseLengthOperations.filter(operation => operation.length < 0).reverse();
                creaseAccumulators[0] = increaseLengthOperations.reduce((total, operation) => total+operation.length, 0);
                creaseAccumulators[1] = decreaseLengthOperations.reduce((total, operation) => total-operation.length, 0);
                maximizeMinimumLength(operationsOfSymbol.creaseLengthOperations, 'dstOffset', 0);
                maximizeMinimumLength(operationsOfSymbol.creaseLengthOperations, 'dstOffset', 1);
            }
            if(operationsOfSymbol.replaceOperations)
                maximizeMinimumLength(operationsOfSymbol.replaceOperations, 'dstOffset', 0);
            if(operationsOfSymbol.copyOperations)
                for(const operation of operationsOfSymbol.copyOperations)
                    maximizeMinimumLength(operation, 'srcOffset', 1);
            if(operationsOfSymbol.manifestOrRelease)
                [operationsOfSymbol.forwardLength, operationsOfSymbol.reverseLength] = [minimumLengths[1], minimumLengths[0]];
            else
                [operationsOfSymbol.forwardLength, operationsOfSymbol.reverseLength] = [minimumLengths[0], minimumLengths[1]];
        }
    }

    /**
     * Applies this diff to transform a materialized version into another
     * @param {boolean} reverse Set to true to revert this diff
     * @param {RelocationTable} materializationRelocation Relocates modal namespaces to become namespaces of the materialized version
     * @param {BasicBackend} dst Apply to another diff or the backend (default)
     * @return {boolean} True on success
     */
    apply(reverse, materializationRelocation=RelocationTable.create(), dst=this.repository.backend) {
        if(dst instanceof this.constructor) {
            console.assert(!reverse);
            dst.isRecordingFromBackend = false;
        } else {
            const modalizationRelocation = RelocationTable.inverse(materializationRelocation),
                  existingSymbols = SymbolMap.create();
            for(const [srcNamespaceIdentity, dstNamespaceIdentity] of RelocationTable.entries(materializationRelocation))
                for(const symbol of this.repository.backend.querySymbols(dstNamespaceIdentity))
                    SymbolMap.set(existingSymbols, symbol, true);
            for(const [symbol, operationsOfSymbol] of SymbolMap.entries(this.operationsBySymbol)) {
                const materialSymbol = RelocationTable.relocateSymbol(materializationRelocation, symbol);
                if(operationsOfSymbol.manifestOrRelease) {
                    if(operationsOfSymbol.manifestOrRelease == (reverse ? 'release' : 'manifest')) {
                        if(SymbolMap.get(existingSymbols, materialSymbol))
                            return false;
                    } else {
                        if(!SymbolMap.get(existingSymbols, materialSymbol))
                            return false;
                        for(let triple of TripleMap.keys(dst.getTriplesOfSymbol(materialSymbol))) {
                            triple = triple.map(symbol => RelocationTable.relocateSymbol(modalizationRelocation, symbol));
                            const operationsOfSymbol = SymbolMap.get(this.operationsBySymbol, triple[0]);
                            if(!operationsOfSymbol || !operationsOfSymbol.tripleOperations)
                                return false;
                            const betaCollection = SymbolMap.get(operationsOfSymbol.tripleOperations, triple[1]);
                            if(!betaCollection || SymbolMap.get(betaCollection, triple[2]) !== reverse)
                                return false;
                        }
                    }
                    if(dst.getLength(materialSymbol) != operationsOfSymbol[(reverse ? 'reverse' : 'forward')+'Length'])
                        return false;
                } else if(dst.getLength(materialSymbol) < operationsOfSymbol[(reverse ? 'reverse' : 'forward')+'Length'])
                    return false;
                if(operationsOfSymbol.tripleOperations) {
                    const triple = [materialSymbol];
                    for(const [beta, gammaCollection] of SymbolMap.entries(operationsOfSymbol.tripleOperations)) {
                        triple[1] = RelocationTable.relocateSymbol(materializationRelocation, beta);
                        for(const [gamma, link] of SymbolMap.entries(gammaCollection)) {
                            triple[2] = RelocationTable.relocateSymbol(materializationRelocation, gamma);
                            if((dst.getTriple(triple) == link) != reverse)
                                return false;
                        }
                    }
                }
            }
        }
        for(const [symbol, operationsOfSymbol] of SymbolMap.entries(this.operationsBySymbol)) {
            const materialSymbol = RelocationTable.relocateSymbol(materializationRelocation, symbol);
            if(operationsOfSymbol.manifestOrRelease == (reverse ? 'release' : 'manifest'))
                console.assert(dst.manifestSymbol(materialSymbol));
            if(operationsOfSymbol.creaseLengthOperations)
                for(const operation of operationsOfSymbol.creaseLengthOperations)
                    if((operation.length < 0) == reverse)
                        console.assert(dst.creaseLength(materialSymbol, operation.dstOffset, reverse ? -operation.length : operation.length));
        }
        let dataSource = this.dataSource, dataSourceOffset = 0;
        if(dst instanceof this.constructor) {
            dataSource = dst.dataSource;
            dataSourceOffset = this.repository.backend.getLength(dst.dataSource);
            const length = this.repository.backend.getLength(this.dataSource);
            console.assert(this.repository.backend.creaseLength(dst.dataSource, dataSourceOffset, length));
            console.assert(this.repository.backend.replaceData(dst.dataSource, dataSourceOffset, this.dataSource, 0, length));
            const operationsOfSymbol = SymbolMap.get(this.operationsBySymbol, this.dataRestore);
            if(operationsOfSymbol && operationsOfSymbol.replaceOperations)
                for(const operation of operationsOfSymbol.replaceOperations)
                    dst.saveDataToRestore(this.dataRestore, RelocationTable.relocateSymbol(materializationRelocation, operation.srcSymbol), operation.srcOffset, operation.length, operation);
        }
        const replaceOperations = [];
        if(reverse) {
            const operationsOfSymbol = SymbolMap.get(this.operationsBySymbol, this.dataRestore);
            if(operationsOfSymbol && operationsOfSymbol.replaceOperations)
                for(const operation of operationsOfSymbol.replaceOperations)
                    replaceOperations.push({
                        'srcSymbol': this.dataRestore,
                        'dstSymbol': RelocationTable.relocateSymbol(materializationRelocation, operation.srcSymbol),
                        'srcOffset': operation.dstOffset,
                        'dstOffset': operation.srcOffset,
                        'length': operation.length
                    });
        } else {
            for(const [symbol, operationsOfSymbol] of SymbolMap.entries(this.operationsBySymbol)) {
                const materialSymbol = RelocationTable.relocateSymbol(materializationRelocation, symbol);
                if(!SymbolInternals.areSymbolsEqual(symbol, this.dataRestore) && operationsOfSymbol.replaceOperations)
                    for(const operation of operationsOfSymbol.replaceOperations) {
                        const fromDataSource = SymbolInternals.areSymbolsEqual(operation.srcSymbol, this.dataSource);
                        replaceOperations.push({
                            'srcSymbol': fromDataSource ? dataSource : RelocationTable.relocateSymbol(materializationRelocation, operation.srcSymbol),
                            'dstSymbol': materialSymbol,
                            'srcOffset': fromDataSource ? operation.srcOffset+dataSourceOffset : operation.srcOffset,
                            'dstOffset': operation.dstOffset,
                            'length': operation.length
                        });
                    }
            }
        }
        console.assert(dst.replaceDataSimultaneously(replaceOperations));
        for(const [symbol, operationsOfSymbol] of SymbolMap.entries(this.operationsBySymbol)) {
            if(!operationsOfSymbol.tripleOperations)
                continue;
            const triple = [RelocationTable.relocateSymbol(materializationRelocation, symbol)];
            for(const [beta, gammaCollection] of SymbolMap.entries(operationsOfSymbol.tripleOperations)) {
                triple[1] = RelocationTable.relocateSymbol(materializationRelocation, beta);
                for(const [gamma, link] of SymbolMap.entries(gammaCollection)) {
                    triple[2] = RelocationTable.relocateSymbol(materializationRelocation, gamma);
                    console.assert(dst.setTriple(triple, link != reverse));
                }
            }
        }
        for(const [symbol, operationsOfSymbol] of SymbolMap.entries(this.operationsBySymbol)) {
            const materialSymbol = RelocationTable.relocateSymbol(materializationRelocation, symbol);
            if(operationsOfSymbol.creaseLengthOperations)
                for(const operation of Utils.reversed(operationsOfSymbol.creaseLengthOperations))
                    if((operation.length > 0) == reverse)
                        console.assert(dst.creaseLength(materialSymbol, operation.dstOffset, reverse ? -operation.length : operation.length));
            if(operationsOfSymbol.manifestOrRelease == (reverse ? 'manifest' : 'release'))
                console.assert(dst.releaseSymbol(materialSymbol));
        }
        if(dst instanceof this.constructor)
            dst.isRecordingFromBackend = true;
        return true;
    }

    /**
     * Exports the commited diff as JSON
     * @return {string} json
     */
    encodeJson() {
        function exportSymbolMap(input, output, callback) {
            const symbols = [...SymbolMap.keys(input)];
            symbols.sort(SymbolInternals.compareSymbols);
            let namespaceIdentity;
            for(const symbol of symbols) {
                const entry = callback(symbol);
                if(entry !== undefined) {
                    if(SymbolInternals.namespaceOfSymbol(symbol) != namespaceIdentity) {
                        namespaceIdentity = SymbolInternals.namespaceOfSymbol(symbol);
                        output.push(-namespaceIdentity-1);
                    }
                    output.push(SymbolInternals.identityOfSymbol(symbol));
                    if(entry !== null)
                        output.push(entry);
                }
            }
        }
        const exportCopyReplaceOperations = (replaceOperations) => {
            let outputOfDataSource;
            const outputOfOtherSymbols = [], aggregate = SymbolMap.create();
            for(const operation of replaceOperations)
                SymbolMap.getOrInsert(aggregate, operation.srcSymbol, []).push(operation);
            exportSymbolMap(aggregate, outputOfOtherSymbols, (srcSymbol) => {
                const replaceOperationsOfSrc = SymbolMap.get(aggregate, srcSymbol),
                      outputOfAnotherSymbol = [];
                outputOfAnotherSymbol.length = replaceOperationsOfSrc.length*3;
                for(let i = 0; i < replaceOperationsOfSrc.length; ++i) {
                    const operation = replaceOperationsOfSrc[i];
                    outputOfAnotherSymbol[i*3  ] = operation.dstOffset;
                    outputOfAnotherSymbol[i*3+1] = operation.srcOffset;
                    outputOfAnotherSymbol[i*3+2] = operation.length;
                }
                if(SymbolInternals.areSymbolsEqual(srcSymbol, this.dataSource)) {
                    outputOfDataSource = outputOfAnotherSymbol;
                    return;
                }
                return outputOfAnotherSymbol;
            });
            return [outputOfDataSource, (outputOfOtherSymbols.length > 0) ? outputOfOtherSymbols : undefined];
        };
        const exportStructure = {'symbols': []};
        for(const type of ['dataSource', 'dataRestore']) {
            if(!this[type])
                continue;
            const length = this.repository.backend.getLength(this[type]),
                  operationsOfSymbol = SymbolMap.get(this.operationsBySymbol, this[type]),
                  exportStructureEntry = exportStructure[type] = {
                'data': (length == 0) ? undefined : Utils.encodeAsHex(new Uint8Array(this.repository.backend.getRawData(this[type]).buffer, 0, Math.ceil(length/8)))
            };
            if(operationsOfSymbol && operationsOfSymbol.replaceOperations && operationsOfSymbol.replaceOperations.length > 0)
                exportStructureEntry.replaceOperations = exportCopyReplaceOperations(operationsOfSymbol.replaceOperations)[1];
        }
        exportSymbolMap(this.operationsBySymbol, exportStructure.symbols, (symbol) => {
            if(SymbolInternals.areSymbolsEqual(symbol, this.dataSource) || SymbolInternals.areSymbolsEqual(symbol, this.dataRestore))
                return;
            const exportStructureEntry = [],
                  operationsOfSymbol = SymbolMap.get(this.operationsBySymbol, symbol);
            if(operationsOfSymbol.manifestOrRelease)
                exportStructureEntry[0] = (operationsOfSymbol.manifestOrRelease == 'manifest');
            if(operationsOfSymbol.tripleOperations) {
                exportStructureEntry[1] = [];
                exportSymbolMap(operationsOfSymbol.tripleOperations, exportStructureEntry[1], (beta) => {
                    const betaEntry = [],
                          gammaCollection = SymbolMap.get(operationsOfSymbol.tripleOperations, beta);
                    exportSymbolMap(gammaCollection, betaEntry, (gamma) => {
                        return (operationsOfSymbol.manifestOrRelease === undefined) ? SymbolMap.get(gammaCollection, gamma) : null;
                    });
                    return betaEntry;
                });
            }
            if(operationsOfSymbol.replaceOperations) {
                const [outputOfDataSource, outputOfOtherSymbols] = exportCopyReplaceOperations(operationsOfSymbol.replaceOperations);
                if(outputOfDataSource)
                    exportStructureEntry[2] = outputOfDataSource;
                if(outputOfOtherSymbols)
                    exportStructureEntry[3] = outputOfOtherSymbols;
            }
            if(operationsOfSymbol.creaseLengthOperations && operationsOfSymbol.manifestOrRelease === undefined) {
                exportStructureEntry[4] = [];
                exportStructureEntry[4].length = operationsOfSymbol.creaseLengthOperations.length*2;
                for(let i = 0; i < operationsOfSymbol.creaseLengthOperations.length; ++i) {
                    const operation = operationsOfSymbol.creaseLengthOperations[i];
                    exportStructureEntry[4][i*2  ] = operation.dstOffset;
                    exportStructureEntry[4][i*2+1] = operation.length;
                }
            }
            return exportStructureEntry;
        });
        // console.log(JSON.stringify(exportStructure, undefined, '\t'));
        return JSON.stringify(exportStructure);
    }

    /**
     * Imports content from JSON. Don't call this method directly, use the constructor instead
     * @param {string} json
     */
    decodeJson(json) {
        function* importSymbolMap(input) {
            let namespaceIdentity;
            for(let i = 0; i < input.length; ++i) {
                if(typeof input[i] == 'number' && input[i] < 0)
                    namespaceIdentity = -input[i++]-1;
                yield [
                    SymbolInternals.concatIntoSymbol(namespaceIdentity, input[i]),
                    (input[i+1] === undefined || typeof input[i+1] == 'number') ? null : input[++i]
                ];
            }
        }
        const importCopyReplaceOperations = (inputOfDataSource, inputOfOtherSymbols, dstSymbol) => {
            const output = [],
                  importInputOfSrc = (srcSymbol, inputOfAnotherSymbol) => {
                for(let i = 0; i < inputOfAnotherSymbol.length; i += 3) {
                    const operation = {
                        'dstOffset': inputOfAnotherSymbol[i],
                        'srcOffset': inputOfAnotherSymbol[i+1],
                        'length': inputOfAnotherSymbol[i+2],
                        'dstSymbol': dstSymbol,
                        'srcSymbol': srcSymbol
                    };
                    output.push(operation);
                    getOrCreateEntry(SymbolMap.getOrInsert(this.operationsBySymbol, operation.srcSymbol, {}), 'copyOperations', []).push(operation);
                }
            };
            if(inputOfOtherSymbols)
                for(const [srcSymbol, inputOfAnotherSymbol] of importSymbolMap(inputOfOtherSymbols))
                    importInputOfSrc(srcSymbol, inputOfAnotherSymbol);
            if(inputOfDataSource)
                importInputOfSrc(this.dataSource, inputOfDataSource);
            return (output.length > 0) ? output : undefined;
        };
        const importStructure = JSON.parse(json);
        for(const type of ['dataSource', 'dataRestore']) {
            this[type] = this.repository.backend.createSymbol(this.repository.namespaceIdentity);
            const importStructureEntry = importStructure[type],
                  operationsOfSymbol = {[(type == 'dataSource') ? 'copyOperations' : 'replaceOperations']: []};
            SymbolMap.set(this.operationsBySymbol, this[type], operationsOfSymbol);
            if(importStructureEntry.data)
                console.assert(this.repository.backend.setRawData(this[type], Utils.decodeAsHex(importStructureEntry.data)));
            operationsOfSymbol.replaceOperations = importCopyReplaceOperations(undefined, importStructureEntry.replaceOperations, this[type]);
            continue;
        }
        for(const [symbol, importStructureEntry] of importSymbolMap(importStructure.symbols)) {
            const operationsOfSymbol = SymbolMap.getOrInsert(this.operationsBySymbol, symbol, {});
            if(importStructureEntry[0] != undefined)
                operationsOfSymbol.manifestOrRelease = (importStructureEntry[0]) ? 'manifest' : 'release';
            if(importStructureEntry[1]) {
                operationsOfSymbol.tripleOperations = SymbolMap.create();
                for(const [beta, gammaCollection] of importSymbolMap(importStructureEntry[1])) {
                    const betaEntry = SymbolMap.create();
                    SymbolMap.set(operationsOfSymbol.tripleOperations, beta, betaEntry);
                    for(const [gamma, link] of importSymbolMap(gammaCollection))
                        SymbolMap.set(betaEntry, gamma, importStructureEntry[0] != undefined ? importStructureEntry[0] : link);
                }
            }
            const replaceOperations = importCopyReplaceOperations(importStructureEntry[2], importStructureEntry[3], symbol);
            if(replaceOperations)
                operationsOfSymbol.replaceOperations = replaceOperations;
            if(importStructureEntry[4]) {
                operationsOfSymbol.creaseLengthOperations = [];
                operationsOfSymbol.creaseLengthOperations.length = Math.ceil(importStructureEntry[4].length/2);
                for(let i = 0; i < operationsOfSymbol.creaseLengthOperations.length; ++i)
                    operationsOfSymbol.creaseLengthOperations[i] = {
                        'dstSymbol': symbol,
                        'dstOffset': importStructureEntry[4][i*2],
                        'length': importStructureEntry[4][i*2+1]
                    };
            }
        }
        for(const [symbol, operationsOfSymbol] of SymbolMap.entries(this.operationsBySymbol)) {
            if(operationsOfSymbol.replaceOperations)
                operationsOfSymbol.replaceOperations.sort((a, b) => a.dstOffset-b.dstOffset);
            if(operationsOfSymbol.copyOperations)
                operationsOfSymbol.copyOperations.sort((a, b) => a.srcOffset-b.srcOffset);
        }
        this.commit();
        for(const [symbol, operationsOfSymbol] of SymbolMap.entries(this.operationsBySymbol))
            if(operationsOfSymbol.manifestOrRelease) {
                const creaseLength = (operationsOfSymbol.manifestOrRelease == 'manifest') ? operationsOfSymbol.reverseLength : -operationsOfSymbol.forwardLength;
                if(creaseLength != 0)
                    operationsOfSymbol.creaseLengthOperations = [{
                        'dstSymbol': symbol,
                        'dstOffset': 0,
                        'length': creaseLength
                    }];
            }
        // console.log(JSON.stringify(this.operationsBySymbol, undefined, '\t'));
    }

    /**
     * Loads the diff from the repository. Don't call this method directly, use the constructor instead
     */
    load(symbol) {
        this.symbol = symbol;
        this.dataSource = this.repository.backend.getPairOptionally(this.symbol, this.repository.backend.symbolByName.DataSource);
        if(SymbolInternals.areSymbolsEqual(this.dataSource, this.repository.backend.symbolByName.Void))
            delete this.dataSource;
        this.dataRestore = this.repository.backend.getPairOptionally(this.symbol, this.repository.backend.symbolByName.DataRestore);
        if(SymbolInternals.areSymbolsEqual(this.dataRestore, this.repository.backend.symbolByName.Void))
            delete this.dataRestore;
        for(const [manifestOrRelease, attributeName] of [['manifest', 'ManifestSymbol'], ['release', 'ReleaseSymbol']])
            for(const triple of this.repository.backend.queryTriples(this.repository.backend.queryMasks.MMV, [this.symbol, this.repository.backend.symbolByName[attributeName], this.repository.backend.symbolByName.Void]))
                SymbolMap.getOrInsert(this.operationsBySymbol, triple[2], {}).manifestOrRelease = manifestOrRelease;
        for(const [link, attributeName] of [[true, 'LinkTriple'], [false, 'UnlinkTriple']])
            for(const triple of this.repository.backend.queryTriples(this.repository.backend.queryMasks.MMV, [this.symbol, this.repository.backend.symbolByName[attributeName], this.repository.backend.symbolByName.Void])) {
                const operationsOfSymbol = SymbolMap.getOrInsert(this.operationsBySymbol, this.repository.backend.getPairOptionally(triple[2], this.repository.backend.symbolByName.Entity), {}),
                      tripleOperations = getOrCreateEntry(operationsOfSymbol, 'tripleOperations', SymbolMap.create()),
                      betaCollection = SymbolMap.getOrInsert(tripleOperations, this.repository.backend.getPairOptionally(triple[2], this.repository.backend.symbolByName.Attribute), SymbolMap.create());
                SymbolMap.set(betaCollection, this.repository.backend.getPairOptionally(triple[2], this.repository.backend.symbolByName.Value), link);
            }
        for(const [sign, attributeName] of [[1, 'IncreaseLength'], [-1, 'DecreaseLength']])
            for(const triple of this.repository.backend.queryTriples(this.repository.backend.queryMasks.MMV, [this.symbol, this.repository.backend.symbolByName[attributeName], this.repository.backend.symbolByName.Void])) {
                const dstSymbol = this.repository.backend.getPairOptionally(triple[2], this.repository.backend.symbolByName.Destination),
                      operationsOfSymbol = SymbolMap.getOrInsert(this.operationsBySymbol, dstSymbol, {});
                getOrCreateEntry(operationsOfSymbol, 'creaseLengthOperations', []).push({
                    'dstSymbol': dstSymbol,
                    'dstOffset': this.repository.backend.getData(this.repository.backend.getPairOptionally(triple[2], this.repository.backend.symbolByName.DestinationOffset)),
                    'length': this.repository.backend.getData(this.repository.backend.getPairOptionally(triple[2], this.repository.backend.symbolByName.Length))*sign
                });
            }
        for(const triple of this.repository.backend.queryTriples(this.repository.backend.queryMasks.MMV, [this.symbol, this.repository.backend.symbolByName.ReplaceData, this.repository.backend.symbolByName.Void])) {
            const operation = {
                'dstSymbol': this.repository.backend.getPairOptionally(triple[2], this.repository.backend.symbolByName.Destination),
                'dstOffset': this.repository.backend.getData(this.repository.backend.getPairOptionally(triple[2], this.repository.backend.symbolByName.DestinationOffset)),
                'srcSymbol': this.repository.backend.getPairOptionally(triple[2], this.repository.backend.symbolByName.Source),
                'srcOffset': this.repository.backend.getData(this.repository.backend.getPairOptionally(triple[2], this.repository.backend.symbolByName.SourceOffset)),
                'length': this.repository.backend.getData(this.repository.backend.getPairOptionally(triple[2], this.repository.backend.symbolByName.Length))
            };
            getOrCreateEntry(SymbolMap.getOrInsert(this.operationsBySymbol, operation.dstSymbol, {}), 'replaceOperations', []).push(operation);
            getOrCreateEntry(SymbolMap.getOrInsert(this.operationsBySymbol, operation.srcSymbol, {}), 'copyOperations', []).push(operation);
        }
        for(const triple of this.repository.backend.queryTriples(this.repository.backend.queryMasks.MMV, [this.symbol, this.repository.backend.symbolByName.MinimumLength, this.repository.backend.symbolByName.Void])) {
            const srcSymbol = this.repository.backend.getPairOptionally(triple[2], this.repository.backend.symbolByName.Source),
                  operationsOfSymbol = SymbolMap.getOrInsert(this.operationsBySymbol, srcSymbol, {});
            operationsOfSymbol.forwardLength = this.repository.backend.getData(this.repository.backend.getPairOptionally(triple[2], this.repository.backend.symbolByName.ForwardLength));
            operationsOfSymbol.reverseLength = this.repository.backend.getData(this.repository.backend.getPairOptionally(triple[2], this.repository.backend.symbolByName.ReverseLength));
        }
        for(const symbol of SymbolMap.keys(this.operationsBySymbol)) {
            const operationsOfSymbol = SymbolMap.get(this.operationsBySymbol, symbol);
            if(operationsOfSymbol.creaseLengthOperations)
                operationsOfSymbol.creaseLengthOperations.sort((a, b) => a.dstOffset-b.dstOffset);
            if(operationsOfSymbol.replaceOperations)
                operationsOfSymbol.replaceOperations.sort((a, b) => a.dstOffset-b.dstOffset);
            if(operationsOfSymbol.copyOperations)
                operationsOfSymbol.copyOperations.sort((a, b) => a.srcOffset-b.srcOffset);
        }
    }

    /**
     * Writes the commited diff into the repository
     */
    link() {
        console.assert(!this.symbol);
        this.symbol = this.repository.backend.createSymbol(this.repository.namespaceIdentity);
        if(this.dataSource)
            console.assert(this.repository.backend.setTriple([this.symbol, this.repository.backend.symbolByName.DataSource, this.dataSource], true));
        if(this.dataRestore)
            console.assert(this.repository.backend.setTriple([this.symbol, this.repository.backend.symbolByName.DataRestore, this.dataRestore], true));
        for(const [symbol, operationsOfSymbol] of SymbolMap.entries(this.operationsBySymbol)) {
            this.repository.backend.manifestSymbol(symbol);
            {
                const operationSymbol = this.repository.backend.createSymbol(this.repository.namespaceIdentity),
                      forwardLengthSymbol = this.repository.backend.createSymbol(this.repository.namespaceIdentity),
                      reverseLengthSymbol = this.repository.backend.createSymbol(this.repository.namespaceIdentity);
                console.assert(this.repository.backend.setTriple([this.symbol, this.repository.backend.symbolByName.MinimumLength, operationSymbol], true));
                console.assert(this.repository.backend.setTriple([operationSymbol, this.repository.backend.symbolByName.Source, symbol], true));
                console.assert(this.repository.backend.setTriple([operationSymbol, this.repository.backend.symbolByName.ForwardLength, forwardLengthSymbol], true));
                console.assert(this.repository.backend.setTriple([operationSymbol, this.repository.backend.symbolByName.ReverseLength, reverseLengthSymbol], true));
                console.assert(this.repository.backend.setData(forwardLengthSymbol, operationsOfSymbol.forwardLength));
                console.assert(this.repository.backend.setData(reverseLengthSymbol, operationsOfSymbol.reverseLength));
            }
            if(operationsOfSymbol.manifestOrRelease)
                console.assert(this.repository.backend.setTriple([this.symbol, this.repository.backend.symbolByName[(operationsOfSymbol.manifestOrRelease == 'manifest') ? 'ManifestSymbol' : 'ReleaseSymbol'], symbol], true));
            if(operationsOfSymbol.tripleOperations)
                for(const [beta, gammaCollection] of SymbolMap.entries(operationsOfSymbol.tripleOperations))
                    for(const [gamma, link] of SymbolMap.entries(gammaCollection)) {
                        this.repository.backend.manifestSymbol(beta);
                        this.repository.backend.manifestSymbol(gamma);
                        const operationSymbol = this.repository.backend.createSymbol(this.repository.namespaceIdentity);
                        console.assert(this.repository.backend.setTriple([this.symbol, this.repository.backend.symbolByName[link ? 'LinkTriple' : 'UnlinkTriple'], operationSymbol], true));
                        console.assert(this.repository.backend.setTriple([operationSymbol, this.repository.backend.symbolByName.Entity, symbol], true));
                        console.assert(this.repository.backend.setTriple([operationSymbol, this.repository.backend.symbolByName.Attribute, beta], true));
                        console.assert(this.repository.backend.setTriple([operationSymbol, this.repository.backend.symbolByName.Value, gamma], true));
                    }
            if(operationsOfSymbol.creaseLengthOperations)
                for(const operation of operationsOfSymbol.creaseLengthOperations) {
                    const operationSymbol = this.repository.backend.createSymbol(this.repository.namespaceIdentity),
                          dstOffsetSymbol = this.repository.backend.createSymbol(this.repository.namespaceIdentity),
                          lengthSymbol = this.repository.backend.createSymbol(this.repository.namespaceIdentity);
                    console.assert(this.repository.backend.setTriple([this.symbol, this.repository.backend.symbolByName[(operation.length > 0) ? 'IncreaseLength' : 'DecreaseLength'], operationSymbol], true));
                    console.assert(this.repository.backend.setTriple([operationSymbol, this.repository.backend.symbolByName.Destination, operation.dstSymbol], true));
                    console.assert(this.repository.backend.setTriple([operationSymbol, this.repository.backend.symbolByName.DestinationOffset, dstOffsetSymbol], true));
                    console.assert(this.repository.backend.setTriple([operationSymbol, this.repository.backend.symbolByName.Length, lengthSymbol], true));
                    console.assert(this.repository.backend.setData(dstOffsetSymbol, operation.dstOffset));
                    console.assert(this.repository.backend.setData(lengthSymbol, Math.abs(operation.length)));
                }
            if(operationsOfSymbol.replaceOperations)
                for(const operation of operationsOfSymbol.replaceOperations) {
                    this.repository.backend.manifestSymbol(operation.srcSymbol);
                    const operationSymbol = this.repository.backend.createSymbol(this.repository.namespaceIdentity),
                          dstOffsetSymbol = this.repository.backend.createSymbol(this.repository.namespaceIdentity),
                          srcOffsetSymbol = this.repository.backend.createSymbol(this.repository.namespaceIdentity),
                          lengthSymbol = this.repository.backend.createSymbol(this.repository.namespaceIdentity);
                    console.assert(this.repository.backend.setTriple([this.symbol, this.repository.backend.symbolByName.ReplaceData, operationSymbol], true));
                    console.assert(this.repository.backend.setTriple([operationSymbol, this.repository.backend.symbolByName.Destination, operation.dstSymbol], true));
                    console.assert(this.repository.backend.setTriple([operationSymbol, this.repository.backend.symbolByName.DestinationOffset, dstOffsetSymbol], true));
                    console.assert(this.repository.backend.setTriple([operationSymbol, this.repository.backend.symbolByName.Source, operation.srcSymbol], true));
                    console.assert(this.repository.backend.setTriple([operationSymbol, this.repository.backend.symbolByName.SourceOffset, srcOffsetSymbol], true));
                    console.assert(this.repository.backend.setTriple([operationSymbol, this.repository.backend.symbolByName.Length, lengthSymbol], true));
                    console.assert(this.repository.backend.setData(dstOffsetSymbol, operation.dstOffset));
                    console.assert(this.repository.backend.setData(srcOffsetSymbol, operation.srcOffset));
                    console.assert(this.repository.backend.setData(lengthSymbol, operation.length));
                }
        }
    }

    /**
     * Removes the diff from the repository
     */
    unlink() {
        if(this.dataSource)
            console.assert(this.repository.backend.unlinkSymbol(this.dataSource));
        if(this.dataRestore)
            console.assert(this.repository.backend.unlinkSymbol(this.dataRestore));
        if(!this.symbol)
            return;
        for(const attributeName of ['LinkTriple', 'UnlinkTriple'])
            for(const triple of this.repository.backend.queryTriples(this.repository.backend.queryMasks.MMV, [this.symbol, this.repository.backend.symbolByName[attributeName], this.repository.backend.symbolByName.Void]))
                console.assert(this.repository.backend.unlinkSymbol(triple[2]));
        for(const attributeName of ['IncreaseLength', 'DecreaseLength'])
            for(const triple of this.repository.backend.queryTriples(this.repository.backend.queryMasks.MMV, [this.symbol, this.repository.backend.symbolByName[attributeName], this.repository.backend.symbolByName.Void])) {
                console.assert(this.repository.backend.unlinkSymbol(this.repository.backend.getPairOptionally(triple[2], this.repository.backend.symbolByName.DestinationOffset)));
                console.assert(this.repository.backend.unlinkSymbol(this.repository.backend.getPairOptionally(triple[2], this.repository.backend.symbolByName.Length)));
                console.assert(this.repository.backend.unlinkSymbol(triple[2]));
            }
        for(const triple of this.repository.backend.queryTriples(this.repository.backend.queryMasks.MMV, [this.symbol, this.repository.backend.symbolByName.ReplaceData, this.repository.backend.symbolByName.Void])) {
            console.assert(this.repository.backend.unlinkSymbol(this.repository.backend.getPairOptionally(triple[2], this.repository.backend.symbolByName.DestinationOffset)));
            console.assert(this.repository.backend.unlinkSymbol(this.repository.backend.getPairOptionally(triple[2], this.repository.backend.symbolByName.SourceOffset)));
            console.assert(this.repository.backend.unlinkSymbol(this.repository.backend.getPairOptionally(triple[2], this.repository.backend.symbolByName.Length)));
            console.assert(this.repository.backend.unlinkSymbol(triple[2]));
        }
        for(const triple of this.repository.backend.queryTriples(this.repository.backend.queryMasks.MMV, [this.symbol, this.repository.backend.symbolByName.MinimumLength, this.repository.backend.symbolByName.Void])) {
            console.assert(this.repository.backend.unlinkSymbol(this.repository.backend.getPairOptionally(triple[2], this.repository.backend.symbolByName.ForwardLength)));
            console.assert(this.repository.backend.unlinkSymbol(this.repository.backend.getPairOptionally(triple[2], this.repository.backend.symbolByName.ReverseLength)));
            console.assert(this.repository.backend.unlinkSymbol(triple[2]));
        }
        console.assert(this.repository.backend.unlinkSymbol(this.symbol));
        delete this.symbol;
    }
}
