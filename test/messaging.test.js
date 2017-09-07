// @flow

// Based on deepstream.io-msg-connector-template 
// https://github.com/deepstreamIO/deepstream.io-msg-connector-template

import type { SocketSettings } from '../src/cluster-node';

const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const ClusterNode = require('../src/cluster-node');

chai.use(sinonChai);
const expect = chai.expect;

const HOST = '127.0.0.1';
const NANOMSG_PUBSUB_PORT_A = 7789;
const NANOMSG_PUBSUB_PORT_B = 7889;
const NANOMSG_PUBSUB_PORT_C = 7989;
const NANOMSG_PIPELINE_PORT_A = 8789;
const NANOMSG_PIPELINE_PORT_B = 8889;
const NANOMSG_PIPELINE_PORT_C = 8989;

const addressA = {
  host: HOST,
  pubsubPort: parseInt(NANOMSG_PUBSUB_PORT_A, 10),
  pipelinePort: parseInt(NANOMSG_PIPELINE_PORT_A, 10),
};

const addressB = {
  host: HOST,
  pubsubPort: parseInt(NANOMSG_PUBSUB_PORT_B, 10),
  pipelinePort: parseInt(NANOMSG_PIPELINE_PORT_B, 10),
};

const addressC = {
  host: HOST,
  pubsubPort: parseInt(NANOMSG_PUBSUB_PORT_C, 10),
  pipelinePort: parseInt(NANOMSG_PIPELINE_PORT_C, 10),
};

const messageTimeout = () => new Promise((resolve) => setTimeout(resolve, 20));


const getNode = async (serverName:string, bindAddress:SocketSettings, peerAddresses:Array<SocketSettings>):Promise<ClusterNode> => {
  const node = new ClusterNode({
    serverName,
    cluster: {
      bindAddress,
      peerAddresses,
    },
  });
  expect(node.isReady).to.equal(false);
  await new Promise((resolve, reject) => {
    node.on('ready', resolve);
    node.on('error', reject);
  });
  expect(node.isReady).to.equal(true);
  return node;
};

describe('Messages are sent between multiple instances', () => {
  let nodeA;
  let nodeB;
  let nodeC;
  const callbackA = sinon.spy();
  const callbackB = sinon.spy();
  const callbackC = sinon.spy();

  before(async () => {
    [nodeA, nodeB, nodeC] = await Promise.all([
      getNode('node-A', addressA, []),
      getNode('node-B', addressB, [addressA]),
      getNode('node-C', addressC, [addressA]),
    ]);
  });

  it('subscribes to a topic', async () => {
    nodeA.subscribe('topic1', callbackA);
    nodeB.subscribe('topic1', callbackB);
    nodeC.subscribe('topic1', callbackC);
    expect(callbackA.callCount).to.equal(0);
    await messageTimeout();
  });

  it('nodeB sends a message', async () => {
    nodeB.send('topic1', { some: 'data' });
    await messageTimeout();
  });

  it('nodeA and nodeC have received the message', () => {
    expect(callbackA).to.have.been.calledWith({ some: 'data' });
    expect(callbackB).to.not.have.been.called; // eslint-disable-line no-unused-expressions
    expect(callbackC).to.have.been.calledWith({ some: 'data' });
  });

  it('nodeC sends a message', async () => {
    nodeC.send('topic1', { other: 'value' });
    await messageTimeout();
  });

  it('nodeA and nodeB have received the message', () => {
    expect(callbackA).to.have.been.calledWith({ other: 'value' });
    expect(callbackB).to.have.been.calledWith({ other: 'value' });
    expect(callbackC).to.have.been.calledWith({ some: 'data' });
  });

  it('nodeA and nodeC send messages at the same time', async () => {
    nodeA.send('topic1', { val: 'x' });
    nodeC.send('topic1', { val: 'y' });
    await messageTimeout();
  });

  it('nodeA and nodeB have received the message', () => {
    expect(callbackA).to.have.been.calledWith({ val: 'y' });
    expect(callbackB).to.have.been.calledWith({ val: 'x' });
    expect(callbackB).to.have.been.calledWith({ val: 'y' });
    expect(callbackC).to.have.been.calledWith({ val: 'x' });
  });

  it('nodeA sends a message', async () => {
    nodeA.send('topic1', { notFor: 'A' });
    await messageTimeout();
    expect(callbackA).to.not.have.been.calledWith({ notFor: 'A' });
  });

  it('only connector c has received the message', async () => {
    nodeA.sendDirect('node-C', 'topic1', { onlyFor: 'C' });
    await messageTimeout();
    expect(callbackA).to.not.have.been.calledWith({ onlyFor: 'C' });
    expect(callbackB).to.not.have.been.calledWith({ onlyFor: 'C' });
    expect(callbackC).to.have.been.calledWith({ onlyFor: 'C' });
  });

  it('should remove a peerAddress from the cluster', async () => {
    nodeA.subscribe('topic2', callbackA);
    nodeB.subscribe('topic2', callbackB);
    nodeC.subscribe('topic2', callbackC);
    nodeC.removePeer(addressA);
    await messageTimeout();
    nodeA.send('topic2', { notFor: 'C' });
    expect(callbackA).to.not.have.been.calledWith({ notFor: 'C' });
    expect(callbackB).to.not.have.been.calledWith({ notFor: 'C' });
    expect(callbackC).to.not.have.been.calledWith({ notFor: 'C' });
  });

  it('nodeB can not be closed more than once.', async () => {
    await nodeB.close();
    try {
      await nodeB.close();
    } catch (e) {
      expect(() => {
        throw e;
      }).to.throw(/ClusterNode already closed/);
    }
  });

  it('nodeA and nodeC close gracefuly.', async () => {
    await nodeA.close();
    await nodeC.close();
  });
});
