import {RelocationTable, SymbolInternals, SymbolMap, Diff} from './SymatemJS.mjs';

/** The repository is a DAG with the versions being vertices and the edges containing the diffs */
export default class Repository {
    /**
     * @param {BasicBackend} backend
     * @param {Symbol} symbol The repository
     */
    constructor(backend, symbol) {
        this.backend = backend;
        this.symbol = symbol;
        this.namespaceIdentity = SymbolInternals.namespaceOfSymbol(this.symbol);
        this.repositoryDiff = backend;
        this.repositoryDiff.setTriple([this.symbol, this.repositoryDiff.symbolByName.Type, this.repositoryDiff.symbolByName.Repository], true);
        this.relocationTable = RelocationTable.create();
        this.relocationTableSymbol = this.repositoryDiff.getPairOptionally(this.symbol, this.repositoryDiff.symbolByName.RelocationTable);
        if(SymbolInternals.areSymbolsEqual(this.relocationTableSymbol, this.repositoryDiff.symbolByName.Void)) {
            this.relocationTableSymbol = this.repositoryDiff.createSymbol(this.namespaceIdentity);
            this.repositoryDiff.setTriple([this.symbol, this.repositoryDiff.symbolByName.RelocationTable, this.relocationTableSymbol], true);
        } else
            for(const triple of this.repositoryDiff.queryTriples(this.repositoryDiff.queryMasks.MVV, [this.relocationTableSymbol, this.repositoryDiff.symbolByName.Void, this.repositoryDiff.symbolByName.Void]))
                RelocationTable.set(this.relocationTable, SymbolInternals.identityOfSymbol(triple[1]), SymbolInternals.identityOfSymbol(triple[2]));
    }

    /** Used in diff recording to map to and automatically create modal namespaces
     * @param {Symbol} symbol
     * @return {Symbol} relocated
     */
    relocateSymbol(diff, symbol) {
        if(diff == this.repositoryDiff)
            return symbol;
        if(diff.isRecordingFromBackend && !RelocationTable.get(this.relocationTable, SymbolInternals.namespaceOfSymbol(symbol))) {
            const modalNamespace = this.repositoryDiff.createSymbol(this.backend.metaNamespaceIdentity),
                  materializationNamespaceIdentity = SymbolInternals.namespaceOfSymbol(symbol);
            RelocationTable.set(this.relocationTable, materializationNamespaceIdentity, SymbolInternals.identityOfSymbol(modalNamespace));
            this.repositoryDiff.setTriple([this.relocationTableSymbol, SymbolInternals.concatIntoSymbol(this.repositoryDiff.metaNamespaceIdentity, materializationNamespaceIdentity), modalNamespace], true); // TODO
        }
        return RelocationTable.relocateSymbol(this.relocationTable, symbol);
    }

    /** Releases a modal namespace if it is empty
     * @param {Identity} modalNamespace
     * @return {boolean} success
     */
    releaseModalNamespace(modalNamespace) {
        if([...this.repositoryDiff.querySymbols(SymbolInternals.identityOfSymbol(modalNamespace))].length > 0)
            return false;
        this.repositoryDiff.unlinkSymbol(modalNamespace);
        RelocationTable.removeDestination(this.relocationTable, SymbolInternals.identityOfSymbol(modalNamespace));
        return true;
    }

    /** Gets the list of versions in this repository
     * @yield {Symbol} version
     */
    *getVersions() {
        for(const triple of this.backend.queryTriples(this.backend.queryMasks.MMV, [this.symbol, this.backend.symbolByName.Version, this.backend.symbolByName.Void]))
            yield triple[2];
    }

    /** Gets the list of edges in this repository
     * @yield {Symbol} diff
     */
    *getEdges() {
        for(const triple of this.backend.queryTriples(this.backend.queryMasks.VMM, [this.symbol, this.backend.symbolByName.Edge, this.backend.symbolByName.Void]))
            yield triple[2];
    }

    /** Gets a versions relatives and their diffs
     * @param {Symbol} version The version to query
     * @param {Symbol} kind Parent or Child
     * @return {SymbolMap} Diffs as keys and versions as values
     */
    getRelatives(version, kind) {
        const result = SymbolMap.create();
        for(const triple of this.backend.queryTriples(this.backend.queryMasks.MMV, [version, kind, this.backend.symbolByName.Void])) {
            const relative = this.backend.getPairOptionally(triple[2], kind);
            SymbolMap.set(result, triple[2], relative);
        }
        return result;
    }

    /** Find an edge by its vertices
     * @param {Symbol} parentVersion The parent vertex
     * @param {Symbol} childVersion The child vertex
     * @return {Symbol} The edge or Void
     */
    getEdge(parentVersion, childVersion) {
        for(const [edge, relative] of SymbolMap.entries(this.getRelatives(parentVersion, this.backend.symbolByName.Child)))
            if(relative == childVersion)
                return edge;
        return this.backend.symbolByName.Void;
    }

    /**
     * @typedef {Object} RepositoryPathEntry
     * @property {Symbol} version
     * @property {Diff} diff
     * @property {boolean} direction
     */

    /** Finds the shortest path between two versions or a destination and the closest materialized version
     * @param {Symbol} dstVersion Destination version
     * @param {Symbol} srcVersion Source version (optional, closest materialized version is used otherwise)
     * @return {RepositoryPathEntry[]} Path from source to destination
     */
    findPath(dstVersion, srcVersion) {
        const path = [], queue = [dstVersion], discoveredBy = SymbolMap.create();
        SymbolMap.set(discoveredBy, dstVersion, true);
        while(queue.length > 0) {
            let version = queue.shift();
            if(srcVersion == version || (!srcVersion && this.backend.getTriple([version, this.backend.symbolByName.Materialization, this.backend.symbolByName.Void], this.backend.queryMasks.MMI))) {
                path.push({'version': version});
                while(true) {
                    const entry = SymbolMap.get(discoveredBy, version);
                    if(entry === true)
                        break;
                    path.push(entry);
                    version = entry.version;
                }
                break;
            }
            for(const [edge, relative] of SymbolMap.entries(this.getRelatives(version, this.backend.symbolByName.Parent)))
                if(!SymbolMap.get(discoveredBy, relative)) {
                    SymbolMap.set(discoveredBy, relative, {'version': version, 'edge': edge, 'direction': false});
                    queue.push(relative);
                }
            for(const [edge, relative] of SymbolMap.entries(this.getRelatives(version, this.backend.symbolByName.Child)))
                if(!SymbolMap.get(discoveredBy, relative)) {
                    SymbolMap.set(discoveredBy, relative, {'version': version, 'edge': edge, 'direction': true});
                    queue.push(relative);
                }
        }
        return path;
    }

    /** Helper to create symbols in the same namespace as this repository
     * @return {Symbol} symbol
     */
    createSymbol() {
        return this.repositoryDiff.createSymbol(SymbolInternals.namespaceOfSymbol(this.symbol));
    }

    /** Adds a vertex to the DAG and returns it
     * @return {Symbol} version
     */
    createVersion() {
        const version = this.createSymbol();
        this.repositoryDiff.setTriple([this.symbol, this.repositoryDiff.symbolByName.Version, version], true);
        this.repositoryDiff.setTriple([version, this.repositoryDiff.symbolByName.Type, this.repositoryDiff.symbolByName.Version], true);
        return version;
    }

    /** Removes a vertex, its materialization and all its connecting edges from the DAG
     * @param {Symbol} version The version to remove
     */
    removeVersion(version) {
        for(const edge of SymbolMap.keys(this.getRelatives(version, this.repositoryDiff.symbolByName.Parent)))
            this.removeEdge(edge);
        for(const edge of SymbolMap.keys(this.getRelatives(version, this.repositoryDiff.symbolByName.Child)))
            this.removeEdge(edge);
        this.dematerializeVersion(version);
        this.repositoryDiff.unlinkSymbol(version);
    }

    /** Adds an edge to the DAG
     * @param {Symbol} parentVersion The parent vertex
     * @param {Symbol} childVersion The child vertex
     * @param {Diff} diff The diff of the edge
     * @return {Symbol} The created edge
     */
    addEdge(parentVersion, childVersion, diff) {
        const edge = this.createSymbol();
        this.repositoryDiff.setTriple([this.symbol, this.repositoryDiff.symbolByName.Edge, edge], true);
        this.repositoryDiff.setTriple([edge, this.repositoryDiff.symbolByName.Type, this.repositoryDiff.symbolByName.Edge], true);
        this.repositoryDiff.setTriple([edge, this.repositoryDiff.symbolByName.Parent, parentVersion], true);
        this.repositoryDiff.setTriple([edge, this.repositoryDiff.symbolByName.Child, childVersion], true);
        if(diff)
            this.repositoryDiff.setTriple([edge, this.repositoryDiff.symbolByName.Diff, diff.symbol], true);
        this.repositoryDiff.setTriple([childVersion, this.repositoryDiff.symbolByName.Parent, edge], true);
        this.repositoryDiff.setTriple([parentVersion, this.repositoryDiff.symbolByName.Child, edge], true);
        return edge;
    }

    /** Removes an edge from the DAG
     * @param {Symbol} edge The edge
     */
    removeEdge(edge) {
        const diffSymbol = this.repositoryDiff.getPairOptionally(edge, this.repositoryDiff.symbolByName.Diff);
        this.repositoryDiff.unlinkSymbol(edge);
        if(diffSymbol == this.repositoryDiff.symbolByName.Void || this.repositoryDiff.getTriple([this.repositoryDiff.symbolByName.Void, this.repositoryDiff.symbolByName.Diff, diffSymbol], this.repositoryDiff.queryMasks.VMM))
            return;
        const diff = new Diff(this, diffSymbol);
        diff.unlink();
    }

    /** Materializes a version (checkout)
     * @param {Symbol} version The version to materialize
     * @return {RelocationTable} Relocates modal namespaces to become namespaces of the materialized version
     */
    materializeVersion(version) {
        console.assert(!this.repositoryDiff.getTriple([version, this.repositoryDiff.symbolByName.Materialization, this.repositoryDiff.symbolByName.Void], this.repositoryDiff.queryMasks.MMI));
        const path = SymbolMap.count(this.getRelatives(version, this.repositoryDiff.symbolByName.Parent)) > 0 ? this.findPath(version) : undefined,
              materializationRelocation = RelocationTable.create(),
              dstMaterialization = this.createSymbol();
        this.repositoryDiff.setTriple([version, this.repositoryDiff.symbolByName.Materialization, dstMaterialization], true);
        for(const [recordingNamespaceIdentity, modalNamespaceIdentity] of Object.entries(this.relocationTable)) {
            const materializationNamespaceSymbol = this.repositoryDiff.createSymbol(SymbolInternals.identityOfSymbol(this.repositoryDiff.symbolByName.Namespaces));
            RelocationTable.set(materializationRelocation, modalNamespaceIdentity, SymbolInternals.identityOfSymbol(materializationNamespaceSymbol));
            this.repositoryDiff.setTriple([dstMaterialization, SymbolInternals.concatIntoSymbol(this.backend.metaNamespaceIdentity, modalNamespaceIdentity), materializationNamespaceSymbol], true);
        }
        if(path) {
            console.assert(path.length > 1);
            version = path[0].version;
            const srcMaterialization = this.repositoryDiff.getPairOptionally(version, this.repositoryDiff.symbolByName.Materialization),
                  cloneRelocation = RelocationTable.create();
            for(const triple of this.repositoryDiff.queryTriples(this.repositoryDiff.queryMasks.MVV, [srcMaterialization, this.repositoryDiff.symbolByName.Void, this.repositoryDiff.symbolByName.Void]))
                RelocationTable.set(cloneRelocation, SymbolInternals.identityOfSymbol(triple[2]), RelocationTable.get(materializationRelocation, SymbolInternals.identityOfSymbol(triple[1])));
            this.repositoryDiff.cloneNamespaces(cloneRelocation);
            for(let i = 1; i < path.length; ++i) {
                const diff = new Diff(this, this.repositoryDiff.getPairOptionally(path[i].edge, this.repositoryDiff.symbolByName.Diff));
                diff.apply(path[i].direction, materializationRelocation);
                version = path[i].version;
            }
        }
        return materializationRelocation;
    }

    /** Deletes the materialization of a version, but not the version itself
     * @param {Symbol} version The version to dematerialize
     */
    dematerializeVersion(version) {
        const materialization = this.repositoryDiff.getPairOptionally(version, this.repositoryDiff.symbolByName.Materialization);
        if(materialization == this.repositoryDiff.symbolByName.Void)
            return;
        for(const triple of this.repositoryDiff.queryTriples(this.repositoryDiff.queryMasks.MIV, [materialization, this.repositoryDiff.symbolByName.Void, this.repositoryDiff.symbolByName.Void]))
            this.repositoryDiff.unlinkSymbol(triple[2]);
        this.repositoryDiff.unlinkSymbol(materialization);
    }
}
