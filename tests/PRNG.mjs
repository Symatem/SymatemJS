export default class MersenneTwister {
    constructor() {
        this.N = 624;
        this.M = 397;
        this.buffer = new Uint32Array(this.N);
        this.setSeed(Math.floor(Math.random()*0x7FFFFFFF));
    }

    setSeed(seed) {
        this.buffer[0] = seed;
        for(this.used = 1; this.used < this.N; ++this.used) {
            const s = this.buffer[this.used-1]^(this.buffer[this.used-1]>>>30);
            this.buffer[this.used] = (((((s&0xFFFF0000)>>>16)*1812433253)<<16)+(s&0x0000FFFF)*1812433253)+this.used;
        }
    }

    twistTriple(first, second, third) {
        const y = (this.buffer[first]&0x80000000)|(this.buffer[second]&0x7FFFFFFF);
        this.buffer[first] = this.buffer[third]^(y>>>1)^((y&1)*0x9908B0DF);
    }

    twist() {
        let i = 0;
        for(; i < this.N-this.M; ++i)
            this.twistTriple(i, i+1, i+this.M);
        for(; i < this.N-1; ++i)
            this.twistTriple(i, i+1, i+this.M-this.N);
        this.twistTriple(this.N-1, 0, this.M-1);
        this.used = 0;
    }

    temper(value) {
        return (value^(value>>>11)^((value<<7)&0x9D2C5680)^((value<<15)&0xEFC60000)^(value>>>18))>>>0;
    }

    bytes(length) {
        const result = new Uint8Array(length);
        let offset = 0;
        while(length > 0) {
            if(this.used >= this.N)
                this.twist();
            const byteCount = Math.min(length, (this.N-this.used)*4),
                  slice = this.buffer.slice(this.used, this.used+Math.ceil(byteCount/4));
            this.used += slice.length;
            for(let i = 0; i < slice.length; ++i)
                slice[i] = this.temper(slice[i]);
            result.set(new Uint8Array(slice.buffer, 0, byteCount), offset);
            length -= byteCount;
            offset += byteCount;
        }
        return result;
    }

    nextInt32() {
        if(this.used >= this.N)
            this.twist();
        return this.temper(this.buffer[++this.used]);
    }

    nextFloat() {
        return this.nextInt32()/0x100000000;
    }

    range(start, end) {
        return start+Math.floor(this.nextFloat()*(end-start));
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
};
