---
title: "AWS Kinesis"
date: 2026-09-07T21:34:38+0545
draft: false
searchHidden: false
# Tags become nodes in the notes graph — a note with no tags and no links shows
# up as an isolated dot, which is a useful signal that it needs connecting.
tags: [aws, kafka]
---

Exploring AWS Kinesis for fun.

Realtime streaming; ingest, buffer, process
Think kafka but fully managed, auto scaling.

Streams have shards
Shards are made of records
![](/notes/aws-kinesis/image.png)

Records have parition key, same partitionkey => Same shard (just like kafka)  
Max record datablob is 1MB  
Basically,
MySQL => AWS RDS,
Kafka => AWS Kinesis

Two ways to put data into the stream.  
SDK, Kinesis Producer Library(KPL)  
KPL = SDK + Somemore stuff (500 records per call vs SDK's only one per call); only available in Java


### data stream vs delivery stream:
- data stream -> your app does the pushing and pulling from the stream   
- delivery stream(firehose) -> something that aws manages (so all buffering, delivery, retry everything); eg. deliver stuff from stream to s3, redshift

