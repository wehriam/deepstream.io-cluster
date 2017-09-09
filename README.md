## Deepstream.io Cluster
----------------------------------------------
Community supported clustering for [deepstream.io](https://github.com/deepstreamIO/deepstream.io). Based on [Nanomsg](http://nanomsg.org/).

[![CircleCI](https://circleci.com/gh/wehriam/deepstream.io-cluster.svg?style=svg)](https://circleci.com/gh/wehriam/deepstream.io-cluster) [![npm version](https://badge.fury.io/js/deepstream.io-cluster.svg)](http://badge.fury.io/js/deepstream.io-cluster)

## Usage:

```sh
yarn install deepstream.io-cluster
```

The `deepstream.io-cluster` module extends the base `deepstream.io`.

Peers bootstrap off of each other.

### Server A, 192.168.1.1

```js
const Deepstream = require('deepstream.io-cluster');

const server = new Deepstream();
```

### Server B, 192.168.1.2

```js
const Deepstream = require('deepstream.io-cluster');

const server = new Deepstream({
  cluster: {
    peerAddresses: [
      {
        host: '192.168.1.1'
      }
    ]
  },
});
```

### Server C, 192.168.1.3

```js
const Deepstream = require('deepstream.io-cluster');

const server = new Deepstream();

server.addPeer({host: '192.168.1.1'});
```

## Options

```js
const Deepstream = require('deepstream.io-cluster');

const server = new Deepstream({
  cluster: {
    bindAddress: {
      host: '127.0.0.1', // Optional, default '127.0.0.1'
      pubsubPort: 6021, // Optional, default 6021
      pipelinePort: 6022, // Optional, default 6022
    },
    peerAddresses: [
      {
        host: '127.0.0.1', // Required
        pubsubPort: 6021, // Optional, default 6021
        pipelinePort: 6022, // Optional, default 6022
      }
    ]
  },
});
```

## Methods

```js
server.addPeer({
  host: '192.168.1.2', // Required
  pubsubPort: 6021, // Optional, default 6021
  pipelinePort: 6022, // Optional, default 6022
});
```

```js
// Returns a Promise.

server.removePeer({
  host: '192.168.1.2', // Required
  pubsubPort: 6021, // Optional, default 6021
  pipelinePort: 6022, // Optional, default 6022
});
```

```js
server.getPeers();

// Returns:
//
// [
//   {
//     serverName: "server-2",
//     host: '192.168.1.2',
//     pubsubPort: 6021,
//     pipelinePort: 6022,
//   },
//   {
//     serverName: "server-3",
//     host: '192.168.1.3',
//     pubsubPort: 6021,
//     pipelinePort: 6022,
//   },
// ]
```


