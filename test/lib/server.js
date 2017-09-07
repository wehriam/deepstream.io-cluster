// @flow

import type { SocketSettings } from '../../src/cluster-node';

const CONSTANTS = require('deepstream.io/src/constants/constants');
const Deepstream = require('../../src');

module.exports.getServer = async function (serverName: string, host: string, deepstreamPort:number, pubsubPort:number, pipelinePort: number, peerAddresses?:Array<SocketSettings> = []):Promise<Deepstream> {
  const server = new Deepstream({
    connectionEndpoints: {
      websocket: {
        options: {
          port: deepstreamPort,
        },
      },
      http: false,
    },
    cluster: {
      bindAddress: {
        host,
        pubsubPort,
        pipelinePort,
      },
      peerAddresses,
    },
  });
  server.set('logLevel', CONSTANTS.LOG_LEVEL.ERROR);
  server.set('serverName', serverName);
  server.set('showLogo', false);
  await new Promise((resolve, reject) => {
    server.once('started', resolve);
    server.once('error', reject);
    server.start();
  });
  server.shutdown = async ():Promise<void> => {
    await new Promise((resolve, reject) => {
      server.on('error', reject);
      server.on('stopped', resolve);
      server.stop();
    });
  };
  return server;
};
