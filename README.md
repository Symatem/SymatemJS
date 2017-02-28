# Symatem JS/WebAssembly API

## Symbol
### symbolID = createSymbol()
Returns a new symbol.
### releaseSymbol(symbolID)
Releases a symbol you don't need anymore.
But in most cases you want to call unlinkSymbol instead.
### unlinkSymbol(symbolID)
Unlinks all triples of a symbol and releases it.

## Blob
### sizeInBits = getBlobSize(symbolID)
Returns the size of a blobs virtual space.
### setBlobSize(symbolID, sizeInBits)
Increases or deceases the size of a blobs virtual space at the end.
### successBool = decreaseBlobSize(symbolID, offsetInBits, lengthInBits)
Removes a slice of a blobs virtual space at the given offset and with the given length.
All data behind the slice moves down.
Returns true on success and false if invalid parameters were given.
### successBool = increaseBlobSize(symbolID, offsetInBits, lengthInBits)
Inserts a slice of a blobs virtual space at the given offset and with the given length.
All data behind the slice moves up.
Returns true on success and false if invalid parameters were given.
### dataAsUint8Array = readBlob(symbolID, offsetInBits, lengthInBits)
Returns a slice of a blob starting at the given offset and with the given length or nothing if invalid parameters were given.
The slice will start at the beginning if no offset is given and reach to the end if no length is given.
### successBool = writeBlob(dataAsUint8Array, symbolID, offsetInBits, paddingInBits)
Replaces a slice of a blob starting at the given offset and with the length of the given data minus the given padding by the given data.
The slice will start at the beginning if no offset is given and have the length of the given data if no padding is given.
Returns true on success and false if invalid parameters were given.
### symbolID = getBlobType(symbolID)
Returns the symbolID of the type associated with the given blobs symbolID.
### data = getBlob(symbolID)
Returns an entire blob converted to JS native data types.
### setBlob(data, symbolID)
Replaces an entire blob by JS native data types.
### string = serializeBlob(symbolID)
Converts a blob to a string.
### data = deserializeBlob(string)
Converts a string to JS native data types.

## Triple
### successBool = linkTriple(entitySymbolID, attributeSymbolID, valueSymbolID)
Returns true if the created triple didn't exist before and false otherwise.
### successBool = unlinkTriple(entitySymbolID, attributeSymbolID, valueSymbolID)
Returns true if the removed triple existed before and false otherwise.
### resultArray = queryArray(mask, entitySymbolID, attributeSymbolID, valueSymbolID)
Returns the set of all matching symbolIDs, pairs or triples according to the given triple and mask.

The mask is a 3-tuple itself and each position matches one position of the triple using the three possible mask-states:
- Match: You are looking for triples which match the given triple at this position exactly.
- Varying: You are looking for all possible combinations and the given triple is ignored at this position.
- Ignore: You don't care about this position and the given triple is ignored at this position.

So three possible mask-states powered by three positions are 27 possible masks and questions to ask:
- MMM: Does the given triple exist?
- VVV: Which triples exist?
- III: Is there at least one triple?
- MII: Is there at least one occurrence of the given entity?
- IMI: Is there at least one occurrence of the given attribute?
- IIM: Is there at least one occurrence of the given value?
- IMM: Is there at least one entity with the given attribute-value pair?
- MIM: Is there at least one attribute with the given entity-value pair?
- MMI: Is there at least one value with the given entity-attribute pair?
- VMM: Which entities has the given attribute-value pair?
- MVM: Which attributes has the given entity-value pair?
- MMV: Which values has the given entity-attribute pair?
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

They are accessed by Symatem.queryMask.MMM for example.
Positions of the triple which aren't masked by match but varying or ignore should be set to Symatem.symbolByName.Void or 0.
The second dimension of the result array corresponds to the count of varyings in the mask.
So without any varying you will get an empty result, but you could use resultCount() instead.
### resultCount = queryCount(mask, entitySymbolID, attributeSymbolID, valueSymbolID)
Does the same as queryArray but returns only the count of triple matches independent of the count of varyings in the mask.
### setSolitary(entitySymbolID, attributeSymbolID, valueSymbolID)
Does the same as linkTriple but also unlinks all triples with different values and returns nothing.

## Ontology
### dataAsUint8Array = encodeOntologyBinary()
Returns the entire ontology as binary LTS format.
### decodeOntologyBinary(dataAsUint8Array)
Loads an entire ontology from the binary LTS format.
### dataAsUint8Array = saveImage()
Returns the entire VM-state as RAM-image which might be incompatible with other versions.
### loadImage(dataAsUint8Array)
Loads an entire VM-state from a RAM-image which might be incompatible with other versions.
### resetImage()
Resets the VM-state.
