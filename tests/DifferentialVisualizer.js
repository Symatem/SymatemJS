import BasicBackend from '../BasicBackend.js';
import NativeBackend from '../NativeBackend.js';
import Differential from '../Differential.js';

export function createElement(tag, parentNode) {
    const svgElement = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if(parentNode)
        parentNode.appendChild(svgElement);
    return svgElement;
}

export function setAttribute(node, attribute, value) {
    node.setAttributeNS('http://www.w3.org/1999/xlink', attribute, value);
}

export const backend = new NativeBackend();
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

export function createSlice(diff, symbolSlot, type, second, sliceGroups, operation) {
    operation.id, operation.srcOffset, operation.length
    const sliceElements = symbolSlot[type];
    let sliceElement = sliceElements[operation.id], rect, leftLabel, rightLabel;
    if(sliceElement) {
        rect = sliceElement.childNodes[0];
        leftLabel = sliceElement.childNodes[1];
        rightLabel = sliceElement.childNodes[2];
    } else {
        sliceElements[operation.id] = sliceElement = createElement('g', symbolSlot);
        let sliceGroup = sliceGroups[operation.id];
        if(!sliceGroup)
            sliceGroup = sliceGroups[operation.id] = [];
        sliceGroup.push(sliceElement);
        if(second)
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
            color = (BasicBackend.namespaceOfSymbol(operation.dstSymbol) != diff.repositoryNamespace) ? '#DDF' : '#FDD';
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
    sliceElement.second = second;
    sliceElement.setAttribute('style', `transform: translate(${offsetX*blockSize}px, ${symbolSlot.height*lineHeight}px);`);
    rect.setAttribute('fill', color);
    rect.setAttribute('width', length*blockSize);
    leftLabel.textContent = offsetX;
    rightLabel.textContent = (length == 1) ? '' : offsetX+length-1;
    rightLabel.setAttribute('style', `transform: translate(${length*blockSize-1}px, ${blockSize-textOffsetY}px);`);
    return sliceElement;
}

export function visualizeDifferential(diff, symbolSlots, second) {
    const symbolTags = {}, sliceGroups = {};
    function getSymbolSlot(symbol) {
        let symbolSlot = symbolSlots[symbol];
        if(!symbolSlot) {
            symbolSlot = createElement('g', svgRoot);
            if(second)
                symbolSlot.classList.add('fadeIn');
            symbolSlot.tripleElements = [];
            symbolSlots[symbol] = symbolSlot;
            createTag(symbolTags, symbol, symbolSlot);
        }
        return symbolSlot;
    }
    for(const symbol in diff.preCommitStructure) {
        const operationsOfSymbol = diff.preCommitStructure[symbol],
              symbolSlot = getSymbolSlot(symbol);
        symbolSlot.second = second;
        const colorByType = {'manifest': '#8F8', 'release': '#F88', 'undefined': '#CCC'};
        symbolSlot.childNodes[0].childNodes[0].setAttribute('fill', colorByType[operationsOfSymbol.manifestOrRelease]);
        symbolSlot.height = 1;
        for(const type of ['copyOperations', 'creaseLengthOperations', 'replaceOperations'])
            if(operationsOfSymbol[type]) {
                if(!symbolSlot[type])
                    symbolSlot[type] = [];
                for(const operation of operationsOfSymbol[type]) {
                    createSlice(diff, symbolSlot, type, second, sliceGroups, operation);
                    if(type == 'copyOperations')
                        symbolSlot.height += 1;
                }
                if(type != 'copyOperations')
                    symbolSlot.height += 1;
            }
        const triple = [symbol];
        if(operationsOfSymbol.tripleOperations)
            for(triple[1] in operationsOfSymbol.tripleOperations)
                for(triple[2] in operationsOfSymbol.tripleOperations[triple[1]]) {
                    let tripleElement = symbolSlot.tripleElements[triple.join(',')];
                    if(!tripleElement) {
                        symbolSlot.tripleElements[triple.join(',')] = tripleElement = createElement('g', symbolSlot);
                        if(second)
                            tripleElement.classList.add('fadeIn');
                        const line = createElement('rect', tripleElement);
                        line.setAttribute('width', blockSize*16);
                        line.setAttribute('height', blockSize*0.5);
                        line.setAttribute('y', blockSize*0.25);
                        line.setAttribute('rx', blockSize*0.25);
                        line.setAttribute('ry', blockSize*0.25);
                        line.setAttribute('fill', (operationsOfSymbol.tripleOperations[triple[1]][triple[2]]) ? '#8F8' : '#F88');
                        for(let i = 0; i < 3; ++i) {
                            const symbolTag = createTag(symbolTags, triple[i], tripleElement);
                            symbolTag.setAttribute('style', `transform: translate(${(i*5+1)*blockSize}px, 0px);`);
                        }
                    }
                    tripleElement.second = second;
                    tripleElement.setAttribute('style', `transform: translate(0px, ${symbolSlot.height*lineHeight}px);`);
                    symbolSlot.height += 1;
                }
    }
    let offsetY = 0;
    const sortedSymbols = [];
    for(let symbol in symbolSlots) {
        const symbolSlot = symbolSlots[symbol];
        if(symbolSlot.second == second) {
            for(let i = symbolSlot.childNodes.length-1; i > 0; --i) {
                const childNode = symbolSlot.childNodes[i];
                if(childNode.second != second) {
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
    BasicBackend.sortSymbolsArray(sortedSymbols);
    for(const symbol of sortedSymbols) {
        const symbolSlot = symbolSlots[symbol];
        symbolSlot.setAttribute('style', `transform: translate(0px, ${offsetY*lineHeight}px);`);
        offsetY += symbolSlot.height+1;
    }
}
