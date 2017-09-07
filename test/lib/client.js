// @flow

const uuid = require('uuid');
const DeepstreamClient = require('deepstream.io-client-js');
const { CONSTANTS } = require('deepstream.io-client-js');

module.exports.getClient = async function (address:string, username?:string = uuid.v4()):Promise<DeepstreamClient> {
  const client = DeepstreamClient(address);
  await new Promise((resolve, reject) => {
    client.on('connectionStateChanged', (connectionState) => {
      if (connectionState === CONSTANTS.CONNECTION_STATE.OPEN) {
        client.off('connectionStateChanged');
        resolve();
      } else if (connectionState === CONSTANTS.CONNECTION_STATE.ERROR) {
        reject(new Error('Connection error.'));
      }
    });
    client.login({ username });
  });
  client.shutdown = async function () {
    await new Promise((resolve) => {
      const currentConnectionState = client.getConnectionState();
      if (currentConnectionState === CONSTANTS.CONNECTION_STATE.CLOSED || currentConnectionState === CONSTANTS.CONNECTION_STATE.ERROR) {
        client.off('connectionStateChanged');
        resolve();
      }
      client.on('connectionStateChanged', (connectionState) => {
        if (connectionState === CONSTANTS.CONNECTION_STATE.CLOSED || connectionState === CONSTANTS.CONNECTION_STATE.ERROR) {
          client.off('connectionStateChanged');
          resolve();
        }
      });
      client.close();
    });
  };
  return client;
};
