// @flow

const uuid = require('uuid');
const { expect } = require('chai');
const { getServer } = require('./lib/server');
const { getClient } = require('./lib/client');

const HOST = '127.0.0.1';
const DEEPSTREAM_PORT_A = 6020;
const NANOMSG_PUBSUB_PORT_A = 6021;
const NANOMSG_PIPELINE_PORT_A = 6022;
const DEEPSTREAM_PORT_B = 7020;
const NANOMSG_PUBSUB_PORT_B = 7021;
const NANOMSG_PIPELINE_PORT_B = 7022;
const DEEPSTREAM_PORT_C = 8020;
const NANOMSG_PUBSUB_PORT_C = 8021;
const NANOMSG_PIPELINE_PORT_C = 8022;

describe('Cluster Messaging - Single Node', function () {
  this.timeout(30000);
  let serverA;
  let serverB;

  before(async () => {
    serverA = await getServer(
      'server-A',
      HOST,
      DEEPSTREAM_PORT_A,
      NANOMSG_PUBSUB_PORT_A,
      NANOMSG_PIPELINE_PORT_A,
    );

    serverB = await getServer(
      'server-B',
      HOST,
      DEEPSTREAM_PORT_B,
      NANOMSG_PUBSUB_PORT_B,
      NANOMSG_PIPELINE_PORT_B,
      [{
        host: HOST,
        pubsubPort: NANOMSG_PUBSUB_PORT_A,
        pipelinePort: NANOMSG_PIPELINE_PORT_A,
      }],
    );
  });

  after(async () => {
    await serverA.shutdown();
    await serverB.shutdown();
  });

  it('Should add and remove peers safely - Single Node', async () => {
    const presenceState = {
      SERVER_A: {},
    };
    const recordNameA = uuid.v4();
    const recordNameB = uuid.v4();
    const recordValueA = `REC_A--${uuid.v4()}`;
    const recordValueB = `REC_B--${uuid.v4()}`;

    // Presense
    const presenseClientA = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'presenseA');
    presenseClientA.presence.subscribe((deviceId:string, login:boolean) => {
      console.log('PRESENSE SERVER A:', deviceId, login);
      if (!presenceState.SERVER_A[deviceId]) {
        presenceState.SERVER_A[deviceId] = [login];
      } else {
        presenceState.SERVER_A[deviceId].push(login);
      }
    });

    // Client A --> Server A
    let clientA = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-A');
    let recordA = clientA.record.getRecord(recordNameA);
    recordA.set({ value: recordValueA }, async () => {
      recordA.discard();
      await clientA.shutdown();
    });

    // Client A --> Server B
    clientA = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-A');
    recordA = clientA.record.getRecord(recordNameA);
    recordA.set({ value: recordValueB }, async () => {
      recordA.discard();
      await clientA.shutdown();
    });

    // Client B --> Server B
    let clientB = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-B');
    let recordB = clientB.record.getRecord(recordNameB);
    recordB.set({ value: recordValueB }, async () => {
      recordB.discard();
      await clientB.shutdown();
    });

    // Client A --> Server A
    clientA = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-A');
    recordA = clientA.record.getRecord(recordNameA);
    recordA.set({ value: 'END' }, async () => {
      recordA.discard();
      await clientA.shutdown();
    });

    // Client B --> Server B
    clientB = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-B');
    recordB = clientB.record.getRecord(recordNameB);
    recordB.set({ value: 'END' }, async () => {
      recordB.discard();
      await clientB.shutdown();
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log('\n\nPRESENSE RECORD ON SINGLE NODE\n', presenceState);
    await presenseClientA.shutdown();

    // Client A connected, disconnected thrice
    expect(presenceState.SERVER_A['client-A'].length).to.equal(6);
    expect(presenceState.SERVER_A['client-A'][0]).to.equal(true);
    expect(presenceState.SERVER_A['client-A'][1]).to.equal(false);
    expect(presenceState.SERVER_A['client-A'][2]).to.equal(true);
    expect(presenceState.SERVER_A['client-A'][3]).to.equal(false);
    expect(presenceState.SERVER_A['client-A'][4]).to.equal(true);
    expect(presenceState.SERVER_A['client-A'][5]).to.equal(false);

    // Client B connected, disconnected twice
    expect(presenceState.SERVER_A['client-B'].length).to.equal(4);
    expect(presenceState.SERVER_A['client-B'][0]).to.equal(true);
    expect(presenceState.SERVER_A['client-B'][1]).to.equal(false);
    expect(presenceState.SERVER_A['client-B'][2]).to.equal(true);
    expect(presenceState.SERVER_A['client-B'][3]).to.equal(false);
  });
});


describe('Cluster Messaging - Cluster', function () {
  this.timeout(30000);
  let serverA;
  let serverB;

  before(async () => {
    serverA = await getServer(
      'server-A',
      HOST,
      DEEPSTREAM_PORT_A,
      NANOMSG_PUBSUB_PORT_A,
      NANOMSG_PIPELINE_PORT_A,
    );

    serverB = await getServer(
      'server-B',
      HOST,
      DEEPSTREAM_PORT_B,
      NANOMSG_PUBSUB_PORT_B,
      NANOMSG_PIPELINE_PORT_B,
      [{
        host: HOST,
        pubsubPort: NANOMSG_PUBSUB_PORT_A,
        pipelinePort: NANOMSG_PIPELINE_PORT_A,
      }],
    );
  });

  after(async () => {
    await serverA.shutdown();
    await serverB.shutdown();
  });
  it('Should add and remove peers safely - 3 Node Cluster', async () => {
    const presenceState = {
      SERVER_A: {},
      SERVER_B: {},
      SERVER_C: {},
    };
    const recordNameA = uuid.v4();
    const recordNameB = uuid.v4();
    const recordValueA = `REC_A--${uuid.v4()}`;
    const recordValueB = `REC_B--${uuid.v4()}`;

    const serverC = await getServer(
      'server-C',
      HOST,
      DEEPSTREAM_PORT_C,
      NANOMSG_PUBSUB_PORT_C,
      NANOMSG_PIPELINE_PORT_C,
      [{
        host: HOST,
        pubsubPort: NANOMSG_PUBSUB_PORT_A,
        pipelinePort: NANOMSG_PIPELINE_PORT_A,
      }],
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    // Presense
    const presenseClientA = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'presenseA');
    presenseClientA.presence.subscribe((deviceId:string, login:boolean) => {
      console.log('PRESENSE SERVER A:', deviceId, login);
      if (!presenceState.SERVER_A[deviceId]) {
        presenceState.SERVER_A[deviceId] = [login];
      } else {
        presenceState.SERVER_A[deviceId].push(login);
      }
    });
    const presenseClientB = await getClient(`${HOST}:${DEEPSTREAM_PORT_B}`, 'presenseB');
    presenseClientB.presence.subscribe((deviceId:string, login:boolean) => {
      console.log('PRESENSE SERVER B:', deviceId, login);
      if (!presenceState.SERVER_B[deviceId]) {
        presenceState.SERVER_B[deviceId] = [login];
      } else {
        presenceState.SERVER_B[deviceId].push(login);
      }
    });
    const presenseClientC = await getClient(`${HOST}:${DEEPSTREAM_PORT_C}`, 'presenseC');
    presenseClientC.presence.subscribe((deviceId:string, login:boolean) => {
      console.log('PRESENSE SERVER C:', deviceId, login);
      if (!presenceState.SERVER_C[deviceId]) {
        presenceState.SERVER_C[deviceId] = [login];
      } else {
        presenceState.SERVER_C[deviceId].push(login);
      }
    });

    // Client A --> Server A
    let clientA = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-A');
    let recordA = clientA.record.getRecord(recordNameA);
    recordA.set({ value: recordValueA }, async () => {
      recordA.discard();
      await clientA.shutdown();
    });

    // Client A --> Server B
    clientA = await getClient(`${HOST}:${DEEPSTREAM_PORT_B}`, 'client-A');
    recordA = clientA.record.getRecord(recordNameA);
    recordA.set({ value: recordValueB }, async () => {
      recordA.discard();
      await clientA.shutdown();
    });

    // Client B --> Server B
    let clientB = await getClient(`${HOST}:${DEEPSTREAM_PORT_B}`, 'client-B');
    let recordB = clientB.record.getRecord(recordNameB);
    recordB.set({ value: recordValueB }, async () => {
      recordB.discard();
      await clientB.shutdown();
    });

    // Client A --> Server A
    clientA = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-A');
    recordA = clientA.record.getRecord(recordNameA);
    recordA.set({ value: 'END' }, async () => {
      recordA.discard();
      await clientA.shutdown();
    });

    // Client B --> Server B
    clientB = await getClient(`${HOST}:${DEEPSTREAM_PORT_B}`, 'client-B');
    recordB = clientB.record.getRecord(recordNameB);
    recordB.set({ value: 'END' }, async () => {
      recordB.discard();
      await clientB.shutdown();
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log('\n\nPRESENSE RECORD ON CLUSTER\n', presenceState);
    await presenseClientA.shutdown();
    await presenseClientB.shutdown();
    await presenseClientC.shutdown();
    await serverC.shutdown();

    // Server A Presense
    // Client A connected, disconnected thrice
    expect(presenceState.SERVER_A['client-A'].length).to.equal(6);
    expect(presenceState.SERVER_A['client-A'][0]).to.equal(true);
    expect(presenceState.SERVER_A['client-A'][1]).to.equal(false);
    expect(presenceState.SERVER_A['client-A'][2]).to.equal(true);
    expect(presenceState.SERVER_A['client-A'][3]).to.equal(false);
    expect(presenceState.SERVER_A['client-A'][4]).to.equal(true);
    expect(presenceState.SERVER_A['client-A'][5]).to.equal(false);

    // Client B connected, disconnected twice
    expect(presenceState.SERVER_A['client-B'].length).to.equal(4);
    expect(presenceState.SERVER_A['client-B'][0]).to.equal(true);
    expect(presenceState.SERVER_A['client-B'][1]).to.equal(false);
    expect(presenceState.SERVER_A['client-B'][2]).to.equal(true);
    expect(presenceState.SERVER_A['client-B'][3]).to.equal(false);

    // Server B Presense
    // Client Å connected, disconnected thrice
    expect(presenceState.SERVER_B['client-A'].length).to.equal(6);
    expect(presenceState.SERVER_B['client-A'][0]).to.equal(true);
    expect(presenceState.SERVER_B['client-A'][1]).to.equal(false);
    expect(presenceState.SERVER_B['client-A'][2]).to.equal(true);
    expect(presenceState.SERVER_B['client-A'][3]).to.equal(false);
    expect(presenceState.SERVER_B['client-A'][4]).to.equal(true);
    expect(presenceState.SERVER_B['client-A'][5]).to.equal(false);

    // Client B connected, disconnected twice
    expect(presenceState.SERVER_B['client-B'].length).to.equal(4);
    expect(presenceState.SERVER_B['client-B'][0]).to.equal(true);
    expect(presenceState.SERVER_B['client-B'][1]).to.equal(false);
    expect(presenceState.SERVER_B['client-B'][2]).to.equal(true);
    expect(presenceState.SERVER_B['client-B'][3]).to.equal(false);

    // Server C Presense
    // Client A connected, disconnected thrice
    expect(presenceState.SERVER_C['client-A'].length).to.equal(6);
    expect(presenceState.SERVER_C['client-A'][0]).to.equal(true);
    expect(presenceState.SERVER_C['client-A'][1]).to.equal(false);
    expect(presenceState.SERVER_C['client-A'][2]).to.equal(true);
    expect(presenceState.SERVER_C['client-A'][3]).to.equal(false);
    expect(presenceState.SERVER_C['client-A'][4]).to.equal(true);
    expect(presenceState.SERVER_C['client-A'][5]).to.equal(false);

    // Client B connected, disconnected twice
    expect(presenceState.SERVER_C['client-B'].length).to.equal(4);
    expect(presenceState.SERVER_C['client-B'][0]).to.equal(true);
    expect(presenceState.SERVER_C['client-B'][1]).to.equal(false);
    expect(presenceState.SERVER_C['client-B'][2]).to.equal(true);
    expect(presenceState.SERVER_C['client-B'][3]).to.equal(false);
  });
});
