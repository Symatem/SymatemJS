# Symatem JS

## QueryMask

The mask is a 3-tuple itself and each position matches one position of the triple using the three possible mask-states:

-   Match: You are looking for triples which match the given triple at this position exactly.
-   Varying: You are looking for all possible combinations and the given triple is ignored at this position.
-   Ignore: You don't care about this position and the given triple is ignored at this position.

So three possible mask-states powered by three positions are 27 possible masks and questions to ask:

-   MMM: Does the given triple exist?
-   VVV: Which triples exist?
-   III: (only for completeness)
-   MII: Is there at least one occurrence of the given entity?
-   IMI: Is there at least one occurrence of the given attribute?
-   IIM: Is there at least one occurrence of the given value?
-   IMM: Is there at least one entity with the given attribute-value-pair?
-   MIM: Is there at least one attribute with the given entity-value-pair?
-   MMI: Is there at least one value with the given entity-attribute-pair?
-   VMM: Which entities has the given attribute-value-pair?
-   MVM: Which attributes has the given entity-value-pair?
-   MMV: Which values has the given entity-attribute-pair?
-   MVV: Which attribute-value pairs has the given entity?
-   VMV: Which entity-value pairs has the given attribute?
-   VVM: Which entity-attribute pairs has the given value?
-   IVM: Which attributes has the given value?
-   VIM: Which entities has the given value?
-   IMV: Which values has the given attribute?
-   MIV: Which values has the given entity?
-   VMI: Which entities has the given attribute?
-   MVI: Which attributes has the given entity?
-   IVV: Which attribute-value pairs exist?
-   VIV: Which entity-value pairs exist?
-   VVI: Which entity-attribute pairs exist?
-   VII: Which entities exist?
-   IVI: Which attributes exist?
-   IIV: Which values exist?

They are accessed by BasicBackend.queryMask.MMM for example.
Positions of the triple which are not masked by Match but by Varying or by Ignore should be set to BasicBackend.symbolByName.Void.
