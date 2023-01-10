---
title: "Python: Solving slow eval"
date: 2023-01-10T20:49:42+05:45
draft: false
searchHidden: false
ShowBreadCrumbs: false
ShowToc: true
TocOpen: true
cover:
    image: "/posts/solveeval/cover.png"
    alt: "Failed image loading"
    caption: ""
    relative: false # To use relative path for cover image, used in hugo Page-bundles
    linkFullImages: true
    responsiveImages: false
---

Welcome to another one of my interesting findings, where I explore some stuff for fun ~~and profit~~ **just fun**

A while back I was solving [AOC](https://adventofcode.com/) and for a problem (day 13), I had this sort of clever idea of using eval to skip writing a `if else`  ladder.
The input file had the following structure
```Monkey 1:
  Starting items: 91, 65
  Operation: new = old * 13
  Test: divisible by 5
    If true: throw to monkey 7
    If false: throw to monkey 4
```
I had to parse the file to get all values, but when parsing the second line I thought why not use the python interpretor itself. And so, I created a variable called `old` and whenever it needed updating I would use the following line
```
old = eval( "line 2 after the equal part" )
```
The cleaver part was that I was skipping having to translate whatever symbol was present in the input (one of `+`, `-` , `/` or `*`)
This was fine for the `test` input, but it became slow when I ran it against the larger input.   
I ran `python -m cProfile main.py` to find out that it was `eval` that took a bunch of time. It was being invoked a lot of time because it was called in the update loop.  
So, I thought,  
why not store the function into a lambda before hand and then just call the lambda instead of calling eval?
And that's exactly what I did, and it worked. The unoptimized program took about 6 seconds when running on the complete input. But after I stored the operation in a lambda, it was basically instant.
So, here is the main "trick"
```
operation = eval("lambda old: " + lines[2].split("=")[1].strip())
```
Notice the parameter name of the lambda "old" it is necessary because the string is "old" in the input. 

>So, why is running eval repeatedly slow?  
  Eval is used for evaluating dynamic expressions, but we already have a fixed expression, so eval is doing extra work trying to evaluate the same expression many times, if we compile the expression to a lambda, we can just execute a lambda and it is a lot faster.
