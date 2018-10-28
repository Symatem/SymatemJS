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

    getIntermediateOffset(symbol, offset) {
        const operations = [];
        for(const type of [BasicBackend.symbolByName.DecreaseLength, BasicBackend.symbolByName.IncreaseLength])
            for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [this.symbol, type, BasicBackend.symbolByName.Void])) {
                if(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Destination) !== symbol)
                    continue;
                const dstOffsetSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.DestinationOffset),
                      lengthSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Length);
                operations.push({
                    'entrySymbol': opTriple[2],
                    'dstOffsetSymbol': dstOffsetSymbol,
                    'dstOffset': this.versionControl.ontology.getData(dstOffsetSymbol),
                    'lengthSymbol': lengthSymbol,
                    'length': this.versionControl.ontology.getData(lengthSymbol)*((type === BasicBackend.symbolByName.DecreaseLength) ? -1 : 1)
                });
            }
        operations.sort((a, b) => a.dstOffset-b.dstOffset);
        for(let i = 0; i < operations.length; ++i) {
            const operation = operations[i];
            if(operation.length < 0)
                offset -= operation.length;
            if(offset < operation.dstOffset)
                return [offset, operations, i];
        }
        return [offset, operations, operations.length];
    }

    creaseLength(dstSymbol, dstOffset, length) {
        if(length == 0)
            return;
        const [intermediateOffset, creaseLengthOperations, operationIndex] = this.getIntermediateOffset(dstSymbol, dstOffset);
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

    replaceData(dstSymbol, dstOffset, srcSymbol, srcOffset, length) {
        if(length == 0)
            return;
        const dstIntermediateOffset = this.getIntermediateOffset(dstSymbol, dstOffset)[0],
              srcIntermediateOffset = this.getIntermediateOffset(srcSymbol, srcOffset)[0];
        const entrySymbol = this.versionControl.ontology.createSymbol(this.versionControl.namespaceId);
        this.versionControl.ontology.setTriple([this.symbol, BasicBackend.symbolByName.Replace, entrySymbol], true);
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.Destination, dstSymbol], true);
        const dstOffsetSymbol = this.versionControl.ontology.createSymbol(this.versionControl.namespaceId);
        this.versionControl.ontology.setData(dstOffsetSymbol, dstIntermediateOffset);
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.DestinationOffset, dstOffsetSymbol], true);
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.Source, srcSymbol], true);
        const srcOffsetSymbol = this.versionControl.ontology.createSymbol(this.versionControl.namespaceId);
        this.versionControl.ontology.setData(srcOffsetSymbol, srcIntermediateOffset);
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.SourceOffset, srcOffsetSymbol], true);
        const lengthSymbol = this.versionControl.ontology.createSymbol(this.versionControl.namespaceId);
        this.versionControl.ontology.setData(lengthSymbol, length);
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.Length, lengthSymbol], true);
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
        if(entry !== undefined)
            this.versionControl.ontology.unlinkSymbol(entry);
        if(findEntry(linked) !== undefined)
            return;
        const entrySymbol = this.versionControl.ontology.createSymbol(this.versionControl.namespaceId);
        this.versionControl.ontology.setTriple([this.symbol, BasicBackend.symbolByName[(linked) ? 'Link' : 'Unlink'], entrySymbol], true);
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.Entity, triple[0]], true);
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.Attribute, triple[1]], true);
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.Value, triple[2]], true);
    }

    apply(forwardDiff, backwardDiff = null, relocationTable = {}) {
        forwardDiff = this; // TODO
        console.log('Differential', forwardDiff.symbol);
        const setSymbols = (linked) => {
            for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [forwardDiff.symbol, BasicBackend.symbolByName[(linked) ? 'Create' : 'Release'], BasicBackend.symbolByName.Void])) {
                console.log((linked) ? 'Create' : 'Release', opTriple[2]);
                // this.versionControl.ontology.createSymbol(opTriple[2]);
                // this.versionControl.ontology.releaseSymbol(opTriple[2]);
            }
        };
        const setTriples = (linked) => {
            for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [forwardDiff.symbol, BasicBackend.symbolByName[(linked) ? 'Link' : 'Unlink'], BasicBackend.symbolByName.Void])) {
                const triple = [
                    BasicBackend.relocateSymbol(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Entity), relocationTable),
                    BasicBackend.relocateSymbol(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Attribute), relocationTable),
                    BasicBackend.relocateSymbol(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Value), relocationTable)
                ];
                console.log((linked) ? 'Link' : 'Unlink', triple);
                // this.versionControl.ontology.setTriple(triple, linked);
            }
        };
        const renameSymbols = () => {
            const renamingTable = {};
            for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [forwardDiff.symbol, BasicBackend.symbolByName.Rename, BasicBackend.symbolByName.Void])) {
                const dstSymbol = BasicBackend.relocateSymbol(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Destination), relocationTable),
                      srcSymbol = BasicBackend.relocateSymbol(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Source), relocationTable);
                renamingTable[srcSymbol] = dstSymbol;
                console.log('Rename', srcSymbol, dstSymbol);
            }
            // this.versionControl.ontology.renameSymbols(renamingTable);
        };
        const creaseLength = (increase) => {
            const operations = {};
            for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [forwardDiff.symbol, BasicBackend.symbolByName[(increase) ? 'IncreaseLength' : 'DecreaseLength'], BasicBackend.symbolByName.Void])) {
                const dstSymbol = BasicBackend.relocateSymbol(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Destination), relocationTable),
                      dstOffsetSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.DestinationOffset),
                      dstOffset = this.versionControl.ontology.getData(dstOffsetSymbol),
                      lengthSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Length),
                      length = this.versionControl.ontology.getData(lengthSymbol);
                if(backwardDiff && !increase)
                    backwardDiff.writeData(dstSymbol, dstOffset, length, this.versionControl.ontology.readData(dstSymbol, dstOffset, length));
                if(!operations[dstSymbol])
                    operations[dstSymbol] = [];
                operations[dstSymbol].push({'dstSymbol': dstSymbol, 'dstOffset': dstOffset, 'length': (increase) ? length : -length});
            }
            for(const dstSymbol in operations) {
                operations[dstSymbol].sort((!increase) ? (a, b) => a.dstOffset-b.dstOffset : (a, b) => b.dstOffset-a.dstOffset);
                for(const operation of operations[dstSymbol])
                    console.log('CreaseLength', operation.dstSymbol, operation.dstOffset, operation.length);
                //     this.versionControl.ontology.creaseLength(operation.dstSymbol, operation.dstOffset, operation.length);
            }
        };
        const replaceData = () => {
            const operations = {};
            for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [forwardDiff.symbol, BasicBackend.symbolByName.Replace, BasicBackend.symbolByName.Void])) {
                const dstSymbol = BasicBackend.relocateSymbol(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Destination), relocationTable),
                      dstOffsetSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.DestinationOffset),
                      dstOffset = this.versionControl.ontology.getData(dstOffsetSymbol),
                      srcSymbol = BasicBackend.relocateSymbol(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Source), relocationTable),
                      srcOffsetSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.SourceOffset),
                      srcOffset = this.versionControl.ontology.getData(srcOffsetSymbol),
                      lengthSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Length),
                      length = this.versionControl.ontology.getData(lengthSymbol),
                      dataBytes = this.versionControl.ontology.readData(srcSymbol, srcOffset, length);
                if(backwardDiff && !this.versionControl.ontology.getTriple([forwardDiff.symbol, BasicBackend.symbolByName.Draft, srcSymbol]))
                    backwardDiff.writeData(srcSymbol, srcOffset, length, this.versionControl.ontology.readData(dstSymbol, dstOffset, length));
                if(!operations[dstSymbol])
                    operations[dstSymbol] = [];
                operations[dstSymbol].push({'dstSymbol': dstSymbol, 'dstOffset': dstOffset, 'srcSymbol': srcSymbol, 'srcOffset': srcOffset, 'length': length, 'dataBytes': dataBytes});
            }
            for(const dstSymbol in operations)
                for(const operation of operations[dstSymbol]) {
                    console.log('Replace', operation.dstSymbol, operation.dstOffset, operation.length, operation.dataBytes);
                    // this.versionControl.ontology.writeData(operation.dstSymbol, operation.dstOffset, operation.length, operation.dataBytes);
                }
        };
        setSymbols(true);
        renameSymbols();
        creaseLength(true);
        replaceData();
        setTriples(true);
        setTriples(false);
        creaseLength(false);
        setSymbols(false);
    }
};
