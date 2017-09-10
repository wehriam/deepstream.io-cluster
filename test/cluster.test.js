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
const DEEPSTREAM_PORT_D = 9020;
const NANOMSG_PUBSUB_PORT_D = 9021;
const NANOMSG_PIPELINE_PORT_D = 9022;

describe('Cluster', function () {
  this.timeout(10000);
  let serverA;
  let serverB;
  let serverC;
  let clientA;
  let clientB;
  let clientC;

  const seedServerAddress = {
    host: HOST,
    pubsubPort: NANOMSG_PUBSUB_PORT_A,
    pipelinePort: NANOMSG_PIPELINE_PORT_A,
  };

  before(async () => {
    [serverA, serverB, serverC] = await Promise.all([
      getServer(
        'server-A',
        HOST,
        DEEPSTREAM_PORT_A,
        NANOMSG_PUBSUB_PORT_A,
        NANOMSG_PIPELINE_PORT_A,
      ),
      getServer(
        'server-B',
        HOST,
        DEEPSTREAM_PORT_B,
        NANOMSG_PUBSUB_PORT_B,
        NANOMSG_PIPELINE_PORT_B,
        [seedServerAddress],
      ),
      getServer(
        'server-C',
        HOST,
        DEEPSTREAM_PORT_C,
        NANOMSG_PUBSUB_PORT_C,
        NANOMSG_PIPELINE_PORT_C,
        [seedServerAddress],
      ),
    ]);
    [clientA, clientB, clientC] = await Promise.all([
      getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-A'),
      getClient(`${HOST}:${DEEPSTREAM_PORT_B}`, 'client-B'),
      getClient(`${HOST}:${DEEPSTREAM_PORT_C}`, 'client-C'),
    ]);
  });

  after(async () => {
    await Promise.all([
      clientA.shutdown(),
      clientB.shutdown(),
      clientC.shutdown(),
    ]);
    await serverA.shutdown();
    await serverB.shutdown();
    await serverC.shutdown();
  });

  it('Should share record state.', async () => {
    const name = `subscription-${uuid.v4()}`;
    const value = uuid.v4();
    const subscribeAPromise = new Promise((resolve) => {
      const recordA = clientA.record.getRecord(name);
      recordA.subscribe((data) => {
        if (data.value === value) {
          recordA.unsubscribe();
          recordA.discard();
          resolve();
        }
      });
    });
    const subscribeBPromise = new Promise((resolve) => {
      const recordB = clientB.record.getRecord(name);
      recordB.subscribe((data) => {
        if (data.value === value) {
          recordB.unsubscribe();
          recordB.discard();
          resolve();
        }
      });
    });
    const recordC = clientC.record.getRecord(name);
    recordC.set({ value });
    await subscribeAPromise;
    await subscribeBPromise;
    recordC.unsubscribe();
    recordC.discard();
  });

  it('Should make RPC calls.', async () => {
    const name = `rpc-${uuid.v4()}`;
    const value = `rpc-prefix-${uuid.v4()}`;
    clientA.rpc.provide(name, (data:string, response:{send: Function}) => {
      response.send(data + value);
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await new Promise((resolve, reject) => {
      const prefixB = uuid.v4();
      clientB.rpc.make(name, prefixB, (errorMessage, result) => {
        if (errorMessage) {
          reject(new Error(errorMessage));
          return;
        }
        if (result !== prefixB + value) {
          reject(new Error('RPC value does not match'));
          return;
        }
        resolve();
      });
    });
    clientA.rpc.unprovide(name);
  });

  it('Should listen.', async () => {
    const name = `listen/${uuid.v4()}`;
    const value = `listen-response-${uuid.v4()}`;
    clientA.record.listen('listen/*', (match, isSubscribed, response) => {
      if (!isSubscribed) {
        return;
      }
      const recordA = clientA.record.getRecord(match);
      response.accept();
      recordA.set({ value }, () => {
        recordA.discard();
      });
    });
    await new Promise((resolve) => {
      const recordB = clientB.record.getRecord(name);
      recordB.subscribe((data) => {
        if (data.value === value) {
          recordB.unsubscribe();
          recordB.on('discard', resolve);
          recordB.discard();
        }
      });
    });
    clientA.record.unlisten('listen/*');
  });

  it('Should listen for events.', async () => {
    const name = `event-${uuid.v4()}`;
    const value = `event-value-${uuid.v4()}`;
    const eventAPromise = new Promise((resolve) => {
      clientA.event.subscribe(name, (data) => {
        if (data.value === value) {
          clientA.event.unsubscribe(name);
          resolve();
        }
      });
    });
    clientB.event.emit(name, { value });
    await eventAPromise;
  });

  it('Should share presence.', async () => {
    const usernamesA = await new Promise((resolve) => clientA.presence.getAll(resolve));
    const usernamesB = await new Promise((resolve) => clientB.presence.getAll(resolve));
    const usernamesC = await new Promise((resolve) => clientC.presence.getAll(resolve));
    expect(usernamesA).to.include.members(['client-B', 'client-C']);
    expect(usernamesB).to.include.members(['client-A', 'client-C']);
    expect(usernamesC).to.include.members(['client-A', 'client-B']);
  });

  it('Should sync presence with a new server.', async () => {
    const serverD = await getServer(
      'server-D',
      HOST,
      DEEPSTREAM_PORT_D,
      NANOMSG_PUBSUB_PORT_D,
      NANOMSG_PIPELINE_PORT_D,
      [seedServerAddress],
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const clientD = await getClient(`${HOST}:${DEEPSTREAM_PORT_D}`, 'client-D');
    const usernamesD = await new Promise((resolve) => clientD.presence.getAll(resolve));
    expect(usernamesD).to.include.members(['client-A', 'client-B', 'client-C']);
    await clientD.shutdown();
    await serverD.shutdown();
  });

  it('Should sync RPC calls with a new server.', async () => {
    const name = `rpc-${uuid.v4()}`;
    const value = `rpc-prefix-${uuid.v4()}`;
    clientA.rpc.provide(name, (data:string, response:{send: Function}) => {
      response.send(data + value);
    });
    const serverD = await getServer(
      'server-D',
      HOST,
      DEEPSTREAM_PORT_D,
      NANOMSG_PUBSUB_PORT_D,
      NANOMSG_PIPELINE_PORT_D,
      [seedServerAddress],
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const clientD = await getClient(`${HOST}:${DEEPSTREAM_PORT_D}`, 'client-D');
    await new Promise((resolve, reject) => {
      const prefixD = uuid.v4();
      clientD.rpc.make(name, prefixD, (errorMessage, result) => {
        if (errorMessage) {
          reject(new Error(errorMessage));
          return;
        }
        if (result !== prefixD + value) {
          reject(new Error('RPC value does not match'));
          return;
        }
        resolve();
      });
    });
    await clientD.shutdown();
    await serverD.shutdown();
    clientA.rpc.unprovide(name);
  });

  it('Should sync listeners with a new server.', async () => {
    const name = `listen/${uuid.v4()}`;
    const value = `listen-response-${uuid.v4()}`;
    clientA.record.listen('listen/*', (match, isSubscribed, response) => {
      if (!isSubscribed) {
        return;
      }
      const recordA = clientA.record.getRecord(match);
      response.accept();
      recordA.set({ value }, () => {
        recordA.discard();
      });
    });
    const serverD = await getServer(
      'server-D',
      HOST,
      DEEPSTREAM_PORT_D,
      NANOMSG_PUBSUB_PORT_D,
      NANOMSG_PIPELINE_PORT_D,
      [seedServerAddress],
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const clientD = await getClient(`${HOST}:${DEEPSTREAM_PORT_D}`, 'client-D');
    await new Promise((resolve) => {
      const recordD = clientD.record.getRecord(name);
      recordD.subscribe((data) => {
        if (data.value === value) {
          recordD.unsubscribe();
          recordD.discard();
          resolve();
        }
      });
    });
    await clientD.shutdown();
    await serverD.shutdown();
    clientA.record.unlisten('listen/*');
  });

  it('Should sync events with a new server.', async () => {
    const name = `event-${uuid.v4()}`;
    const value = `event-value-${uuid.v4()}`;
    const eventAPromise = new Promise((resolve) => {
      clientA.event.subscribe(name, (data) => {
        if (data.value === value) {
          clientA.event.unsubscribe(name);
          resolve();
        }
      });
    });
    const serverD = await getServer(
      'server-D',
      HOST,
      DEEPSTREAM_PORT_D,
      NANOMSG_PUBSUB_PORT_D,
      NANOMSG_PIPELINE_PORT_D,
      [seedServerAddress],
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const clientD = await getClient(`${HOST}:${DEEPSTREAM_PORT_D}`, 'client-D');
    clientD.event.emit(name, { value });
    await eventAPromise;
    await clientD.shutdown();
    await serverD.shutdown();
  });

  it('Should add and remove peers.', async () => {
    const beforePeers = serverA.getPeers().map((peer) => peer.serverName);
    expect(beforePeers).to.eql(['server-B', 'server-C']);
    const serverD = await getServer(
      'server-D',
      HOST,
      DEEPSTREAM_PORT_D,
      NANOMSG_PUBSUB_PORT_D,
      NANOMSG_PIPELINE_PORT_D,
    );
    serverA.addPeer({
      host: HOST,
      pubsubPort: NANOMSG_PUBSUB_PORT_D,
      pipelinePort: NANOMSG_PIPELINE_PORT_D,
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const peers = serverA.getPeers().map((peer) => peer.serverName);
    expect(peers).to.eql(['server-B', 'server-C', 'server-D']);
    await serverD.shutdown();
    await serverA.removePeer({
      host: HOST,
      pubsubPort: NANOMSG_PUBSUB_PORT_D,
      pipelinePort: NANOMSG_PIPELINE_PORT_D,
    });
    const afterPeers = serverA.getPeers().map((peer) => peer.serverName);
    expect(afterPeers).to.eql(['server-B', 'server-C']);
  });
});

