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
const expect_1 = require("expect");
const server_1 = require("./lib/server");
const client_1 = require("./lib/client");
const ports_1 = require("./lib/ports");
const HOST = '127.0.0.1';
const DEEPSTREAM_SEED_PORT = ports_1.getRandomPort();
const PUBSUB_SEED_PORT = ports_1.getRandomPort();
const PIPELINE_SEED_PORT = ports_1.getRandomPort();
const CLIENT_COUNT = 8;
describe('Cluster Messaging', () => {
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
    const seedServerAddress = {
        host: HOST,
        pubsubPort: PUBSUB_SEED_PORT,
        pipelinePort: PIPELINE_SEED_PORT,
    };
    beforeAll(() => __awaiter(this, void 0, void 0, function* () {
        const seedServer = yield server_1.getServer('server-0', HOST, DEEPSTREAM_SEED_PORT, PUBSUB_SEED_PORT, PIPELINE_SEED_PORT);
        const seedClient = yield client_1.getClient(`${HOST}:${DEEPSTREAM_SEED_PORT}`, 'client-0');
        servers.push(seedServer);
        clients.push(seedClient);
        for (let i = 1; i < CLIENT_COUNT; i += 1) {
            const server = yield server_1.getServer(`server-${i}`, HOST, DEEPSTREAM_SEED_PORT + (i * 3), PUBSUB_SEED_PORT + (i * 3) + 1, PIPELINE_SEED_PORT + (i * 3) + 2, [seedServerAddress]);
            const client = yield client_1.getClient(`${HOST}:${DEEPSTREAM_SEED_PORT + (i * 3)}`, `client-${i}`);
            servers.push(server);
            clients.push(client);
        }
        yield new Promise(resolve => setTimeout(resolve, 100));
    }));
    afterAll(() => __awaiter(this, void 0, void 0, function* () {
        for (let i = 0; i < servers.length; i += 1) {
            yield clients[i].shutdown();
            yield servers[i].shutdown();
        }
    }));
    it('Should share presence.', () => __awaiter(this, void 0, void 0, function* () {
        const [clientA, clientB] = getRandomClients();
        let clientC = clients[Math.floor(Math.random() * clients.length)];
        const randomizeClientC = () => {
            clientC = clients[Math.floor(Math.random() * clients.length)];
            if (clientC.username === clientA.username || clientC.username === clientB.username) {
                randomizeClientC();
            }
        };
        const presenceA = new Set(yield new Promise(resolve => clientA.presence.getAll(resolve)));
        const presenceB = new Set(yield new Promise(resolve => clientB.presence.getAll(resolve)));
        presenceA.add(clientA.username);
        presenceB.add(clientB.username);
        expect_1.default(presenceA.size).toEqual(CLIENT_COUNT);
        expect_1.default(presenceB.size).toEqual(CLIENT_COUNT);
        clientA.presence.subscribe((username, login) => {
            if (login) {
                presenceA.add(username);
            }
            else {
                presenceA.delete(username);
            }
        });
        clientB.presence.subscribe((username, login) => {
            if (login) {
                presenceB.add(username);
            }
            else {
                presenceB.delete(username);
            }
        });
        yield new Promise(resolve => setTimeout(resolve, 100));
        for (let i = 0; i < 20; i += 1) {
            randomizeClientC();
            yield clientC.shutdown();
            yield new Promise(resolve => setTimeout(resolve, 10));
            expect_1.default(presenceA.size).toEqual(CLIENT_COUNT - 1);
            expect_1.default(presenceB.size).toEqual(CLIENT_COUNT - 1);
            yield clientC.loginAgain();
            yield new Promise(resolve => setTimeout(resolve, 10));
            expect_1.default(presenceA.size).toEqual(CLIENT_COUNT);
            expect_1.default(presenceB.size).toEqual(CLIENT_COUNT);
        }
        const tempClients = [];
        for (let i = 0; i < CLIENT_COUNT; i += 1) {
            const tempClient = yield client_1.getClient(`${HOST}:${DEEPSTREAM_SEED_PORT + (i * 3)}`, `client-temp-${i}`);
            tempClients.push(tempClient);
        }
        yield new Promise(resolve => setTimeout(resolve, 200));
        expect_1.default(presenceA.size).toEqual(CLIENT_COUNT * 2);
        expect_1.default(presenceB.size).toEqual(CLIENT_COUNT * 2);
        yield Promise.all(tempClients.map(tempClient => tempClient.shutdown()));
        yield new Promise(resolve => setTimeout(resolve, 200));
        expect_1.default(presenceA.size).toEqual(CLIENT_COUNT);
        expect_1.default(presenceB.size).toEqual(CLIENT_COUNT);
        yield Promise.all(tempClients.map(tempClient => tempClient.loginAgain()));
        yield new Promise(resolve => setTimeout(resolve, 200));
        while (tempClients.length > 0) {
            const tempClient = tempClients.pop();
            yield tempClient.shutdown();
            yield new Promise(resolve => setTimeout(resolve, 100));
            expect_1.default(presenceA.size).toEqual(CLIENT_COUNT + tempClients.length);
            expect_1.default(presenceB.size).toEqual(CLIENT_COUNT + tempClients.length);
        }
    }));
});
//# sourceMappingURL=cluster-messaging-b.test.js.map