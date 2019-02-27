#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pgk = require("../../package.json");
const commander_1 = require("commander");
const deepstream_install_1 = require("./deepstream-install");
const deepstream_start_1 = require("./deepstream-start");
const deepstream_info_1 = require("./deepstream-info");
const deepstream_hash_1 = require("./deepstream-hash");
const deepstream_service_1 = require("./deepstream-service");
const deepstream_daemon_1 = require("./deepstream-daemon");
const program = new commander_1.Command('deepstream');
program
    .usage('[command]')
    .version(pgk.version.toString());
deepstream_start_1.start(program);
deepstream_install_1.install(program);
deepstream_info_1.info(program);
deepstream_hash_1.hash(program);
deepstream_service_1.service(program);
deepstream_daemon_1.daemon(program);
program.parse(process.argv);
if (program.args.length === 0) {
    program.emit('command:start');
}
//# sourceMappingURL=deepstream.js.map