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
const deepstream_io_client_js_1 = require("deepstream.io-client-js");
const constants_1 = require("deepstream.io-client-js/src/constants");
class TestClient extends deepstream_io_client_js_1.Client {
    loginAgain() {
        return __awaiter(this, void 0, void 0, function* () {
            yield new Promise((resolve, reject) => {
                this.on('connectionStateChanged', connectionState => {
                    if (connectionState === constants_1.CONNECTION_STATE.OPEN) {
                        this.off('connectionStateChanged');
                        resolve();
                    }
                    else if (connectionState === constants_1.CONNECTION_STATE.ERROR) {
                        reject(new Error('Connection error.'));
                    }
                });
                this.login({ username: this.username });
            });
        });
    }
    shutdown() {
        return __awaiter(this, void 0, void 0, function* () {
            yield new Promise(resolve => {
                const currentConnectionState = this.getConnectionState();
                if (currentConnectionState === constants_1.CONNECTION_STATE.CLOSED || currentConnectionState === constants_1.CONNECTION_STATE.ERROR) {
                    this.off('connectionStateChanged');
                    resolve();
                }
                this.on('connectionStateChanged', connectionState => {
                    if (connectionState === constants_1.CONNECTION_STATE.CLOSED || connectionState === constants_1.CONNECTION_STATE.ERROR) {
                        this.off('connectionStateChanged');
                        resolve();
                    }
                });
                this.close();
            });
        });
    }
}
exports.TestClient = TestClient;
exports.getClient = function (address, username = uuid_1.default.v4()) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = new TestClient(address);
        client.on('error', (errorMessage, errorType) => {
            throw new Error(`${errorType}: ${errorMessage}`);
        });
        yield new Promise((resolve, reject) => {
            client.on('connectionStateChanged', connectionState => {
                if (connectionState === constants_1.CONNECTION_STATE.OPEN) {
                    client.off('connectionStateChanged');
                    resolve();
                }
                else if (connectionState === constants_1.CONNECTION_STATE.ERROR) {
                    reject(new Error('Connection error.'));
                }
            });
            client.login({ username });
            client.username = username;
        });
        return client;
    });
};
//# sourceMappingURL=client.js.map