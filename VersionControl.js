import BasicBackend from './BasicBackend.js';

export class Differential {
    constructor(versionControl, symbol) {
        this.versionControl = versionControl;
        this.symbol = symbol;
    }

    createSymbol(symbol) {
        this.versionControl.ontology.setTriple([this.symbol, BasicBackend.symbolByName.Create, symbol], true);
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
};
