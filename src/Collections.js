import {Utils} from '../SymatemJS.js';

export class IdentityPool {
    static insert(collection, identity) {
        const indexOfRange = Utils.bisect(collection.length, (index) => (collection[index].start <= identity));
        const prevRange = collection[indexOfRange-1],
              nextRange = collection[indexOfRange];
        if(prevRange && (indexOfRange == collection.length || identity < prevRange.start+prevRange.count))
            return false;
        const mergePrevRange = (prevRange && prevRange.start+prevRange.count == identity),
              mergePostRange = (nextRange && identity+1 == nextRange.start);
        if(mergePrevRange && mergePostRange) {
            nextRange.start = prevRange.start;
            if(nextRange.count)
                nextRange.count += 1+prevRange.count;
            collection.splice(indexOfRange-1, 1);
        } else if(mergePrevRange) {
            ++prevRange.count;
        } else if(mergePostRange) {
            --nextRange.start;
            if(nextRange.count)
                ++nextRange.count;
        } else
            collection.splice(indexOfRange, 0, {'start': identity, 'count': 1});
        return true;
    }

    static remove(collection, identity) {
        const indexOfRange = Utils.bisect(collection.length, (index) => (collection[index].start <= identity));
        const range = collection[indexOfRange-1];
        if(!range || identity >= range.start+range.count)
            return false;
        if(identity == range.start) {
            ++range.start;
            if(range.count && --range.count == 0)
                collection.splice(indexOfRange-1, 1);
        } else if(identity == range.start+range.count-1)
            --range.count;
        else {
            const count = identity-range.start;
            collection.splice(indexOfRange-1, 0, {'start': range.start, 'count': count});
            range.start = identity+1;
            if(range.count)
                range.count -= 1+count;
        }
        return true;
    }

    static get(collection) {
        return collection[0].start;
    }
};

export class SymbolMap {
    static create() {
        return {};
    }

    static isEmpty(collection) {
        return Object.keys(collection).length == 0;
    }

    static insert(collection, symbol, element) {
        if(collection[symbol])
            return false;
        collection[symbol] = element;
        return true;
    }

    static remove(collection, symbol) {
        if(!collection[symbol])
            return false;
        delete collection[symbol];
        return true;
    }

    static get(collection, symbol) {
        return collection[symbol];
    }

    static entries(collection) {
        return Object.entries(collection);
    }

    static symbols(collection) {
        return Object.keys(collection);
    }
};
