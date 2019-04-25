import BasicBackend from './BasicBackend.js';

export class Differential {
    constructor(versionControl, symbol) {
        this.versionControl = versionControl;
        this.symbol = symbol;
    }

    manifestSymbol(symbol) {
        this.versionControl.ontology.setTriple([this.symbol, BasicBackend.symbolByName.Release, symbol], false);
        this.versionControl.ontology.setTriple([this.symbol, BasicBackend.symbolByName.Manifest, symbol], true);
    }

    releaseSymbol(symbol) {
        for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [this.symbol, BasicBackend.symbolByName.Rename, BasicBackend.symbolByName.Void]))
            if(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Destination) == symbol) {
                symbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Source);
                break;
            }
        for(const type of [BasicBackend.symbolByName.IncreaseLength, BasicBackend.symbolByName.DecreaseLength, BasicBackend.symbolByName.Replace])
            for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [this.symbol, type, BasicBackend.symbolByName.Void]))
                if(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Destination) == symbol)
                    this.versionControl.ontology.unlinkSymbol(opTriple[2]);
        for(const type of [BasicBackend.symbolByName.Link, BasicBackend.symbolByName.Unlink])
            for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [this.symbol, type, BasicBackend.symbolByName.Void]))
                if(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Entity) == symbol ||
                   this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Attribute) == symbol ||
                   this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Value) == symbol)
                    this.versionControl.ontology.unlinkSymbol(opTriple[2]);
        if(this.versionControl.ontology.getTriple([this.symbol, BasicBackend.symbolByName.Manifest, symbol]))
            this.versionControl.ontology.setTriple([this.symbol, BasicBackend.symbolByName.Manifest, symbol], false);
        else
            this.versionControl.ontology.setTriple([this.symbol, BasicBackend.symbolByName.Release, symbol], true);
    }

    renameSymbols(renamingTable) {
        const rename = (entity, attribute, value = null) => {
            if(!value)
                value = this.versionControl.ontology.getSolitary(entity, attribute);
            if(renamingTable[value]) {
                this.versionControl.ontology.setTriple([entity, attribute, value], false);
                this.versionControl.ontology.setTriple([entity, attribute, renamingTable[value]], true);
                return true;
            }
            return false;
        };
        for(const type of [BasicBackend.symbolByName.Manifest, BasicBackend.symbolByName.Release])
            for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [this.symbol, type, BasicBackend.symbolByName.Void]))
                rename(this.symbol, type, opTriple[2]);
        for(const type of [BasicBackend.symbolByName.IncreaseLength, BasicBackend.symbolByName.DecreaseLength])
            for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [this.symbol, type, BasicBackend.symbolByName.Void]))
                rename(opTriple[2], BasicBackend.symbolByName.Destination);
        for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [this.symbol, BasicBackend.symbolByName.Replace, BasicBackend.symbolByName.Void])) {
            rename(opTriple[2], BasicBackend.symbolByName.Destination);
            rename(opTriple[2], BasicBackend.symbolByName.Source);
        }
        for(const type of [BasicBackend.symbolByName.Link, BasicBackend.symbolByName.Unlink])
            for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [this.symbol, type, BasicBackend.symbolByName.Void])) {
                rename(opTriple[2], BasicBackend.symbolByName.Entity);
                rename(opTriple[2], BasicBackend.symbolByName.Attribute);
                rename(opTriple[2], BasicBackend.symbolByName.Value);
            }
        for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [this.symbol, BasicBackend.symbolByName.Rename, BasicBackend.symbolByName.Void])) {
            const dstSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Destination),
                  srcSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Source);
            if(renamingTable[srcSymbol] && !this.versionControl.ontology.getTriple([this.symbol, BasicBackend.symbolByName.Manifest, dstSymbol]))
                return false;
            if(rename(opTriple[2], BasicBackend.symbolByName.Destination))
                delete renamingTable[dstSymbol];
        }
        for(const srcSymbol in renamingTable) {
            const dstSymbol = renamingTable[srcSymbol];
            if(this.versionControl.ontology.getTriple([this.symbol, BasicBackend.symbolByName.Manifest, dstSymbol]))
                continue;
            const entrySymbol = this.versionControl.ontology.createSymbol(this.versionControl.namespaceId);
            this.versionControl.ontology.setTriple([this.symbol, BasicBackend.symbolByName.Rename, entrySymbol], true);
            this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.Destination, dstSymbol], true);
            this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.Source, srcSymbol], true);
        }
        return true;
    }

    addReplaceOperation(dstSymbol, dstOffset, srcSymbol, srcOffset, length) {
        if(length == 0)
            return;
        const entrySymbol = this.versionControl.ontology.createSymbol(this.versionControl.namespaceId);
        this.versionControl.ontology.setTriple([this.symbol, BasicBackend.symbolByName.Replace, entrySymbol], true);
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.Destination, dstSymbol], true);
        const dstOffsetSymbol = this.versionControl.ontology.createSymbol(this.versionControl.namespaceId);
        this.versionControl.ontology.setData(dstOffsetSymbol, dstOffset);
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.DestinationOffset, dstOffsetSymbol], true);
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.Source, srcSymbol], true);
        const srcOffsetSymbol = this.versionControl.ontology.createSymbol(this.versionControl.namespaceId);
        this.versionControl.ontology.setData(srcOffsetSymbol, srcOffset);
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.SourceOffset, srcOffsetSymbol], true);
        const lengthSymbol = this.versionControl.ontology.createSymbol(this.versionControl.namespaceId);
        this.versionControl.ontology.setData(lengthSymbol, length);
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.Length, lengthSymbol], true);
    }

    getCreaseLengthOperations(symbol, postOffset) {
        const creaseLengthOperations = [];
        for(const type of [BasicBackend.symbolByName.DecreaseLength, BasicBackend.symbolByName.IncreaseLength])
            for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [this.symbol, type, BasicBackend.symbolByName.Void])) {
                const dstSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Destination);
                if(dstSymbol !== symbol)
                    continue;
                const dstOffsetSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.DestinationOffset),
                      lengthSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Length);
                creaseLengthOperations.push({
                    'entrySymbol': opTriple[2],
                    'dstSymbol': dstSymbol,
                    'dstOffsetSymbol': dstOffsetSymbol,
                    'dstOffset': this.versionControl.ontology.getData(dstOffsetSymbol),
                    'lengthSymbol': lengthSymbol,
                    'length': this.versionControl.ontology.getData(lengthSymbol)*((type === BasicBackend.symbolByName.DecreaseLength) ? -1 : 1)
                });
            }
        creaseLengthOperations.sort((a, b) => a.dstOffset-b.dstOffset);
        let intermediateOffset = postOffset;
        for(let i = 0; i < creaseLengthOperations.length; ++i) {
            const operation = creaseLengthOperations[i];
            if(intermediateOffset < operation.dstOffset)
                return {'offset': intermediateOffset, 'operations': creaseLengthOperations, 'operationIndex': i};
            if(operation.length < 0)
                intermediateOffset -= operation.length;
        }
        return {'offset': intermediateOffset, 'operations': creaseLengthOperations, 'operationIndex': creaseLengthOperations.length};
    }

    getReplaceOperations(symbol) {
        const replaceOperations = [];
        for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [this.symbol, BasicBackend.symbolByName.Replace, BasicBackend.symbolByName.Void])) {
            const dstSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Destination);
            if(dstSymbol !== symbol)
                continue;
            const dstOffsetSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.DestinationOffset),
                  srcOffsetSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.SourceOffset),
                  lengthSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Length);
            replaceOperations.push({
                'entrySymbol': opTriple[2],
                'dstSymbol': dstSymbol,
                'srcSymbol': this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Source),
                'dstOffsetSymbol': dstOffsetSymbol,
                'dstOffset': this.versionControl.ontology.getData(dstOffsetSymbol),
                'srcOffsetSymbol': srcOffsetSymbol,
                'srcOffset': this.versionControl.ontology.getData(srcOffsetSymbol),
                'lengthSymbol': lengthSymbol,
                'length': this.versionControl.ontology.getData(lengthSymbol)
            });
        }
        replaceOperations.sort((a, b) => a.dstOffset-b.dstOffset);
        return replaceOperations;
    }

    cutReplaceOperations(symbol, intermediateOffset, shift, decreaseLength) {
        const replaceOperations = this.getReplaceOperations(symbol),
              intermediateEndOffset = intermediateOffset+decreaseLength;
        for(const operation of replaceOperations) {
            const operationEndOffset = operation.dstOffset+operation.length;
            if(operationEndOffset <= intermediateOffset)
                continue;
            const endLength = operationEndOffset-intermediateEndOffset;
            if(operation.dstOffset < intermediateOffset && intermediateEndOffset < operationEndOffset) {
                this.versionControl.ontology.setData(operation.lengthSymbol, intermediateOffset-operation.dstOffset);
                this.addReplaceOperation(symbol, intermediateEndOffset+shift, operation.srcSymbol, operation.srcOffset+operation.length-endLength, endLength);
                continue;
            }
            const operationsBeginIsInside = (intermediateOffset <= operation.dstOffset && operation.dstOffset <= intermediateEndOffset),
                  operationsEndIsInside = (intermediateOffset <= operationEndOffset && operationEndOffset <= intermediateEndOffset);
            if(operationsEndIsInside || operationsBeginIsInside) {
                if(operationsBeginIsInside) {
                    if(operationsEndIsInside)
                        this.versionControl.ontology.unlinkSymbol(operation.entrySymbol);
                    else {
                        this.versionControl.ontology.setData(operation.dstOffsetSymbol, intermediateEndOffset+shift);
                        this.versionControl.ontology.setData(operation.srcOffsetSymbol, operation.srcOffset+operation.length-endLength);
                        this.versionControl.ontology.setData(operation.lengthSymbol, endLength);
                    }
                } else
                    this.versionControl.ontology.setData(operation.lengthSymbol, intermediateOffset-operation.dstOffset);
            } else if(shift < 0 && intermediateEndOffset <= operation.dstOffset)
                this.versionControl.ontology.setData(operation.dstOffsetSymbol, operation.dstOffset+shift);
        }
    }

    mergeReplaceOperations(symbol, intermediateOffset) {
        const replaceOperations = this.getReplaceOperations(symbol);
        for(let operationIndex = 1; operationIndex < replaceOperations.length; ++operationIndex) {
            const secondOperation = replaceOperations[operationIndex];
            if(secondOperation.dstOffset < intermediateOffset)
                continue;
            const firstOperation = replaceOperations[operationIndex-1];
            if(secondOperation.dstOffset == intermediateOffset &&
               firstOperation.dstOffset+firstOperation.length == secondOperation.dstOffset &&
               firstOperation.srcOffset+firstOperation.length == secondOperation.srcOffset &&
               firstOperation.srcSymbol == secondOperation.srcSymbol) {
                this.versionControl.ontology.setData(firstOperation.lengthSymbol, firstOperation.length+secondOperation.length);
                this.versionControl.ontology.unlinkSymbol(secondOperation.entrySymbol);
            }
            break;
        }
    }

    shiftIntermediateOffsets(creaseLengthOperations, shift) {
        if(shift <= 0)
            return;
        for(let i = creaseLengthOperations.operationIndex; i < creaseLengthOperations.operations.length; ++i) {
            const operation = creaseLengthOperations.operations[i];
            this.versionControl.ontology.setData(operation.dstOffsetSymbol, operation.dstOffset+shift);
        }
    }

    creaseLength(dstSymbol, dstOffset, length) {
        if(length == 0)
            return;
        const creaseLengthOperations = this.getCreaseLengthOperations(dstSymbol, dstOffset);
        let operationAtIntermediateOffset, intermediateOffset = creaseLengthOperations.offset;
        if(creaseLengthOperations.operationIndex > 0) {
            operationAtIntermediateOffset = creaseLengthOperations.operations[creaseLengthOperations.operationIndex-1];
            if(creaseLengthOperations.offset > operationAtIntermediateOffset.dstOffset+Math.abs(operationAtIntermediateOffset.length))
                operationAtIntermediateOffset = undefined;
        }
        if(length < 0) {
            let decreaseAccumulator = -length, increaseAccumulator = 0;
            if(operationAtIntermediateOffset) {
                intermediateOffset = operationAtIntermediateOffset.dstOffset;
                --creaseLengthOperations.operationIndex;
            }
            for(; creaseLengthOperations.operationIndex < creaseLengthOperations.operations.length; ++creaseLengthOperations.operationIndex) {
                const operation = creaseLengthOperations.operations[creaseLengthOperations.operationIndex];
                if(creaseLengthOperations.offset+decreaseAccumulator < operation.dstOffset)
                    break;
                if(operation.length < 0)
                    decreaseAccumulator -= operation.length;
                else
                    increaseAccumulator += operation.length;
                this.versionControl.ontology.unlinkSymbol(operation.entrySymbol);
            }
            this.shiftIntermediateOffsets(creaseLengthOperations, length);
            this.cutReplaceOperations(dstSymbol, creaseLengthOperations.offset, length, decreaseAccumulator);
            this.mergeReplaceOperations(dstSymbol, creaseLengthOperations.offset);
            length = increaseAccumulator-decreaseAccumulator;
        } else {
            let mergeAccumulator = 0;
            if(operationAtIntermediateOffset) {
                if(operationAtIntermediateOffset.length < 0) {
                    const subtract = Math.min(-operationAtIntermediateOffset.length, length);
                    if(subtract === -operationAtIntermediateOffset.length)
                        this.versionControl.ontology.unlinkSymbol(operationAtIntermediateOffset.entrySymbol);
                    else
                        this.versionControl.ontology.setData(operationAtIntermediateOffset.lengthSymbol, -operationAtIntermediateOffset.length-subtract);
                    length -= subtract;
                    if(length == 0)
                        return;
                } else {
                    this.versionControl.ontology.setData(operationAtIntermediateOffset.lengthSymbol, operationAtIntermediateOffset.length+length);
                    mergeAccumulator = length;
                }
            }
            this.shiftIntermediateOffsets(creaseLengthOperations, length);
            const replaceOperations = this.getReplaceOperations(dstSymbol);
            for(const operation of replaceOperations) {
                const operationEndOffset = operation.dstOffset+operation.length;
                if(operationEndOffset <= creaseLengthOperations.offset)
                    continue;
                if(operation.dstOffset < creaseLengthOperations.offset && creaseLengthOperations.offset < operationEndOffset) {
                    this.versionControl.ontology.setData(operation.lengthSymbol, creaseLengthOperations.offset-operation.dstOffset);
                    this.addReplaceOperation(dstSymbol, creaseLengthOperations.offset+length, operation.srcSymbol, operation.srcOffset+creaseLengthOperations.offset-operation.dstOffset, operationEndOffset-creaseLengthOperations.offset);
                } else if(creaseLengthOperations.offset <= operation.dstOffset)
                    this.versionControl.ontology.setData(operation.dstOffsetSymbol, operation.dstOffset+length);
            }
            length -= mergeAccumulator;
        }
        if(length == 0)
            return;
        const entrySymbol = this.versionControl.ontology.createSymbol(this.versionControl.namespaceId);
        this.versionControl.ontology.setTriple([this.symbol, BasicBackend.symbolByName[(length > 0) ? 'IncreaseLength' : 'DecreaseLength'], entrySymbol], true);
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.Destination, dstSymbol], true);
        const dstOffsetSymbol = this.versionControl.ontology.createSymbol(this.versionControl.namespaceId);
        this.versionControl.ontology.setData(dstOffsetSymbol, intermediateOffset);
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.DestinationOffset, dstOffsetSymbol], true);
        const lengthSymbol = this.versionControl.ontology.createSymbol(this.versionControl.namespaceId);
        this.versionControl.ontology.setData(lengthSymbol, Math.abs(length));
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.Length, lengthSymbol], true);
    }

    replaceDataSimultaneously(replaceOperations) {
        const context = {},
              cutReplaceOperations = [], addReplaceOperations = [], mergeReplaceOperations = [],
              addSlice = (srcSymbol, srcOffset, length) => {
            if(context.dstSymbol != srcSymbol || context.dstCreaseLengthOperations.offset != srcOffset)
                addReplaceOperations.push({'dstSymbol': context.dstSymbol, 'dstOffset': context.dstCreaseLengthOperations.offset, 'srcSymbol': srcSymbol, 'srcOffset': srcOffset, 'length': length});
            context.srcCreaseLengthOperations.offset += length;
            context.dstCreaseLengthOperations.offset += length;
            return true;
        }, backTrackSrc = (length) => {
            cutReplaceOperations.push({'dstSymbol': context.dstSymbol, 'dstOffset': context.dstCreaseLengthOperations.offset, 'length': length});
            for(; context.replaceOperationsAtSrcSymbolIndex < context.replaceOperationsAtSrcSymbol.length; ++context.replaceOperationsAtSrcSymbolIndex) {
                const operation = context.replaceOperationsAtSrcSymbol[context.replaceOperationsAtSrcSymbolIndex];
                if(context.srcCreaseLengthOperations.offset <= operation.dstOffset+operation.length)
                    break;
            }
            while(length > 0 && context.replaceOperationsAtSrcSymbolIndex < context.replaceOperationsAtSrcSymbol.length) {
                const operation = context.replaceOperationsAtSrcSymbol[context.replaceOperationsAtSrcSymbolIndex];
                if(context.srcCreaseLengthOperations.offset+length <= operation.dstOffset)
                    break;
                if(context.srcCreaseLengthOperations.offset < operation.dstOffset) {
                    const sliceLength = operation.dstOffset-context.srcCreaseLengthOperations.offset;
                    if(!addSlice(context.srcSymbol, context.srcCreaseLengthOperations.offset, sliceLength))
                        return false;
                    length -= sliceLength;
                }
                const sliceStartOffset = Math.max(context.srcCreaseLengthOperations.offset, operation.dstOffset),
                      sliceEndOffset = Math.min(context.srcCreaseLengthOperations.offset+length, operation.dstOffset+operation.length);
                if(sliceStartOffset < sliceEndOffset) {
                    const sliceLength = sliceEndOffset-sliceStartOffset;
                    if(!addSlice(operation.srcSymbol, operation.srcOffset+context.srcCreaseLengthOperations.offset-operation.dstOffset, sliceLength))
                        return false;
                    length -= sliceLength;
                }
                if(operation.dstOffset+operation.length <= context.srcCreaseLengthOperations.offset)
                    ++context.replaceOperationsAtSrcSymbolIndex;
            }
            return length == 0 || addSlice(context.srcSymbol, context.srcCreaseLengthOperations.offset, length);
        }, skipDecreaseOperations = (contextSlot, handleSlice, length) => {
            let range = length;
            for(const creaseLengthOperations = context[contextSlot]; creaseLengthOperations.operationIndex < creaseLengthOperations.operations.length && length > 0; ++creaseLengthOperations.operationIndex) {
                const operation = creaseLengthOperations.operations[creaseLengthOperations.operationIndex];
                if(creaseLengthOperations.offset+range < operation.dstOffset)
                    break;
                if(operation.length < 0) {
                    const sliceLength = Math.min(length, operation.dstOffset-creaseLengthOperations.offset);
                    if(!handleSlice(sliceLength))
                        return false;
                    length -= sliceLength;
                    creaseLengthOperations.offset = operation.dstOffset-operation.length;
                    range -= operation.length;
                }
            }
            return length == 0 || handleSlice(length);
        }, skipSrcDecreaseOperations = skipDecreaseOperations.bind(this, 'srcCreaseLengthOperations', backTrackSrc),
           skipDstDecreaseOperations = skipDecreaseOperations.bind(this, 'dstCreaseLengthOperations', skipSrcDecreaseOperations);
        for(const operation of replaceOperations) {
            if(operation.length <= 0 || (operation.dstSymbol == operation.srcSymbol && operation.dstOffset == operation.srcOffset))
                continue;
            context.dstSymbol = operation.dstSymbol;
            context.srcSymbol = operation.srcSymbol;
            context.dstCreaseLengthOperations = this.getCreaseLengthOperations(context.dstSymbol, operation.dstOffset);
            context.srcCreaseLengthOperations = this.getCreaseLengthOperations(context.srcSymbol, operation.srcOffset);
            context.replaceOperationsAtSrcSymbol = this.getReplaceOperations(context.srcSymbol);
            context.replaceOperationsAtSrcSymbolIndex = 0;
            mergeReplaceOperations.push({'dstSymbol': context.dstSymbol, 'dstOffset': context.dstCreaseLengthOperations.offset});
            if(!skipDstDecreaseOperations(operation.length))
                return false;
            mergeReplaceOperations.push({'dstSymbol': context.dstSymbol, 'dstOffset': context.dstCreaseLengthOperations.offset});
        }
        for(const operation of cutReplaceOperations)
            this.cutReplaceOperations(operation.dstSymbol, operation.dstOffset, 0, operation.length);
        for(const operation of addReplaceOperations)
            this.addReplaceOperation(operation.dstSymbol, operation.dstOffset, operation.srcSymbol, operation.srcOffset, operation.length);
        for(const operation of mergeReplaceOperations)
            this.mergeReplaceOperations(operation.dstSymbol, operation.dstOffset);
        return true;
    }

    replaceData(dstSymbol, dstOffset, srcSymbol, srcOffset, length) {
        return this.replaceDataSimultaneously([{'dstSymbol': dstSymbol, 'dstOffset': dstOffset, 'srcSymbol': srcSymbol, 'srcOffset': srcOffset, 'length': length}]);
    }

    writeData(dstSymbol, offset, length, dataBytes) {
        const srcSymbol = this.versionControl.ontology.createSymbol(this.versionControl.namespaceId);
        this.versionControl.ontology.setTriple([this.symbol, BasicBackend.symbolByName.Draft, srcSymbol], true);
        this.versionControl.ontology.setData(srcSymbol, dataBytes);
        this.replaceData(dstSymbol, offset, srcSymbol, 0, length);
    }

    setTriple(triple, linked) {
        const findEntry = (linked) => {
            for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [this.symbol, BasicBackend.symbolByName[(linked) ? 'Link' : 'Unlink'], BasicBackend.symbolByName.Void]))
                if(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Entity) == triple[0] &&
                   this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Attribute) == triple[1] &&
                   this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Value) == triple[2])
                    return opTriple[2];
        };
        const entry = findEntry(!linked);
        if(entry !== undefined) {
            this.versionControl.ontology.unlinkSymbol(entry);
            return true;
        }
        if(findEntry(linked) !== undefined)
            return false;
        const entrySymbol = this.versionControl.ontology.createSymbol(this.versionControl.namespaceId);
        this.versionControl.ontology.setTriple([this.symbol, BasicBackend.symbolByName[(linked) ? 'Link' : 'Unlink'], entrySymbol], true);
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.Entity, triple[0]], true);
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.Attribute, triple[1]], true);
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.Value, triple[2]], true);
        return true;
    }

    getOperations(relocationTable = {}) {
        const operations = {
            'Draft': {},
            'Manifest': [],
            'Release': [],
            'Rename': {},
            'IncreaseLength': {},
            'DecreaseLength': {},
            'Replace': {},
            'Link': [],
            'Unlink': []
        };
        for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [this.symbol, BasicBackend.symbolByName.Draft, BasicBackend.symbolByName.Void]))
            operations.Draft[BasicBackend.identityOfSymbol(opTriple[2])] = this.versionControl.ontology.getRawData(opTriple[2]);
        for(const type of ['Manifest', 'Release'])
            for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [this.symbol, BasicBackend.symbolByName[type], BasicBackend.symbolByName.Void]))
                operations[type].push(opTriple[2]);
        for(const type of ['Link', 'Unlink'])
            for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [this.symbol, BasicBackend.symbolByName[type], BasicBackend.symbolByName.Void])) {
                const triple = [
                    BasicBackend.relocateSymbol(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Entity), relocationTable),
                    BasicBackend.relocateSymbol(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Attribute), relocationTable),
                    BasicBackend.relocateSymbol(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Value), relocationTable)
                ];
                operations[type].push(triple);
            }
        for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [this.symbol, BasicBackend.symbolByName.Rename, BasicBackend.symbolByName.Void])) {
            const dstSymbol = BasicBackend.relocateSymbol(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Destination), relocationTable),
                  srcSymbol = BasicBackend.relocateSymbol(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Source), relocationTable);
            operations.Rename[srcSymbol] = dstSymbol;
        }
        for(const increase of [true, false]) {
            const type = (increase) ? 'IncreaseLength' : 'DecreaseLength',
                  creaseLengthOperations = operations[type];
            for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [this.symbol, BasicBackend.symbolByName[type], BasicBackend.symbolByName.Void])) {
                const dstSymbol = BasicBackend.relocateSymbol(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Destination), relocationTable),
                      dstOffsetSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.DestinationOffset),
                      dstOffset = this.versionControl.ontology.getData(dstOffsetSymbol),
                      lengthSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Length),
                      length = this.versionControl.ontology.getData(lengthSymbol);
                if(!creaseLengthOperations[dstSymbol])
                    creaseLengthOperations[dstSymbol] = [];
                creaseLengthOperations[dstSymbol].push({'dstSymbol': dstSymbol, 'dstOffset': dstOffset, 'length': (increase) ? length : -length});
            }
            for(const dstSymbol in creaseLengthOperations)
                creaseLengthOperations[dstSymbol].sort((increase) ? (a, b) => b.dstOffset-a.dstOffset : (a, b) => a.dstOffset-b.dstOffset);
        }
        for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [this.symbol, BasicBackend.symbolByName.Replace, BasicBackend.symbolByName.Void])) {
            const dstSymbol = BasicBackend.relocateSymbol(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Destination), relocationTable),
                  dstOffsetSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.DestinationOffset),
                  dstOffset = this.versionControl.ontology.getData(dstOffsetSymbol),
                  srcSymbol = BasicBackend.relocateSymbol(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Source), relocationTable),
                  srcOffsetSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.SourceOffset),
                  srcOffset = this.versionControl.ontology.getData(srcOffsetSymbol),
                  lengthSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Length),
                  length = this.versionControl.ontology.getData(lengthSymbol);
            if(!operations.Replace[dstSymbol])
                operations.Replace[dstSymbol] = [];
            operations.Replace[dstSymbol].push({'dstSymbol': dstSymbol, 'dstOffset': dstOffset, 'srcSymbol': srcSymbol, 'srcOffset': srcOffset, 'length': length});
        }
        return operations;
    }
};
