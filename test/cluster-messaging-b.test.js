// @flow

// const uuid = require('uuid');
const { expect } = require('chai');
const { getServer } = require('./lib/server');
const { getClient } = require('./lib/client');

const HOST = '127.0.0.1';
const DEEPSTREAM_SEED_PORT = 6000;
const PUBSUB_SEED_PORT = 6001;
const PIPELINE_SEED_PORT = 6002;
const CLIENT_COUNT = 8;

describe('Cluster Messaging', function () {
  this.timeout(10000);
  const servers = [];
  const clients = [];

  const getRandomClients = () => {
    const clientA = clients[Math.floor(Math.random() * clients.length)];
    let clientB = clientA;
    while (clientB === clientA) {
      clientB = clients[Math.floor(Math.random() * clients.length)];
    }
    return [clientA, clientB];
  };

  const seedServerAddress = {
    host: HOST,
    pubsubPort: PUBSUB_SEED_PORT,
    pipelinePort: PIPELINE_SEED_PORT,
  };

  before(async () => {
    const seedServer = await getServer(
      'server-0',
      HOST,
      DEEPSTREAM_SEED_PORT,
      PUBSUB_SEED_PORT,
      PIPELINE_SEED_PORT,
    );
    const seedClient = await getClient(`${HOST}:${DEEPSTREAM_SEED_PORT}`, 'client-0');
    servers.push(seedServer);
    clients.push(seedClient);
    for (let i = 1; i < CLIENT_COUNT; i += 1) {
      const server = await getServer(
        `server-${i}`,
        HOST,
        DEEPSTREAM_SEED_PORT + (i * 3),
        PUBSUB_SEED_PORT + (i * 3) + 1,
        PIPELINE_SEED_PORT + (i * 3) + 2,
        [seedServerAddress],
      );
      const client = await getClient(`${HOST}:${DEEPSTREAM_SEED_PORT + (i * 3)}`, `client-${i}`);
      servers.push(server);
      clients.push(client);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  after(async () => {
    for (let i = 0; i < servers.length; i += 1) {
      await clients[i].shutdown();
      await servers[i].shutdown();
    }
  });

  it('Should share presence.', async () => {
    const [clientA, clientB] = getRandomClients();
    let clientC = clients[Math.floor(Math.random() * clients.length)];
    const randomizeClientC = () => {
      clientC = clients[Math.floor(Math.random() * clients.length)];
      if (clientC.username === clientA.username || clientC.username === clientB.username) {
        randomizeClientC();
      }
    };
    const presenceA = new Set(await new Promise((resolve) => clientA.presence.getAll(resolve)));
    const presenceB = new Set(await new Promise((resolve) => clientB.presence.getAll(resolve)));
    presenceA.add(clientA.username);
    presenceB.add(clientB.username);
    expect(presenceA.size).to.equal(CLIENT_COUNT);
    expect(presenceB.size).to.equal(CLIENT_COUNT);
    clientA.presence.subscribe((username:string, login:boolean) => {
      if (login) {
        presenceA.add(username);
      } else {
        presenceA.delete(username);
      }
    });
    clientB.presence.subscribe((username:string, login:boolean) => {
      if (login) {
        presenceB.add(username);
      } else {
        presenceB.delete(username);
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    for (let i = 0; i < 5; i += 1) {
      randomizeClientC();
      await clientC.shutdown();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(presenceA.size).to.equal(CLIENT_COUNT - 1);
      expect(presenceB.size).to.equal(CLIENT_COUNT - 1);
      await clientC.loginAgain();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(presenceA.size).to.equal(CLIENT_COUNT);
      expect(presenceB.size).to.equal(CLIENT_COUNT);
    }
  });
});

