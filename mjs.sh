#! /bin/bash

mkdir -p dist dist/src dist/tests
FILES="*.js src/*.js tests/*.js"
for src in $FILES
do
    if [ -f $src ] ; then
        dst="${src%.js}.mjs"
        cp $src dist/$dst
        if [[ "$OSTYPE" == "linux-gnu" ]]; then
            sed -i -E 's/\.js/.mjs/g' dist/$dst
        elif [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' -E 's/\.js/.mjs/g' dist/$dst
        else
            echo 'Unsupported OS'
        fi
    fi
done
curl --create-dirs -o dist/backend.wasm -GL https://github.com/Symatem/SymatemRust/releases/latest/download/symatem.wasm
