"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const allocatedPorts = new Set();
exports.getRandomPort = () => {
    let randomPort;
    do {
        randomPort = 20000 + Math.round(Math.random() * 10000);
    } while (allocatedPorts.has(randomPort));
    allocatedPorts.add(randomPort);
    return randomPort;
};
//# sourceMappingURL=ports.js.map