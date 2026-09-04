---
title: "Designing E2E encrypted financial application: The technical side."
date: 2026-09-05T01:39:24+0545
draft: false
searchHidden: false
ShowBreadCrumbs: false
ShowToc: true
TocOpen: true
cover:
    image: "/posts/designing-e2e-encrypted-financial-application-the-technical-side/image-2.png"
    alt: "Failed image loading"
    caption: ""
    relative: false # To use relative path for cover image, used in hugo Page-bundles
    linkFullImages: true
    responsiveImages: false
---

Originally Posted here: https://bhoos.games/blog/designing-e2e-payroll-application/  
Author: [Kindablissy](https://kindablissy.com/) and [Aayush Lamichhane](https://lamichhaneaayush.com.np/)

Do you want your payroll information in other's hands? Surely, not.

As an online application, a non encrypted data means an open keyhole to your company's inner data for the application's employees, or the spooky feds. "But-but there's rules against it, no one can just look at my data for whatever purposes". Sure buddy, I've never had anyone replay my orders to me in the exact date time and order  from an online store before. Chances are I know yours too. I will surely keep it to myself. Right?

However, you do want the said data to sync between multiple accounts and multiple devices of those accounts, without tipping off the feds of course.

With e2e we are saying, "we don't want your data, keep it to yourself". What you do/have in your private company is your own private concerns. Now the problem is syncing with offline first is difficult and with e2e it is disastrous (at least for me). Now let's dive into whatever we cooked, burnt and recooked all over again for NumPlus and where we are now.

 [Visit NumPlus](http://num.plus/)

# Architecture
Let me start off by saying: "this is not a UI blog", that is probably a rollercoaster of its own. All I know about the UI side is: we use react (maybe). This is more about the backend process that runs off on its own as a separate entity.

## What are we building?
A sync engine that syncs within multiple users without the authenticity of the delivery service (our servers). Yes, you read that right, WE DON'T TRUST OUR OWN SERVERS. However, this does not mean that the engine will function without the server, it just means it remains out of service in case our servers have been hacked, or worse, our own employees have turned against us. Someone with access could definitely render us unavailable, but they cannot forge integrity. I.e, what you see in app is what is definitely there. So there's two parts to this architecture: a sync engine and an e2e encrypted communication module. There are three main "Entities" that models the system: Device, User, and  Organization. We will be talking about the following:

- Sync/Storage
  - Sqlite
  - multi-master sync
- E2E Messaging
  - p2p
  - Group (TreeKEM)
# Encryption
Every client (device) contains a permanent asymetric public and private KeyPair for identification (identity keys), and a seperate encryption public and private KeyPair that can be rotated with time. The encryption public key is used to encrypt messages to that client, and identity keys are used to sign and verify the sender of the message. If Client A wants to send message to Client B, A would encrypt message using B’s encryption public key and sign the message using A’s private identity key. Client B would then verify the sender by verifying the signature of the message with A’s public identity key and B would then encrypt the message using its own private encryption key. 

# Propagation of Trust
How do you know that you are sharing or receiving data with the intended party?

Similar to how TLS uses asymmetric encryption to secure your HTTPS requests, this end-to-end setup also secures the messages shared. In case of TLS, you rely on the CA(certificate authority) to verify the legitimacy of the shared certificate. In our case, we are leaving the verification step to the user (similar to WhatsApp).

To establish trust between two devices that are syncing with each other, they need to be in the same organization. When a device is added to an organization, the adder verifies the identity of the addee and the addee also verifies the identity of the adder using out of bound messages. eg. verifying the key of the other party using email, WhatsApp or similar trusted channel.

Once, trusted keys have been established, they can encrypt the messages using those keys and a third party (even the syncing server) will not be able to read those messages.

# Signal Group Chat Protocol
Our group messaging protocol is loosely inspired by the signal protocol. Once keys have been shared between the devices using out of bound communication, we want to establish a common key that is shared between group members so that each message can be sent once instead of being sent to every member of group. 

In two party communication, we use the publicly known key to encrypt our messages so that only the receiver can decrypt using the corresponding private key.

In group communication, everyone keeps their public key (encryption key) with themselves and shares the private key (decryption key) with all the members of the group. This sharing is again done using the peer to peer channel established during key sharing (just like TLS). To send messages to the group, a member encrypts using their own public key and broadcasts the messages to all members of the group. Since every member knows the sender and their corresponding private key (shared through p2p channel), they can read the message.

# Group Evolution
When a member is added or removed from the group, all the encryption keys of the group members need to be rotated so that the new member cannot read old messages (backward secrecy) and the removed member cannot read new messages (forward secrecy). Each of these operations, will require at least NxN messages between the members (resharing their keys). It should also be done periodically for forward secrecy regardless of membership change. Another issue is it relies on the p2p channel again in sharing of those secrets.

# TreeKEM
Motivation: TreeKEM is a way to arrive at a common group secret and evolve group using only log(N) encryptions, and independently without relying on p2p encryptions.

In TreeKEM the group is represented in a left balanced tree structure where all nodes contain a public and private key-pair.  In a group with n members there would be 2n + 1 nodes, with the leaves representing the members of the group. The private key of a parent nodes (non leaf nodes) are known only to members that belong in the subtree of that node, and the public key is known to all. This means a member can encrypt message using any node of the tree and the message can only be decrypted by the subtree of that node. The private key of the root node is known to all and it can be used to encrypt messages for all the members of the group.

![](/posts/designing-e2e-encrypted-financial-application-the-technical-side/image-5.png)

# Key Generation
Key generation starts from bottom up (leaf to root). The path from leaf to its root is called direct_path. A leaf node is responsible for generating the keypairs for its direct path. The key generation is done in following steps:

- Generate a Random Secret for the Leaf.

- Traverse along the direct path and derive secret for those node using the previous node’s secret.

  ```
  direct_path_node[i].secret = DeriveKey(direct_path_node[i-1].secret)
  ```
- Use the secret to derive the new Public and private key for the nodes.
  ```
  direct_path_node[i].keypair = DeriveKeyPair(direct_path_node[i].secret);
  ```

## Sharing the new Keys
The leaf that is deriving the key encrypts the secrets in such a way that all the nodes in the subtree of the updated node know the new secret to their `direct_path`, i.e we encrypt the parent’s secrets to the sibling of the direct_path. The path that does not belong on the direct_path but still contain all the members of the tree is called the leaf’s co_path. The following figure shows co_path of leaf node for Alice. `Co_path` includes the leaf’s sibling, and the parent’s sibling along the direct_path. This means the number of encryption is log(N). The members can then generate the key-pair for those nodes using the shared secret.  

Only one key is needed by each member because they can then perform the same key derivation technique and derive secrets upward until root themselves and arrive at the same state as the leaf that shared the secret.
![](/posts/designing-e2e-encrypted-financial-application-the-technical-side/image-6.png)

In this diagram, the direct path for Alice is N3-N1-Root. And the copath for Alice is, Bob, N4 and Eminem.

# Messaging
Once, a channel (either p2p or group) has been established, we can start the sync engine on top of the messaging service. The whole architecture works like a e2e messaging system (e.g signal, WhatsApp, and telegram). Every action needs to be synced with all of your devices at least. For e.g creating an organization, creating a new group, adding a new device. All of these changes are broadcasted to all the devices using the p2p channel. Adding a device, would need to be broadcasted to all the group channels as well (same as adding a member to the group).

However, e2e encryption adds slightly but probable unreliability to the system even on top of something like a web-sockets, due to the fact that the key can change. 

This is due to the fact that in group channel, the key can rotate that makes a sent message  invalidated. Generally in networking the receiving party would have to  acknowledge the message then we could mark the message as being sent. But in a messaging system we cannot wait for all the group members to acknowledge the message, since they can be offline. But, being a group channel, we know the message is going to be broadcasted back to us by the delivery service, i.e our servers. We expect the server to order the message and send it in back in the order it receives. Although we have chosen this, it is also optional and a CRDT system could totally be applied here to order the messages completely independently and deterministically regardless of server ordering, but that would add more complexity we don’t need (for now) so we opted out of this option. We only mark a message as being “sent” when we receive the message back. If the message we sent was overwritten by a key rotation, that would make the message invalid since, none of the members are able to decrypt the message post key rotation. The message can then either be sent again, or and error can be thrown to that message in that case.
![](/posts/designing-e2e-encrypted-financial-application-the-technical-side/image-7.png)

Normally, operations like adding a device would be (and is) a very complicated process, where you send message to all the groups, and make sure its acknowledged (returned back to us before any key rotation) in all the groups. In our case however, we only add a device to an organization, so we only need to sync up the device with that organization. Although from the code standpoint its the same thing regardless, the work done by the device is less and with that less of failure points.

## Storage and Sync engine
Being a financial application, the data we deal with is not that complicated. It's mostly just a series of transactions that would basically be: account, credit, debit. The creation of accounts and management of those accounts are a bit tricky but we won't be discussing those here. What we need to think about is mostly storage and sync of those data multiple layers: sync within browser tabs, sync within the user's devices, then sync within the members of organization who are given access to those data each with their own devices and browser tabs.

In other words, we need multi master replication. That means we will need a way to merge changes made independently by two sources. The first thing that comes to mind is CRDT (Conflict-Free Replicated Data Types). For now we are using LWW(Last Writer Wins) merge strategy.

Data operations need to be local first, and also need to work offline. So, we store all data in a local Sqlite file and track the changes made. 

A server then facilitates two clients trying to sync with each other (exchanging the changesets). The server cannot read the data exchanged because they are encrypted using each others’ key pair.the server cannot read messages. Here’s an AI generated system diagram or whatever that is.

![](/posts/designing-e2e-encrypted-financial-application-the-technical-side/image-8.png)

The changes are also broadcasted in multiple tabs. The sync engine however runs only in one of those tabs. I.e any of those tabs can generate change but the communication with other devices and server is done only by one of the tabs. We utilize navigator.locks feature of web browsers to create a sort of master and slave where only one of the tabs race for a lock and all the other tabs (slaves) wait for the lock to be released (tab close) and its now their turn to be the master. The master would broadcast remote changes to other tabs as well. 

Here are some notes (shameless plug) I made during the implementation and design phase for migrating to TreeKEM: [Kindablissy Blog](https://kindablissy.com/posts/mls/?ref=blog.bhoos.dev)
