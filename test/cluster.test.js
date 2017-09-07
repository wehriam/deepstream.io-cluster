// @flow

const uuid = require('uuid');
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

describe('Cluster', function () {
  this.timeout(10000);
  let serverA;
  let serverB;
  let serverC;
  let clientA;
  let clientB;
  let clientC;

  before(async () => {
    const seedServerAddress = {
      host: HOST,
      pubsubPort: parseInt(NANOMSG_PUBSUB_PORT_A, 10),
      pipelinePort: parseInt(NANOMSG_PIPELINE_PORT_A, 10),
    };
    [serverA, serverB, serverC] = await Promise.all([
      getServer(
        'server-A',
        HOST,
        parseInt(DEEPSTREAM_PORT_A, 10),
        parseInt(NANOMSG_PUBSUB_PORT_A, 10),
        parseInt(NANOMSG_PIPELINE_PORT_A, 10),
      ),
      getServer(
        'server-B',
        HOST,
        parseInt(DEEPSTREAM_PORT_B, 10),
        parseInt(NANOMSG_PUBSUB_PORT_B, 10),
        parseInt(NANOMSG_PIPELINE_PORT_B, 10),
        [seedServerAddress],
      ),
      getServer(
        'server-C',
        HOST,
        parseInt(DEEPSTREAM_PORT_C, 10),
        parseInt(NANOMSG_PUBSUB_PORT_C, 10),
        parseInt(NANOMSG_PIPELINE_PORT_C, 10),
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
    await Promise.all([
      serverA.shutdown(),
      serverB.shutdown(),
      serverC.shutdown(),
    ]);
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
    const recordC = clientB.record.getRecord(name);
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
      const prefixA = uuid.v4();
      clientB.rpc.make(name, prefixA, (errorMessage, result) => {
        if (errorMessage) {
          reject(new Error(errorMessage));
          return;
        }
        if (result !== prefixA + value) {
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
          recordB.discard();
          resolve();
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
    await new Promise((resolve) => {
      clientC.presence.getAll((usernames) => {
        console.log(usernames);
        resolve();
      });
    });
  });
});

