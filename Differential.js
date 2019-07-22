import BasicBackend from './BasicBackend.js';

function getOrCreateEntry(dict, key, value={}) {
    const entry = dict[key];
    return (entry) ? entry : (dict[key] = value);
}

function getOrDefaultEntry(dict, key, value={}) {
    const entry = dict[key];
    return (entry) ? entry : value;
}

/** Differential defining the transformation from one version to another and back.
 * To record the actions from a journal, use the differental as backend and then call commit.
 */
export default class Differential extends BasicBackend {
    /**
     * @param {NativeBackend} backend
     * @param {Identity} repositoryNamespace The namespace identity of the repository
     * @param {RelocationTable} recordingRelocation Relocate recording namespaces to become modal namespaces
     */
    constructor(backend, repositoryNamespace, recordingRelocation={}) {
        super();
        this.backend = backend;
        this.isRecordingFromBackend = true;
        this.repositoryNamespace = repositoryNamespace;
        this.recordingRelocation = recordingRelocation;
        this.operationsBySymbol = {};
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
        // TODO: Use binary search?
        for(let operationIndex = 0; operationIndex < operations.length; ++operationIndex)
            if(intermediateOffset <= operations[operationIndex][key])
                return operationIndex;
        return operations.length;
    }

    addCopyReplaceOperation(mode, operation, operations, operationIndex) {
        if(operations === undefined) {
            const operationsOfSymbol = getOrCreateEntry(this.operationsBySymbol, operation[mode+'Symbol']);
            operations = getOrCreateEntry(operationsOfSymbol, (mode == 'src') ? 'copyOperations' : 'replaceOperations', []);
            operationIndex = this.constructor.getOperationIndex(operations, mode+'Offset', operation[mode+'Offset']);
        }
        operations.splice(operationIndex, 0, operation);
    }

    removeCopyReplaceOperation(mode, operation, operations, operationIndex) {
        if(operations === undefined) {
            const operationsOfSymbol = this.operationsBySymbol[operation[mode+'Symbol']];
            operations = operationsOfSymbol[(mode == 'src') ? 'copyOperations' : 'replaceOperations'];
            operationIndex = operations.indexOf(operation);
        }
        operations.splice(operationIndex, 1);
        if(operations.length == 0 && BasicBackend.namespaceOfSymbol(operation[mode+'Symbol']) == this.repositoryNamespace)
            this.backend.unlinkSymbol(operation[mode+'Symbol']);
    }

    cutAndShiftReplaceOperations(operations, mode, intermediateOffset, decreaseLength, shift) {
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
                    'dstSymbol': operation.dstSymbol,
                    'srcSymbol': operation.srcSymbol,
                    'length': endLength,
                    [mode+'Offset']: intermediateEndOffset+shift,
                    [complementaryMode+'Offset']: operation[complementaryMode+'Offset']+operation.length-endLength // +intermediateEndOffset-operation[mode+'Offset']
                };
                addCopyReplaceOperations.push(secondPart);
                operation.length = intermediateOffset-operation[mode+'Offset'];
            } else {
                const operationsBeginIsInside = (intermediateOffset <= operation[mode+'Offset'] && operation[mode+'Offset'] <= intermediateEndOffset),
                      operationsEndIsInside = (intermediateOffset <= operationEndOffset && operationEndOffset <= intermediateEndOffset);
                if(operationsBeginIsInside || operationsEndIsInside) {
                    if(operationsBeginIsInside) {
                        if(operationsEndIsInside) {
                            this.removeCopyReplaceOperation(mode, operation, operations, operationIndex--);
                            this.removeCopyReplaceOperation(complementaryMode, operation);
                        } else {
                            operation[mode+'Offset'] = intermediateEndOffset+shift;
                            operation[complementaryMode+'Offset'] += operation.length-endLength;
                            operation.length = endLength;
                            if(complementaryMode == 'src') {
                                const copyOperations = this.operationsBySymbol[operation.srcSymbol].copyOperations,
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

    mergeReplaceOperations(operations, mode, intermediateOffset) {
        // TODO: Take possible DAG-like overlap into account if(mode == 'src')
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
               firstOperation[complementaryMode+'Symbol'] == secondOperation[complementaryMode+'Symbol'] &&
               firstOperation[complementaryMode+'Offset']+firstOperation.length == secondOperation[complementaryMode+'Offset'] &&
               firstOperation.srcSymbol == secondOperation.srcSymbol) {
                firstOperation.length += secondOperation.length;
                this.removeCopyReplaceOperation(mode, secondOperation, operations, operationIndex--);
                this.removeCopyReplaceOperation(complementaryMode, secondOperation);
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

    saveDataToRestore(srcSymbol, srcOffset, length) {
        console.assert(this.isRecordingFromBackend && srcOffset+length <= this.backend.getLength(srcSymbol));
        const operationsOfSymbol = getOrCreateEntry(this.operationsBySymbol, srcSymbol),
              creaseLengthOperations = getOrDefaultEntry(operationsOfSymbol, 'creaseLengthOperations', []);
        if(operationsOfSymbol.manifestOrRelease == 'manifest')
            return;
        let [intermediateOffset, operationIndex] = this.constructor.getIntermediateOffset(creaseLengthOperations, srcOffset),
            decreaseAccumulator = intermediateOffset-srcOffset,
            dstSymbol = operationsOfSymbol.restoreSymbol;
        const addSlice = (length) => {
            if(length <= 0)
                return;
            let dstOffset = (dstSymbol) ? this.backend.getLength(dstSymbol) : 0,
                replaceOperations = (dstSymbol) ? this.operationsBySymbol[dstSymbol].replaceOperations : [],
                replaceOperationIndex = 0;
            if(!dstSymbol) {
                operationsOfSymbol.restoreSymbol = dstSymbol = this.backend.createSymbol(this.repositoryNamespace);
                this.operationsBySymbol[dstSymbol] = {'replaceOperations': []};
                replaceOperations = this.operationsBySymbol[dstSymbol].replaceOperations;
            } else
                for(; replaceOperationIndex < replaceOperations.length; ++replaceOperationIndex)
                    if(intermediateOffset <= replaceOperations[replaceOperationIndex].srcOffset) {
                        dstOffset = replaceOperations[replaceOperationIndex].dstOffset;
                        break;
                    }
            this.backend.creaseLength(dstSymbol, dstOffset, length);
            this.backend.writeData(dstSymbol, dstOffset, length, this.backend.readData(srcSymbol, intermediateOffset-decreaseAccumulator, length));
            const operation = {
                'dstSymbol': dstSymbol,
                'dstOffset': dstOffset,
                'srcSymbol': srcSymbol,
                'srcOffset': intermediateOffset,
                'length': length
            };
            this.addCopyReplaceOperation('src', operation);
            this.addCopyReplaceOperation('dst', operation, replaceOperations, replaceOperationIndex++);
            for(; replaceOperationIndex < replaceOperations.length; ++replaceOperationIndex)
                replaceOperations[replaceOperationIndex].dstOffset += length;
            this.mergeReplaceOperations(replaceOperations, 'dst', dstOffset);
            this.mergeReplaceOperations(replaceOperations, 'dst', dstOffset+length);
        };
        const avoidRestoreOperations = (length) => {
            if(length <= 0)
                return;
            if(dstSymbol) {
                const replaceOperations = this.operationsBySymbol[dstSymbol].replaceOperations;
                for(let replaceOperationIndex = 0; length > 0 && replaceOperationIndex < replaceOperations.length; ++replaceOperationIndex) {
                    const operation = replaceOperations[replaceOperationIndex];
                    if(operation.srcOffset+operation.length <= intermediateOffset)
                        continue;
                    if(intermediateOffset+length <= operation.srcOffset)
                        break;
                    const sliceLength = operation.srcOffset-intermediateOffset;
                    addSlice(sliceLength);
                    length -= sliceLength+operation.length; // operation.srcOffset+operation.length-intermediateOffset;
                    intermediateOffset = operation.srcOffset+operation.length;
                }
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
    }

    queryTriples(queryMask, triple) {
        console.assert(this.isRecordingFromBackend);
        return this.backend.queryTriples(queryMask, triple);
    }

    getLength(symbol) {
        console.assert(this.isRecordingFromBackend);
        return this.backend.getLength(symbol);
    }

    manifestSymbol(symbol) {
        console.assert(this.operationsBySymbol);
        if(this.isRecordingFromBackend && !this.backend.manifestSymbol(symbol))
            return false;
        symbol = BasicBackend.relocateSymbol(symbol, this.recordingRelocation);
        const operationsOfSymbol = getOrCreateEntry(this.operationsBySymbol, symbol);
        if(operationsOfSymbol.manifestOrRelease == 'release')
            delete operationsOfSymbol.manifestOrRelease;
        else
            operationsOfSymbol.manifestOrRelease = 'manifest';
        return true;
    }

    releaseSymbol(symbol) {
        console.assert(this.operationsBySymbol);
        if(this.isRecordingFromBackend && !this.backend.releaseSymbol(symbol))
            return false;
        symbol = BasicBackend.relocateSymbol(symbol, this.recordingRelocation);
        const operationsOfSymbol = getOrCreateEntry(this.operationsBySymbol, symbol);
        if(operationsOfSymbol.manifestOrRelease == 'manifest')
            delete operationsOfSymbol.manifestOrRelease;
        else
            operationsOfSymbol.manifestOrRelease = 'release';
        return true;
    }

    setTriple(triple, link) {
        console.assert(this.operationsBySymbol);
        if(this.isRecordingFromBackend && !this.backend.setTriple(triple, link))
            return false;
        triple = triple.map(symbol => BasicBackend.relocateSymbol(symbol, this.recordingRelocation));
        const operationsOfSymbol = getOrCreateEntry(this.operationsBySymbol, triple[0]),
              attributeDict = getOrCreateEntry(operationsOfSymbol, 'tripleOperations'),
              valueDict = getOrCreateEntry(attributeDict, triple[1]),
              isLinked = valueDict[triple[2]];
        if(isLinked === link)
            return false;
        if(isLinked === undefined)
            valueDict[triple[2]] = link;
        else
            delete valueDict[triple[2]];
        return true;
    }

    creaseLength(dstSymbol, dstOffset, length) {
        console.assert(this.operationsBySymbol);
        if(length == 0)
            return true;
        if(this.isRecordingFromBackend) {
            const dataLength = this.backend.getLength(dstSymbol);
            if(length < 0) {
                if(dstOffset-length > dataLength)
                    return false;
            } else if(dstOffset > dataLength)
                return false;
        }
        const originalDstSymbol = dstSymbol, originalLength = length;
        dstSymbol = BasicBackend.relocateSymbol(dstSymbol, this.recordingRelocation);
        const operationsOfSymbol = getOrCreateEntry(this.operationsBySymbol, dstSymbol),
              creaseLengthOperations = getOrCreateEntry(operationsOfSymbol, 'creaseLengthOperations', []);
        let operationAtIntermediateOffset,
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
                operationId = operation.id;
                ++creaseLengthOperationsToDelete;
            }
            if(this.isRecordingFromBackend)
                this.saveDataToRestore(dstSymbol, dstOffset, -length);
            length = increaseAccumulator-decreaseAccumulator;
            increaseAccumulator = 0;
            let copyOperationIndex = 0;
            const copyOperations = getOrDefaultEntry(operationsOfSymbol, 'copyOperations', []),
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
                            'dstSymbol': copyOperation.dstSymbol,
                            'srcSymbol': copyOperation.srcSymbol,
                            'length': endLength,
                            'srcOffset': srcOffset,
                            'dstOffset': copyOperation.dstOffset+copyOperation.length-endLength
                        };
                        copyOperation.length -= endLength;
                        this.addCopyReplaceOperation('dst', secondPart);
                        this.addCopyReplaceOperation('src', secondPart);
                        // this.cutAndShiftReplaceOperations(copyOperations, 'src', srcOffset, 0, 0);
                    } else
                        copyOperation.srcOffset += Math.max(0, length)-increaseAccumulator;
                    if(this.mergeReplaceOperations(copyOperations, 'src', copyOperation.srcOffset))
                        --copyOperationIndex;
                }
            }
            creaseLengthOperations.splice(operationIndex, creaseLengthOperationsToDelete);
            const annihilated = increaseAccumulator-Math.max(0, length);
            this.shiftIntermediateOffsets(creaseLengthOperations, operationIndex, -annihilated);
            this.cutAndShiftReplaceOperations(operationsOfSymbol.replaceOperations, 'dst', intermediateOffset, decreaseAccumulator, -annihilated);
            this.mergeReplaceOperations(operationsOfSymbol.replaceOperations, 'dst', intermediateOffset);
            intermediateOffset = nextIntermediateOffset;
        } else {
            let mergeAccumulator = 0;
            if(operationAtIntermediateOffset) {
                if(operationAtIntermediateOffset.length < 0) {
                    const annihilate = Math.min(-operationAtIntermediateOffset.length, length);
                    if(annihilate === -operationAtIntermediateOffset.length) {
                        intermediateOffset = operationAtIntermediateOffset.dstOffset;
                        creaseLengthOperations.splice(--operationIndex, 1);
                    } else
                        operationAtIntermediateOffset.length += annihilate;
                    length -= annihilate;
                } else {
                    operationAtIntermediateOffset.length += length;
                    mergeAccumulator = length;
                }
            }
            if(length > 0) {
                this.shiftIntermediateOffsets(creaseLengthOperations, operationIndex, length);
                this.cutAndShiftReplaceOperations(operationsOfSymbol.copyOperations, 'src', intermediateOffset, 0, length);
                this.cutAndShiftReplaceOperations(operationsOfSymbol.replaceOperations, 'dst', intermediateOffset, 0, length);
                length -= mergeAccumulator;
            }
        }
        if(length != 0)
            creaseLengthOperations.splice(operationIndex, 0, {
                'dstSymbol': dstSymbol,
                'dstOffset': intermediateOffset,
                'length': length
            });
        return !this.isRecordingFromBackend || this.backend.creaseLength(originalDstSymbol, dstOffset, originalLength);
    }

    replaceDataSimultaneously(replaceOperations) {
        console.assert(this.operationsBySymbol);
        if(this.isRecordingFromBackend)
            for(const operation of replaceOperations)
                if(operation.length < 0 ||
                   operation.dstOffset+operation.length > this.backend.getLength(operation.dstSymbol) ||
                   operation.srcOffset+operation.length > this.backend.getLength(operation.srcSymbol))
                    return false;
        const context = {},
              cutReplaceOperations = [], addCopyReplaceOperations = [], mergeReplaceOperations = [],
              addSlice = (srcSymbol, srcOffset, length) => {
            const operationsOfSymbol = getOrDefaultEntry(this.operationsBySymbol, srcSymbol, {}),
                  srcCreaseLengthOperations = getOrDefaultEntry(operationsOfSymbol, 'creaseLengthOperations', []);
            for(let operationIndex = 0; operationIndex < srcCreaseLengthOperations.length; ++operationIndex) {
                const operation = srcCreaseLengthOperations[operationIndex];
                if(operation.dstOffset+Math.abs(operation.length) <= srcOffset)
                    continue;
                if(operation.dstOffset >= srcOffset+length)
                    break;
                if(operation.length > 0) {
                    console.error('Tried to copy data from uninitialized increased slice');
                    return false;
                }
            }
            if(context.dstSymbol != srcSymbol || context.dstIntermediateOffset != srcOffset)
                addCopyReplaceOperations.push({
                    'dstSymbol': context.dstSymbol,
                    'dstOffset': context.dstIntermediateOffset,
                    'srcSymbol': srcSymbol,
                    'srcOffset': srcOffset,
                    'length': length
                });
            context.dstIntermediateOffset += length;
            context.srcIntermediateOffset += length;
            return true;
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
                    if(!addSlice(context.srcSymbol, context.srcIntermediateOffset, sliceLength))
                        return false;
                    length -= sliceLength;
                }
                const sliceStartOffset = Math.max(context.srcIntermediateOffset, operation.dstOffset),
                      sliceEndOffset = Math.min(context.srcIntermediateOffset+length, operation.dstOffset+operation.length);
                if(sliceStartOffset < sliceEndOffset) {
                    const sliceLength = sliceEndOffset-sliceStartOffset;
                    if(!addSlice(operation.srcSymbol, operation.srcOffset+context.srcIntermediateOffset-operation.dstOffset, sliceLength))
                        return false;
                    length -= sliceLength;
                }
                if(operation.dstOffset+operation.length <= context.srcIntermediateOffset)
                    ++context.srcReplaceOperationIndex;
            }
            return length == 0 || addSlice(context.srcSymbol, context.srcIntermediateOffset, length);
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
                    if(!handleSlice(sliceLength))
                        return false;
                    length -= sliceLength;
                    context[contextSlot+'IntermediateOffset'] = operation.dstOffset-operation.length;
                }
            }
            return length == 0 || handleSlice(length);
        }, skipSrcDecreaseOperations = skipDecreaseOperations.bind(this, 'src', backTrackSrc),
           skipDstDecreaseOperations = skipDecreaseOperations.bind(this, 'dst', skipSrcDecreaseOperations);
        for(const operation of replaceOperations) {
            if(operation.length <= 0 || (operation.dstSymbol == operation.srcSymbol && operation.dstOffset == operation.srcOffset))
                continue;
            for(const mode of ['dst', 'src']) {
                context[mode+'Symbol'] = BasicBackend.relocateSymbol(operation[mode+'Symbol'], this.recordingRelocation);
                context[mode+'OperationsOfSymbol'] = getOrDefaultEntry(this.operationsBySymbol, context[mode+'Symbol'], {});
                context[mode+'CreaseLengthOperations'] = getOrDefaultEntry(context[mode+'OperationsOfSymbol'], 'creaseLengthOperations', []);
                [context[mode+'IntermediateOffset'], context[mode+'OperationIndex']] = this.constructor.getIntermediateOffset(context[mode+'CreaseLengthOperations'], operation[mode+'Offset']);
            }
            context.srcReplaceOperations = getOrDefaultEntry(context.srcOperationsOfSymbol, 'replaceOperations', []);
            context.srcReplaceOperationIndex = 0;
            mergeReplaceOperations.push({'dstSymbol': context.dstSymbol, 'dstOffset': context.dstIntermediateOffset});
            if(!skipDstDecreaseOperations(operation.length))
                return false;
            mergeReplaceOperations.push({'dstSymbol': context.dstSymbol, 'dstOffset': context.dstIntermediateOffset});
        }
        if(this.isRecordingFromBackend)
            for(const operation of replaceOperations)
                this.saveDataToRestore(BasicBackend.relocateSymbol(operation.dstSymbol, this.recordingRelocation), operation.dstOffset, operation.length);
        for(const operation of cutReplaceOperations)
            this.cutAndShiftReplaceOperations(getOrCreateEntry(this.operationsBySymbol, operation.dstSymbol).replaceOperations, 'dst', operation.dstOffset, operation.length, 0);
        for(const operation of addCopyReplaceOperations) {
            this.addCopyReplaceOperation('dst', operation);
            this.addCopyReplaceOperation('src', operation);
        }
        for(const operation of mergeReplaceOperations)
            this.mergeReplaceOperations(getOrCreateEntry(this.operationsBySymbol, operation.dstSymbol).replaceOperations, 'dst', operation.dstOffset);
        return !this.isRecordingFromBackend || this.backend.replaceDataSimultaneously(replaceOperations);
    }

    writeData(dstSymbol, dstOffset, length, dataBytes) {
        console.assert(this.operationsBySymbol);
        dstSymbol = BasicBackend.relocateSymbol(dstSymbol, this.recordingRelocation);
        const srcSymbol = this.backend.createSymbol(this.repositoryNamespace);
        this.backend.setRawData(srcSymbol, dataBytes, length);
        return this.replaceData(dstSymbol, dstOffset, srcSymbol, 0, length);
    }

    /**
     * Scan through all internal structures and check their integrity
     * @return {Boolean} True on success
     */
    validateIntegrity() {
        for(const symbol in this.operationsBySymbol) {
            const operationsOfSymbol = this.operationsBySymbol[symbol];
            if(operationsOfSymbol.creaseLengthOperations)
                for(let i = 1; i < operationsOfSymbol.creaseLengthOperations.length; ++i)
                    if(operationsOfSymbol.creaseLengthOperations[i-1].dstOffset >= operationsOfSymbol.creaseLengthOperations[i].dstOffset)
                        return false;
            if(operationsOfSymbol.copyOperations)
                for(let i = 1; i < operationsOfSymbol.copyOperations.length; ++i)
                    if(operationsOfSymbol.copyOperations[i-1].srcOffset > operationsOfSymbol.copyOperations[i].srcOffset)
                        return false;
            if(operationsOfSymbol.replaceOperations)
                for(let i = 1; i < operationsOfSymbol.replaceOperations.length; ++i)
                    if(operationsOfSymbol.replaceOperations[i-1].dstOffset >= operationsOfSymbol.replaceOperations[i].dstOffset)
                        return false;
        }
        // TODO
        return true;
    }

    /**
     * Optimizes the internal structures so that they are ready to be applied, but no further recording can happen afterwards.
     */
    commit() {
        if(!this.operationsBySymbol)
            return false;
        this.operationsByType = {
            'manifestSymbols': [],
            'increaseLengthOperations': [],
            'replaceDataOperations': [],
            'restoreDataOperations': [],
            'decreaseLengthOperations': [],
            'tripleOperations': [],
            'releaseSymbols': []
        };
        for(const symbol in this.operationsBySymbol) {
            const operationsOfSymbol = this.operationsBySymbol[symbol];
            if(operationsOfSymbol.manifestOrRelease)
                this.operationsByType[(operationsOfSymbol.manifestOrRelease == 'manifest') ? 'manifestSymbols' : 'releaseSymbols'].push(symbol);
            if(operationsOfSymbol.creaseLengthOperations) {
                this.operationsByType.decreaseLengthOperations.splice(
                    this.operationsByType.decreaseLengthOperations.length-1, 0,
                    ...operationsOfSymbol.creaseLengthOperations.filter(operation => operation.length < 0).reverse()
                );
                this.operationsByType.increaseLengthOperations.splice(
                    this.operationsByType.increaseLengthOperations.length-1, 0,
                    ...operationsOfSymbol.creaseLengthOperations.filter(operation => operation.length > 0)
                );
            }
            if(operationsOfSymbol.copyOperations)
                for(const operation of operationsOfSymbol.copyOperations)
                    if(BasicBackend.namespaceOfSymbol(operation.dstSymbol) == this.repositoryNamespace)
                        this.operationsByType.restoreDataOperations.push(operation);
            if(operationsOfSymbol.replaceOperations && BasicBackend.namespaceOfSymbol(symbol) != this.repositoryNamespace)
                for(const operation of operationsOfSymbol.replaceOperations)
                    this.operationsByType.replaceDataOperations.push(operation);
            const triple = [symbol];
            if(operationsOfSymbol.tripleOperations)
                for(triple[1] in operationsOfSymbol.tripleOperations)
                    for(triple[2] in operationsOfSymbol.tripleOperations[triple[1]])
                        this.operationsByType.tripleOperations.push([[...triple], operationsOfSymbol.tripleOperations[triple[1]][triple[2]]]);
        }
        delete this.operationsBySymbol;
        // TODO: Optimize data source and data restore
        return true;
    }

    /**
     * Applies this differential to a checkout
     * @param {Boolean} reverse Set to true to revert this differential
     * @param {RelocationTable} checkoutRelocation Relocate modal namespaces to become checkout namespaces
     * @param {BasicBackend} dst Apply to another differential or the backend (default)
     * @return {Boolean} True on success
     */
    apply(reverse, checkoutRelocation={}, dst=this.backend) {
        // TODO: Validate everything first before applying anything (atomic transactions)
        for(const symbol of this.operationsByType[(reverse) ? 'releaseSymbols' : 'manifestSymbols'])
            dst.manifestSymbol(BasicBackend.relocateSymbol(symbol, checkoutRelocation));
        for(const operation of (reverse) ? Array.reversed(this.operationsByType.decreaseLengthOperations) : this.operationsByType.increaseLengthOperations)
            if(!dst.creaseLength(BasicBackend.relocateSymbol(operation.dstSymbol, checkoutRelocation), operation.dstOffset, (reverse) ? -operation.length : operation.length))
                return false;
        const replaceOperations = (reverse)
            ? this.operationsByType.restoreDataOperations.map(operation => { return {
                'srcSymbol': BasicBackend.relocateSymbol(operation.dstSymbol, checkoutRelocation),
                'dstSymbol': BasicBackend.relocateSymbol(operation.srcSymbol, checkoutRelocation),
                'srcOffset': operation.dstOffset,
                'dstOffset': operation.srcOffset,
                'length': operation.length
            };})
            : this.operationsByType.replaceDataOperations.map(operation => { return {
                'srcSymbol': BasicBackend.relocateSymbol(operation.srcSymbol, checkoutRelocation),
                'dstSymbol': BasicBackend.relocateSymbol(operation.dstSymbol, checkoutRelocation),
                'srcOffset': operation.srcOffset,
                'dstOffset': operation.dstOffset,
                'length': operation.length
            };});
        if(!dst.replaceDataSimultaneously(replaceOperations))
            return false;
        for(const operation of (reverse) ? Array.reversed(this.operationsByType.increaseLengthOperations) : this.operationsByType.decreaseLengthOperations)
            if(!dst.creaseLength(BasicBackend.relocateSymbol(operation.dstSymbol, checkoutRelocation), operation.dstOffset, (reverse) ? -operation.length : operation.length))
                return false;
        for(const [triple, linked] of this.operationsByType.tripleOperations)
            if(!dst.setTriple(triple.map(symbol => BasicBackend.relocateSymbol(symbol, checkoutRelocation)), linked != reverse))
                return false;
        for(const symbol of this.operationsByType[(reverse) ? 'manifestSymbols' : 'releaseSymbols'])
            if(!dst.releaseSymbol(BasicBackend.relocateSymbol(symbol, checkoutRelocation)))
                return false;
        return true;
    }
}
