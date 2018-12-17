"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const uuid_1 = require("uuid");
const expect_1 = require("expect");
const server_1 = require("./lib/server");
const client_1 = require("./lib/client");
const ports_1 = require("./lib/ports");
const HOST = '127.0.0.1';
const DEEPSTREAM_PORT_A = ports_1.getRandomPort();
const NANOMSG_PUBSUB_PORT_A = ports_1.getRandomPort();
const NANOMSG_PIPELINE_PORT_A = ports_1.getRandomPort();
const DEEPSTREAM_PORT_B = ports_1.getRandomPort();
const NANOMSG_PUBSUB_PORT_B = ports_1.getRandomPort();
const NANOMSG_PIPELINE_PORT_B = ports_1.getRandomPort();
const DEEPSTREAM_PORT_C = ports_1.getRandomPort();
const NANOMSG_PUBSUB_PORT_C = ports_1.getRandomPort();
const NANOMSG_PIPELINE_PORT_C = ports_1.getRandomPort();
const DEEPSTREAM_PORT_D = ports_1.getRandomPort();
const NANOMSG_PUBSUB_PORT_D = ports_1.getRandomPort();
const NANOMSG_PIPELINE_PORT_D = ports_1.getRandomPort();
const DEEPSTREAM_PORT_E = ports_1.getRandomPort();
const NANOMSG_PUBSUB_PORT_E = ports_1.getRandomPort();
const NANOMSG_PIPELINE_PORT_E = ports_1.getRandomPort();
const messageTimeout = () => new Promise(resolve => setTimeout(resolve, 250));
describe('Cluster', () => {
    jest.setTimeout(10000);
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
    beforeAll(() => __awaiter(this, void 0, void 0, function* () {
        [serverA, serverB, serverC] = yield Promise.all([
            server_1.getServer('server-A', HOST, DEEPSTREAM_PORT_A, NANOMSG_PUBSUB_PORT_A, NANOMSG_PIPELINE_PORT_A),
            server_1.getServer('server-B', HOST, DEEPSTREAM_PORT_B, NANOMSG_PUBSUB_PORT_B, NANOMSG_PIPELINE_PORT_B, [seedServerAddress]),
            server_1.getServer('server-C', HOST, DEEPSTREAM_PORT_C, NANOMSG_PUBSUB_PORT_C, NANOMSG_PIPELINE_PORT_C, [seedServerAddress]),
        ]);
        [clientA, clientB, clientC] = yield Promise.all([
            client_1.getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-A'),
            client_1.getClient(`${HOST}:${DEEPSTREAM_PORT_B}`, 'client-B'),
            client_1.getClient(`${HOST}:${DEEPSTREAM_PORT_C}`, 'client-C'),
        ]);
    }));
    afterAll(() => __awaiter(this, void 0, void 0, function* () {
        yield Promise.all([
            clientA.shutdown(),
            clientB.shutdown(),
            clientC.shutdown(),
        ]);
        yield serverA.shutdown();
        yield serverB.shutdown();
        yield serverC.shutdown();
    }));
    it('Should share record state.', () => __awaiter(this, void 0, void 0, function* () {
        const name = `subscription-${uuid_1.default.v4()}`;
        const value = uuid_1.default.v4();
        const subscribeAPromise = new Promise(resolve => {
            const recordA = clientA.record.getRecord(name);
            recordA.subscribe(data => {
                if (data.value === value) {
                    recordA.unsubscribe();
                    recordA.discard();
                    resolve();
                }
            });
        });
        const subscribeBPromise = new Promise(resolve => {
            const recordB = clientB.record.getRecord(name);
            recordB.subscribe(data => {
                if (data.value === value) {
                    recordB.unsubscribe();
                    recordB.discard();
                    resolve();
                }
            });
        });
        yield new Promise(resolve => setTimeout(resolve, 500));
        const recordC = clientC.record.getRecord(name);
        recordC.set({ value });
        yield subscribeAPromise;
        yield subscribeBPromise;
        recordC.unsubscribe();
        recordC.discard();
    }));
    it('Should make RPC calls.', () => __awaiter(this, void 0, void 0, function* () {
        const name = `rpc-${uuid_1.default.v4()}`;
        const value = `rpc-prefix-${uuid_1.default.v4()}`;
        clientA.rpc.provide(name, (data, response) => {
            response.send(data + value);
        });
        yield new Promise(resolve => setTimeout(resolve, 500));
        yield new Promise((resolve, reject) => {
            const prefixB = uuid_1.default.v4();
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
    }));
    it('Should listen.', () => __awaiter(this, void 0, void 0, function* () {
        const name = `listen/${uuid_1.default.v4()}`;
        const value = `listen-response-${uuid_1.default.v4()}`;
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
        yield new Promise(resolve => {
            const recordB = clientB.record.getRecord(name);
            recordB.subscribe(data => {
                if (data.value === value) {
                    recordB.unsubscribe();
                    recordB.on('discard', resolve);
                    recordB.discard();
                }
            });
        });
        clientA.record.unlisten('listen/*');
        yield messageTimeout();
    }));
    it('Should listen for events.', () => __awaiter(this, void 0, void 0, function* () {
        const name = `event-${uuid_1.default.v4()}`;
        const value = `event-value-${uuid_1.default.v4()}`;
        const eventAPromise = new Promise(resolve => {
            clientA.event.subscribe(name, data => {
                if (data.value === value) {
                    clientA.event.unsubscribe(name);
                    resolve();
                }
            });
        });
        clientB.event.emit(name, { value });
        yield eventAPromise;
    }));
    it('Should share presence.', () => __awaiter(this, void 0, void 0, function* () {
        const usernamesA = yield new Promise(resolve => clientA.presence.getAll(resolve));
        const usernamesB = yield new Promise(resolve => clientB.presence.getAll(resolve));
        const usernamesC = yield new Promise(resolve => clientC.presence.getAll(resolve));
        expect_1.default(usernamesA).toEqual(expect_1.default.arrayContaining(['client-B', 'client-C']));
        expect_1.default(usernamesB).toEqual(expect_1.default.arrayContaining(['client-A', 'client-C']));
        expect_1.default(usernamesC).toEqual(expect_1.default.arrayContaining(['client-A', 'client-B']));
    }));
    it('Should receive presence events.', () => __awaiter(this, void 0, void 0, function* () {
        const loginA2Promise = new Promise(resolve => {
            clientB.presence.subscribe((deviceId, login) => {
                if (deviceId === 'client-A2' && login) {
                    resolve();
                }
            });
        });
        const logoutA2Promise = new Promise(resolve => {
            clientC.presence.subscribe((deviceId, login) => {
                if (deviceId === 'client-A2' && !login) {
                    resolve();
                }
            });
        });
        yield new Promise(resolve => setTimeout(resolve, 1000));
        const clientA2 = yield client_1.getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-A2');
        yield loginA2Promise;
        yield new Promise(resolve => setTimeout(resolve, 1000));
        yield clientA2.shutdown();
        yield logoutA2Promise;
    }));
    it.skip('Should unsubscribe from presence events.', () => __awaiter(this, void 0, void 0, function* () {
        // This doesn't work because the unsubscribe event messaging seems to be off.
        clientB.presence.unsubscribe();
        clientC.presence.unsubscribe();
    }));
    it('Should sync presence with a new server.', () => __awaiter(this, void 0, void 0, function* () {
        const serverD = yield server_1.getServer('server-D', HOST, DEEPSTREAM_PORT_D, NANOMSG_PUBSUB_PORT_D, NANOMSG_PIPELINE_PORT_D, [seedServerAddress]);
        yield new Promise(resolve => setTimeout(resolve, 1000));
        const clientD = yield client_1.getClient(`${HOST}:${DEEPSTREAM_PORT_D}`, 'client-D');
        const usernamesD = yield new Promise(resolve => clientD.presence.getAll(resolve));
        expect_1.default(usernamesD).toEqual(expect_1.default.arrayContaining(['client-A', 'client-B', 'client-C']));
        yield clientD.shutdown();
        yield serverD.shutdown();
    }));
    it('Should sync RPC calls with a new server.', () => __awaiter(this, void 0, void 0, function* () {
        const name = `rpc-${uuid_1.default.v4()}`;
        const value = `rpc-prefix-${uuid_1.default.v4()}`;
        clientA.rpc.provide(name, (data, response) => {
            response.send(data + value);
        });
        const serverD = yield server_1.getServer('server-D', HOST, DEEPSTREAM_PORT_D, NANOMSG_PUBSUB_PORT_D, NANOMSG_PIPELINE_PORT_D, [seedServerAddress]);
        yield new Promise(resolve => setTimeout(resolve, 1000));
        const clientD = yield client_1.getClient(`${HOST}:${DEEPSTREAM_PORT_D}`, 'client-D');
        yield new Promise((resolve, reject) => {
            const prefixD = uuid_1.default.v4();
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
        yield clientD.shutdown();
        yield serverD.shutdown();
        clientA.rpc.unprovide(name);
    }));
    it('Should sync listeners with a new server.', () => __awaiter(this, void 0, void 0, function* () {
        const name = `listen/${uuid_1.default.v4()}`;
        const value = `listen-response-${uuid_1.default.v4()}`;
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
        const serverD = yield server_1.getServer('server-D', HOST, DEEPSTREAM_PORT_D, NANOMSG_PUBSUB_PORT_D, NANOMSG_PIPELINE_PORT_D, [seedServerAddress]);
        yield new Promise(resolve => setTimeout(resolve, 1000));
        const clientD = yield client_1.getClient(`${HOST}:${DEEPSTREAM_PORT_D}`, 'client-D');
        yield new Promise(resolve => {
            const recordD = clientD.record.getRecord(name);
            recordD.subscribe(data => {
                if (data.value === value) {
                    recordD.unsubscribe();
                    recordD.discard();
                    resolve();
                }
            });
        });
        clientA.record.unlisten('listen/*');
        yield messageTimeout();
        yield clientD.shutdown();
        yield serverD.shutdown();
    }));
    it('Should sync events with a new server.', () => __awaiter(this, void 0, void 0, function* () {
        const name = `event-${uuid_1.default.v4()}`;
        const value = `event-value-${uuid_1.default.v4()}`;
        const eventAPromise = new Promise(resolve => {
            clientA.event.subscribe(name, data => {
                if (data.value === value) {
                    clientA.event.unsubscribe(name);
                    resolve();
                }
            });
        });
        const serverD = yield server_1.getServer('server-D', HOST, DEEPSTREAM_PORT_D, NANOMSG_PUBSUB_PORT_D, NANOMSG_PIPELINE_PORT_D, [seedServerAddress]);
        yield new Promise(resolve => setTimeout(resolve, 1000));
        const clientD = yield client_1.getClient(`${HOST}:${DEEPSTREAM_PORT_D}`, 'client-D');
        clientD.event.emit(name, { value });
        yield eventAPromise;
        yield clientD.shutdown();
        yield serverD.shutdown();
        yield messageTimeout();
    }));
    it('Should add and remove peers.', () => __awaiter(this, void 0, void 0, function* () {
        const beforePeersServerNames = serverA.getPeers().map(peer => peer.serverName);
        expect_1.default(beforePeersServerNames).toEqual(['server-B', 'server-C']);
        const serverE = yield server_1.getServer('server-E', HOST, DEEPSTREAM_PORT_E, NANOMSG_PUBSUB_PORT_E, NANOMSG_PIPELINE_PORT_E);
        const addPeerAPromise = new Promise(resolve => {
            serverA.onAddPeer(peerAddress => {
                if (peerAddress.serverName === 'server-E') {
                    resolve();
                }
            });
        });
        const addPeerBPromise = new Promise(resolve => {
            serverB.onAddPeer(peerAddress => {
                if (peerAddress.serverName === 'server-E') {
                    resolve();
                }
            });
        });
        const removePeerAPromise = new Promise(resolve => {
            serverA.onRemovePeer(peerAddress => {
                if (peerAddress.serverName === 'server-E') {
                    resolve();
                }
            });
        });
        const removePeerBPromise = new Promise(resolve => {
            serverB.onRemovePeer(peerAddress => {
                if (peerAddress.serverName === 'server-E') {
                    resolve();
                }
            });
        });
        serverA.addPeer({
            host: HOST,
            pubsubPort: NANOMSG_PUBSUB_PORT_E,
            pipelinePort: NANOMSG_PIPELINE_PORT_E,
        });
        yield new Promise(resolve => setTimeout(resolve, 1000));
        yield addPeerAPromise;
        yield addPeerBPromise;
        const peers = serverA.getPeers().map(peer => peer.serverName);
        expect_1.default(peers).toEqual(['server-B', 'server-C', 'server-E']);
        yield serverE.shutdown();
        yield serverA.removePeer({
            host: HOST,
            pubsubPort: NANOMSG_PUBSUB_PORT_E,
            pipelinePort: NANOMSG_PIPELINE_PORT_E,
        });
        yield removePeerAPromise;
        yield removePeerBPromise;
        const afterPeersServerNames = serverA.getPeers().map(peer => peer.serverName);
        expect_1.default(afterPeersServerNames).toEqual(['server-B', 'server-C']);
        const afterPeersHosts = serverA.getPeers().map(peer => peer.host);
        expect_1.default(afterPeersHosts).toEqual([HOST, HOST]);
        const afterPeersPubsubPorts = serverA.getPeers().map(peer => peer.pubsubPort);
        expect_1.default(afterPeersPubsubPorts).toEqual([NANOMSG_PUBSUB_PORT_B, NANOMSG_PUBSUB_PORT_C]);
        const afterPeersPipelinePorts = serverA.getPeers().map(peer => peer.pipelinePort);
        expect_1.default(afterPeersPipelinePorts).toEqual([NANOMSG_PIPELINE_PORT_B, NANOMSG_PIPELINE_PORT_C]);
    }));
});
//# sourceMappingURL=cluster.test.js.map