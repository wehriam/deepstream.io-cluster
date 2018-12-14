// @flow

// Based on deepstream.io-msg-connector-template
// https://github.com/deepstreamIO/deepstream.io-msg-connector-template

import type { SocketSettings } from '../src/cluster-node';

const expect = require('expect');
const ClusterNode = require('../src/cluster-node');
const { getRandomPort } = require('./lib/ports');

const HOST = '127.0.0.1';
const NANOMSG_PUBSUB_PORT_A = getRandomPort();
const NANOMSG_PUBSUB_PORT_B = getRandomPort();
const NANOMSG_PUBSUB_PORT_C = getRandomPort();
const NANOMSG_PIPELINE_PORT_A = getRandomPort();
const NANOMSG_PIPELINE_PORT_B = getRandomPort();
const NANOMSG_PIPELINE_PORT_C = getRandomPort();

const addressA = {
  host: HOST,
  pubsubPort: NANOMSG_PUBSUB_PORT_A,
  pipelinePort: NANOMSG_PIPELINE_PORT_A,
};

const addressB = {
  host: HOST,
  pubsubPort: NANOMSG_PUBSUB_PORT_B,
  pipelinePort: NANOMSG_PIPELINE_PORT_B,
};

const addressC = {
  host: HOST,
  pubsubPort: NANOMSG_PUBSUB_PORT_C,
  pipelinePort: NANOMSG_PIPELINE_PORT_C,
};

const messageTimeout = () => new Promise((resolve) => setTimeout(resolve, 250));


const getNode = async (serverName:string, bindAddress:SocketSettings, peerAddresses:Array<SocketSettings>):Promise<ClusterNode> => {
  const node = new ClusterNode({
    serverName,
    cluster: {
      bindAddress,
      peerAddresses,
    },
  });
  expect(node.isReady).toEqual(false);
  await new Promise((resolve, reject) => {
    node.on('ready', resolve);
    node.on('error', reject);
  });
  expect(node.isReady).toEqual(true);
  return node;
};

describe('Messages are sent between multiple instances', () => {
  let nodeA;
  let nodeB;
  let nodeC;
  const callbackA = jest.fn();
  const callbackB = jest.fn();
  const callbackC = jest.fn();

  beforeAll(async () => {
    nodeA = await getNode('node-A', addressA, []);
    nodeB = await getNode('node-B', addressB, [addressA]);
    nodeC = await getNode('node-C', addressC, [addressA]);
  });

  it('subscribes to a topic', async () => {
    nodeA.subscribe('topic1', callbackA);
    nodeB.subscribe('topic1', callbackB);
    nodeC.subscribe('topic1', callbackC);
    await messageTimeout();
    expect(callbackA).not.toHaveBeenCalled();
    expect(callbackB).not.toHaveBeenCalled();
    expect(callbackC).not.toHaveBeenCalled();
  });

  it('nodeB sends a message', async () => {
    nodeB.send('topic1', { some: 'data' });
    await messageTimeout();
  });

  it('nodeA and nodeC have received the message', () => {
    expect(callbackA).toHaveBeenCalledWith({ some: 'data' }, 'node-B');
    expect(callbackB).not.toHaveBeenCalledWith({ some: 'data' }, 'node-B');
    expect(callbackC).toHaveBeenCalledWith({ some: 'data' }, 'node-B');
  });

  it('nodeC sends a message', async () => {
    nodeC.send('topic1', { other: 'value' });
    await messageTimeout();
  });

  it('nodeA and nodeB have received the message', () => {
    expect(callbackA).toHaveBeenCalledWith({ other: 'value' }, 'node-C');
    expect(callbackB).toHaveBeenCalledWith({ other: 'value' }, 'node-C');
    expect(callbackC).not.toHaveBeenCalledWith({ other: 'value' }, 'node-C');
  });


  it('nodeA and nodeC send messages at the same time', async () => {
    nodeA.send('topic1', { val: 'x' });
    nodeC.send('topic1', { val: 'y' });
    await messageTimeout();
  });

  it('nodeA and nodeB have received the message', () => {
    expect(callbackA).toHaveBeenCalledWith({ val: 'y' }, 'node-C');
    expect(callbackB).toHaveBeenCalledWith({ val: 'x' }, 'node-A');
    expect(callbackB).toHaveBeenCalledWith({ val: 'y' }, 'node-C');
    expect(callbackC).toHaveBeenCalledWith({ val: 'x' }, 'node-A');
  });

  it('nodeA sends a message', async () => {
    nodeA.send('topic1', { notFor: 'A' });
    await messageTimeout();
    expect(callbackA).not.toHaveBeenCalledWith({ notFor: 'A' }, 'node-A');
    expect(callbackB).toHaveBeenCalledWith({ notFor: 'A' }, 'node-A');
    expect(callbackC).toHaveBeenCalledWith({ notFor: 'A' }, 'node-A');
  });

  it('only connector c has received the message', async () => {
    nodeA.sendDirect('node-C', 'topic1', { onlyFor: 'C' });
    await messageTimeout();
    expect(callbackA).not.toHaveBeenCalledWith({ onlyFor: 'C' }, 'node-A');
    expect(callbackB).not.toHaveBeenCalledWith({ onlyFor: 'C' }, 'node-A');
    expect(callbackC).toHaveBeenCalledWith({ onlyFor: 'C' }, 'node-A');
  });

  it('should remove a peerAddress from the cluster', async () => {
    nodeA.subscribe('topic2', callbackA);
    nodeB.subscribe('topic2', callbackB);
    nodeC.subscribe('topic2', callbackC);
    nodeC.removePeer(addressA);
    await messageTimeout();
    nodeA.send('topic2', { notFor: 'C' });
    await messageTimeout();
    expect(callbackA).not.toHaveBeenCalledWith({ notFor: 'C' }, 'node-A');
    expect(callbackB).not.toHaveBeenCalledWith({ notFor: 'C' }, 'node-A');
    expect(callbackC).not.toHaveBeenCalledWith({ notFor: 'C' }, 'node-A');
  });

  it('nodeB can not be closed more than once.', async () => {
    await nodeB.close();
    try {
      await nodeB.close();
    } catch (e) {
      expect(() => {
        throw e;
      }).toThrowError(/ClusterNode already closed/);
    }
    await messageTimeout();
  });

  it('nodeA and nodeC close gracefuly.', async () => {
    await nodeA.close();
    await nodeC.close();
  });
});

