// @flow
/* eslint-disable no-underscore-dangle */

import type { SocketSettings } from './cluster-node';

const Deepstream = require('deepstream.io');
const C = require('deepstream.io/src/constants/constants');
const DependencyInitialiser = require('deepstream.io/src/utils/dependency-initialiser');
const ClusterNode = require('./cluster-node');

class NanomsgDeepstreamCluster extends Deepstream {
  addPeer(peerAddress: SocketSettings):void {
    this._options.message.addPeer(peerAddress);
  }
  removePeer(peerAddress: SocketSettings):Promise<void> {
    return this._options.message.removePeer(peerAddress);
  }
  getPeers():Array<SocketSettings & {serverName: string}> {
    return this._options.message.getPeers();
  }
  _pluginInit():void {
    this._options.message = new ClusterNode(this._options);

    const infoLogger = (message) => this._options.logger.log(C.LOG_LEVEL.INFO, C.EVENT.INFO, message);

    if (this._configFile != null) {
      infoLogger(`configuration file loaded from ${this._configFile}`);
    }

    if (global.deepstreamLibDir) {
      infoLogger(`library directory set to: ${global.deepstreamLibDir}`);
    }

    this._options.pluginTypes.forEach((pluginType) => {
      const plugin = this._options[pluginType];
      const initialiser = new DependencyInitialiser(this, this._options, plugin, pluginType);
      initialiser.once('ready', () => {
        this._checkReady(pluginType, plugin);
      });
      return initialiser;
    });
  }
}

module.exports = NanomsgDeepstreamCluster;
