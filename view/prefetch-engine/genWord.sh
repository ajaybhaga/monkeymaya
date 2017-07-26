#!/bin/bash
word=$1
max=30

mkdir ../viewer/images/${word}
for (( i=1; i <= $max; ++i ))
do
    echo "$i"
    ./start.sh ${word} 
    sleep 1
    cp render_${word}.gif ../viewer/images/${word}/clip${i}.gif
    sleep 1
done

