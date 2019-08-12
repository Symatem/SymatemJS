/** The repository is a DAG with the versions being vertices and the differentals being edges */
export default class Repository {
    /**
     * @param {BasicBackend} backend
     * @param {Identity} namespace
     */
    constructor(backend, namespace) {
        this.backend = backend;
        this.namespace = namespace;
        this.versions = {};
        this.materializedVersions = {};
    }

    /** Adds a vertex to the DAG and returns it
     * @param {Symbol} versionId The version to remove
     * @param {Object} version
     */
    manifestVersion(versionId) {
        return (this.versions[versionId])
            ? this.versions[versionId]
            : this.versions[versionId] = {
            'id': versionId,
            'children': {}
        };
    }

    /** Adds a edges to the DAG
     * @param {Symbol} versionId The child vertex
     * @param {Object.<Symbol, Differential>} differentalsToParents Keys are the parent vertices and values the edges connecting them
     */
    setPartentsOfVersion(versionId, differentalsToParents) {
        this.versions[versionId].parents = differentalsToParents;
        for(const parentId in differentalsToParents)
            this.manifestVersion(parentId).children[versionId] = differentalsToParents[parentId];
    }

    /** Removes a vertex from the DAG
     * @param {Symbol} versionId The version to remove
     */
    removeVersion(versionId) {
        for(const parentId in this.versions[versionId].parents)
            delete this.versions[parentId].children[versionId];
        delete this.versions[versionId];
    }

    /** Materializes a version (checkout)
     * @param {Symbol} versionId The version to materialize
     * @param {RelocationTable} checkoutRelocation Relocate modal namespaces to become checkout namespaces
     */
    materializeVersion(versionId, checkoutRelocation) {
        this.materializedVersions[versionId] = checkoutRelocation;
    }

    /** Deletes the materialization of a version, not the vertex in the DAG
     * @param {Symbol} versionId The version to dematerialize
     */
    dematerializeVersion(versionId) {
        this.backend.unlinkSymbol(BasicBackend.symbolInNamespace('Namespaces', this.materializedVersions[versionId]));
        delete this.materializedVersions[versionId];
    }

    /** Finds the shortest path between two versions or a destination and the closest materialized version
     * @param {Symbol} dstVersionId Destination version
     * @param {Symbol} srcVersionId Source version (optional, closest materialized version is used otherwise)
     * @param {Symbol[]} Path of version hops from source to destination
     */
    findPathTo(dstVersionId, srcVersionId) {
        const path = [], queue = [dstVersionId];
        this.versions[dstVersionId].discoveredBy = true;
        while(queue.length > 0) {
            let versionId = queue.shift();
            if(srcVersionId == versionId || (!srcVersionId && this.materializedVersions[versionId])) {
                while(true) {
                    const discoveredBy = this.versions[versionId].discoveredBy;
                    if(discoveredBy === true)
                        break;
                    path.push(discoveredBy);
                    versionId = discoveredBy[0];
                }
                break;
            }
            for(const neighborId in this.versions[versionId].parents)
                if(!this.versions[neighborId].discoveredBy) {
                    this.versions[neighborId].discoveredBy = [versionId, this.versions[versionId].parents[neighborId]];
                    queue.push(neighborId);
                }
            for(const neighborId in this.versions[versionId].children)
                if(!this.versions[neighborId].discoveredBy) {
                    this.versions[neighborId].discoveredBy = [versionId, this.versions[versionId].children[neighborId]];
                    queue.push(neighborId);
                }
        }
        for(const versionId in this.versions)
            delete this.versions[versionId].discoveredBy;
        return path;
    }
}
