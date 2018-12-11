import BasicBackend from './BasicBackend.js';

export class Differential {
    constructor(versionControl, symbol) {
        this.versionControl = versionControl;
        this.symbol = symbol;
    }

    createSymbol(symbol) {
        this.versionControl.ontology.setTriple([this.symbol, BasicBackend.symbolByName.Release, symbol], false);
        this.versionControl.ontology.setTriple([this.symbol, BasicBackend.symbolByName.Create, symbol], true);
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
        if(this.versionControl.ontology.getTriple([this.symbol, BasicBackend.symbolByName.Create, symbol]))
            this.versionControl.ontology.setTriple([this.symbol, BasicBackend.symbolByName.Create, symbol], false);
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
            }
        };
        for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [this.symbol, BasicBackend.symbolByName.Rename, BasicBackend.symbolByName.Void])) {
            const dstSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Destination),
                  srcSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Source);
            if(renamingTable[srcSymbol] && !this.versionControl.ontology.getTriple([this.symbol, BasicBackend.symbolByName.Create, srcSymbol]))
                return;
            rename(opTriple[2], BasicBackend.symbolByName.Destination);
        }
        for(const srcSymbol in renamingTable) {
            if(this.versionControl.ontology.getTriple([this.symbol, BasicBackend.symbolByName.Create, srcSymbol]))
                continue;
            const entrySymbol = this.versionControl.ontology.createSymbol(this.versionControl.namespaceId);
            this.versionControl.ontology.setTriple([this.symbol, BasicBackend.symbolByName.Rename, entrySymbol], true);
            this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.Destination, renamingTable[srcSymbol]], true);
            this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.Source, srcSymbol], true);
        }
        for(const type of [BasicBackend.symbolByName.Create, BasicBackend.symbolByName.Release])
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
                if(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Destination) !== symbol)
                    continue;
                const dstOffsetSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.DestinationOffset),
                      lengthSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Length);
                creaseLengthOperations.push({
                    'entrySymbol': opTriple[2],
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

    /*getPreOffset(symbol, postOffset) {
        const creaseLength = this.getCreaseLengthOperations(symbol, postOffset);
        let preOffset = creaseLength.offset;
        if(creaseLength.operationIndex > 0) {
            const operationAtIntermediateOffset = creaseLength.operations[creaseLength.operationIndex-1];
            if(operationAtIntermediateOffset.length > 0)
                preOffset -= Math.min(operationAtIntermediateOffset.length, creaseLength.offset-operationAtIntermediateOffset.dstOffset);
        }
        for(let i = 0; i < creaseLength.operationIndex-1; ++i) {
            const operation = creaseLength.operations[i];
            if(operation.length > 0)
                preOffset -= operation.length;
        }
        return preOffset;
    }*/

    getReplaceOperations(symbol) {
        const replaceOperations = [];
        for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [this.symbol, BasicBackend.symbolByName.Replace, BasicBackend.symbolByName.Void])) {
            if(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Destination) !== symbol)
                continue;
            const dstOffsetSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.DestinationOffset),
                  srcOffsetSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.SourceOffset),
                  lengthSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Length);
            replaceOperations.push({
                'entrySymbol': opTriple[2],
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

    splitReplaceOperations(symbol, intermediateOffset, shift) {
        if(shift <= 0)
            return;
        const replaceOperations = this.getReplaceOperations(symbol);
        for(const operation of replaceOperations) {
            const operationEndOffset = operation.dstOffset+operation.length;
            if(operationEndOffset <= intermediateOffset)
                continue;
            if(operation.dstOffset < intermediateOffset && intermediateOffset < operationEndOffset) {
                this.versionControl.ontology.setData(operation.lengthSymbol, offset-operation.dstOffset);
                this.addReplaceOperation(symbol, offset+shift, operation.srcSymbol, operation.srcOffset+intermediateOffset-operation.dstOffset, operationEndOffset-intermediateOffset);
            } else if(intermediateOffset <= operation.dstOffset)
                this.versionControl.ontology.setData(operation.dstOffsetSymbol, dstOffset+shift);
        }
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
        for(let i = operationIndex; i < creaseLengthOperations.operations.length; ++i) {
            const operation = creaseLengthOperations.operations[creaseLengthOperations.operationIndex];
            this.versionControl.ontology.setData(operation.dstOffsetSymbol, operation.dstOffset+shift);
        }
    }

    creaseLength(dstSymbol, dstOffset, length) {
        if(length == 0)
            return;
        const creaseLengthOperations = this.getCreaseLengthOperations(dstSymbol, dstOffset);
        const entrySymbol = this.versionControl.ontology.createSymbol(this.versionControl.namespaceId);
        this.versionControl.ontology.setTriple([this.symbol, BasicBackend.symbolByName[(length > 0) ? 'IncreaseLength' : 'DecreaseLength'], entrySymbol], true);
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.Destination, dstSymbol], true);
        const dstOffsetSymbol = this.versionControl.ontology.createSymbol(this.versionControl.namespaceId);
        this.versionControl.ontology.setData(dstOffsetSymbol, creaseLengthOperations.offset);
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.DestinationOffset, dstOffsetSymbol], true);
        const lengthSymbol = this.versionControl.ontology.createSymbol(this.versionControl.namespaceId);
        this.versionControl.ontology.setData(lengthSymbol, Math.abs(length));
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.Length, lengthSymbol], true);
    }

    replaceData(dstSymbol, dstOffset, srcSymbol, srcOffset, length) {
        if(length <= 0)
            return;
        let dstIntermediateEndOffset, replaceOperationIndex = 0;
        const dstCreaseLengthOperations = this.getCreaseLengthOperations(dstSymbol, dstOffset),
              srcCreaseLengthOperations = this.getCreaseLengthOperations(srcSymbol, srcOffset),
              replaceOperations = this.getReplaceOperations(srcSymbol),
              beginDstIntermediateOffset = dstCreaseLengthOperations.offset,
              cutReplaceOperations = [], addReplaceOperations = [],
              addSlice = (srcSymbol, srcOffset, length) => {
                  addReplaceOperations.push({'dstOffset': dstCreaseLengthOperations.offset, 'srcSymbol': srcSymbol, 'srcOffset': srcOffset, 'length': length});
                  srcCreaseLengthOperations.offset += length;
                  dstCreaseLengthOperations.offset += length;
                  return true;
              },
              backTrackSrc = (length) => {
            cutReplaceOperations.push({'dstOffset': dstCreaseLengthOperations.offset, 'length': length});
            for(; replaceOperationIndex < replaceOperations.length; ++replaceOperationIndex) {
                const operation = replaceOperations[replaceOperationIndex];
                if(srcCreaseLengthOperations.offset <= operation.dstOffset+operation.length)
                    break;
            }
            while(length > 0 && replaceOperationIndex < replaceOperations.length) {
                const operation = replaceOperations[replaceOperationIndex];
                if(srcCreaseLengthOperations.offset+length <= operation.dstOffset)
                    break;
                if(srcCreaseLengthOperations.offset < operation.dstOffset) {
                    const sliceLength = operation.dstOffset-srcCreaseLengthOperations.offset;
                    if(!addSlice(srcSymbol, srcCreaseLengthOperations.offset, sliceLength))
                        return false;
                    length -= sliceLength;
                }
                const sliceStartOffset = Math.max(srcCreaseLengthOperations.offset, operation.dstOffset),
                      sliceEndOffset = Math.min(srcCreaseLengthOperations.offset+length, operation.dstOffset+operation.length);
                if(sliceStartOffset < sliceEndOffset) {
                    const sliceLength = sliceEndOffset-sliceStartOffset;
                    if(!addSlice(operation.srcSymbol, operation.srcOffset+srcCreaseLengthOperations.offset-operation.dstOffset, sliceLength))
                        return false;
                    length -= sliceLength;
                }
                if(operation.dstOffset+operation.length <= srcCreaseLengthOperations.offset)
                    ++replaceOperationIndex;
            }
            return length == 0 || addSlice(srcSymbol, srcCreaseLengthOperations.offset, length);
        }, skipDecreaseOperations = (creaseLengthOperations, handleSlice, length) => {
            let overlappingDecrease = length;
            for(; creaseLengthOperations.operationIndex < creaseLengthOperations.operations.length && length > 0; ++creaseLengthOperations.operationIndex) {
                const operation = creaseLengthOperations.operations[creaseLengthOperations.operationIndex];
                if(creaseLengthOperations.offset+overlappingDecrease < operation.dstOffset)
                    break;
                if(operation.length < 0) {
                    const sliceLength = Math.min(length, operation.dstOffset-creaseLengthOperations.offset);
                    if(!handleSlice(sliceLength))
                        return false;
                    length -= sliceLength;
                    creaseLengthOperations.offset = operation.dstOffset-operation.length;
                    overlappingDecrease -= operation.length;
                }
            }
            return length == 0 || handleSlice(length);
        }, skipSrcDecreaseOperations = skipDecreaseOperations.bind(this, srcCreaseLengthOperations, backTrackSrc),
           skipDstDecreaseOperations = skipDecreaseOperations.bind(this, dstCreaseLengthOperations, skipSrcDecreaseOperations);
        skipDstDecreaseOperations(length);
        for(const operation of cutReplaceOperations)
            this.cutReplaceOperations(dstSymbol, operation.dstOffset, 0, operation.length);
        for(const operation of addReplaceOperations)
            this.addReplaceOperation(dstSymbol, operation.dstOffset, operation.srcSymbol, operation.srcOffset, operation.length);
        this.mergeReplaceOperations(dstSymbol, beginDstIntermediateOffset);
        this.mergeReplaceOperations(dstSymbol, dstCreaseLengthOperations.offset);
        return true;
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
            'Create': [],
            'Release': [],
            'Rename': {},
            'CreaseLength': {},
            'Replace': {},
            'Link': [],
            'Unlink': []
        };
        for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [this.symbol, BasicBackend.symbolByName.Draft, BasicBackend.symbolByName.Void]))
            operations.Draft[opTriple[2]] = this.versionControl.ontology.getRawData(opTriple[2]);
        for(const type of ['Create', 'Release'])
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
            for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [this.symbol, BasicBackend.symbolByName[(increase) ? 'IncreaseLength' : 'DecreaseLength'], BasicBackend.symbolByName.Void])) {
                const dstSymbol = BasicBackend.relocateSymbol(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Destination), relocationTable),
                      dstOffsetSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.DestinationOffset),
                      dstOffset = this.versionControl.ontology.getData(dstOffsetSymbol),
                      lengthSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Length),
                      length = this.versionControl.ontology.getData(lengthSymbol);
                if(!operations.CreaseLength[dstSymbol])
                    operations.CreaseLength[dstSymbol] = [];
                operations.CreaseLength[dstSymbol].push({'dstSymbol': dstSymbol, 'dstOffset': dstOffset, 'length': (increase) ? length : -length});
            }
            for(const dstSymbol in operations.CreaseLength)
                operations.CreaseLength[dstSymbol].sort((increase) ? (a, b) => b.dstOffset-a.dstOffset : (a, b) => a.dstOffset-b.dstOffset);
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
