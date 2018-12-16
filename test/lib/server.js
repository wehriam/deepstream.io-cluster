// @flow

const path = require('path');
const Deepstream = require('deepstream.io').default;

module.exports.getServer = async function (serverName: string, host: string, deepstreamPort:number, pubsubPort:number, pipelinePort: number, peerAddresses?:Array<SocketSettings> = []):Promise<Deepstream> {
  const server = new Deepstream({
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
        name: path.resolve(__dirname, '../../src'),
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
