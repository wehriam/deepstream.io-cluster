// @flow

const expect = require('expect');
const { getServer } = require('./lib/server');
const { getClient } = require('./lib/client');
const { getRandomPort } = require('./lib/ports');

const HOST = '127.0.0.1';
const DEEPSTREAM_PORT_A = getRandomPort();
const NANOMSG_PUBSUB_PORT_A = getRandomPort();
const NANOMSG_PIPELINE_PORT_A = getRandomPort();
const DEEPSTREAM_PORT_B = getRandomPort();
const NANOMSG_PUBSUB_PORT_B = getRandomPort();
const NANOMSG_PIPELINE_PORT_B = getRandomPort();
const DEEPSTREAM_PORT_C = getRandomPort();
const NANOMSG_PUBSUB_PORT_C = getRandomPort();
const NANOMSG_PIPELINE_PORT_C = getRandomPort();

describe('Cluster Messaging - Single Node', () => {
  jest.setTimeout(30000);
  let serverA;
  let serverB;

  beforeAll(async () => {
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

  afterAll(async () => {
    await serverA.shutdown();
    await serverB.shutdown();
  });

  it('Should add and remove peers safely - Single Node', async () => {
    const presenceState = {
      SERVER_A: {},
    };


    // Presence
    const presenceClientA = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'presenceA');
    presenceClientA.presence.subscribe((deviceId:string, login:boolean) => {
      if (!presenceState.SERVER_A[deviceId]) {
        presenceState.SERVER_A[deviceId] = [login];
      } else {
        presenceState.SERVER_A[deviceId].push(login);
      }
    });

    // Client A --> Server A
    let clientA = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-A');
    await clientA.shutdown();

    // Client A --> Server B
    clientA = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-A');
    await clientA.shutdown();

    // Client B --> Server B
    let clientB = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-B');
    await clientB.shutdown();

    // Client A --> Server A
    clientA = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-A');
    await clientA.shutdown();

    // Client B --> Server B
    clientB = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-B');
    await clientB.shutdown();

    await new Promise((resolve) => setTimeout(resolve, 100));

    await presenceClientA.shutdown();

    // Client A connected, disconnected thrice
    expect(presenceState.SERVER_A['client-A'].length).toEqual(6);
    expect(presenceState.SERVER_A['client-A'][0]).toEqual(true);
    expect(presenceState.SERVER_A['client-A'][1]).toEqual(false);
    expect(presenceState.SERVER_A['client-A'][2]).toEqual(true);
    expect(presenceState.SERVER_A['client-A'][3]).toEqual(false);
    expect(presenceState.SERVER_A['client-A'][4]).toEqual(true);
    expect(presenceState.SERVER_A['client-A'][5]).toEqual(false);

    // Client B connected, disconnected twice
    expect(presenceState.SERVER_A['client-B'].length).toEqual(4);
    expect(presenceState.SERVER_A['client-B'][0]).toEqual(true);
    expect(presenceState.SERVER_A['client-B'][1]).toEqual(false);
    expect(presenceState.SERVER_A['client-B'][2]).toEqual(true);
    expect(presenceState.SERVER_A['client-B'][3]).toEqual(false);
  });
});


describe('Cluster Messaging - Cluster', () => {
  jest.setTimeout(30000);
  let serverA;
  let serverB;

  beforeAll(async () => {
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

  afterAll(async () => {
    await serverA.shutdown();
    await serverB.shutdown();
  });
  it('Should add and remove peers safely - 3 Node Cluster', async () => {
    const presenceState = {
      SERVER_A: {},
      SERVER_B: {},
      SERVER_C: {},
    };

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
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Presence
    const presenceClientA = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'presenceA');
    presenceClientA.presence.subscribe((deviceId:string, login:boolean) => {
      if (!presenceState.SERVER_A[deviceId]) {
        presenceState.SERVER_A[deviceId] = [login];
      } else {
        presenceState.SERVER_A[deviceId].push(login);
      }
    });
    const presenceClientB = await getClient(`${HOST}:${DEEPSTREAM_PORT_B}`, 'presenceB');
    presenceClientB.presence.subscribe((deviceId:string, login:boolean) => {
      if (!presenceState.SERVER_B[deviceId]) {
        presenceState.SERVER_B[deviceId] = [login];
      } else {
        presenceState.SERVER_B[deviceId].push(login);
      }
    });
    const presenceClientC = await getClient(`${HOST}:${DEEPSTREAM_PORT_C}`, 'presenceC');
    presenceClientC.presence.subscribe((deviceId:string, login:boolean) => {
      if (!presenceState.SERVER_C[deviceId]) {
        presenceState.SERVER_C[deviceId] = [login];
      } else {
        presenceState.SERVER_C[deviceId].push(login);
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Client A --> Server A
    let clientA = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-A');
    await clientA.shutdown();

    // Client A --> Server B
    clientA = await getClient(`${HOST}:${DEEPSTREAM_PORT_B}`, 'client-A');
    await clientA.shutdown();

    // Client B --> Server B
    let clientB = await getClient(`${HOST}:${DEEPSTREAM_PORT_B}`, 'client-B');
    await clientB.shutdown();

    // Client A --> Server A
    clientA = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-A');
    await clientA.shutdown();

    // Client B --> Server B
    clientB = await getClient(`${HOST}:${DEEPSTREAM_PORT_B}`, 'client-B');
    await clientB.shutdown();

    await new Promise((resolve) => setTimeout(resolve, 100));

    await presenceClientA.shutdown();
    await presenceClientB.shutdown();
    await presenceClientC.shutdown();
    await serverC.shutdown();

    // Server A Presence
    // Client A connected, disconnected thrice
    expect(presenceState.SERVER_A['client-A'].length).toEqual(6);
    expect(presenceState.SERVER_A['client-A'][0]).toEqual(true);
    expect(presenceState.SERVER_A['client-A'][1]).toEqual(false);
    expect(presenceState.SERVER_A['client-A'][2]).toEqual(true);
    expect(presenceState.SERVER_A['client-A'][3]).toEqual(false);
    expect(presenceState.SERVER_A['client-A'][4]).toEqual(true);
    expect(presenceState.SERVER_A['client-A'][5]).toEqual(false);

    // Client B connected, disconnected twice
    expect(presenceState.SERVER_A['client-B'].length).toEqual(4);
    expect(presenceState.SERVER_A['client-B'][0]).toEqual(true);
    expect(presenceState.SERVER_A['client-B'][1]).toEqual(false);
    expect(presenceState.SERVER_A['client-B'][2]).toEqual(true);
    expect(presenceState.SERVER_A['client-B'][3]).toEqual(false);

    // Server B Presence
    // Client Å connected, disconnected thrice
    expect(presenceState.SERVER_B['client-A'].length).toEqual(6);
    expect(presenceState.SERVER_B['client-A'][0]).toEqual(true);
    expect(presenceState.SERVER_B['client-A'][1]).toEqual(false);
    expect(presenceState.SERVER_B['client-A'][2]).toEqual(true);
    expect(presenceState.SERVER_B['client-A'][3]).toEqual(false);
    expect(presenceState.SERVER_B['client-A'][4]).toEqual(true);
    expect(presenceState.SERVER_B['client-A'][5]).toEqual(false);

    // Client B connected, disconnected twice
    expect(presenceState.SERVER_B['client-B'].length).toEqual(4);
    expect(presenceState.SERVER_B['client-B'][0]).toEqual(true);
    expect(presenceState.SERVER_B['client-B'][1]).toEqual(false);
    expect(presenceState.SERVER_B['client-B'][2]).toEqual(true);
    expect(presenceState.SERVER_B['client-B'][3]).toEqual(false);

    // Server C Presence
    // Client A connected, disconnected thrice
    expect(presenceState.SERVER_C['client-A'].length).toEqual(6);
    expect(presenceState.SERVER_C['client-A'][0]).toEqual(true);
    expect(presenceState.SERVER_C['client-A'][1]).toEqual(false);
    expect(presenceState.SERVER_C['client-A'][2]).toEqual(true);
    expect(presenceState.SERVER_C['client-A'][3]).toEqual(false);
    expect(presenceState.SERVER_C['client-A'][4]).toEqual(true);
    expect(presenceState.SERVER_C['client-A'][5]).toEqual(false);

    // Client B connected, disconnected twice
    expect(presenceState.SERVER_C['client-B'].length).toEqual(4);
    expect(presenceState.SERVER_C['client-B'][0]).toEqual(true);
    expect(presenceState.SERVER_C['client-B'][1]).toEqual(false);
    expect(presenceState.SERVER_C['client-B'][2]).toEqual(true);
    expect(presenceState.SERVER_C['client-B'][3]).toEqual(false);
  });
});
