// @flow

/*
*
* Based on https://github.com/deepstreamIO/deepstream.io/blob/dab0fd740b8efe2c4ddaa9d1dc6531c2e97ec338/src/cluster/cluster-node.js
*
*/

const NanomsgClusterNode = require('nanomsg-cluster');

const EventEmitter = require('events');

const StateRegistry = require('./state-registry');

class ClusterNode extends EventEmitter implements Cluster {
    stateRegistries: Map<TOPIC, StateRegistry>;

    constructor(config: InternalDeepstreamConfig, services: DeepstreamServices, type: string) {
      super();
      this.stateRegistries = new Map();
    }

    sendDirect(serverName: string, message: Message, metaData?: any) { }

    sendState() {

    }

    send(stateRegistryTopic: TOPIC, message: Message, metaData?: any) { }

    subscribe(stateRegistryTopic: TOPIC, callback: Function) { }

    isLeader() { throw new Error('Leader not used in single state'); }

    getStateRegistry(stateRegistryTopic: TOPIC) {

    }

    close(callback: Function) {
      callback();
    }
}

module.exports.default = ClusterNode;
