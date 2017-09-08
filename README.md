## Deepstream.io Cluster
----------------------------------------------
Community supported clustering for [deepstream.io](https://github.com/deepstreamIO/deepstream.io). Based on (Nanomsg)[http://nanomsg.org/].

## Usage:

The `deepstream.io-cluster` extends the base `deepstream.io' module and inherits all other setup parameters.

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
        host: "192.168.1.1"
      }
    ]
  },
});

```

### Server C, 192.168.1.3

```js

const Deepstream = require('deepstream.io-cluster');

const server = new Deepstream({
  cluster: {
    peerAddresses: [
      {
        host: "192.168.1.1"
      }
    ]
  },
});

```

## Options:

```js

const Deepstream = require('deepstream.io-cluster);

const server = new Deepstream({
  cluster: {
    bindAddress: {
      host: "127.0.0.1", // Optional, default "127.0.0.1"
      pubsubPort: 6021, // Optional, default 6021
      pipelinePort: 6022, // Optional, default 6022
    },
    peerAddresses: [
      {
        host: "127.0.0.1", // Required
        pubsubPort: 6021, // Optional, default 6021
        pipelinePort: 6022, // Optional, default 6022
      }
    ]
  },
});

```
