/** Collection of utility functions
 */
export default class Utils {
    /**
     * Saves a buffer as download file in browsers
     * @param {Uint8Array} buffer
     * @param {String} fileName
     */
    static downloadAsFile(buffer, fileName) {
        const file = new Blob([buffer], {type: 'octet/stream'}),
              url = URL.createObjectURL(file),
              a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Converts Uint8Array to binary string of '0's and '1's
     * @param {Uint8Array} buffer
     * @return {Number} hash value
     */
    static djb2Hash(buffer) {
        let result = 5381;
        for(let i = 0; i < buffer.byteLength; ++i)
            result = ((result<<5)+result+buffer[i])>>>0;
        return result; // ('0000000'+result.toString(16).toUpperCase()).substr(-8);
    }

    /**
     * Converts Uint8Array to binary string of '0's and '1's
     * @param {Uint8Array} buffer
     * @return {String} binary
     */
    static asBitString(buffer, length) {
        const result = [];
        for(let i = 0; i < length; ++i)
            result.push(((buffer[Math.floor(i/8)]>>(i%8))&1) ? '1' : '0');
        return result.join('');
    }

    /**
     * Copies length bits from source at sourceOffset to destination at destinationOffset
     * @param {Uint8Array} destination
     * @param {Number} destinationOffset
     * @param {Uint8Array} source
     * @param {Number} sourceOffset
     * @param {Number} length
     */
    static bitwiseCopy(destination, destinationOffset, source, sourceOffset, length) {
        if(length == 0)
            return;
        if(destinationOffset%8 == 0 && sourceOffset%8 == 0 && length%8 == 0) {
            destination.set(source.subarray(sourceOffset/8, (sourceOffset+length)/8), destinationOffset/8);
            return;
        }
        if(destination == source && sourceOffset < destinationOffset && sourceOffset+length > destinationOffset)
            throw new Error('bitwiseCopy with destination == source is not implemented yet'); // TODO
        const elementLength = 32;
        destination = new DataView(destination.buffer);
        source = new DataView(source.buffer);
        let sourceIndex = Math.floor(sourceOffset/elementLength)*elementLength/8,
            destinationIndex = Math.floor(destinationOffset/elementLength)*elementLength/8;
        const sourceShift = sourceOffset%elementLength,
              destinationShift = destinationOffset%elementLength;
        while(true) {
            const mask = (length < elementLength) ? ~((-1)<<length) : -1,
                  nextSourceIndex = sourceIndex+elementLength/8,
                  nextDestinationIndex = destinationIndex+elementLength/8;
            let element = source.getUint32(sourceIndex, true)>>>sourceShift;
            if(nextSourceIndex < source.byteLength && sourceShift > 0)
                element |= source.getUint32(nextSourceIndex, true)<<(elementLength-sourceShift);
            element &= mask;
            destination.setUint32(destinationIndex, destination.getUint32(destinationIndex, true)&(~(mask<<destinationShift))|(element<<destinationShift), true);
            if(nextDestinationIndex < destination.byteLength && destinationShift > 0)
                destination.setUint32(nextDestinationIndex, destination.getUint32(nextDestinationIndex, true)&(~(mask>>>(elementLength-destinationShift)))|(element>>>(elementLength-destinationShift)), true);
            length -= elementLength;
            if(length <= 0)
                break;
            sourceIndex = nextSourceIndex;
            destinationIndex = nextDestinationIndex;
        }
    }

    /**
     * Converts a buffer to text in UTF8
     * @param {Uint8Array} buffer
     * @return {String} text
     */
    static encodeAsUTF8(buffer) {
        // return new TextDecoder('utf8').decode(buffer);
        let uri = '';
        for(const byte of new Uint8Array(buffer)) {
            const hex = byte.toString(16);
            uri += '%' + ((hex.length == 1) ? '0' + hex : hex);
        }
        try {
            return decodeURIComponent(uri);
        } catch(error) {
            return buffer;
        }
    }

    /**
     * Converts text to a buffer in UTF8
     * @param {String} text
     * @return {Uint8Array} buffer
     */
    static decodeAsUTF8(text) {
        // return new TextEncoder('utf8').encode(text);
        const uri = encodeURI(text),
              buffer = [];
        for(let i = 0; i < uri.length; ++i) {
            if(uri[i] == '%') {
                buffer.push(parseInt(uri.substr(i + 1, 2), 16));
                i += 2;
            } else
                buffer.push(uri.charCodeAt(i));
        }
        return new Uint8Array(buffer);
    }

    /**
     * Converts a buffer to hex
     * @param {Uint8Array} buffer
     * @return {String} text
     */
    static encodeAsHex(buffer) {
        return Array.from(buffer).map(byte => (byte&0xF).toString(16)+(byte>>4).toString(16)).join('').toUpperCase();
    }

    /**
     * Converts hex to a buffer
     * @param {String} text
     * @return {Uint8Array} buffer
     */
    static decodeAsHex(text) {
        const buffer = new Uint8Array(Math.floor(text.length/2));
        for(let i = 0; i < buffer.byteLength; ++i)
            buffer[i] = parseInt(text[i*2], 16)|(parseInt(text[i*2+1], 16)<<4);
        return buffer;
    }

    /**
     * Returns a sorted copy of a map or an object dict
     * @param {Object|Map} src
     * @param {Function} compare compares two keys
     * @return {Object|Map} result
     */
    static sorted(src, compare) {
        return (src instanceof Map)
            ? new Map(Array.from(src.entries()).sort(compare))
            : Object.fromEntries(Array.from(Object.entries(src)).sort(compare));
    }

    /**
     * Returns a shallow copy of an object
     * @param {Object} src
     * @return {Object} result
     */
    static clone(src) {
        return Object.assign(Object.create(Object.getPrototypeOf(src)), src);
    }

    /**
     * Returns an reverse iterator of an array
     * @param {Object} array
     * @return {Object} reversed
     */
    static *reversed(array) {
        for(let i = array.length-1; i >= 0; --i)
            yield array[i];
    }

    /**
     * Finds an element in an array by bisection (binary search)
     * @param {Number} high Count of elements in the array
     * @param {Function} compare Compares the element and the current mid index
     * @return {Number} index
     */
    static bisect(high, compare) {
        let low = 0;
        while(low < high) {
            const mid = (low+high)>>1;
            if(compare(mid))
                low = mid+1;
            else
                high = mid;
        }
        return low;
    }
};
