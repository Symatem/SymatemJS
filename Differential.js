import BasicBackend from './BasicBackend.js';

export default class Differential extends BasicBackend {
    constructor(ontology, repositoryNamespace, recordingRelocation={}) {
        super();
        this.ontology = ontology;
        this.repositoryNamespace = repositoryNamespace;
        this.recordingRelocation = recordingRelocation;
        this.operationsBySymbol = {};
    }

    queryTriples(queryMask, triple) {
        return this.ontology.queryTriples(queryMask, triple);
    }

    getLength(symbol) {
        return this.ontology.getLength(symbol);
    }

    getOrCreateEntry(dict, key, value={}) {
        const entry = dict[key];
        return (entry) ? entry : (dict[key] = value);
    }

    manifestSymbol(symbol) {
        if(!this.ontology.manifestSymbol(symbol))
            return false;
        symbol = BasicBackend.relocateSymbol(symbol, this.recordingRelocation);
        const operationsOfSymbol = this.getOrCreateEntry(this.operationsBySymbol, symbol);
        if(operationsOfSymbol.manifestOrRelease == 'release')
            delete operationsOfSymbol.manifestOrRelease;
        else
            operationsOfSymbol.manifestOrRelease = 'manifest';
        return true;
    }

    releaseSymbol(symbol) {
        if(!this.ontology.releaseSymbol(symbol))
            return false;
        symbol = BasicBackend.relocateSymbol(symbol, this.recordingRelocation);
        const operationsOfSymbol = this.getOrCreateEntry(this.operationsBySymbol, symbol);
        if(operationsOfSymbol.manifestOrRelease == 'manifest')
            delete operationsOfSymbol.manifestOrRelease;
        else
            operationsOfSymbol.manifestOrRelease = 'release';
        return true;
    }

    setTriple(triple, link) {
        if(!this.ontology.setTriple(triple, link))
            return false;
        triple = triple.map(symbol => BasicBackend.relocateSymbol(symbol, this.recordingRelocation));
        const operationsOfSymbol = this.getOrCreateEntry(this.operationsBySymbol, triple[0]),
              attributeDict = this.getOrCreateEntry(operationsOfSymbol, 'tripleOperations'),
              valueDict = this.getOrCreateEntry(attributeDict, triple[1]),
              isLinked = valueDict[triple[2]];
        if(isLinked === link)
            return false;
        if(isLinked === undefined)
            valueDict[triple[2]] = link;
        else
            delete valueDict[triple[2]];
        return true;
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

    addReplaceOperation(mode, operation, operations, operationIndex) {
        if(operations === undefined) {
            const operationsOfSymbol = this.getOrCreateEntry(this.operationsBySymbol, operation[mode+'Symbol']);
            operations = this.getOrCreateEntry(operationsOfSymbol, (mode == 'src') ? 'copyOperations' : 'replaceOperations', []);
            operationIndex = this.constructor.getOperationIndex(operations, mode+'Offset', operation[mode+'Offset']);
        }
        operations.splice(operationIndex, 0, operation);
    }

    removeReplaceOperation(mode, operation, operations, operationIndex) {
        if(operations === undefined) {
            const operationsOfSymbol = this.operationsBySymbol[operation[mode+'Symbol']];
            operations = operationsOfSymbol[(mode == 'src') ? 'copyOperations' : 'replaceOperations'];
            operationIndex = operations.indexOf(operation);
        }
        operations.splice(operationIndex, 1);
    }

    cutAndShiftReplaceOperations(operations, mode, intermediateOffset, decreaseLength, shift) {
        const complementaryMode = (mode == 'dst') ? 'src' : 'dst';
        if(!operations)
            return;
        const intermediateEndOffset = intermediateOffset+decreaseLength;
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
                this.addReplaceOperation(mode, secondPart, operations, ++operationIndex);
                this.addReplaceOperation(complementaryMode, secondPart);
                operation.length = intermediateOffset-operation[mode+'Offset'];
            } else {
                const operationsBeginIsInside = (intermediateOffset <= operation[mode+'Offset'] && operation[mode+'Offset'] <= intermediateEndOffset),
                      operationsEndIsInside = (intermediateOffset <= operationEndOffset && operationEndOffset <= intermediateEndOffset);
                if(operationsBeginIsInside || operationsEndIsInside) {
                    if(operationsBeginIsInside) {
                        if(operationsEndIsInside) {
                            this.removeReplaceOperation(mode, operation, operations, operationIndex--);
                            this.removeReplaceOperation(complementaryMode, operation);
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
                                    [copyOperations[dstIndex], copyOperations[srcIndex]] = [copyOperations[srcIndex], copyOperations[dstIndex]];
                            }
                        }
                    } else
                        operation.length = intermediateOffset-operation[mode+'Offset'];
                } else if(intermediateEndOffset <= operation[mode+'Offset'])
                    operation[mode+'Offset'] += shift;
            }
        }
    }

    mergeReplaceOperations(operations, mode, intermediateOffset) {
        const complementaryMode = (mode == 'dst') ? 'src' : 'dst';
        if(!operations)
            return;
        for(let operationIndex = 1; operationIndex < operations.length; ++operationIndex) {
            const secondOperation = operations[operationIndex];
            if(secondOperation[mode+'Offset'] < intermediateOffset)
                continue;
            const firstOperation = operations[operationIndex-1];
            if(secondOperation[mode+'Offset'] == intermediateOffset &&
               firstOperation[mode+'Offset']+firstOperation.length == secondOperation[mode+'Offset'] &&
               firstOperation[complementaryMode+'Offset']+firstOperation.length == secondOperation[complementaryMode+'Offset'] &&
               firstOperation.srcSymbol == secondOperation.srcSymbol) {
                firstOperation.length += secondOperation.length;
                this.removeReplaceOperation(mode, secondOperation, operations, operationIndex--);
                this.removeReplaceOperation(complementaryMode, secondOperation);
            }
            break;
        }
    }

    shiftIntermediateOffsets(creaseLengthOperations, operationIndex, shift) {
        if(shift != 0)
            for(let i = operationIndex; i < creaseLengthOperations.length; ++i)
                creaseLengthOperations[i].dstOffset += shift;
    }

    saveDataToRestore(symbol, offset, length) {
        symbol = BasicBackend.relocateSymbol(symbol, this.recordingRelocation);
        console.assert(offset+length <= this.ontology.getLength(symbol));
        const operationsOfSymbol = this.getOrCreateEntry(this.operationsBySymbol, symbol),
              creaseLengthOperations = (operationsOfSymbol.creaseLengthOperations) ? operationsOfSymbol.creaseLengthOperations : [],
              replaceOperations = (operationsOfSymbol.replaceOperations) ? operationsOfSymbol.replaceOperations : [];
        const addSlice = (length) => {
            const dataBytes = this.ontology.readData(symbol, intermediateOffset, length),
                  storeSymbol = this.ontology.createSymbol(this.repositoryNamespace);
            this.ontology.writeData(storeSymbol, 0, length, dataBytes);
            // TODO
            return true;
        };
        let replaceOperationIndex = 0;
        const avoidReplaceOperations = (length) => {
            for(; length > 0 && replaceOperationIndex < replaceOperations.length; ++replaceOperationIndex) {
                const operation = replaceOperations[replaceOperationIndex];
                if(operation.dstOffset+operation.length <= intermediateOffset)
                    continue;
                if(intermediateOffset+length <= operation.dstOffset)
                    break;
                const sliceLength = operation.dstOffset-intermediateOffset;
                if(sliceLength > 0) {
                    if(!addSlice(sliceLength))
                        return false;
                    length -= sliceLength;
                } else
                    length -= operation.dstOffset+operation.length-intermediateOffset;
                intermediateOffset = operation.dstOffset+operation.length;
            }
            return length <= 0 || addSlice(length);
        };
        let [intermediateOffset, operationIndex] = this.constructor.getIntermediateOffset(creaseLengthOperations, offset);
        if(operationIndex > 0 && intermediateOffset < creaseLengthOperations[operationIndex-1].dstOffset+creaseLengthOperations[operationIndex-1].length)
            intermediateOffset = creaseLengthOperations[--operationIndex].dstOffset;
        for(; operationIndex < creaseLengthOperations.length && length > 0; ++operationIndex) {
            const operation = creaseLengthOperations[operationIndex];
            if(intermediateOffset+length <= operation.dstOffset)
                break;
            const sliceLength = Math.min(length, operation.dstOffset-intermediateOffset);
            if(sliceLength == 0 || !avoidReplaceOperations(sliceLength))
                return false;
            length -= sliceLength+Math.max(0, operation.length);
            intermediateOffset = operation.dstOffset+Math.abs(operation.length);
        }
        return length <= 0 || avoidReplaceOperations(length);
    }

    creaseLength(dstSymbol, dstOffset, length) {
        if(length == 0)
            return;
        if(length < 0)
            this.saveDataToRestore(dstSymbol, dstOffset, -length);
        if(!this.ontology.creaseLength(dstSymbol, dstOffset, length))
            return false;
        dstSymbol = BasicBackend.relocateSymbol(dstSymbol, this.recordingRelocation);
        const operationsOfSymbol = this.getOrCreateEntry(this.operationsBySymbol, dstSymbol),
              creaseLengthOperations = this.getOrCreateEntry(operationsOfSymbol, 'creaseLengthOperations', []);
        let operationAtIntermediateOffset,
            [intermediateOffset, operationIndex] = this.constructor.getIntermediateOffset(creaseLengthOperations, dstOffset);
        if(operationIndex > 0) {
            operationAtIntermediateOffset = creaseLengthOperations[operationIndex-1];
            if(operationAtIntermediateOffset.dstOffset+Math.abs(operationAtIntermediateOffset.length) < intermediateOffset)
                operationAtIntermediateOffset = undefined;
        }
        if(length < 0) {
            let decreaseAccumulator = -length,
                increaseAccumulator = 0,
                annihilationAccumulator = 0;
            if(operationAtIntermediateOffset) {
                if(operationAtIntermediateOffset.length < 0)
                    intermediateOffset = operationAtIntermediateOffset.dstOffset;
                --operationIndex;
            }
            const firstOperation = (operationAtIntermediateOffset) ? operationAtIntermediateOffset : creaseLengthOperations[operationIndex],
                  minOperationIndex = operationIndex;
            for(; operationIndex < creaseLengthOperations.length; ++operationIndex) {
                const operation = creaseLengthOperations[operationIndex];
                if(intermediateOffset+decreaseAccumulator < operation.dstOffset)
                    break;
                if(operation.length < 0)
                    decreaseAccumulator -= operation.length;
            }
            length = -decreaseAccumulator;
            for(--operationIndex; operationIndex >= minOperationIndex; --operationIndex) {
                const operation = creaseLengthOperations[operationIndex];
                if(intermediateOffset+decreaseAccumulator < operation.dstOffset)
                    break;
                if(operation.length > 0) {
                    increaseAccumulator += operation.length;
                    const annihilate = Math.min(-length, operation.length);
                    this.cutAndShiftReplaceOperations(operationsOfSymbol.copyOperations, 'src', operation.dstOffset, 0, -annihilate);
                    // this.mergeReplaceOperations(operationsOfSymbol.copyOperations, 'src', operation.dstOffset); // TODO
                    annihilationAccumulator += annihilate;
                    length += annihilate;
                }
                creaseLengthOperations.splice(operationIndex, 1);
                operationId = operation.id;
            }
            ++operationIndex; // operationIndex = minOperationIndex;
            length = increaseAccumulator-decreaseAccumulator;
            console.assert(annihilationAccumulator == increaseAccumulator-Math.max(0, length));
            this.shiftIntermediateOffsets(creaseLengthOperations, operationIndex, -annihilationAccumulator);
            this.cutAndShiftReplaceOperations(operationsOfSymbol.replaceOperations, 'dst', intermediateOffset, decreaseAccumulator, -annihilationAccumulator);
            this.mergeReplaceOperations(operationsOfSymbol.replaceOperations, 'dst', intermediateOffset);
            if(length > 0 && firstOperation && firstOperation.length > 0)
                intermediateOffset = firstOperation.dstOffset;
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
        return true;
    }

    replaceDataSimultaneously(replaceOperations) {
        for(const operation of replaceOperations)
            this.saveDataToRestore(operation.dstSymbol, operation.dstOffset, operation.length);
        if(!this.ontology.replaceDataSimultaneously(replaceOperations))
            return false;
        const context = {},
              cutReplaceOperations = [], addReplaceOperations = [], mergeReplaceOperations = [],
              addSlice = (srcSymbol, srcOffset, length) => {
            const srcCreaseLengthOperations = (this.operationsBySymbol[srcSymbol] && this.operationsBySymbol[srcSymbol].creaseLengthOperations) ? this.operationsBySymbol[srcSymbol].creaseLengthOperations : [];
            for(let operationIndex = 0; operationIndex < srcCreaseLengthOperations.length; ++operationIndex) {
                const operation = srcCreaseLengthOperations[operationIndex];
                if(operation.dstOffset+Math.abs(operation.length) <= srcOffset)
                    continue;
                if(operation.dstOffset >= srcOffset+length)
                    break;
                if(operation.length > 0)
                    return false;
            }
            if(context.dstSymbol != srcSymbol || context.dstIntermediateOffset != srcOffset)
                addReplaceOperations.push({
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
            for(; context.replaceOperationIndexAtSrcSymbol < context.replaceOperationsAtSrcSymbol.length; ++context.replaceOperationIndexAtSrcSymbol) {
                const operation = context.replaceOperationsAtSrcSymbol[context.replaceOperationIndexAtSrcSymbol];
                if(context.srcIntermediateOffset <= operation.dstOffset+operation.length)
                    break;
            }
            while(length > 0 && context.replaceOperationIndexAtSrcSymbol < context.replaceOperationsAtSrcSymbol.length) {
                const operation = context.replaceOperationsAtSrcSymbol[context.replaceOperationIndexAtSrcSymbol];
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
                    ++context.replaceOperationIndexAtSrcSymbol;
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
            context.dstSymbol = BasicBackend.relocateSymbol(operation.dstSymbol, this.recordingRelocation);
            context.srcSymbol = BasicBackend.relocateSymbol(operation.srcSymbol, this.recordingRelocation);
            context.dstCreaseLengthOperations = (this.operationsBySymbol[context.dstSymbol] && this.operationsBySymbol[context.dstSymbol].creaseLengthOperations) ? this.operationsBySymbol[context.dstSymbol].creaseLengthOperations : [];
            [context.dstIntermediateOffset, context.dstOperationIndex] = this.constructor.getIntermediateOffset(context.dstCreaseLengthOperations, operation.dstOffset);
            context.srcCreaseLengthOperations = (this.operationsBySymbol[context.srcSymbol] && this.operationsBySymbol[context.srcSymbol].creaseLengthOperations) ? this.operationsBySymbol[context.srcSymbol].creaseLengthOperations : [];
            [context.srcIntermediateOffset, context.srcOperationIndex] = this.constructor.getIntermediateOffset(context.srcCreaseLengthOperations, operation.srcOffset);
            context.replaceOperationsAtSrcSymbol = (this.operationsBySymbol[context.srcSymbol] && this.operationsBySymbol[context.srcSymbol].replaceOperations) ? this.operationsBySymbol[context.srcSymbol].replaceOperations : [];
            context.replaceOperationIndexAtSrcSymbol = 0;
            mergeReplaceOperations.push({'dstSymbol': context.dstSymbol, 'dstOffset': context.dstIntermediateOffset});
            if(!skipDstDecreaseOperations(operation.length))
                return false;
            mergeReplaceOperations.push({'dstSymbol': context.dstSymbol, 'dstOffset': context.dstIntermediateOffset});
        }
        for(const operation of cutReplaceOperations)
            this.cutAndShiftReplaceOperations(this.getOrCreateEntry(this.operationsBySymbol, operation.dstSymbol).replaceOperations, 'dst', operation.dstOffset, operation.length, 0);
        for(const operation of addReplaceOperations) {
            this.addReplaceOperation('dst', operation);
            this.addReplaceOperation('src', operation);
        }
        for(const operation of mergeReplaceOperations)
            this.mergeReplaceOperations(this.getOrCreateEntry(this.operationsBySymbol, operation.dstSymbol).replaceOperations, 'dst', operation.dstOffset);
        return true;
    }

    replaceData(dstSymbol, dstOffset, srcSymbol, srcOffset, length) {
        return this.replaceDataSimultaneously([{'dstSymbol': dstSymbol, 'dstOffset': dstOffset, 'srcSymbol': srcSymbol, 'srcOffset': srcOffset, 'length': length}]);
    }

    writeData(dstSymbol, offset, length, dataBytes) {
        if(!this.ontology.writeData(dstSymbol, offset, length, dataBytes))
            return false;
        dstSymbol = BasicBackend.relocateSymbol(dstSymbol, this.recordingRelocation);
        const srcSymbol = this.ontology.createSymbol(this.repositoryNamespace);
        this.ontology.setRawData(srcSymbol, dataBytes, length);
        return this.replaceData(dstSymbol, offset, srcSymbol, 0, length);
    }

    commit(repositoryNamespace) {
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
            if(operationsOfSymbol.replaceOperations)
                for(const operation of operationsOfSymbol.replaceOperations)
                    this.operationsByType.replaceDataOperations.push(operation);
            const triple = [symbol];
            if(operationsOfSymbol.tripleOperations)
                for(triple[1] in operationsOfSymbol.tripleOperations)
                    for(triple[2] in operationsOfSymbol.tripleOperations[triple[1]])
                        this.operationsByType.tripleOperations.push([[...triple], operationsOfSymbol.tripleOperations[triple[1]][triple[2]]]);
        }
        delete this.operationsBySymbol;
        // TODO: Write to ontology
        // this.symbol = this.ontology.createSymbol(repositoryNamespace);
        // TODO: Optimize data source and data restore
        return true;
    }

    uncommit() {
        // TODO: Unlink from ontology
    }

    apply(reverse, checkoutRelocation={}, dst=this.ontology) {
        for(const symbol of this.operationsByType[(reverse) ? 'releaseSymbols' : 'manifestSymbols'])
            dst.manifestSymbol(BasicBackend.relocateSymbol(symbol, checkoutRelocation));
        for(const operation of this.operationsByType[(reverse) ? 'decreaseLengthOperations' : 'increaseLengthOperations'])
            if(!dst.creaseLength(BasicBackend.relocateSymbol(operation.dstSymbol, checkoutRelocation), operation.dstOffset, (reverse) ? -operation.length : operation.length))
                return false;
        if(!dst.replaceDataSimultaneously(this.operationsByType[(reverse) ? 'restoreDataOperations' : 'replaceDataOperations'].map(operation => { return {
            'srcSymbol': BasicBackend.relocateSymbol(operation.srcSymbol, checkoutRelocation),
            'dstSymbol': BasicBackend.relocateSymbol(operation.dstSymbol, checkoutRelocation),
            'srcOffset': operation.srcOffset,
            'dstOffset': operation.dstOffset,
            'length': operation.length
        };})))
            return false;
        for(const operation of this.operationsByType[(reverse) ? 'increaseLengthOperations' : 'decreaseLengthOperations'])
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
