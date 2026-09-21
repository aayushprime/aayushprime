---
title: "vlcn.io/cr-sqlite working"
date: 2026-09-21T16:18:59+0545
draft: false
searchHidden: false
# Tags become nodes in the notes graph — a note with no tags and no links shows
# up as an isolated dot, which is a useful signal that it needs connecting.
tags: []
---

It is a sqlite extension built for multiple platforms.
written in rust, uses a C layer to make rust work.

```core/
  src/              C SQLite extension layer, triggers, virtual tables
  rs/core/          Rust CRDT, clock, merge, schema, and replication logic
  rs/bundle/        Rust library bundle
  rs/integration_check/
                    Rust integration tests
  Makefile          Builds loadable/static SQLite binaries

py/
  correctness/      Python synchronization and merge tests
  perf/             Performance experiments

README.md           Usage, replication model, CRDT design, build instructions
Makefile            Initializes submodules and builds core
```

How to use?
```
CREATE TABLE notes (
  id INTEGER PRIMARY KEY NOT NULL,
  title TEXT,
  body TEXT
);

SELECT crsql_as_crr('notes');
```

Now changes to the table notes are tracked in a table `crsql_changes`

```SELECT
  "table",
  "pk",
  "cid",
  "val",
  "col_version",
  "db_version",
  "site_id",
  "cl",
  "seq"
FROM crsql_changes;
```

This can then be sent over the network to another device and they can merge their changes and arrive at a same dataset.
Merge using insert into `crsql_changes`. 

# How changes are stored
It is not a append only log. It is whats called a history-free crdt. It stores row + some metadata to compare deterministically and tell who should win.

For each `crr` table it creates two other tables.
### notes__crsql_pks:
   mapping for primary key of the table. eg. The table itself might use a composite, complex structure, but that is mapped to a simple number for tracking in the changes.
### notes__crsql_clock`:  
This stores the metadata required for merging and which version is the authoritative. It stores data per row per column. So a single row update = #columns entries in this table (if all rows were updated).

Data stored in `*__crsql_clock`:
- key : which row (id)
- col_name: which column (name)
- col_version: 
- site_id: who (unique id generated when initializing db)
  exists because a node must also apply changes from other sites, and distinguish between them. Compare between two remote sites and determine whose change is the "winner".
- seq: tracks changes within a transaction (first row change is 1, second one is 2 ...)

   `crsql_changes` table is not a change_log it is generated from current table state + clock metadata.

  A `Change` is the following
  ```
  table       = notes
  pk          = id = 1 (which row)
  cid         = body   (which column)
  val         = "updated text" (what is the new value)
  col_version = 7 (version for that column)
  db_version  = 20 (global db version)
  site_id     = peer B (site id)
  cl          = 1 (causal length)
  seq         = 3 (ordering within a transaction)
  ```

## How merging works
how it knows same row was modified. Using the `id`. If same id's columns were modified, they are assumed same.

The exact rule for which change should win depends on the type of the column.

```
if incoming version > local version:
    accept incoming value
else:
    keep local value
```

how to determine causal ordering?
1. Compare causal length (cl)  
     Odd cl = Alive/inserted state  
     Even cl = Deleted state
   This is how many times the row has been inserted/deleted. Lifecycle  
   Note: that a discrepancy can happen here. If A inserts/deletes a lot of time, his change will win B's change even though B might have inserted at a later Wall time (but who's looking at Wall time)
 3. Column version:
    if cl is same, col_version is compared.
    This is the n'th update of the column itself. (not whole row delete/insert)  
    `db_version` -> which transaction does this change belong to.
    
5. Actual value  
   use greater of incoming and local, if still same,  use `siteId`.  
   why do we care if values are same? future changes might depend and a clear winner (even for metadata) is always better  
   if different data types:  NULL < INTEGER < FLOAT < TEXT < BLOB
      
        
`db_version` is inserted into clock table when remote change is accepted. (we have now moved to that point in updates, hand wavy explanation)

 Deletes: 
 A tombstone is saved to prevent resurrections.


 mixed support for CRDT types
 - last writer wins
 - counter (add the two changes)
-  multi-value register: retain both (dont merge)
-  fractional index: floating point range to insert new items between already existing (for ordering without reindexing all items)
 - observe-remove set: merge additions and removals casually
  
  Further exploration,
  The README describes a future/alternate “causal event log” approach that would retain every modification, support custom conflict policies, and allow forks. That is different from the current history-free approach.
