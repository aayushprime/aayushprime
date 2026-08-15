---
title: "Recursive CTE"
date: 2026-08-14T21:04:17+0545
draft: false
searchHidden: false
tags: [postgres]
---

```sql
with recursive all_cte_test as (
    select 1 as a, 2 as b
    union all
    select b, b+1 from all_cte_test
)
select * from all_cte_test limit 10;
```


It was really surprising to me how this query even stops. 

It is like one of those recursive functions that is taught when we encounter the `recursion` in the college classes for the first time.
All the magic is within the cte that is `recursive` and named `all_cte_test`.

If ctes' executed completely before the actual query (select in this case), this query (as a whole) would never end. The select at the end is doing nothing special is what I would like say but it is applying the limit (telling when to stop).

The first select before the union is the starting point, and the select after the union is the next step which references itself.
The cte itself wouldn't be able to reference itself if it were not marked `recursive`.

Rather than just viewing this query like a means to pull data from the database. It makes it apparent that you are computing something using the database.
