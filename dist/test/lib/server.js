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
const path_1 = require("path");
const deepstream_io_1 = require("deepstream.io");
exports.getServer = function (serverName, host, deepstreamPort, pubsubPort, pipelinePort, peerAddresses = []) {
    return __awaiter(this, void 0, void 0, function* () {
        const server = new deepstream_io_1.Deepstream({
            serverName,
            connectionEndpoints: {
                websocket: {
                    options: {
                        port: deepstreamPort,
                    },
                },
                http: false,
            },
            plugins: {
                cluster: {
                    name: path_1.resolve(__dirname, '../../src'),
                    options: {
                        serverName,
                        cluster: {
                            bindAddress: {
                                host,
                                pubsubPort,
                                pipelinePort,
                            },
                            peerAddresses,
                        },
                    },
                },
            },
        });
        server.set('showLogo', false);
        yield new Promise((resolve, reject) => {
            server.once('started', resolve);
            server.once('error', reject);
            server.start();
        });
        server.shutdown = () => __awaiter(this, void 0, void 0, function* () {
            yield new Promise((resolve, reject) => {
                server.on('error', reject);
                server.on('stopped', resolve);
                server.stop();
            });
        });
        return server;
    });
};
//# sourceMappingURL=server.js.map