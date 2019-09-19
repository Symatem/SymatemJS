import {SymbolInternals, SymbolMap, JavaScriptBackend, Differential} from '../SymatemJS.js';

export function createElement(tag, parentNode) {
    const svgElement = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if(parentNode)
        parentNode.appendChild(svgElement);
    return svgElement;
}

export function setAttribute(node, attribute, value) {
    node.setAttributeNS('http://www.w3.org/1999/xlink', attribute, value);
}

export const backend = new JavaScriptBackend();
backend.initPredefinedSymbols();

export const blockSize = 16, lineHeight = 18, textOffsetY = 4,
             svgRoot = createElement('svg', document.body);
svgRoot.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
svgRoot.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
svgRoot.setAttribute('version', '1.1');
const css = createElement('style', document.head);
css.type = 'text/css';
css.textContent = `
@keyframes fadeOut {
    0% { opacity: 1; }
    100% { opacity: 0; }
}

@keyframes fadeIn {
    0% { opacity: 0; }
    100% { opacity: 1; }
}

.fadeIn {
    animation: fadeIn 0.25s ease-in-out forwards;
}

.fadeOut {
    animation: fadeOut 0.25s ease-in-out forwards;
    pointer-events: none;
}

svg {
    width: 10000px;
    height: 200000px;
}

* {
    -webkit-transition: all 0.5s ease-in-out;
    -moz-transition: all 0.5s ease-in-out;
    -o-transition: all 0.5s ease-in-out;
    transition: all 0.5s ease-in-out;
}

text {
    font-size: 12;
    font-family: monospace;
}

rect {
    stroke-width: 2px;
}`;

export function createTag(tagsByName, name, parent) {
    const tagElement = createElement('g', parent),
          border = createElement('rect', tagElement);
    border.setAttribute('width', blockSize*4);
    border.setAttribute('height', blockSize);
    border.setAttribute('rx', blockSize*0.5);
    border.setAttribute('ry', blockSize*0.5);
    border.setAttribute('fill', '#CCC');
    const text = createElement('text', tagElement);
    text.textContent = name;
    text.setAttribute('x', blockSize*0.5);
    text.setAttribute('y', blockSize-textOffsetY);
    tagElement.onmouseover = () => {
        for(const tagElement of tagsByName[name])
            tagElement.childNodes[0].setAttribute('stroke', '#333');
    };
    tagElement.onmouseout = () => {
        for(const tagElement of tagsByName[name])
            tagElement.childNodes[0].removeAttribute('stroke');
    };
    if(!tagsByName[name])
        tagsByName[name] = [];
    tagsByName[name].push(tagElement);
    return tagElement;
}

export function createSlice(diff, symbolSlot, type, animationSlot, sliceGroups, operation) {
    operation.trackingId, operation.srcOffset, operation.length
    const sliceElements = symbolSlot[type];
    let sliceElement = sliceElements[operation.trackingId], rect, leftLabel, rightLabel;
    if(sliceElement) {
        rect = sliceElement.childNodes[0];
        leftLabel = sliceElement.childNodes[1];
        rightLabel = sliceElement.childNodes[2];
    } else {
        sliceElements[operation.trackingId] = sliceElement = createElement('g', symbolSlot);
        let sliceGroup = sliceGroups[operation.trackingId];
        if(!sliceGroup)
            sliceGroup = sliceGroups[operation.trackingId] = [];
        sliceGroup.push(sliceElement);
        if(animationSlot)
            sliceElement.classList.add('fadeIn');
        sliceElement.onmouseover = () => {
            for(const sliceElement of sliceGroup) {
                sliceElement.classList.remove('fadeIn');
                sliceElement.parentNode.appendChild(sliceElement);
                sliceElement.childNodes[0].setAttribute('stroke', '#333');
            }
        };
        sliceElement.onmouseout = () => {
            for(const sliceElement of sliceGroup)
                sliceElement.childNodes[0].removeAttribute('stroke');
        };
        rect = createElement('rect', sliceElement);
        rect.setAttribute('height', blockSize);
        leftLabel = createElement('text', sliceElement);
        leftLabel.setAttribute('x', 1);
        leftLabel.setAttribute('y', blockSize-textOffsetY);
        rightLabel = createElement('text', sliceElement);
        rightLabel.setAttribute('text-anchor', 'end');
    }
    let color;
    switch(type) {
        case 'copyOperations':
            color = SymbolInternals.areSymbolsEqual(operation.dstSymbol, diff.dataRestore) ? '#FDD' : '#DDF';
            break;
        case 'creaseLengthOperations':
            color = (operation.length < 0) ? '#F88' : '#8F8';
            break;
        case 'replaceOperations':
            color = '#99F';
            break;
    }
    const offsetX = (type == 'copyOperations') ? operation.srcOffset : operation.dstOffset,
          length = Math.abs(operation.length);
    sliceElement.animationSlot = animationSlot;
    sliceElement.setAttribute('style', `transform: translate(${offsetX*blockSize}px, ${symbolSlot.height*lineHeight}px);`);
    rect.setAttribute('fill', color);
    rect.setAttribute('width', length*blockSize);
    leftLabel.textContent = offsetX;
    rightLabel.textContent = (length == 1) ? '' : offsetX+length-1;
    rightLabel.setAttribute('style', `transform: translate(${length*blockSize-1}px, ${blockSize-textOffsetY}px);`);
    return sliceElement;
}

export function visualizeDifferential(diff, symbolSlots, animationSlot) {
    const symbolTags = {}, sliceGroups = {};
    function getSymbolSlot(symbol) {
        let symbolSlot = SymbolMap.get(symbolSlots, symbol);
        if(!symbolSlot) {
            symbolSlot = createElement('g', svgRoot);
            if(animationSlot)
                symbolSlot.classList.add('fadeIn');
            symbolSlot.tripleElements = [];
            SymbolMap.insert(symbolSlots, symbol, symbolSlot);
            createTag(symbolTags, symbol, symbolSlot);
        }
        return symbolSlot;
    }
    for(const [symbol, operationsOfSymbol] of SymbolMap.entries(diff.preCommitStructure)) {
        const symbolSlot = getSymbolSlot(symbol);
        symbolSlot.animationSlot = animationSlot;
        const colorByType = {'manifest': '#8F8', 'release': '#F88', 'undefined': '#CCC'};
        symbolSlot.childNodes[0].childNodes[0].setAttribute('fill', colorByType[operationsOfSymbol.manifestOrRelease]);
        symbolSlot.height = 1;
        for(const type of ['copyOperations', 'creaseLengthOperations', 'replaceOperations'])
            if(operationsOfSymbol[type]) {
                if(!symbolSlot[type])
                    symbolSlot[type] = [];
                for(const operation of operationsOfSymbol[type]) {
                    createSlice(diff, symbolSlot, type, animationSlot, sliceGroups, operation);
                    if(type == 'copyOperations')
                        symbolSlot.height += 1;
                }
                if(type != 'copyOperations')
                    symbolSlot.height += 1;
            }
        const triple = [symbol];
        if(operationsOfSymbol.tripleOperations)
            for(const [beta, gammaCollection] of SymbolMap.entries(operationsOfSymbol.tripleOperations)) {
                triple[1] = beta;
                for(const [gamma, link] of SymbolMap.entries(gammaCollection)) {
                    triple[2] = gamma;
                    let tripleElement = symbolSlot.tripleElements[triple.join(';')];
                    if(!tripleElement) {
                        symbolSlot.tripleElements[triple.join(';')] = tripleElement = createElement('g', symbolSlot);
                        if(animationSlot)
                            tripleElement.classList.add('fadeIn');
                        const line = createElement('rect', tripleElement);
                        line.setAttribute('width', blockSize*16);
                        line.setAttribute('height', blockSize*0.5);
                        line.setAttribute('y', blockSize*0.25);
                        line.setAttribute('rx', blockSize*0.25);
                        line.setAttribute('ry', blockSize*0.25);
                        line.setAttribute('fill', link ? '#8F8' : '#F88');
                        for(let i = 0; i < 3; ++i) {
                            const symbolTag = createTag(symbolTags, triple[i], tripleElement);
                            symbolTag.setAttribute('style', `transform: translate(${(i*5+1)*blockSize}px, 0px);`);
                        }
                    }
                    tripleElement.animationSlot = animationSlot;
                    tripleElement.setAttribute('style', `transform: translate(0px, ${symbolSlot.height*lineHeight}px);`);
                    symbolSlot.height += 1;
                }
            }
    }
    let offsetY = 0;
    const sortedSymbols = [];
    for(const [symbol, symbolSlot] of SymbolMap.entries(symbolSlots)) {
        if(symbolSlot.animationSlot == animationSlot) {
            for(let i = symbolSlot.childNodes.length-1; i > 0; --i) {
                const childNode = symbolSlot.childNodes[i];
                if(childNode.animationSlot != animationSlot) {
                    childNode.classList.remove('fadeIn');
                    childNode.classList.add('fadeOut');
                }
            }
            sortedSymbols.push(symbol);
        } else {
            symbolSlot.classList.remove('fadeIn');
            symbolSlot.classList.add('fadeOut');
        }
    }
    sortedSymbols.sort(SymbolInternals.compareSymbols);
    for(const symbol of sortedSymbols) {
        const symbolSlot = SymbolMap.get(symbolSlots, symbol);
        symbolSlot.setAttribute('style', `transform: translate(0px, ${offsetY*lineHeight}px);`);
        offsetY += symbolSlot.height+1;
    }
}
