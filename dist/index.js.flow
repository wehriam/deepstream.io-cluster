// @flow
/* eslint-disable no-underscore-dangle */

import type { SocketSettings } from './cluster-node';

const Deepstream = require('deepstream.io');
const C = require('deepstream.io/src/constants/constants');
const MessageProcessor = require('deepstream.io/src/message/message-processor');
const MessageDistributor = require('deepstream.io/src/message/message-distributor');
const EventHandler = require('deepstream.io/src/event/event-handler');
const RpcHandler = require('deepstream.io/src/rpc/rpc-handler');
const RecordHandler = require('deepstream.io/src/record/record-handler');
const LockRegistry = require('deepstream.io/src/cluster/lock-registry');
const DependencyInitialiser = require('deepstream.io/src/utils/dependency-initialiser');
const PresenceHandler = require('./presence-handler');
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
  onAddPeer(callback: Function): void {
    this._options.message.clusterNode.on('addPeer', (peer:SocketSettings) => {
      callback({
        serverName: peer.name,
        host: peer.host,
        pubsubPort: peer.pubsubPort,
        pipelinePort: peer.pipelinePort,
      });
    }, true);
  }
  onRemovePeer(callback: Function): void {
    this._options.message.clusterNode.on('removePeer', (peer:SocketSettings) => {
      callback({
        serverName: peer.name,
        host: peer.host,
        pubsubPort: peer.pubsubPort,
        pipelinePort: peer.pipelinePort,
      });
    }, true);
  }
  startPeerDiscovery(options: Object):Promise<void> {
    return this._options.message.clusterNode.startDiscovery(options);
  }
  stopPeerDiscovery():void {
    return this._options.message.clusterNode.stopDiscovery();
  }
  _serviceInit() {
    this._messageProcessor = new MessageProcessor(this._options);
    this._messageDistributor = new MessageDistributor(this._options);

    this._options.uniqueRegistry = new LockRegistry(this._options, this._options.message);

    this._eventHandler = new EventHandler(this._options);
    this._messageDistributor.registerForTopic(
      C.TOPIC.EVENT,
      this._eventHandler.handle.bind(this._eventHandler),
    );

    this._rpcHandler = new RpcHandler(this._options);
    this._messageDistributor.registerForTopic(
      C.TOPIC.RPC,
      this._rpcHandler.handle.bind(this._rpcHandler),
    );

    this._recordHandler = new RecordHandler(this._options);
    this._messageDistributor.registerForTopic(
      C.TOPIC.RECORD,
      this._recordHandler.handle.bind(this._recordHandler),
    );

    this._presenceHandler = new PresenceHandler(this._options);
    this._messageDistributor.registerForTopic(
      C.TOPIC.PRESENCE,
      this._presenceHandler.handle.bind(this._presenceHandler),
    );

    this._messageProcessor.onAuthenticatedMessage =
      this._messageDistributor.distribute.bind(this._messageDistributor);

    if (this._options.permissionHandler.setRecordHandler) {
      this._options.permissionHandler.setRecordHandler(this._recordHandler);
    }

    process.nextTick(() => this._transition('services-started'));
  }
  _pluginInit() {
    this._options.message = new ClusterNode(this._options);

    const infoLogger = (message) => this._options.logger.info(C.EVENT.INFO, message);

    // otherwise (no configFile) deepstream was invoked by API
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
