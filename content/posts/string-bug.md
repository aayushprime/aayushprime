---
title: "String Bug"
date: 2021-12-01T18:06:19+05:45
draft: false 
searchHidden: false
ShowBreadCrumbs: true 
ShowToc: false
TocOpen: false
cover:
    image: "/posts/string-bug/43.gif"
    alt: "Failed image loading"
    caption: ""
    relative: false # To use relative path for cover image, used in hugo Page-bundles
    linkFullImages: true
    responsiveImages: false
---
Today the coding calendar Advent of Code started. 
> You should try it too, [Advent of Code](https://adventofcode.com).   

I tried to solve the first challenge. It was pretty straight forward.
Except, I was stumped by a simple problem.  
Here is my first attempt,  
```py
def part1(lines):
    prev = lines[0]
    more = 0
    for i in range(len(lines) - 1):
        if lines[i+1] > prev:
            more += 1
        prev = lines[i+1]
    print(more)
if __name__ =='__main__':
    with open('./input/day1.txt', 'r') as f:
        lines = [a.strip() for a in f.readlines()]
    part1(lines)
```
The thing is it gives correct result for the test data. So, I assumed it would work for the input data. But, the program always
gave me 1 less than the actual answer. I couldn't figure out why.  
Notice, I use string comparison in the if condition on line 5. 
I knew using string for comparison of numbers was a bad idea but, the following IDLE experiments convinced me otherwise.
```bash
>>> "123" > "456"
False
>>> "456" > "123"
True
```
If you didn't know (I certainly didn't) you can compare strings with the `>` and `<` operators in python.
This led me to believe that comparing numbers would work without explicitly using integers.  
```bash
>>> "1024">"946"
False
```
Here is the problem. String comparison compares the first character of the strings
and the tries to distinguish which is larger. 
Here, even though 1024 is greater than 946, 9 is greater than 1!
The string comparison operator doesn't know better.
I could've casted them to integers or `zfill`ed them to have same number of digits to solve the problem.

And I did, the program now works!
```py
if __name__ =='__main__':
    with open('./input/day1.txt', 'r') as f:
        lines = [int(a.strip()) for a in f.readlines()]
    part1(lines)
```

So, the takeaway is, use numbers(the datatype) when dealing with numbers.
