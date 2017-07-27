#!/bin/bash

for extraword in red blue purple black electric fuzzy shiny metal organic plastic earth planet universe
do  
  for word in blissful dreamy defeated furious psychedelic sexy seductive euphoric raging vibrant
  do
    echo word=${word}, extraword=${extraword}
    ./genWord.sh ${word} ${extraword}
  done
done
exit 0


