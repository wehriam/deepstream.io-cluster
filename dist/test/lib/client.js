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
const deepstream_1 = require("../../deepstream.io-client-js/src/deepstream");
const constants_1 = require("../../deepstream.io-client-js/src/constants");
exports.getClient = function (address, username = uuid_1.default.v4()) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = deepstream_1.default(address);
        client.on('error', (errorMessage, errorType) => {
            if (errorType !== constants_1.EVENT.UNSOLICITED_MESSAGE && errorType !== constants_1.EVENT.NOT_SUBSCRIBED) {
                throw new Error(`${errorType}: ${errorMessage}`);
            }
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
        client.loginAgain = function () {
            return __awaiter(this, void 0, void 0, function* () {
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
                    client.login({ username: client.username });
                });
            });
        };
        client.shutdown = function () {
            return __awaiter(this, void 0, void 0, function* () {
                yield new Promise(resolve => {
                    const currentConnectionState = client.getConnectionState();
                    if (currentConnectionState === constants_1.CONNECTION_STATE.CLOSED || currentConnectionState === constants_1.CONNECTION_STATE.ERROR) {
                        client.off('connectionStateChanged');
                        resolve();
                    }
                    client.on('connectionStateChanged', connectionState => {
                        if (connectionState === constants_1.CONNECTION_STATE.CLOSED || connectionState === constants_1.CONNECTION_STATE.ERROR) {
                            client.off('connectionStateChanged');
                            resolve();
                        }
                    });
                    client.close();
                });
            });
        };
        return client;
    });
};
//# sourceMappingURL=client.js.map