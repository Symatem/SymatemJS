import BasicBackend from './BasicBackend.js';

export default class Differential extends BasicBackend {
    constructor(ontology, repositoryNamespace) {
        super();
        this.ontology = ontology;
        this.repositoryNamespace = repositoryNamespace;
        // Namespaces for: meta info (repositoryNamespace), abstract / coexistence / pushout, recording, checkouts
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
        const operationsOfSymbol = this.getOrCreateEntry(this.operationsBySymbol, symbol);
        if(operationsOfSymbol.manifestOrRelease == 'release')
            delete operationsOfSymbol.manifestOrRelease;
        else
            operationsOfSymbol.manifestOrRelease = 'manifest';
        return this.ontology.manifestSymbol(symbol);
    }

    releaseSymbol(symbol) {
        const operationsOfSymbol = this.getOrCreateEntry(this.operationsBySymbol, symbol);
        if(operationsOfSymbol.manifestOrRelease == 'manifest')
            delete operationsOfSymbol.manifestOrRelease;
        else
            operationsOfSymbol.manifestOrRelease = 'release';
        return this.ontology.releaseSymbol(symbol);
    }

    setTriple(triple, link) {
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
        return this.ontology.setTriple(triple, link);
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

    addReplaceOperation(operation, replaceOperations, operationIndexInDst, copyOperations, operationIndexInSrc) {
        if(replaceOperations === undefined)
            replaceOperations = this.getOrCreateEntry(this.getOrCreateEntry(this.operationsBySymbol, operation.dstSymbol), 'replaceOperations', []);
        if(operationIndexInDst === undefined)
            operationIndexInDst = this.constructor.getOperationIndex(replaceOperations, 'dstOffset', operation.dstOffset);
        replaceOperations.splice(operationIndexInDst, 0, operation);
        if(copyOperations === undefined)
            copyOperations = this.getOrCreateEntry(this.getOrCreateEntry(this.operationsBySymbol, operation.srcSymbol), 'copyOperations', []);
        if(operationIndexInSrc === undefined)
            operationIndexInSrc = this.constructor.getOperationIndex(copyOperations, 'srcOffset', operation.srcOffset);
        copyOperations.splice(operationIndexInSrc, 0, operation);
    }

    removeReplaceOperation(operation, replaceOperations, operationIndexInDst, copyOperations, operationIndexInSrc) {
        if(replaceOperations === undefined)
            replaceOperations = this.operationsBySymbol[operation.dstSymbol].replaceOperations;
        if(operationIndexInDst === undefined)
            operationIndexInDst = replaceOperations.indexOf(operation);
        replaceOperations.splice(operationIndexInDst, 1);
        if(copyOperations === undefined)
            copyOperations = this.operationsBySymbol[operation.srcSymbol].copyOperations;
        if(operationIndexInSrc === undefined)
            operationIndexInSrc = copyOperations.indexOf(operation);
        copyOperations.splice(operationIndexInSrc, 1);
    }

    removeCreaseLengthOperation(operation, creaseLengthOperations, operationIndexInDst) {
        creaseLengthOperations.splice(operationIndexInDst, 1);
    }

    cutAndShiftReplaceOperations(replaceOperations, offsetKey, intermediateOffset, decreaseLength, shift) {
        if(!replaceOperations)
            return;
        const otherOffsetKey = (offsetKey == 'dstOffset') ? 'srcOffset' : 'dstOffset',
              intermediateEndOffset = intermediateOffset+decreaseLength;
        for(let operationIndex = 0; operationIndex < replaceOperations.length; ++operationIndex) {
            const operation = replaceOperations[operationIndex],
                  operationEndOffset = operation[offsetKey]+operation.length;
            if(operationEndOffset <= intermediateOffset)
                continue;
            const endLength = operationEndOffset-intermediateEndOffset;
            if(operation[offsetKey] < intermediateOffset && intermediateEndOffset < operationEndOffset) {
                this.addReplaceOperation({
                    'dstSymbol': operation.dstSymbol,
                    'srcSymbol': operation.srcSymbol,
                    'length': endLength,
                    [offsetKey]: intermediateEndOffset+shift,
                    [otherOffsetKey]: operation[otherOffsetKey]+operation.length-endLength // +intermediateEndOffset-operation[offsetKey]
                }, replaceOperations, ++operationIndex);
                operation.length = intermediateOffset-operation[offsetKey];
            } else {
                const operationsBeginIsInside = (intermediateOffset <= operation[offsetKey] && operation[offsetKey] <= intermediateEndOffset),
                      operationsEndIsInside = (intermediateOffset <= operationEndOffset && operationEndOffset <= intermediateEndOffset);
                if(operationsEndIsInside || operationsBeginIsInside) {
                    if(operationsBeginIsInside) {
                        if(operationsEndIsInside)
                            this.removeReplaceOperation(operation, replaceOperations, operationIndex--);
                        else {
                            operation[offsetKey] = intermediateEndOffset+shift;
                            operation[otherOffsetKey] += operation.length-endLength;
                            operation.length = endLength;
                        }
                    } else
                        operation.length = intermediateOffset-operation[offsetKey];
                } else if(intermediateEndOffset <= operation[offsetKey])
                    operation[offsetKey] += shift;
            }
        }
    }

    mergeReplaceOperations(replaceOperations, offsetKey, intermediateOffset) {
        if(!replaceOperations)
            return;
        const otherOffsetKey = (offsetKey == 'dstOffset') ? 'srcOffset' : 'dstOffset';
        for(let operationIndex = 1; operationIndex < replaceOperations.length; ++operationIndex) {
            const secondOperation = replaceOperations[operationIndex];
            if(secondOperation[offsetKey] < intermediateOffset)
                continue;
            const firstOperation = replaceOperations[operationIndex-1];
            if(secondOperation[offsetKey] == intermediateOffset &&
               firstOperation[offsetKey]+firstOperation.length == secondOperation[offsetKey] &&
               firstOperation[otherOffsetKey]+firstOperation.length == secondOperation[otherOffsetKey] &&
               firstOperation.srcSymbol == secondOperation.srcSymbol) {
                firstOperation.length += secondOperation.length;
                this.removeReplaceOperation(secondOperation, replaceOperations, operationIndex--);
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
        console.assert(offset+length <= this.ontology.getLength(symbol));
        const operationsOfSymbol = this.getOrCreateEntry(this.operationsBySymbol, symbol),
              creaseLengthOperations = (operationsOfSymbol.creaseLengthOperations) ? operationsOfSymbol.creaseLengthOperations : [],
              replaceOperations = (operationsOfSymbol.replaceOperations) ? operationsOfSymbol.replaceOperations : [];
        const addSlice = (length) => {
            const data = this.ontology.readData(symbol, intermediateOffset, length);
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
        const operationsOfSymbol = this.getOrCreateEntry(this.operationsBySymbol, dstSymbol),
              creaseLengthOperations = this.getOrCreateEntry(operationsOfSymbol, 'creaseLengthOperations', []),
              originalLength = length;
        let operationAtIntermediateOffset,
            [intermediateOffset, operationIndex] = this.constructor.getIntermediateOffset(creaseLengthOperations, dstOffset);
        if(operationIndex > 0) {
            operationAtIntermediateOffset = creaseLengthOperations[operationIndex-1];
            if(intermediateOffset > operationAtIntermediateOffset.dstOffset+Math.abs(operationAtIntermediateOffset.length))
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
            for(let i = operationIndex; i < creaseLengthOperations.length; ++i) {
                const operation = creaseLengthOperations[i];
                if(intermediateOffset+decreaseAccumulator < operation.dstOffset)
                    break;
                if(operation.length < 0)
                    decreaseAccumulator -= operation.length;
            }
            length = -decreaseAccumulator;
            for(; operationIndex < creaseLengthOperations.length;) {
                const operation = creaseLengthOperations[operationIndex];
                if(intermediateOffset+decreaseAccumulator < operation.dstOffset)
                    break;
                if(operation.length > 0) {
                    increaseAccumulator += operation.length;
                    const annihilate = Math.min(-length, operation.length);
                    this.cutAndShiftReplaceOperations(operationsOfSymbol.copyOperations, 'srcOffset', operation.dstOffset, 0, -annihilate);
                    // this.mergeReplaceOperations(operationsOfSymbol.copyOperations, 'srcOffset', operation.dstOffset); // TODO
                    annihilationAccumulator += annihilate;
                    length += annihilate;
                }
                this.removeCreaseLengthOperation(operation, creaseLengthOperations, operationIndex);
                operationId = operation.id;
            }
            length = increaseAccumulator-decreaseAccumulator;
            console.assert(annihilationAccumulator == increaseAccumulator-Math.max(0, length));
            this.shiftIntermediateOffsets(creaseLengthOperations, operationIndex, -annihilationAccumulator);
            this.cutAndShiftReplaceOperations(operationsOfSymbol.replaceOperations, 'dstOffset', intermediateOffset, decreaseAccumulator, -annihilationAccumulator);
            this.mergeReplaceOperations(operationsOfSymbol.replaceOperations, 'dstOffset', intermediateOffset);
            if(length > 0 && operationAtIntermediateOffset && operationAtIntermediateOffset.length > 0)
                intermediateOffset = operationAtIntermediateOffset.dstOffset;
        } else {
            let mergeAccumulator = 0;
            if(operationAtIntermediateOffset) {
                if(operationAtIntermediateOffset.length < 0) {
                    const annihilate = Math.min(-operationAtIntermediateOffset.length, length);
                    if(annihilate === -operationAtIntermediateOffset.length) {
                        intermediateOffset = operationAtIntermediateOffset.dstOffset;
                        this.removeCreaseLengthOperation(operationAtIntermediateOffset, creaseLengthOperations, --operationIndex);
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
                this.cutAndShiftReplaceOperations(operationsOfSymbol.copyOperations, 'srcOffset', intermediateOffset, 0, length);
                this.cutAndShiftReplaceOperations(operationsOfSymbol.replaceOperations, 'dstOffset', intermediateOffset, 0, length);
                length -= mergeAccumulator;
            }
        }
        if(length != 0)
            creaseLengthOperations.splice(operationIndex, 0, {
                'dstSymbol': dstSymbol,
                'dstOffset': intermediateOffset,
                'length': length
            });
        return this.ontology.creaseLength(dstSymbol, dstOffset, originalLength);
    }

    replaceDataSimultaneously(replaceOperations) {
        for(const operation of replaceOperations)
            this.saveDataToRestore(operation.dstSymbol, operation.dstOffset, operation.length);
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
                addReplaceOperations.push({'dstSymbol': context.dstSymbol, 'dstOffset': context.dstIntermediateOffset, 'srcSymbol': srcSymbol, 'srcOffset': srcOffset, 'length': length});
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
            context.dstSymbol = operation.dstSymbol;
            context.srcSymbol = operation.srcSymbol;
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
            this.cutAndShiftReplaceOperations(this.getOrCreateEntry(this.operationsBySymbol, operation.dstSymbol).replaceOperations, 'dstOffset', operation.dstOffset, operation.length, 0);
        for(const operation of addReplaceOperations)
            this.addReplaceOperation(operation);
        for(const operation of mergeReplaceOperations)
            this.mergeReplaceOperations(this.getOrCreateEntry(this.operationsBySymbol, operation.dstSymbol).replaceOperations, 'dstOffset', operation.dstOffset);
        return this.ontology.replaceDataSimultaneously(replaceOperations);
    }

    replaceData(dstSymbol, dstOffset, srcSymbol, srcOffset, length) {
        return this.replaceDataSimultaneously([{'dstSymbol': dstSymbol, 'dstOffset': dstOffset, 'srcSymbol': srcSymbol, 'srcOffset': srcOffset, 'length': length}]);
    }

    writeData(dstSymbol, offset, length, dataBytes) {
        const srcSymbol = this.ontology.createSymbol(this.repositoryNamespace);
        this.ontology.setRawData(srcSymbol, dataBytes, length);
        return this.replaceData(dstSymbol, offset, srcSymbol, 0, length);
    }

    commit(repositoryNamespace) {
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
            if(operationsOfSymbol.replaceOperations)
                for(const operation of operationsOfSymbol.replaceOperations)
                    this.operationsByType[(this.operationsBySymbol[operation.srcSymbol].isDataRestore) ? 'restoreDataOperations' : 'replaceDataOperations'].push(operation);
            const triple = [symbol];
            if(operationsOfSymbol.tripleOperations)
                for(triple[1] in operationsOfSymbol.tripleOperations)
                    for(triple[2] in operationsOfSymbol.tripleOperations[triple[1]])
                        this.operationsByType.tripleOperations.push([[...triple], operationsOfSymbol.tripleOperations[triple[1]][triple[2]]]);
        }
        delete this.operationsBySymbol;
        // TODO: Write to ontology
        // this.symbol = this.ontology.createSymbol(repositoryNamespace);
        // TODO: Optimize data source and data drain
    }

    uncommit() {
        // TODO: Unlink from ontology
    }

    apply(checkoutNamespace, reverse=false) {
        // TODO: checkoutNamespace
        for(const symbol of this.operationsByType[(reverse) ? 'releaseSymbols' : 'manifestSymbols'])
            this.ontology.manifestSymbol(symbol);
        for(const operation of this.operationsByType[(reverse) ? 'decreaseLengthOperations' : 'increaseLengthOperations'])
            this.ontology.creaseLength(operation.dstSymbol, operation.dstOffset, (reverse) ? -operation.length : operation.length);
        this.ontology.replaceDataSimultaneously(this.operationsByType[(reverse) ? 'restoreDataOperations' : 'replaceDataOperations']);
        for(const operation of this.operationsByType[(reverse) ? 'increaseLengthOperations' : 'decreaseLengthOperations'])
            this.ontology.creaseLength(operation.dstSymbol, operation.dstOffset, (reverse) ? -operation.length : operation.length);
        for(const [triple, linked] of this.operationsByType.tripleOperations)
            this.ontology.setTriple(triple, linked != reverse);
        for(const symbol of this.operationsByType[(reverse) ? 'manifestSymbols' : 'releaseSymbols'])
            this.ontology.releaseSymbol(symbol);
    }
}
