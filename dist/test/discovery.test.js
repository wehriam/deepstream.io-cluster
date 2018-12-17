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
const ip_1 = require("ip");
const expect_1 = require("expect");
const server_1 = require("./lib/server");
const client_1 = require("./lib/client");
const ports_1 = require("./lib/ports");
const HOST = ip_1.default.address();
const DEEPSTREAM_SEED_PORT = ports_1.getRandomPort();
const PUBSUB_SEED_PORT = ports_1.getRandomPort();
const PIPELINE_SEED_PORT = ports_1.getRandomPort();
describe('Discovery', () => {
    jest.setTimeout(10000);
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
    beforeAll(() => __awaiter(this, void 0, void 0, function* () {
        const seedServer = yield server_1.getServer('server-0', HOST, DEEPSTREAM_SEED_PORT, PUBSUB_SEED_PORT, PIPELINE_SEED_PORT);
        seedServer.startPeerDiscovery({
            ignoreProcess: false,
        });
        const seedClient = yield client_1.getClient(`${HOST}:${DEEPSTREAM_SEED_PORT}`, 'client-0');
        servers.push(seedServer);
        clients.push(seedClient);
        for (let i = 1; i < 4; i += 1) {
            const server = yield server_1.getServer(`server-${i}`, HOST, DEEPSTREAM_SEED_PORT + (i * 3), PUBSUB_SEED_PORT + (i * 3) + 1, PIPELINE_SEED_PORT + (i * 3) + 2);
            server.startPeerDiscovery({
                ignoreProcess: false,
            });
            const client = yield client_1.getClient(`${HOST}:${DEEPSTREAM_SEED_PORT + (i * 3)}`, `client-${i}`);
            servers.push(server);
            clients.push(client);
        }
        yield new Promise(resolve => setTimeout(resolve, 1000));
    }));
    afterAll(() => __awaiter(this, void 0, void 0, function* () {
        for (let i = 0; i < servers.length; i += 1) {
            yield clients[i].shutdown();
            yield servers[i].shutdown();
        }
    }));
    it('Should share record state.', () => __awaiter(this, void 0, void 0, function* () {
        const name = `subscription-${uuid_1.default.v4()}`;
        const value = uuid_1.default.v4();
        const [clientA, clientB] = getRandomClients();
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
        const recordB = clientB.record.getRecord(name);
        recordB.set({ value });
        yield subscribeAPromise;
        recordB.unsubscribe();
        recordB.discard();
    }));
    it('Should make RPC calls.', () => __awaiter(this, void 0, void 0, function* () {
        const name = `rpc-${uuid_1.default.v4()}`;
        const value = `rpc-prefix-${uuid_1.default.v4()}`;
        const [clientA, clientB] = getRandomClients();
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
        const [clientA, clientB] = getRandomClients();
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
    }));
    it('Should listen for events.', () => __awaiter(this, void 0, void 0, function* () {
        const name = `event-${uuid_1.default.v4()}`;
        const value = `event-value-${uuid_1.default.v4()}`;
        const [clientA, clientB] = getRandomClients();
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
        const allUsernames = [];
        for (let i = 0; i < clients.length; i += 1) {
            allUsernames.push(`client-${i}`);
        }
        for (let i = 0; i < clients.length; i += 1) {
            const client = clients[i];
            const expectedUsernames = allUsernames.filter(x => x !== `client-${i}`);
            const usernames = yield new Promise(resolve => client.presence.getAll(resolve));
            usernames.sort();
            expectedUsernames.sort();
            expect_1.default(usernames).toEqual(expectedUsernames);
        }
    }));
});
//# sourceMappingURL=discovery.test.js.map