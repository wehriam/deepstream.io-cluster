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
const events_1 = require("events");
const src_1 = require("../src");
const expect_1 = require("expect");
const mock_services_1 = require("./lib/mock-services");
const default_options_1 = require("deepstream.io/src/default-options");
describe('The cluster node adapter has the correct structure', () => {
    let clusterNode;
    beforeAll(() => __awaiter(this, void 0, void 0, function* () {
        clusterNode = new src_1.default(default_options_1.get(), mock_services_1.default, "example");
        expect_1.default(clusterNode.isReady).toEqual(false);
        yield new Promise((resolve, reject) => {
            clusterNode.on('ready', resolve);
            clusterNode.on('error', reject);
        });
        expect_1.default(clusterNode.isReady).toEqual(true);
    }));
    beforeAll(() => __awaiter(this, void 0, void 0, function* () {
        yield clusterNode.close();
    }));
    it('implements the clusterNode interface', () => {
        expect_1.default(typeof clusterNode.sendDirect).toEqual('function');
        expect_1.default(typeof clusterNode.send).toEqual('function');
        expect_1.default(typeof clusterNode.subscribe).toEqual('function');
        expect_1.default(typeof clusterNode.getStateRegistry).toEqual('function');
        expect_1.default(typeof clusterNode.close).toEqual('function');
        expect_1.default(typeof clusterNode.isReady).toEqual('boolean');
        expect_1.default(clusterNode instanceof events_1.EventEmitter).toEqual(true);
    });
});
//# sourceMappingURL=connector.test.js.map