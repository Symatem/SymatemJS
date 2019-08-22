#! /bin/bash

mkdir -p dist dist/tests
FILES="*.js tests/*.js"
for src in $FILES
do
    dst="${src%.js}.mjs"
    cp $src dist/$dst
    sed -i '' -E 's/\.js/.mjs/g' dist/$dst
done
