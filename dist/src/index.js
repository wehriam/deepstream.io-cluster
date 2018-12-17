"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const state_registry_1 = require("./state-registry");
class ClusterNode {
    constructor(config, services, type) {
        this.stateRegistries = new Map();
    }
    sendDirect(serverName, message, metaData) { }
    sendState() { }
    send(stateRegistryTopic, message, metaData) { }
    subscribe(stateRegistryTopic, callback) { }
    isLeader() { throw new Error('Leader not used in single state'); }
    getStateRegistry(stateRegistryTopic) {
        let stateRegistry = this.stateRegistries.get(stateRegistryTopic);
        if (!stateRegistry) {
            stateRegistry = new state_registry_1.default(stateRegistryTopic, {});
            this.stateRegistries.set(stateRegistryTopic, stateRegistry);
        }
        return stateRegistry;
    }
    close(callback) {
        callback();
    }
}
exports.default = ClusterNode;
//# sourceMappingURL=index.js.map