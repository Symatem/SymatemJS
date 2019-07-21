/** The repository is a DAG with the versions being vertices and the differentals being edges */
export default class Repository {
    /**
     * @param {BasicBackend} backend
     * @param {Identity} namespaceIdentity
     */
    constructor(backend, namespaceIdentity) {
        this.backend = backend;
        this.namespaceIdentity = namespaceIdentity;
        this.versions = {};
        this.checkouts = {};
    }

    // TODO: Documentation
    addVersion(versionId, parents) {
        if(!this.versions[versionId])
            this.versions[versionId] = {
                'id': versionId,
                'children': {}
            };
        if(parents) {
            this.versions[versionId].parents = parents;
            for(const parentId in parents) {
                if(!this.versions[parentId])
                    this.addVersion(parentId);
                this.versions[parentId].children[versionId] = parents[parentId];
            }
        }
        return this.versions[versionId];
    }

    // TODO: Documentation
    removeVersion(versionId) {
        for(const parentId in this.versions[versionId].parents)
            delete this.versions[parentId].children[versionId];
        delete this.versions[versionId];
    }

    // TODO: Documentation
    addCheckout(versionId, namespaceIdentity) {
        this.checkouts[versionId] = namespaceIdentity;
    }

    // TODO: Documentation
    removeCheckout(versionId) {
        this.backend.unlinkSymbol(BasicBackend.symbolInNamespace('Namespaces', this.checkouts[versionId]));
        delete this.checkouts[versionId];
    }

    // TODO: Documentation
    findPathTo(dstVersionId, srcVersionId) {
        for(const versionId in this.versions)
            delete this.versions[versionId].discoveredBy;
        const path = [], queue = [dstVersionId];
        this.versions[dstVersionId].discoveredBy = true;
        while(queue.length > 0) {
            let versionId = queue.shift();
            if(srcVersionId == versionId || (!srcVersionId && this.checkouts[versionId])) {
                const path = [];
                while(true) {
                    const discoveredBy = this.versions[versionId].discoveredBy;
                    if(discoveredBy === true)
                        return path;
                    path.push(discoveredBy);
                    versionId = discoveredBy[0];
                }
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
    }
}
