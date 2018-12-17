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
const DEEPSTREAM_PORT_A = ports_1.getRandomPort();
const NANOMSG_PUBSUB_PORT_A = ports_1.getRandomPort();
const NANOMSG_PIPELINE_PORT_A = ports_1.getRandomPort();
const DEEPSTREAM_PORT_B = ports_1.getRandomPort();
const NANOMSG_PUBSUB_PORT_B = ports_1.getRandomPort();
const NANOMSG_PIPELINE_PORT_B = ports_1.getRandomPort();
const DEEPSTREAM_PORT_C = ports_1.getRandomPort();
const NANOMSG_PUBSUB_PORT_C = ports_1.getRandomPort();
const NANOMSG_PIPELINE_PORT_C = ports_1.getRandomPort();
describe('Cluster Messaging - Single Node', () => {
    jest.setTimeout(30000);
    let serverA;
    let serverB;
    beforeAll(() => __awaiter(this, void 0, void 0, function* () {
        serverA = yield server_1.getServer('server-A', HOST, DEEPSTREAM_PORT_A, NANOMSG_PUBSUB_PORT_A, NANOMSG_PIPELINE_PORT_A);
        serverB = yield server_1.getServer('server-B', HOST, DEEPSTREAM_PORT_B, NANOMSG_PUBSUB_PORT_B, NANOMSG_PIPELINE_PORT_B, [{
                host: HOST,
                pubsubPort: NANOMSG_PUBSUB_PORT_A,
                pipelinePort: NANOMSG_PIPELINE_PORT_A,
            }]);
    }));
    afterAll(() => __awaiter(this, void 0, void 0, function* () {
        yield serverA.shutdown();
        yield serverB.shutdown();
    }));
    it('Should add and remove peers safely - Single Node', () => __awaiter(this, void 0, void 0, function* () {
        const presenceState = {
            SERVER_A: {},
        };
        // Presence
        const presenceClientA = yield client_1.getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'presenceA');
        presenceClientA.presence.subscribe((deviceId, login) => {
            if (!presenceState.SERVER_A[deviceId]) {
                presenceState.SERVER_A[deviceId] = [login];
            }
            else {
                presenceState.SERVER_A[deviceId].push(login);
            }
        });
        // Client A --> Server A
        let clientA = yield client_1.getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-A');
        yield clientA.shutdown();
        // Client A --> Server B
        clientA = yield client_1.getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-A');
        yield clientA.shutdown();
        // Client B --> Server B
        let clientB = yield client_1.getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-B');
        yield clientB.shutdown();
        // Client A --> Server A
        clientA = yield client_1.getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-A');
        yield clientA.shutdown();
        // Client B --> Server B
        clientB = yield client_1.getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-B');
        yield clientB.shutdown();
        yield new Promise(resolve => setTimeout(resolve, 100));
        yield presenceClientA.shutdown();
        // Client A connected, disconnected thrice
        expect_1.default(presenceState.SERVER_A['client-A'].length).toEqual(6);
        expect_1.default(presenceState.SERVER_A['client-A'][0]).toEqual(true);
        expect_1.default(presenceState.SERVER_A['client-A'][1]).toEqual(false);
        expect_1.default(presenceState.SERVER_A['client-A'][2]).toEqual(true);
        expect_1.default(presenceState.SERVER_A['client-A'][3]).toEqual(false);
        expect_1.default(presenceState.SERVER_A['client-A'][4]).toEqual(true);
        expect_1.default(presenceState.SERVER_A['client-A'][5]).toEqual(false);
        // Client B connected, disconnected twice
        expect_1.default(presenceState.SERVER_A['client-B'].length).toEqual(4);
        expect_1.default(presenceState.SERVER_A['client-B'][0]).toEqual(true);
        expect_1.default(presenceState.SERVER_A['client-B'][1]).toEqual(false);
        expect_1.default(presenceState.SERVER_A['client-B'][2]).toEqual(true);
        expect_1.default(presenceState.SERVER_A['client-B'][3]).toEqual(false);
    }));
});
describe('Cluster Messaging - Cluster', () => {
    jest.setTimeout(30000);
    let serverA;
    let serverB;
    beforeAll(() => __awaiter(this, void 0, void 0, function* () {
        serverA = yield server_1.getServer('server-A', HOST, DEEPSTREAM_PORT_A, NANOMSG_PUBSUB_PORT_A, NANOMSG_PIPELINE_PORT_A);
        serverB = yield server_1.getServer('server-B', HOST, DEEPSTREAM_PORT_B, NANOMSG_PUBSUB_PORT_B, NANOMSG_PIPELINE_PORT_B, [{
                host: HOST,
                pubsubPort: NANOMSG_PUBSUB_PORT_A,
                pipelinePort: NANOMSG_PIPELINE_PORT_A,
            }]);
    }));
    afterAll(() => __awaiter(this, void 0, void 0, function* () {
        yield serverA.shutdown();
        yield serverB.shutdown();
    }));
    it('Should add and remove peers safely - 3 Node Cluster', () => __awaiter(this, void 0, void 0, function* () {
        const presenceState = {
            SERVER_A: {},
            SERVER_B: {},
            SERVER_C: {},
        };
        const serverC = yield server_1.getServer('server-C', HOST, DEEPSTREAM_PORT_C, NANOMSG_PUBSUB_PORT_C, NANOMSG_PIPELINE_PORT_C, [{
                host: HOST,
                pubsubPort: NANOMSG_PUBSUB_PORT_A,
                pipelinePort: NANOMSG_PIPELINE_PORT_A,
            }]);
        yield new Promise(resolve => setTimeout(resolve, 100));
        // Presence
        const presenceClientA = yield client_1.getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'presenceA');
        presenceClientA.presence.subscribe((deviceId, login) => {
            if (!presenceState.SERVER_A[deviceId]) {
                presenceState.SERVER_A[deviceId] = [login];
            }
            else {
                presenceState.SERVER_A[deviceId].push(login);
            }
        });
        const presenceClientB = yield client_1.getClient(`${HOST}:${DEEPSTREAM_PORT_B}`, 'presenceB');
        presenceClientB.presence.subscribe((deviceId, login) => {
            if (!presenceState.SERVER_B[deviceId]) {
                presenceState.SERVER_B[deviceId] = [login];
            }
            else {
                presenceState.SERVER_B[deviceId].push(login);
            }
        });
        const presenceClientC = yield client_1.getClient(`${HOST}:${DEEPSTREAM_PORT_C}`, 'presenceC');
        presenceClientC.presence.subscribe((deviceId, login) => {
            if (!presenceState.SERVER_C[deviceId]) {
                presenceState.SERVER_C[deviceId] = [login];
            }
            else {
                presenceState.SERVER_C[deviceId].push(login);
            }
        });
        yield new Promise(resolve => setTimeout(resolve, 100));
        // Client A --> Server A
        let clientA = yield client_1.getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-A');
        yield clientA.shutdown();
        // Client A --> Server B
        clientA = yield client_1.getClient(`${HOST}:${DEEPSTREAM_PORT_B}`, 'client-A');
        yield clientA.shutdown();
        // Client B --> Server B
        let clientB = yield client_1.getClient(`${HOST}:${DEEPSTREAM_PORT_B}`, 'client-B');
        yield clientB.shutdown();
        // Client A --> Server A
        clientA = yield client_1.getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-A');
        yield clientA.shutdown();
        // Client B --> Server B
        clientB = yield client_1.getClient(`${HOST}:${DEEPSTREAM_PORT_B}`, 'client-B');
        yield clientB.shutdown();
        yield new Promise(resolve => setTimeout(resolve, 100));
        yield presenceClientA.shutdown();
        yield presenceClientB.shutdown();
        yield presenceClientC.shutdown();
        yield serverC.shutdown();
        // Server A Presence
        // Client A connected, disconnected thrice
        expect_1.default(presenceState.SERVER_A['client-A'].length).toEqual(6);
        expect_1.default(presenceState.SERVER_A['client-A'][0]).toEqual(true);
        expect_1.default(presenceState.SERVER_A['client-A'][1]).toEqual(false);
        expect_1.default(presenceState.SERVER_A['client-A'][2]).toEqual(true);
        expect_1.default(presenceState.SERVER_A['client-A'][3]).toEqual(false);
        expect_1.default(presenceState.SERVER_A['client-A'][4]).toEqual(true);
        expect_1.default(presenceState.SERVER_A['client-A'][5]).toEqual(false);
        // Client B connected, disconnected twice
        expect_1.default(presenceState.SERVER_A['client-B'].length).toEqual(4);
        expect_1.default(presenceState.SERVER_A['client-B'][0]).toEqual(true);
        expect_1.default(presenceState.SERVER_A['client-B'][1]).toEqual(false);
        expect_1.default(presenceState.SERVER_A['client-B'][2]).toEqual(true);
        expect_1.default(presenceState.SERVER_A['client-B'][3]).toEqual(false);
        // Server B Presence
        // Client Å connected, disconnected thrice
        expect_1.default(presenceState.SERVER_B['client-A'].length).toEqual(6);
        expect_1.default(presenceState.SERVER_B['client-A'][0]).toEqual(true);
        expect_1.default(presenceState.SERVER_B['client-A'][1]).toEqual(false);
        expect_1.default(presenceState.SERVER_B['client-A'][2]).toEqual(true);
        expect_1.default(presenceState.SERVER_B['client-A'][3]).toEqual(false);
        expect_1.default(presenceState.SERVER_B['client-A'][4]).toEqual(true);
        expect_1.default(presenceState.SERVER_B['client-A'][5]).toEqual(false);
        // Client B connected, disconnected twice
        expect_1.default(presenceState.SERVER_B['client-B'].length).toEqual(4);
        expect_1.default(presenceState.SERVER_B['client-B'][0]).toEqual(true);
        expect_1.default(presenceState.SERVER_B['client-B'][1]).toEqual(false);
        expect_1.default(presenceState.SERVER_B['client-B'][2]).toEqual(true);
        expect_1.default(presenceState.SERVER_B['client-B'][3]).toEqual(false);
        // Server C Presence
        // Client A connected, disconnected thrice
        expect_1.default(presenceState.SERVER_C['client-A'].length).toEqual(6);
        expect_1.default(presenceState.SERVER_C['client-A'][0]).toEqual(true);
        expect_1.default(presenceState.SERVER_C['client-A'][1]).toEqual(false);
        expect_1.default(presenceState.SERVER_C['client-A'][2]).toEqual(true);
        expect_1.default(presenceState.SERVER_C['client-A'][3]).toEqual(false);
        expect_1.default(presenceState.SERVER_C['client-A'][4]).toEqual(true);
        expect_1.default(presenceState.SERVER_C['client-A'][5]).toEqual(false);
        // Client B connected, disconnected twice
        expect_1.default(presenceState.SERVER_C['client-B'].length).toEqual(4);
        expect_1.default(presenceState.SERVER_C['client-B'][0]).toEqual(true);
        expect_1.default(presenceState.SERVER_C['client-B'][1]).toEqual(false);
        expect_1.default(presenceState.SERVER_C['client-B'][2]).toEqual(true);
        expect_1.default(presenceState.SERVER_C['client-B'][3]).toEqual(false);
    }));
});
//# sourceMappingURL=cluster-messaging.test.js.map