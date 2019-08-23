/** The repository is a DAG with the versions being vertices and the differentals being edges */
export default class Repository {
    /**
     * @param {BasicBackend} backend
     * @param {Identity} namespace
     */
    constructor(backend, namespace) {
        this.backend = backend;
        this.namespace = namespace;
        this.modalNamespaces = [];
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
        if(this.materializedVersions[versionId])
            this.dematerializeVersion(versionId);
        for(const parentId in this.versions[versionId].parents)
            delete this.versions[parentId].children[versionId];
        delete this.versions[versionId];
    }

    /** Materializes a version (checkout)
     * @param {Symbol} versionId The version to materialize
     * @return {RelocationTable} Relocates modal namespaces which became checkout namespaces
     */
    materializeVersion(versionId) {
        const checkoutRelocation = {};
        for(const modalNamespaceIdentity of this.modalNamespaces) {
            const namespaceSymbol = this.createSymbol(BasicBackend.identityOfSymbol(BasicBackend.symbolByName.Namespaces)),
                  namespaceIdentity = BasicBackend.identityOfSymbol(namespaceSymbol);
            checkoutRelocation[modalNamespaceIdentity] = namespaceIdentity;
        }
        this.materializedVersions[versionId] = checkoutRelocation;
        if(Object.keys(this.versions[versionId].parents).length > 0) {
            const path = this.findPathTo(versionId);
            versionId = path[0];
            for(const modalNamespaceIdentity of this.materializedVersions[versionId])
                this.backend.copyNamespace(checkoutRelocation[modalNamespaceIdentity], this.materializedVersions[versionId][modalNamespaceIdentity]); // TODO
            for(let i = 1; i < path.length; ++i) {
                path[i][1].apply(path[i][2], checkoutRelocation);
                versionId = path[i][0];
            }
        }
        return checkoutRelocation;
    }

    /** Deletes the materialization of a version, not the vertex in the DAG
     * @param {Symbol} versionId The version to dematerialize
     */
    dematerializeVersion(versionId) {
        for(const namespaceIdentity of this.materializedVersions[versionId])
            this.backend.unlinkSymbol(BasicBackend.symbolInNamespace('Namespaces', namespaceIdentity));
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
                path.push(versionId);
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
                    this.versions[neighborId].discoveredBy = [versionId, this.versions[versionId].parents[neighborId], false];
                    queue.push(neighborId);
                }
            for(const neighborId in this.versions[versionId].children)
                if(!this.versions[neighborId].discoveredBy) {
                    this.versions[neighborId].discoveredBy = [versionId, this.versions[versionId].children[neighborId], true];
                    queue.push(neighborId);
                }
        }
        for(const versionId in this.versions)
            delete this.versions[versionId].discoveredBy;
        return path;
    }
}
