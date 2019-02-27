"use strict";
// Based on deepstream.io-msg-connector-template
// https://github.com/deepstreamIO/deepstream.io-msg-connector-template
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
const src_1 = require("../src");
const ports_1 = require("./lib/ports");
const mock_services_1 = require("./lib/mock-services");
const default_options_1 = require("deepstream.io/src/default-options");
const HOST = '127.0.0.1';
const NANOMSG_PUBSUB_PORT_A = ports_1.getRandomPort();
const NANOMSG_PUBSUB_PORT_B = ports_1.getRandomPort();
const NANOMSG_PUBSUB_PORT_C = ports_1.getRandomPort();
const NANOMSG_PIPELINE_PORT_A = ports_1.getRandomPort();
const NANOMSG_PIPELINE_PORT_B = ports_1.getRandomPort();
const NANOMSG_PIPELINE_PORT_C = ports_1.getRandomPort();
const addressA = {
    host: HOST,
    pubsubPort: NANOMSG_PUBSUB_PORT_A,
    pipelinePort: NANOMSG_PIPELINE_PORT_A,
};
const addressB = {
    host: HOST,
    pubsubPort: NANOMSG_PUBSUB_PORT_B,
    pipelinePort: NANOMSG_PIPELINE_PORT_B,
};
const addressC = {
    host: HOST,
    pubsubPort: NANOMSG_PUBSUB_PORT_C,
    pipelinePort: NANOMSG_PIPELINE_PORT_C,
};
const messageTimeout = () => new Promise(resolve => setTimeout(resolve, 250));
const getNode = (serverName, bindAddress, peerAddresses) => __awaiter(this, void 0, void 0, function* () {
    const options = default_options_1.get();
    options.serverName = serverName;
    const node = new src_1.default(options, mock_services_1.default, "example");
    expect_1.default(node.isReady).toEqual(false);
    yield new Promise((resolve, reject) => {
        node.on('ready', resolve);
        node.on('error', reject);
    });
    expect_1.default(node.isReady).toEqual(true);
    return node;
});
describe('Messages are sent between multiple instances', () => {
    let nodeA;
    let nodeB;
    let nodeC;
    const callbackA = jest.fn();
    const callbackB = jest.fn();
    const callbackC = jest.fn();
    beforeAll(() => __awaiter(this, void 0, void 0, function* () {
        nodeA = yield getNode('node-A', addressA, []);
        nodeB = yield getNode('node-B', addressB, [addressA]);
        nodeC = yield getNode('node-C', addressC, [addressA]);
    }));
    it('subscribes to a topic', () => __awaiter(this, void 0, void 0, function* () {
        nodeA.subscribe('topic1', callbackA);
        nodeB.subscribe('topic1', callbackB);
        nodeC.subscribe('topic1', callbackC);
        yield messageTimeout();
        expect_1.default(callbackA).not.toHaveBeenCalled();
        expect_1.default(callbackB).not.toHaveBeenCalled();
        expect_1.default(callbackC).not.toHaveBeenCalled();
    }));
    it('nodeB sends a message', () => __awaiter(this, void 0, void 0, function* () {
        nodeB.send('topic1', { some: 'data' });
        yield messageTimeout();
    }));
    it('nodeA and nodeC have received the message', () => {
        expect_1.default(callbackA).toHaveBeenCalledWith({ some: 'data' }, 'node-B');
        expect_1.default(callbackB).not.toHaveBeenCalledWith({ some: 'data' }, 'node-B');
        expect_1.default(callbackC).toHaveBeenCalledWith({ some: 'data' }, 'node-B');
    });
    it('nodeC sends a message', () => __awaiter(this, void 0, void 0, function* () {
        nodeC.send('topic1', { other: 'value' });
        yield messageTimeout();
    }));
    it('nodeA and nodeB have received the message', () => {
        expect_1.default(callbackA).toHaveBeenCalledWith({ other: 'value' }, 'node-C');
        expect_1.default(callbackB).toHaveBeenCalledWith({ other: 'value' }, 'node-C');
        expect_1.default(callbackC).not.toHaveBeenCalledWith({ other: 'value' }, 'node-C');
    });
    it('nodeA and nodeC send messages at the same time', () => __awaiter(this, void 0, void 0, function* () {
        nodeA.send('topic1', { val: 'x' });
        nodeC.send('topic1', { val: 'y' });
        yield messageTimeout();
    }));
    it('nodeA and nodeB have received the message', () => {
        expect_1.default(callbackA).toHaveBeenCalledWith({ val: 'y' }, 'node-C');
        expect_1.default(callbackB).toHaveBeenCalledWith({ val: 'x' }, 'node-A');
        expect_1.default(callbackB).toHaveBeenCalledWith({ val: 'y' }, 'node-C');
        expect_1.default(callbackC).toHaveBeenCalledWith({ val: 'x' }, 'node-A');
    });
    it('nodeA sends a message', () => __awaiter(this, void 0, void 0, function* () {
        nodeA.send('topic1', { notFor: 'A' });
        yield messageTimeout();
        expect_1.default(callbackA).not.toHaveBeenCalledWith({ notFor: 'A' }, 'node-A');
        expect_1.default(callbackB).toHaveBeenCalledWith({ notFor: 'A' }, 'node-A');
        expect_1.default(callbackC).toHaveBeenCalledWith({ notFor: 'A' }, 'node-A');
    }));
    it('only connector c has received the message', () => __awaiter(this, void 0, void 0, function* () {
        nodeA.sendDirect('node-C', 'topic1', { onlyFor: 'C' });
        yield messageTimeout();
        expect_1.default(callbackA).not.toHaveBeenCalledWith({ onlyFor: 'C' }, 'node-A');
        expect_1.default(callbackB).not.toHaveBeenCalledWith({ onlyFor: 'C' }, 'node-A');
        expect_1.default(callbackC).toHaveBeenCalledWith({ onlyFor: 'C' }, 'node-A');
    }));
    it('should remove a peerAddress from the cluster', () => __awaiter(this, void 0, void 0, function* () {
        nodeA.subscribe('topic2', callbackA);
        nodeB.subscribe('topic2', callbackB);
        nodeC.subscribe('topic2', callbackC);
        nodeC.removePeer(addressA);
        yield messageTimeout();
        nodeA.send('topic2', { notFor: 'C' });
        yield messageTimeout();
        expect_1.default(callbackA).not.toHaveBeenCalledWith({ notFor: 'C' }, 'node-A');
        expect_1.default(callbackB).not.toHaveBeenCalledWith({ notFor: 'C' }, 'node-A');
        expect_1.default(callbackC).not.toHaveBeenCalledWith({ notFor: 'C' }, 'node-A');
    }));
    it('nodeB can not be closed more than once.', () => __awaiter(this, void 0, void 0, function* () {
        yield nodeB.close();
        try {
            yield nodeB.close();
        }
        catch (e) {
            expect_1.default(() => {
                throw e;
            }).toThrowError(/ClusterNode already closed/);
        }
        yield messageTimeout();
    }));
    it('nodeA and nodeC close gracefuly.', () => __awaiter(this, void 0, void 0, function* () {
        yield nodeA.close();
        yield nodeC.close();
    }));
});
//# sourceMappingURL=messaging.test.js.map