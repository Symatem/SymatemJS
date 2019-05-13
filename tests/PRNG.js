export default class RNG {
    static get rangeSize() {
        return -(1<<31); // 0x80000000;
    }

    constructor(seed) {
        this.a = 1103515245;
        this.c = 12345;
        this.state = (seed != undefined) ? seed : Math.floor(Math.random()*(this.constructor.rangeSize-1));
    }

    nextInt() {
        this.state = (this.a*this.state+this.c)%this.constructor.rangeSize;
        return this.state;
    }

    nextFloat() {
        return this.nextInt()/(this.constructor.rangeSize-1);
    }

    range(start, end) {
        const size = end-start,
              randomUnder1 = this.nextInt()/this.constructor.rangeSize;
        return start+Math.floor(randomUnder1*size);
    }

    selectUniformly(array) {
        return array[this.range(0, array.length)];
    }

    selectByDistribution(map) {
        const value = this.nextFloat();
        for(const key in map)
            if(value < map[key])
                return key;
    }

    static cumulateDistribution(map) {
        let sum = 0;
        for(const key in map)
            sum = (map[key] += sum);
        const factor = 1.0/sum;
        for(const key in map)
            map[key] *= factor;
        return map;
    }

    bytes(length) {
        const result = new Uint8Array(length);
        for(let i = 0; i < length; ++i)
            result[i] = this.range(0x00, 0xFF);
        return result;
    }
};
