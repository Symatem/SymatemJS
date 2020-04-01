function advanceEnvelope(lengthA, lengthB, envelope, equal, depth, diagonalIndex) {
    const vertical = (diagonalIndex == -depth || (diagonalIndex != depth && envelope[diagonalIndex-1] < envelope[diagonalIndex+1]));
    let x = vertical ? envelope[diagonalIndex+1] : envelope[diagonalIndex-1]+1,
        y = x-diagonalIndex,
        commonSubsequenceLength = 0;
    while(x < lengthA && y < lengthB && equal(x, y)) {
        ++x;
        ++y;
        ++commonSubsequenceLength;
    }
    envelope[diagonalIndex] = x;
    return [x, y, commonSubsequenceLength];
}

function getCommonSubsequenceAndOptimalLength(equal, beginA, endA, beginB, endB) {
    const lengthA = endA-beginA,
          lengthB = endB-beginB,
          diagonalShift = lengthA-lengthB,
          forwardEnvelope = [0, 0], forwardEqual = (x, y) => equal(beginA+x, beginB+y),
          reverseEnvelope = [0, 0], reverseEqual = (x, y) => equal(endA-x-1, endB-y-1);
    for(let depth = 0; depth <= Math.ceil((lengthA+lengthB)/2); ++depth) {
        for(let diagonalIndex = -depth; diagonalIndex <= depth; diagonalIndex += 2) {
            const [x, y, commonSubsequenceLength] = advanceEnvelope(lengthA, lengthB, forwardEnvelope, forwardEqual, depth, diagonalIndex);
            if(diagonalShift%2 != 0 && diagonalIndex >= diagonalShift-depth && diagonalIndex <= diagonalShift+depth && forwardEnvelope[diagonalIndex]+reverseEnvelope[diagonalShift-diagonalIndex] >= lengthA)
                return [beginA+x-commonSubsequenceLength, beginB+y-commonSubsequenceLength, commonSubsequenceLength, 2*depth-1];
        }
        for(let diagonalIndex = -depth; diagonalIndex <= depth; diagonalIndex += 2) {
            const [x, y, commonSubsequenceLength] = advanceEnvelope(lengthA, lengthB, reverseEnvelope, reverseEqual, depth, diagonalIndex);
            if(diagonalShift%2 == 0 && diagonalIndex >= diagonalShift-depth && diagonalIndex <= diagonalShift+depth && forwardEnvelope[diagonalShift-diagonalIndex]+reverseEnvelope[diagonalIndex] >= lengthA)
                return [endA-x, endB-y, commonSubsequenceLength, 2*depth];
        }
    }
}

function* compareSequences(equal, beginA, endA, beginB, endB) {
    if(beginA == endA || beginB == endB) {
        if(beginA < endA)
            yield [1, beginA, endA];
        if(beginB < endB)
            yield [2, beginB, endB];
        return;
    }
    const [x, y, commonSubsequenceLength, optimalLength] = getCommonSubsequenceAndOptimalLength(equal, beginA, endA, beginB, endB);
    if(optimalLength == 0) {
        yield [3, beginA, endA];
        return;
    } else if(optimalLength == 1) {
        let i;
        for(i = 0; beginA+i < endA && beginB+i < endB && equal(beginA+i, beginB+i); ++i);
        if(i > 0)
            yield [3, beginA, beginA+i];
        yield (endA-beginA > endB-beginB) ? [1, beginA+i, beginA+i+1] : [2, beginB+i, beginB+i+1];
        const restLength = Math.min(endA-beginA, endB-beginB)-i;
        if(restLength > 0)
            yield [3, endA-restLength, endA];
        return;
    }
    for(const entry of compareSequences(equal, beginA, x, beginB, y))
        yield entry;
    if(commonSubsequenceLength > 0)
        yield [3, x, x+commonSubsequenceLength];
    for(const entry of compareSequences(equal, x+commonSubsequenceLength, endA, y+commonSubsequenceLength, endB))
        yield entry;
}

export function* diffOfSequences(equal, lengthA, lengthB) {
    let offsetA = 0, offsetB = 0, prevWasKeep = false;
    const accumulators = [0, 0, 0];
    for(const entry of compareSequences(equal, 0, lengthA, 0, lengthB)) {
        let length = entry[2]-entry[1],
            isKeep = (entry[0] == 3);
        if(!isKeep && prevWasKeep) {
            yield {'offsetA': offsetA, 'offsetB': offsetB, 'remove': accumulators[0], 'insert': accumulators[1], 'keep': accumulators[2]};
            offsetA += accumulators[0]+accumulators[2];
            offsetB += accumulators[1]+accumulators[2];
            for(let i = 0; i < 3; ++i)
                accumulators[i] = 0;
        }
        accumulators[entry[0]-1] += length;
        prevWasKeep = isKeep;
    }
    if(accumulators[0] > 0 || accumulators[1] > 0 || accumulators[2] > 0)
        yield {'offsetA': offsetA, 'offsetB': offsetB, 'remove': accumulators[0], 'insert': accumulators[1], 'keep': accumulators[2]};
    console.assert(offsetA+accumulators[0]+accumulators[2] == lengthA && offsetB+accumulators[1]+accumulators[2] == lengthB);
}
