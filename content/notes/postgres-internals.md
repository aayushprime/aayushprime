---
title: "Basic Postgres"
date: 2026-08-14T21:04:17+0545
draft: false
searchHidden: false
tags: [postgres]
---


# Pages 
Space on disk is used in blocks called pages. (8KB by default)


# Tables
List of pages (numbered).
eg. page 1-6 => table users
Postgres can jump to the table location.
Rows are represented by a tuple.

Say,
(id, item_id, price) is a row. then, (100, 2000, 300)  
This is called a tuple. Actual data that lives in the page on disk.

The entry is represented by a line pointer.
(page_no, index_in_the_page)

The whole thing where the row data lives is also called heap.


# Indexes

B-trees(a kind of index, gross generalization). Kind of like Binary trees but have range nodes; instead of binary left or right; there is a range, either the first, second ... last.
Indexes is the mapping of a property of the tuple to the location of the tuple.
Eg. property = first element = row 1 value = `id`
or property = sin(row 2 value) = functional index.

When a `update` happens. The original tuple is not modified. A new slot is found in the pages of the table(new page if not found). And the index also needs to be updated to point to the new tuple.


Now, old tuples have to be cleaned up. Thats what `vacuum` does, and all those `autovacuum` options are for.  

Old tuples cannot be cleaned until they are dead. Dead = no transaction depends on them, no transaction can possibly reference them.

