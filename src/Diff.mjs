import {Utils, SymbolInternals, SymbolMap, BasicBackend} from '../SymatemJS.mjs';

function getOrCreateEntry(dict, key, value) {
    const entry = dict[key];
    return (entry) ? entry : (dict[key] = value);
}

/** A transaction defining the transformation from one version to another and back.
 * To record the actions, use the diff as backend and then call commit.
 */
export default class Diff extends BasicBackend {
    /**
     * @param {BasicBackend} backend
     * @param {Identity} repositoryNamespace The namespace identity of the repository
     * @param {RelocationTable} recordingRelocation Relocate recording namespaces to become modal namespaces
     * @param {String|Symbol} [source] Optionally a JSON string or symbol to load the diff from. If none is provided the diff will be setup for recording instead
     */
    constructor(backend, repositoryNamespace, recordingRelocation, source) {
        super();
        this.backend = backend;
        this.recordingRelocation = recordingRelocation;
        this.repositoryNamespace = repositoryNamespace;
        if(source) {
            if(SymbolInternals.validateSymbol(source))
                this.load(source);
            else
                this.decodeJson(source);
        } else {
            this.isRecordingFromBackend = true;
            this.nextTrackingId = 0;
            this.dataSource = this.backend.createSymbol(this.repositoryNamespace);
            this.dataRestore = this.backend.createSymbol(this.repositoryNamespace);
            this.preCommitStructure = SymbolMap.create();
            SymbolMap.insert(this.preCommitStructure, this.dataRestore, {'replaceOperations': []});
        }
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
            const operationsOfSymbol = SymbolMap.getOrInsert(this.preCommitStructure, operation[mode+'Symbol'], {});
            operations = getOrCreateEntry(operationsOfSymbol, (mode == 'src') ? 'copyOperations' : 'replaceOperations', []);
            operationIndex = this.constructor.getOperationIndex(operations, mode+'Offset', operation[mode+'Offset']);
        }
        operations.splice(operationIndex, 0, operation);
    }

    removeCopyReplaceOperation(mode, operation, dirtySymbols, operations, operationIndex) {
        if(operations === undefined) {
            const operationsOfSymbol = SymbolMap.get(this.preCommitStructure, operation[mode+'Symbol']);
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
        SymbolMap.remove(this.preCommitStructure, symbol);
        return true;
    }

    removeEmptyCopyReplaceOperations(symbols) {
        for(const symbol of symbols) {
            const operationsOfSymbol = SymbolMap.get(this.preCommitStructure, symbol);
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
                                const copyOperations = SymbolMap.get(this.preCommitStructure, operation.srcSymbol).copyOperations,
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
            console.assert(srcOffset+length <= this.backend.getLength(srcSymbolRecording));
        else if(!dataRestoreOperation)
            return;
        const operationsOfSymbol = SymbolMap.getOrInsert(this.preCommitStructure, srcSymbolModal, {}),
              creaseLengthOperations = operationsOfSymbol.creaseLengthOperations || [],
              mergeCopyReplaceOperations = new Set(),
              operationsOfDataRestore = SymbolMap.get(this.preCommitStructure, this.dataRestore);
        if(operationsOfSymbol.manifestOrRelease == 'manifest')
            return;
        let [intermediateOffset, operationIndex] = this.constructor.getIntermediateOffset(creaseLengthOperations, srcOffset),
            decreaseAccumulator = intermediateOffset-srcOffset;
        const addSlice = (length) => {
            if(length <= 0)
                return;
            const dstOffset = (replaceOperationIndex < operationsOfDataRestore.replaceOperations.length)
                             ? operationsOfDataRestore.replaceOperations[replaceOperationIndex].dstOffset
                             : this.backend.getLength(this.dataRestore);
            let srcOffset = intermediateOffset-decreaseAccumulator;
            if(dataRestoreOperation)
                srcOffset += dataRestoreOperation.dstOffset-dataRestoreOperation.srcOffset;
            this.backend.creaseLength(this.dataRestore, dstOffset, length);
            this.backend.writeData(this.dataRestore, dstOffset, length, this.backend.readData(srcSymbolRecording, srcOffset, length));
            const operation = {
                'trackingId': this.nextTrackingId++,
                'dstSymbol': this.dataRestore,
                'dstOffset': dstOffset,
                'srcSymbol': srcSymbolModal,
                'srcOffset': intermediateOffset,
                'length': length
            };
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
        console.assert(this.isRecordingFromBackend);
        return this.backend.querySymbols(namespaceIdentity);
    }

    queryTriples(queryMask, triple) {
        console.assert(this.isRecordingFromBackend);
        return this.backend.queryTriples(queryMask, triple);
    }

    getLength(symbol) {
        console.assert(this.isRecordingFromBackend);
        return this.backend.getLength(symbol);
    }

    readData(symbol, offset, length) {
        console.assert(this.isRecordingFromBackend);
        return this.backend.readData(symbol, offset, length);
    }

    manifestSymbol(symbol, created) {
        console.assert(this.preCommitStructure);
        if(this.isRecordingFromBackend && !created && !this.backend.manifestSymbol(symbol))
            return false;
        symbol = BasicBackend.relocateSymbol(symbol, this.recordingRelocation);
        const operationsOfSymbol = SymbolMap.getOrInsert(this.preCommitStructure, symbol, {});
        if(operationsOfSymbol.manifestOrRelease == 'release') {
            delete operationsOfSymbol.manifestOrRelease;
            this.removeEmptyOperationsOfSymbol(symbol, operationsOfSymbol);
        } else
            operationsOfSymbol.manifestOrRelease = 'manifest';
        return true;
    }

    createSymbol(namespaceIdentity) {
        console.assert(this.isRecordingFromBackend);
        const symbol = this.backend.createSymbol(namespaceIdentity);
        console.assert(this.manifestSymbol(symbol, true));
        return symbol;
    }

    releaseSymbol(symbol) {
        console.assert(this.preCommitStructure);
        if(this.isRecordingFromBackend && !this.backend.releaseSymbol(symbol))
            return false;
        symbol = BasicBackend.relocateSymbol(symbol, this.recordingRelocation);
        const operationsOfSymbol = SymbolMap.getOrInsert(this.preCommitStructure, symbol, {});
        if(operationsOfSymbol.manifestOrRelease == 'manifest') {
            delete operationsOfSymbol.manifestOrRelease;
            this.removeEmptyOperationsOfSymbol(symbol, operationsOfSymbol);
        } else
            operationsOfSymbol.manifestOrRelease = 'release';
        return true;
    }

    setTriple(triple, link) {
        console.assert(this.preCommitStructure);
        if(this.isRecordingFromBackend && !this.backend.setTriple(triple, link))
            return false;
        triple = triple.map(symbol => BasicBackend.relocateSymbol(symbol, this.recordingRelocation));
        const operationsOfSymbol = SymbolMap.getOrInsert(this.preCommitStructure, triple[0], {}),
              betaCollection = getOrCreateEntry(operationsOfSymbol, 'tripleOperations', SymbolMap.create()),
              gammaCollection = SymbolMap.getOrInsert(betaCollection, triple[1], SymbolMap.create()),
              isLinked = SymbolMap.get(gammaCollection, triple[2]);
        if(isLinked === link)
            return false;
        if(isLinked === undefined)
            SymbolMap.insert(gammaCollection, triple[2], link);
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
        console.assert(this.preCommitStructure);
        if(length == 0)
            return true;
        if(this.isRecordingFromBackend) {
            const dataLength = this.backend.getLength(dstSymbolRecording);
            if(length < 0) {
                if(dstOffset-length > dataLength)
                    return false;
            } else if(dstOffset > dataLength)
                return false;
        }
        const originalLength = length,
              dstSymbolModal = BasicBackend.relocateSymbol(dstSymbolRecording, this.recordingRelocation);
        const operationsOfSymbol = SymbolMap.getOrInsert(this.preCommitStructure, dstSymbolModal, {}),
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
                        const replaceOperations = SymbolMap.get(this.preCommitStructure, copyOperation.dstSymbol).replaceOperations;
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
        console.assert(!this.isRecordingFromBackend || this.backend.creaseLength(dstSymbolRecording, dstOffset, originalLength));
        return true;
    }

    replaceDataSimultaneously(replaceOperations) {
        console.assert(this.preCommitStructure);
        if(this.isRecordingFromBackend)
            for(const operation of replaceOperations)
                if(operation.length < 0 ||
                   operation.dstOffset+operation.length > this.backend.getLength(operation.dstSymbol) ||
                   operation.srcOffset+operation.length > this.backend.getLength(operation.srcSymbol))
                    return false;
        const context = {},
              dirtySymbols = new Set(),
              cutReplaceOperations = [],
              addCopyReplaceOperations = [],
              mergeCopyReplaceOperations = [],
              addSlice = (srcSymbol, srcOffset, length) => {
            const operationsOfSymbol = SymbolMap.get(this.preCommitStructure, srcSymbol) || {},
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
                context[mode+'Symbol'] = BasicBackend.relocateSymbol(operation[mode+'Symbol'], this.recordingRelocation);
                context[mode+'OperationsOfSymbol'] = SymbolMap.getOrInsert(this.preCommitStructure, context[mode+'Symbol'], {});
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
            this.cutAndShiftCopyReplaceOperations('dst', SymbolMap.get(this.preCommitStructure, operation.dstSymbol).replaceOperations, dirtySymbols, operation.dstOffset, operation.length, 0);
        for(const operation of addCopyReplaceOperations) {
            this.addCopyReplaceOperation('dst', operation);
            this.addCopyReplaceOperation('src', operation);
        }
        for(const operation of mergeCopyReplaceOperations)
            this.mergeCopyReplaceOperations('dst', SymbolMap.get(this.preCommitStructure, operation.dstSymbol).replaceOperations, operation.dstOffset);
        this.removeEmptyCopyReplaceOperations(dirtySymbols);
        console.assert(!this.isRecordingFromBackend || this.backend.replaceDataSimultaneously(replaceOperations));
        return true;
    }

    writeData(dstSymbolRecording, dstOffset, length, dataBytes) {
        console.assert(this.preCommitStructure);
        const srcOffset = this.backend.getLength(this.dataSource);
        this.backend.creaseLength(this.dataSource, srcOffset, length);
        this.backend.writeData(this.dataSource, srcOffset, length, dataBytes);
        return this.replaceData(dstSymbolRecording, dstOffset, this.dataSource, srcOffset, length);
    }



    /**
     * Scan through all internal structures and check their integrity
     * @return {Boolean} True on success
     */
    validateIntegrity() {
        console.assert(this.preCommitStructure);
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
        for(const [symbol, operationsOfSymbol] of SymbolMap.entries(this.preCommitStructure)) {
            if(Object.keys(operationsOfSymbol) == 0) {
                console.warn(`Empty entry preCommitStructure['${symbol}']`);
                return false;
            }
            if(!SymbolInternals.areSymbolsEqual(symbol, this.dataSource) && !SymbolInternals.areSymbolsEqual(symbol, this.dataRestore))
                for(const type of ['copyOperations', 'replaceOperations', 'creaseLengthOperations'])
                    if(operationsOfSymbol[type] && operationsOfSymbol[type].length == 0) {
                        console.warn(`Empty entry preCommitStructure['${symbol}']['${type}']`);
                        return false;
                    }
            if(operationsOfSymbol.tripleOperations) {
                if(SymbolMap.isEmpty(operationsOfSymbol.tripleOperations)) {
                    console.warn(`Empty entry preCommitStructure['${symbol}'].tripleOperations`);
                    return false;
                }
                for(const [beta, gammaCollection] of SymbolMap.entries(operationsOfSymbol.tripleOperations))
                    if(SymbolMap.isEmpty(gammaCollection)) {
                        console.warn(`Empty entry preCommitStructure['${symbol}'].tripleOperations['${beta}']`);
                        return false;
                    }
            }
            if(!checkOperations(operationsOfSymbol.copyOperations, `operationsOfSymbol['${symbol}'].copyOperations`, 'srcOffset', false, true))
                return false;
            if(!checkOperations(operationsOfSymbol.replaceOperations, `operationsOfSymbol['${symbol}'].replaceOperations`, 'dstOffset', false, false))
                return false;
            if(!checkOperations(operationsOfSymbol.creaseLengthOperations, `operationsOfSymbol['${symbol}'].creaseLengthOperations`, 'dstOffset', true, false))
                return false;
            // TODO: Check increases covered by replaces and free of copyOperations
            // TODO: Check decreases free of replaceOperations
        }
        return true;
    }

    /**
     * Optimizes data source and restore
     */
    compressData() {
        const operationsOfSymbol = SymbolMap.get(this.preCommitStructure, this.dataSource) || {},
              copyOperations = operationsOfSymbol.copyOperations || [];
        let lastOffset = 0, decreaseAccumulator = 0;
        for(let i = 0; i < copyOperations.length; ++i) {
            const operation = copyOperations[i],
                  gapLength = operation.srcOffset-lastOffset,
                  nextOffset = operation.srcOffset+operation.length;
            if(gapLength > 0) {
                this.backend.creaseLength(this.dataSource, lastOffset-decreaseAccumulator, -gapLength);
                decreaseAccumulator += gapLength;
            }
            operation.srcOffset -= decreaseAccumulator;
            lastOffset = Math.max(lastOffset, nextOffset);
        }
        this.backend.setLength(this.dataSource, lastOffset-decreaseAccumulator);
        // TODO: Compress redundancy in data source and restore by finding equal slices and map them to the same place
    }

    /**
     * Reorganizes the internal structure so that it is ready to be applied, but no further recording can happen afterwards.
     */
    commit() {
        console.assert(this.preCommitStructure);
        this.postCommitStructure = {
            'manifestSymbols': [],
            'releaseSymbols': [],
            'linkTripleOperations': [],
            'unlinkTripleOperations': [],
            'increaseLengthOperations': [],
            'decreaseLengthOperations': [],
            'replaceDataOperations': [],
            'restoreDataOperations': SymbolMap.get(this.preCommitStructure, this.dataRestore).replaceOperations,
            'minimumLengths': []
        };
        for(const [symbol, operationsOfSymbol] of SymbolMap.entries(this.preCommitStructure)) {
            if(SymbolInternals.areSymbolsEqual(symbol, this.dataSource) || SymbolInternals.areSymbolsEqual(symbol, this.dataRestore))
                continue;
            if(operationsOfSymbol.manifestOrRelease)
                this.postCommitStructure[(operationsOfSymbol.manifestOrRelease == 'manifest') ? 'manifestSymbols' : 'releaseSymbols'].push(symbol);
            const triple = [symbol];
            if(operationsOfSymbol.tripleOperations)
                for(const [beta, gammaCollection] of SymbolMap.entries(operationsOfSymbol.tripleOperations)) {
                    triple[1] = beta;
                    for(const [gamma, link] of SymbolMap.entries(gammaCollection)) {
                        triple[2] = gamma;
                        this.postCommitStructure[(link ? 'link' : 'unlink')+'TripleOperations'].push({'triple': [...triple]});
                    }
                }
            let minimumLengths = [0, 0], creaseAccumulators = [0, 0];
            function maximizeMinimumLength(operations, key, slot) {
                const lastOperation = operations[operations.length-1];
                minimumLengths[slot] = Math.max(minimumLengths[slot], lastOperation[key]+Math.abs(lastOperation.length)-creaseAccumulators[slot]);
            }
            if(operationsOfSymbol.creaseLengthOperations) {
                const increaseLengthOperations = operationsOfSymbol.creaseLengthOperations.filter(operation => operation.length > 0),
                      decreaseLengthOperations = operationsOfSymbol.creaseLengthOperations.filter(operation => operation.length < 0).reverse();
                this.postCommitStructure.increaseLengthOperations.splice(this.postCommitStructure.increaseLengthOperations.length-1, 0, ...increaseLengthOperations);
                this.postCommitStructure.decreaseLengthOperations.splice(this.postCommitStructure.decreaseLengthOperations.length-1, 0, ...decreaseLengthOperations);
                creaseAccumulators[0] = increaseLengthOperations.reduce((total, operation) => total+operation.length, 0);
                creaseAccumulators[1] = decreaseLengthOperations.reduce((total, operation) => total-operation.length, 0);
                maximizeMinimumLength(operationsOfSymbol.creaseLengthOperations, 'dstOffset', 0);
                maximizeMinimumLength(operationsOfSymbol.creaseLengthOperations, 'dstOffset', 1);
            }
            if(operationsOfSymbol.replaceOperations) {
                this.postCommitStructure.replaceDataOperations.splice(this.postCommitStructure.replaceDataOperations.length-1, 0, ...operationsOfSymbol.replaceOperations);
                maximizeMinimumLength(operationsOfSymbol.replaceOperations, 'dstOffset', 0);
            }
            if(operationsOfSymbol.copyOperations)
                maximizeMinimumLength(operationsOfSymbol.copyOperations, 'srcOffset', 1);
            this.postCommitStructure.minimumLengths.push({'srcSymbol': symbol, 'forwardLength': minimumLengths[0], 'reverseLength': minimumLengths[1]});
        }
        delete this.preCommitStructure;
        for(const type of ['replaceDataOperations', 'restoreDataOperations'])
            for(const operation of this.postCommitStructure[type]) {
                if(SymbolInternals.areSymbolsEqual(operation.srcSymbol, this.dataSource))
                    delete operation.srcSymbol;
                if(SymbolInternals.areSymbolsEqual(operation.dstSymbol, this.dataRestore))
                    delete operation.dstSymbol;
            }
        for(const key in this.postCommitStructure)
            if(this.postCommitStructure[key].length == 0)
                delete this.postCommitStructure[key];
    }

    /**
     * Applies this diff to a checkout
     * @param {Boolean} reverse Set to true to revert this diff
     * @param {RelocationTable} checkoutRelocation Relocate modal namespaces to become checkout namespaces
     * @param {BasicBackend} dst Apply to another diff or the backend (default)
     * @return {Boolean} True on success
     */
    apply(reverse, checkoutRelocation={}, dst=this.backend) {
        console.assert(this.postCommitStructure);
        // TODO: Validate everything first before applying anything: manifest/release symbols
        // manifest: Check that there are no triples yet and the size is 0
        // release: Check if all remaining triples are marked to be unlinked and the size decreases to 0
        if(dst instanceof Diff) {
            console.assert(!reverse);
            dst.isRecordingFromBackend = false;
        } else {
            for(const [type, link] of [['linkTripleOperations', true], ['unlinkTripleOperations', false]])
                if(this.postCommitStructure[type])
                    for(const operation of this.postCommitStructure[type])
                        if((dst.getTriple(operation.triple.map(symbol => BasicBackend.relocateSymbol(symbol, checkoutRelocation))) == link) != reverse)
                            return false;
            if(this.postCommitStructure.minimumLengths)
                for(const operation of this.postCommitStructure.minimumLengths)
                    if(dst.getLength(BasicBackend.relocateSymbol(operation.srcSymbol, checkoutRelocation)) < operation[((reverse) ? 'reverse' : 'forward')+'Length'])
                        return false;
        }
        if(this.postCommitStructure[(reverse) ? 'releaseSymbols' : 'manifestSymbols'])
            for(const symbol of this.postCommitStructure[(reverse) ? 'releaseSymbols' : 'manifestSymbols'])
                console.assert(dst.manifestSymbol(BasicBackend.relocateSymbol(symbol, checkoutRelocation)));
        if(this.postCommitStructure[(reverse) ? 'decreaseLengthOperations' : 'increaseLengthOperations'])
            for(const operation of (reverse) ? Utils.reversed(this.postCommitStructure.decreaseLengthOperations) : this.postCommitStructure.increaseLengthOperations)
                console.assert(dst.creaseLength(BasicBackend.relocateSymbol(operation.dstSymbol, checkoutRelocation), operation.dstOffset, (reverse) ? -operation.length : operation.length));
        let dataSource = this.dataSource, dataSourceOffset = 0;
        if(dst instanceof Diff) {
            dataSource = dst.dataSource;
            dataSourceOffset = this.backend.getLength(dst.dataSource);
            const length = this.backend.getLength(this.dataSource);
            this.backend.creaseLength(dst.dataSource, dataSourceOffset, length);
            this.backend.replaceData(dst.dataSource, dataSourceOffset, this.dataSource, 0, length);
            if(this.postCommitStructure.restoreDataOperations)
                for(const operation of this.postCommitStructure.restoreDataOperations)
                    dst.saveDataToRestore(this.dataRestore, BasicBackend.relocateSymbol(operation.srcSymbol, checkoutRelocation), operation.srcOffset, operation.length, operation);
        }
        if(this.postCommitStructure[(reverse) ? 'restoreDataOperations' : 'replaceDataOperations']) {
            const replaceOperations = (reverse)
                ? this.postCommitStructure.restoreDataOperations.map(operation => ({
                    'srcSymbol': this.dataRestore,
                    'dstSymbol': BasicBackend.relocateSymbol(operation.srcSymbol, checkoutRelocation),
                    'srcOffset': operation.dstOffset,
                    'dstOffset': operation.srcOffset,
                    'length': operation.length
                }))
                : this.postCommitStructure.replaceDataOperations.map(operation => ({
                    'srcSymbol': (operation.srcSymbol) ? BasicBackend.relocateSymbol(operation.srcSymbol, checkoutRelocation) : dataSource,
                    'dstSymbol': BasicBackend.relocateSymbol(operation.dstSymbol, checkoutRelocation),
                    'srcOffset': (operation.srcSymbol) ? operation.srcOffset : operation.srcOffset+dataSourceOffset,
                    'dstOffset': operation.dstOffset,
                    'length': operation.length
                }));
            console.assert(dst.replaceDataSimultaneously(replaceOperations));
        }
        if(this.postCommitStructure[(reverse) ? 'increaseLengthOperations' : 'decreaseLengthOperations'])
            for(const operation of (reverse) ? Utils.reversed(this.postCommitStructure.increaseLengthOperations) : this.postCommitStructure.decreaseLengthOperations)
                console.assert(dst.creaseLength(BasicBackend.relocateSymbol(operation.dstSymbol, checkoutRelocation), operation.dstOffset, (reverse) ? -operation.length : operation.length));
        for(const [type, link] of [['linkTripleOperations', true], ['unlinkTripleOperations', false]])
            if(this.postCommitStructure[type])
                for(const operation of this.postCommitStructure[type])
                    console.assert(dst.setTriple(operation.triple.map(symbol => BasicBackend.relocateSymbol(symbol, checkoutRelocation)), link != reverse));
        if(this.postCommitStructure[(reverse) ? 'manifestSymbols' : 'releaseSymbols'])
            for(const symbol of this.postCommitStructure[(reverse) ? 'manifestSymbols' : 'releaseSymbols'])
                console.assert(dst.releaseSymbol(BasicBackend.relocateSymbol(symbol, checkoutRelocation)));
        if(dst instanceof Diff)
            dst.isRecordingFromBackend = true;
        return true;
    }

    /**
     * Exports the commited diff as JSON
     * @return {String} json
     */
    encodeJson() {
        console.assert(this.postCommitStructure);
        const exportStructure = Object.assign({}, this.postCommitStructure);
        for(const type of ['dataSource', 'dataRestore']) {
            const length = this.backend.getLength(this[type]);
            if(length > 0)
                exportStructure[type] = Utils.encodeAsHex(new Uint8Array(this.backend.getRawData(this[type]).buffer, 0, Math.ceil(length/8)));
        }
        return JSON.stringify(exportStructure, (type, operations) => {
            switch(type) {
                case 'linkTripleOperations':
                case 'unlinkTripleOperations':
                    return operations.map(operation => {
                        return { 'triple': operation.triple.map(symbol => SymbolInternals.symbolToString(symbol)) };
                    });
                case 'releaseSymbols':
                case 'manifestSymbols':
                    return operations.map(symbol => SymbolInternals.symbolToString(symbol));
                case 'decreaseLengthOperations':
                case 'increaseLengthOperations':
                case 'restoreDataOperations':
                case 'replaceDataOperations':
                case 'minimumLengths':
                    return operations.map(operation => {
                        const result = {
                            'dstSymbol': operation.dstSymbol,
                            'dstOffset': operation.dstOffset,
                            'srcSymbol': operation.srcSymbol,
                            'srcOffset': operation.srcOffset,
                            'length': operation.length,
                            'forwardLength': operation.forwardLength,
                            'reverseLength': operation.reverseLength
                        };
                        if(operation.srcSymbol)
                            result.srcSymbol = SymbolInternals.symbolToString(operation.srcSymbol);
                        if(operation.dstSymbol)
                            result.dstSymbol = SymbolInternals.symbolToString(operation.dstSymbol);
                        return result;
                    });
                default:
                    return operations;
            }
        });
    }

    /**
     * Imports content from JSON. Don't call this method directly, use the constructor instead
     * @param {String} json
     */
    decodeJson(json) {
        console.assert(!this.postCommitStructure);
        this.postCommitStructure = JSON.parse(json, (type, operations) => {
            switch(type) {
                case 'dataSource':
                case 'dataRestore':
                    this[type] = this.backend.createSymbol(this.repositoryNamespace);
                    this.backend.setRawData(this[type], Utils.decodeAsHex(operations));
                    return;
                case 'linkTripleOperations':
                case 'unlinkTripleOperations':
                    for(const operation of operations)
                        operation.triple = operation.triple.map(symbol => SymbolInternals.symbolFromString(symbol));
                    return operations;
                case 'manifestSymbols':
                case 'releaseSymbols':
                    return operations.map(string => SymbolInternals.symbolFromString(string));
                case 'decreaseLengthOperations':
                case 'increaseLengthOperations':
                case 'restoreDataOperations':
                case 'replaceDataOperations':
                case 'minimumLengths':
                    for(const operation of operations) {
                        if(operation.srcSymbol)
                            operation.srcSymbol = SymbolInternals.symbolFromString(operation.srcSymbol);
                        if(operation.dstSymbol)
                            operation.dstSymbol = SymbolInternals.symbolFromString(operation.dstSymbol);
                    }
                    return operations;
                default:
                    return operations;
            }
        });
    }

    /**
     * Loads the diff from the repository. Don't call this method directly, use the constructor instead
     */
    load(symbol) {
        console.assert(!this.postCommitStructure);
        this.symbol = symbol;
        this.postCommitStructure = {
            'manifestSymbols': [],
            'releaseSymbols': [],
            'linkTripleOperations': [],
            'unlinkTripleOperations': [],
            'increaseLengthOperations': [],
            'decreaseLengthOperations': [],
            'replaceDataOperations': [],
            'restoreDataOperations': [],
            'minimumLengths': []
        };
        this.dataSource = this.backend.getPairOptionally(this.symbol, BasicBackend.symbolByName.DataSource);
        this.dataRestore = this.backend.getPairOptionally(this.symbol, BasicBackend.symbolByName.DataRestore);
        for(const [type, attributeName] of [['manifestSymbols', 'ManifestSymbol'], ['releaseSymbols', 'ReleaseSymbol']])
            for(const triple of this.backend.queryTriples(BasicBackend.queryMasks.MMV, [this.symbol, BasicBackend.symbolByName[attributeName], BasicBackend.symbolByName.Void]))
                this.postCommitStructure[type].push(triple[2]);
        for(const [type, attributeName] of [['linkTripleOperations', 'LinkTriple'], ['unlinkTripleOperations', 'UnlinkTriple']])
            for(const triple of this.backend.queryTriples(BasicBackend.queryMasks.MMV, [this.symbol, BasicBackend.symbolByName[attributeName], BasicBackend.symbolByName.Void]))
                this.postCommitStructure[type].push({
                    'symbol': triple[2],
                    'triple': [
                        this.backend.getPairOptionally(triple[2], BasicBackend.symbolByName.Entity),
                        this.backend.getPairOptionally(triple[2], BasicBackend.symbolByName.Attribute),
                        this.backend.getPairOptionally(triple[2], BasicBackend.symbolByName.Value)
                    ]
                });
        for(const [type, attributeName] of [['increaseLengthOperations', 'IncreaseLength'], ['decreaseLengthOperations', 'DecreaseLength']]) {
            for(const triple of this.backend.queryTriples(BasicBackend.queryMasks.MMV, [this.symbol, BasicBackend.symbolByName[attributeName], BasicBackend.symbolByName.Void])) {
                const operation = {
                    'symbol': triple[2],
                    'dstSymbol': this.backend.getPairOptionally(triple[2], BasicBackend.symbolByName.Destination),
                    'dstOffsetSymbol': this.backend.getPairOptionally(triple[2], BasicBackend.symbolByName.DestinationOffset),
                    'lengthSymbol': this.backend.getPairOptionally(triple[2], BasicBackend.symbolByName.Length)
                };
                operation.dstOffset = this.backend.getData(operation.dstOffsetSymbol);
                operation.length = this.backend.getData(operation.lengthSymbol);
                this.postCommitStructure[type].push(operation);
            }
            this.postCommitStructure[type].sort(attributeName == 'IncreaseLength' ? (a, b) => a.dstOffset-b.dstOffset : (a, b) => b.dstOffset-a.dstOffset);
        }
        for(const [type, attributeName] of [['replaceDataOperations', 'ReplaceData'], ['restoreDataOperations', 'RestoreData']])
            for(const triple of this.backend.queryTriples(BasicBackend.queryMasks.MMV, [this.symbol, BasicBackend.symbolByName[attributeName], BasicBackend.symbolByName.Void])) {
                const operation = {
                    'symbol': triple[2],
                    'dstSymbol': this.backend.getPairOptionally(triple[2], BasicBackend.symbolByName.Destination),
                    'dstOffsetSymbol': this.backend.getPairOptionally(triple[2], BasicBackend.symbolByName.DestinationOffset),
                    'srcSymbol': this.backend.getPairOptionally(triple[2], BasicBackend.symbolByName.Source),
                    'srcOffsetSymbol': this.backend.getPairOptionally(triple[2], BasicBackend.symbolByName.SourceOffset),
                    'lengthSymbol': this.backend.getPairOptionally(triple[2], BasicBackend.symbolByName.Length)
                };
                if(SymbolInternals.areSymbolsEqual(operation.dstSymbol, BasicBackend.symbolByName.Void))
                    delete operation.dstSymbol;
                operation.dstOffset = this.backend.getData(operation.dstOffsetSymbol);
                if(SymbolInternals.areSymbolsEqual(operation.srcSymbol, BasicBackend.symbolByName.Void))
                    delete operation.srcSymbol;
                operation.srcOffset = this.backend.getData(operation.srcOffsetSymbol);
                operation.length = this.backend.getData(operation.lengthSymbol);
                this.postCommitStructure[type].push(operation);
            }
        for(const triple of this.backend.queryTriples(BasicBackend.queryMasks.MMV, [this.symbol, BasicBackend.symbolByName.MinimumLength, BasicBackend.symbolByName.Void])) {
            const operation = {
                'symbol': triple[2],
                'srcSymbol': this.backend.getPairOptionally(triple[2], BasicBackend.symbolByName.Source),
                'forwardLengthSymbol': this.backend.getPairOptionally(triple[2], BasicBackend.symbolByName.ForwardLength),
                'reverseLengthSymbol': this.backend.getPairOptionally(triple[2], BasicBackend.symbolByName.ReverseLength)
            };
            operation.forwardLength = this.backend.getData(operation.forwardLengthSymbol);
            operation.reverseLength = this.backend.getData(operation.reverseLengthSymbol);
            this.postCommitStructure.minimumLengths.push(operation);
        }
        for(const key in this.postCommitStructure)
            if(this.postCommitStructure[key].length == 0)
                delete this.postCommitStructure[key];
    }

    /**
     * Writes the diff into the repository
     */
    link() {
        console.assert(this.postCommitStructure && !this.symbol);
        this.symbol = this.backend.createSymbol(this.repositoryNamespace);
        this.backend.setTriple([this.symbol, BasicBackend.symbolByName.DataSource, this.dataSource], true);
        this.backend.setTriple([this.symbol, BasicBackend.symbolByName.DataRestore, this.dataRestore], true);
        for(const [type, attributeName] of [['manifestSymbols', 'ManifestSymbol'], ['releaseSymbols', 'ReleaseSymbol']])
            if(this.postCommitStructure[type])
                for(const symbol of this.postCommitStructure[type]) {
                    this.backend.manifestSymbol(symbol);
                    this.backend.setTriple([this.symbol, BasicBackend.symbolByName[attributeName], symbol], true);
                }
        for(const [type, attributeName] of [['linkTripleOperations', 'LinkTriple'], ['unlinkTripleOperations', 'UnlinkTriple']])
            if(this.postCommitStructure[type])
                for(const operation of this.postCommitStructure[type]) {
                    operation.symbol = this.backend.createSymbol(this.repositoryNamespace);
                    this.backend.setTriple([this.symbol, BasicBackend.symbolByName[attributeName], operation.symbol], true);
                    this.backend.setTriple([operation.symbol, BasicBackend.symbolByName.Entity, operation.triple[0]], true);
                    this.backend.setTriple([operation.symbol, BasicBackend.symbolByName.Attribute, operation.triple[1]], true);
                    this.backend.setTriple([operation.symbol, BasicBackend.symbolByName.Value, operation.triple[2]], true);
                }
        for(const [type, attributeName] of [['increaseLengthOperations', 'IncreaseLength'], ['decreaseLengthOperations', 'DecreaseLength']])
            if(this.postCommitStructure[type])
                for(const operation of this.postCommitStructure[type]) {
                    operation.symbol = this.backend.createSymbol(this.repositoryNamespace);
                    operation.dstOffsetSymbol = this.backend.createSymbol(this.repositoryNamespace);
                    operation.lengthSymbol = this.backend.createSymbol(this.repositoryNamespace);
                    this.backend.setTriple([this.symbol, BasicBackend.symbolByName[attributeName], operation.symbol], true);
                    this.backend.setTriple([operation.symbol, BasicBackend.symbolByName.Destination, operation.dstSymbol], true);
                    this.backend.setTriple([operation.symbol, BasicBackend.symbolByName.DestinationOffset, operation.dstOffsetSymbol], true);
                    this.backend.setTriple([operation.symbol, BasicBackend.symbolByName.Length, operation.lengthSymbol], true);
                    this.backend.setData(operation.dstOffsetSymbol, operation.dstOffset);
                    this.backend.setData(operation.lengthSymbol, operation.length);
                }
        for(const [type, attributeName] of [['replaceDataOperations', 'ReplaceData'], ['restoreDataOperations', 'RestoreData']])
            if(this.postCommitStructure[type])
                for(const operation of this.postCommitStructure[type]) {
                    operation.symbol = this.backend.createSymbol(this.repositoryNamespace);
                    operation.dstOffsetSymbol = this.backend.createSymbol(this.repositoryNamespace);
                    operation.srcOffsetSymbol = this.backend.createSymbol(this.repositoryNamespace);
                    operation.lengthSymbol = this.backend.createSymbol(this.repositoryNamespace);
                    this.backend.setTriple([this.symbol, BasicBackend.symbolByName[attributeName], operation.symbol], true);
                    if(operation.dstSymbol)
                        this.backend.setTriple([operation.symbol, BasicBackend.symbolByName.Destination, operation.dstSymbol], true);
                    this.backend.setTriple([operation.symbol, BasicBackend.symbolByName.DestinationOffset, operation.dstOffsetSymbol], true);
                    if(operation.srcSymbol)
                        this.backend.setTriple([operation.symbol, BasicBackend.symbolByName.Source, operation.srcSymbol], true);
                    this.backend.setTriple([operation.symbol, BasicBackend.symbolByName.SourceOffset, operation.srcOffsetSymbol], true);
                    this.backend.setTriple([operation.symbol, BasicBackend.symbolByName.Length, operation.lengthSymbol], true);
                    this.backend.setData(operation.dstOffsetSymbol, operation.dstOffset);
                    this.backend.setData(operation.srcOffsetSymbol, operation.srcOffset);
                    this.backend.setData(operation.lengthSymbol, operation.length);
                }
        if(this.postCommitStructure.minimumLengths)
            for(const operation of this.postCommitStructure.minimumLengths) {
                operation.symbol = this.backend.createSymbol(this.repositoryNamespace);
                operation.forwardLengthSymbol = this.backend.createSymbol(this.repositoryNamespace);
                operation.reverseLengthSymbol = this.backend.createSymbol(this.repositoryNamespace);
                this.backend.setTriple([this.symbol, BasicBackend.symbolByName.MinimumLength, operation.symbol], true);
                this.backend.setTriple([operation.symbol, BasicBackend.symbolByName.Source, operation.srcSymbol], true);
                this.backend.setTriple([operation.symbol, BasicBackend.symbolByName.ForwardLength, operation.forwardLengthSymbol], true);
                this.backend.setTriple([operation.symbol, BasicBackend.symbolByName.ReverseLength, operation.reverseLengthSymbol], true);
                this.backend.setData(operation.forwardLengthSymbol, operation.forwardLength);
                this.backend.setData(operation.reverseLengthSymbol, operation.reverseLength);
            }
    }

    /**
     * Removes the diff from the repository
     */
    unlink() {
        console.assert(this.postCommitStructure);
        this.backend.unlinkSymbol(this.dataSource);
        this.backend.unlinkSymbol(this.dataRestore);
        if(!this.symbol)
            return;
        for(const type of ['linkTripleOperations', 'unlinkTripleOperations'])
            if(this.postCommitStructure[type])
                for(const operation of this.postCommitStructure[type])
                    this.backend.unlinkSymbol(operation.symbol);
        for(const type of ['increaseLengthOperations', 'decreaseLengthOperations'])
            if(this.postCommitStructure[type])
                for(const operation of this.postCommitStructure[type]) {
                    this.backend.unlinkSymbol(operation.dstOffsetSymbol);
                    this.backend.unlinkSymbol(operation.lengthSymbol);
                    this.backend.unlinkSymbol(operation.symbol);
                }
        for(const type of ['replaceDataOperations', 'restoreDataOperations'])
            if(this.postCommitStructure[type])
                for(const operation of this.postCommitStructure[type]) {
                    this.backend.unlinkSymbol(operation.dstOffsetSymbol);
                    this.backend.unlinkSymbol(operation.srcOffsetSymbol);
                    this.backend.unlinkSymbol(operation.lengthSymbol);
                    this.backend.unlinkSymbol(operation.symbol);
                }
        if(this.postCommitStructure.minimumLengths)
            for(const operation of this.postCommitStructure.minimumLengths) {
                this.backend.unlinkSymbol(operation.forwardLengthSymbol);
                this.backend.unlinkSymbol(operation.reverseLengthSymbol);
                this.backend.unlinkSymbol(operation.symbol);
            }
        this.backend.unlinkSymbol(this.symbol);
        delete this.symbol;
    }
}
