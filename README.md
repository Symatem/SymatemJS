# Symatem JS & WebAssembly API

## Static
### downloadAsFile(dataBytes, fileName)
Saves dataBytes as download file in browsers.
### string = utf8ArrayToString(dataBytes)
Converts a Uint8Array containing UTF8 to a string.
### dataBytes = stringToUtf8Array(string)
Converts a string to a Uint8Array containing UTF8.
### string = encodeText(data)
Converts JS native data types to a string.
### data = decodeText(string)
Converts a string to JS native data types.
### symbol = concatIntoSymbol(namespaceIdentity, identity)
Converts the given identities into a symbol.
### namespaceIdentity = getNameSpaceOfSymbol(symbol)
Extracts the namespace of a symbol.
### identity = getIdentityOfSymbol(symbol)
Extracts the identity of a symbol.

## Symbol
### symbol = manifestSymbol(symbol)
Makes sure the given symbol exists.
### symbol = createSymbol(namespaceIdentity)
Creates a new symbol and returns it.
### releaseSymbol(symbol)
Releases an empty symbol.
But in most cases you want to call unlinkSymbol instead to make sure the symbol is empty.
### unlinkSymbol(symbol)
Unlinks all triples of a symbol and releases it.

## Data
### length = getLength(symbol)
Returns the length of the symbols virtual space.
### setLength(symbol, length)
Increases or deceases the length of a symbols virtual space at the end.
### decreaseLength(symbol, offset, length)
Removes a slice of a symbols virtual space at the given offset and with the given length.
All data behind the slice moves downward.
### increaseLength(symbol, offset, length)
Inserts a slice of a symbols virtual space at the given offset and with the given length.
All data behind the slice moves upward.
### dataBytes = readData(symbol, offset, length)
Returns a slice of data starting at the given offset and with the given length.
NOTE: Do not modify the return value as it might be used internally.
### writeData(symbol, offset, length, dataBytes)
Replaces a slice of data starting at the given offset and with the given length by dataBytes.
### dataValue = getData(symbol)
Returns the symbols entire data converted to JS native data types.
### setData(symbol, dataValue)
Replaces the symbols entire data by JS native data types.

## Triple
### successBool = setTriple([entity, attribute, value], linked)
Links or unlinks a triple.
Returns false if no changes were made.
### bool = getTriple([entity, attribute, value])
Tests if the given Triple exists (same as queryTriples with the mask MMM)
### setSolitary([entity, attribute, value])
Does the same as setTriple (linked = true) but also unlinks all triples with different values and returns nothing.
### value = getSolitary(entity, attribute)
Returns the value if exactly one triple matches with the given entity-attribute-pair.
### iterator = queryTriples(mask, [entity, attribute, value])
Yields all matching triples according to the given triple and mask.
The final .next() returns the count of matches.

The mask is a 3-tuple itself and each position matches one position of the triple using the three possible mask-states:
- Match: You are looking for triples which match the given triple at this position exactly.
- Varying: You are looking for all possible combinations and the given triple is ignored at this position.
- Ignore: You don't care about this position and the given triple is ignored at this position.

So three possible mask-states powered by three positions are 27 possible masks and questions to ask:
- MMM: Does the given triple exist?
- VVV: Which triples exist?
- III: (only for completeness)
- MII: Is there at least one occurrence of the given entity?
- IMI: Is there at least one occurrence of the given attribute?
- IIM: Is there at least one occurrence of the given value?
- IMM: Is there at least one entity with the given attribute-value-pair?
- MIM: Is there at least one attribute with the given entity-value-pair?
- MMI: Is there at least one value with the given entity-attribute-pair?
- VMM: Which entities has the given attribute-value-pair?
- MVM: Which attributes has the given entity-value-pair?
- MMV: Which values has the given entity-attribute-pair?
- MVV: Which attribute-value pairs has the given entity?
- VMV: Which entity-value pairs has the given attribute?
- VVM: Which entity-attribute pairs has the given value?
- IVM: Which attributes has the given value?
- VIM: Which entities has the given value?
- IMV: Which values has the given attribute?
- MIV: Which values has the given entity?
- VMI: Which entities has the given attribute?
- MVI: Which attributes has the given entity?
- IVV: Which attribute-value pairs exist?
- VIV: Which entity-value pairs exist?
- VVI: Which entity-attribute pairs exist?
- VII: Which entities exist?
- IVI: Which attributes exist?
- IIV: Which values exist?

They are accessed by BasicBackend.queryMask.MMM for example.
Positions of the triple which are not masked by Match but by Varying or by Ignore should be set to BasicBackend.symbolByName.Void or 0.

## Ontology
### encodeJson()
Returns the ontology as JSON LTS format.
### decodeJson(data)
Loads an ontology from the JSON LTS format.
