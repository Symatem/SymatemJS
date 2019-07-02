export default class VersionDAG {
    constructor() {
        this.versions = {};
        this.checkouts = {};
    }

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

    removeVersion(versionId) {
        for(const parentId in this.versions[versionId].parents)
            delete this.versions[parentId].children[versionId];
        delete this.versions[versionId];
    }

    addCheckout(versionId, namespaceId) {
        this.checkouts[versionId] = namespaceId;
        // TODO
    }

    removeCheckout(versionId) {
        const namespaceId = this.checkouts[versionId];
        // TODO: Ontology unlink namespace
        delete this.checkouts[versionId];
    }

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
