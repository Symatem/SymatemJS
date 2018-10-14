import BasicBackend from './BasicBackend.js';

export class Differential {
    constructor(versionControl, symbol) {
        this.versionControl = versionControl;
        this.symbol = symbol;
    }

    createSymbol(symbol) {
        this.versionControl.ontology.setTriple([this.symbol, BasicBackend.symbolByName.Create, symbol], true);
    }

    releaseSymbol(symbol) {
        if(this.versionControl.ontology.getTriple([this.symbol, BasicBackend.symbolByName.Create, symbol]))
            this.versionControl.ontology.setTriple([this.symbol, BasicBackend.symbolByName.Create, symbol], false);
        else
            this.versionControl.ontology.setTriple([this.symbol, BasicBackend.symbolByName.Release, symbol], true);
    }

    creaseLength(dstSymbol, dstOffset, length) {
        const entrySymbol = this.versionControl.ontology.createSymbol(this.versionControl.namespaceId);
        this.versionControl.ontology.setTriple([this.symbol, BasicBackend.symbolByName[(length > 0) ? 'IncreaseLength' : 'DecreaseLength'], entrySymbol], true);
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.Destination, dstSymbol], true);
        const dstOffsetSymbol = this.versionControl.ontology.createSymbol(this.versionControl.namespaceId);
        this.versionControl.ontology.setData(dstOffsetSymbol, dstOffset);
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.DestinationOffset, dstOffsetSymbol], true);
        const lengthSymbol = this.versionControl.ontology.createSymbol(this.versionControl.namespaceId);
        this.versionControl.ontology.setData(lengthSymbol, Math.abs(length));
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.Length, lengthSymbol], true);
    }

    replaceData(dstSymbol, dstOffset, srcSymbol, srcOffset, length) {
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

    writeData(symbol, offset, length, dataBytes) {
        const srcSymbol = this.versionControl.ontology.createSymbol(this.versionControl.namespaceId);
        this.versionControl.ontology.setData(srcSymbol, dataBytes);
        this.replaceData(symbol, offset, srcSymbol, 0, length);
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
            this.versionControl.ontology.unlink(entry);
        if(findEntry(linked) !== undefined)
            return;
        const entrySymbol = this.versionControl.ontology.createSymbol(this.versionControl.namespaceId);
        this.versionControl.ontology.setTriple([this.symbol, BasicBackend.symbolByName[(linked) ? 'Link' : 'Unlink'], entrySymbol], true);
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.Entity, triple[0]], true);
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.Attribute, triple[1]], true);
        this.versionControl.ontology.setTriple([entrySymbol, BasicBackend.symbolByName.Value, triple[2]], true);
    }

    apply(differential, relocationTable = {}) {
        differential = this;
        // TODO
        console.log('Differential', differential.symbol);
        const setSymbols = (linked) => {
            for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [differential.symbol, BasicBackend.symbolByName[(linked) ? 'Create' : 'Release'], BasicBackend.symbolByName.Void])) {
                console.log((linked) ? 'Create' : 'Release', opTriple[2]);
                // this.versionControl.ontology.createSymbol(opTriple[2]);
                // this.versionControl.ontology.releaseSymbol(opTriple[2]);
                // TODO: Record Symbols being created / released for revert
            }
        };
        const creaseLength = (increase) => {
            // TODO: Sort by dstOffset
            const operations = {};
            for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [differential.symbol, BasicBackend.symbolByName[(increase) ? 'IncreaseLength' : 'DecreaseLength'], BasicBackend.symbolByName.Void])) {
                const dstSymbol = BasicBackend.relocateSymbol(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Destination), relocationTable),
                      dstOffsetSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.DestinationOffset),
                      dstOffset = this.versionControl.ontology.getData(dstOffsetSymbol),
                      lengthSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Length),
                      length = this.versionControl.ontology.getData(lengthSymbol);
                if(!operations[dstSymbol])
                    operations[dstSymbol] = [];
                operations[dstSymbol].push({'dstSymbol': dstSymbol, 'dstOffset': dstOffset, 'length': (increase) ? length : -length});
            }
            for(const dstSymbol in operations) {
                operations[dstSymbol].sort(function(a, b) {
                    return a.dstOffset-b.dstOffset;
                });
                console.log('CreaseLength', operations[dstSymbol]);
                // for(const operation of operations[dstSymbol])
                //     this.versionControl.ontology.creaseLength(operation.dstSymbol, operation.dstOffset, operation.length);
            }
        };
        const setTriples = (linked) => {
            for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [differential.symbol, BasicBackend.symbolByName[(linked) ? 'Link' : 'Unlink'], BasicBackend.symbolByName.Void])) {
                const triple = [
                    BasicBackend.relocateSymbol(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Entity), relocationTable),
                    BasicBackend.relocateSymbol(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Attribute), relocationTable),
                    BasicBackend.relocateSymbol(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Value), relocationTable)
                ];
                console.log((linked) ? 'Link' : 'Unlink', triple);
                // this.versionControl.ontology.setTriple(triple, linked);
                // TODO: Record Triples being (un)linked for revert
            }
        };
        const renamingTable = {};
        for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [differential.symbol, BasicBackend.symbolByName.Rename, BasicBackend.symbolByName.Void])) {
            const dstSymbol = BasicBackend.relocateSymbol(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Destination), relocationTable),
                  srcSymbol = BasicBackend.relocateSymbol(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Source), relocationTable);
            renamingTable[srcSymbol] = dstSymbol;
            console.log('Rename', srcSymbol, dstSymbol);
        }
        // this.versionControl.ontology.renameSymbols(renamingTable);
        setSymbols(true);
        creaseLength(true);
        for(const opTriple of this.versionControl.ontology.queryTriples(BasicBackend.queryMask.MMV, [differential.symbol, BasicBackend.symbolByName.Replace, BasicBackend.symbolByName.Void])) {
            const dstSymbol = BasicBackend.relocateSymbol(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Destination), relocationTable),
                  dstOffsetSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.DestinationOffset),
                  dstOffset = this.versionControl.ontology.getData(dstOffsetSymbol),
                  srcSymbol = BasicBackend.relocateSymbol(this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Source), relocationTable),
                  srcOffsetSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.SourceOffset),
                  srcOffset = this.versionControl.ontology.getData(srcOffsetSymbol),
                  lengthSymbol = this.versionControl.ontology.getSolitary(opTriple[2], BasicBackend.symbolByName.Length),
                  length = this.versionControl.ontology.getData(lengthSymbol),
                  dataBytes = this.versionControl.ontology.readData(srcSymbol, srcOffset, length);
            console.log('Replace', dstSymbol, dstOffset, length, dataBytes);
            // this.versionControl.ontology.writeData(dstSymbol, dstOffset, length, dataBytes);
            // TODO: Record replaced data for revert
        }
        setTriples(true);
        setTriples(false);
        creaseLength(false);
        setSymbols(false);
    }
};
