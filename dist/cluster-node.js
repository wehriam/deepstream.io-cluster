//      

/*
*
* Based on https://github.com/deepstreamIO/deepstream.io/blob/dab0fd740b8efe2c4ddaa9d1dc6531c2e97ec338/src/cluster/cluster-node.js
*
*/

const nano = require('nanomsg');
const events = require('events');
const merge = require('lodash.merge');

const StateRegistry = require('./state-registry');

                              
               
                      
                       
  

                   
               
                 
                 
                  
                            
                          
  

                      
               
                    
                  
                 
                                
                          
  

                
             
                                 
                                          
    
                    
  

const getSocketHash = (serverName       , socketSettings                )        => `${serverName}/${socketSettings.host}/${socketSettings.pubsubPort || 6021}/${socketSettings.pipelinePort || 6022}`;

const getSocketSettings = (hash       )                => {
  const [host, pubsubPort, pipelinePort] = hash.split('/').slice(1);
  return {
    host,
    pubsubPort: parseInt(pubsubPort, 10),
    pipelinePort: parseInt(pipelinePort, 10),
  };
};

class ClusterNode extends events.EventEmitter {
                   
                   
                         
                                        
                        
                                       
                     
                                     
                                
                     
                                       
                                             
                  
                                            
                               

  constructor(options        ) {
    super();
    this.options = options;
    this.stateRegistries = {};
    this.isReady = false;
    this.subscriptions = {};
    this.serverName = options.serverName;
    this.boundReceiveMessage = this.receiveMessage.bind(this);
    const clusterOptions = merge({
      bindAddress: {
        host: '127.0.0.1',
        pubsubPort: 6021,
        pipelinePort: 6022,
      },
      peerAddresses: [],
    }, options.cluster);
    // String version of this node address.
    this.socketHash = getSocketHash(options.serverName, clusterOptions.bindAddress);
    // String versions of peer addresses.
    this.peerSocketHashes = {};
    // Bind a nanomsg pull socket for incoming direct messages
    // http://nanomsg.org/v0.1/nn_pipeline.7.html
    const pullBindAddress = `tcp://${clusterOptions.bindAddress.host}:${clusterOptions.bindAddress.pipelinePort}`;
    this.pullSocket = nano.socket('pull');
    this.pullSocket.bind(pullBindAddress);
    this.pullSocket.on('error', function (error) {
      this.emit('error', `Nanomsg pull socket "${pullBindAddress}": ${error.message}`);
    });
    this.pullSocket.on('data', this.boundReceiveMessage);
    if (this.pullSocket.bound[pullBindAddress] <= -1) {
      this.emit('error', `Nanomsg: Could not bind pull socket to ${pullBindAddress}`);
    }
    // Bind a Nanomsg pub socket for outgoing messages to all nodes
    // http://nanomsg.org/v0.5/nn_pubsub.7.html
    const pubsubBindAddress = `tcp://${clusterOptions.bindAddress.host}:${clusterOptions.bindAddress.pubsubPort}`;
    this.pubSocket = nano.socket('pub');
    this.pubSocket.bind(pubsubBindAddress);
    this.pubSocket.on('error', function (error) {
      this.emit('error', `Nanomsg pub socket: ${error.message}`);
    });
    if (this.pubSocket.bound[pubsubBindAddress] <= -1) {
      this.emit('error', `Nanomsg: Could not bind pub socket to ${pubsubBindAddress}`);
    }
    // Nanomsg sub sockets for incoming messages from all nodes
    // http://nanomsg.org/v1.0.0/nn_pubsub.7.html
    // Socket object is keyed to the connection string, 
    // i.e.: this.subSockets['tcp://127.0.0.1:6021'] = nano.socket('sub')
    this.subSockets = {};
    // Nanomsg push sockets for outgoing direct messages
    // http://nanomsg.org/v1.0.0/nn_pipeline.7.html
    // Socket object is keyed to the connection string, 
    // i.e.: this.subSockets['tcp://127.0.0.1:6022'] = nano.socket('push')
    this.pushSockets = {};
    // Socket object is keyed to the server name,
    // i.e.: this.subSockets[serverName] = nano.socket('push')
    this.namedPushSockets = {};
    // Messaging about peers
    this.subscribe('_clusterAddPeers', (message) => {
      const peerSocketHashes = [message.socketHash].concat(message.peerSocketHashes.filter((peerSocketHash) => this.socketHash !== peerSocketHash));
      peerSocketHashes.forEach((socketHash) => {
        const serverName = socketHash.split('/').shift();
        this.peerSocketHashes[socketHash] = true;
        this.namedPushSockets[serverName] = this.addPeer(getSocketSettings(socketHash));
      });
    });
    this.subscribe('_clusterRemovePeer', (message) => {
      this.removePeer(getSocketSettings(message.socketHash));
    });
    // Messaging about topics to add to the state registry
    this.subscribe('_clusterTopicAdd', (message) => {
      const [serverName, topic, name] = message;
      const stateRegistry = this.getStateRegistry(topic);
      stateRegistry.add(name, serverName);
    });
    // Messaging about topics to remove from the state registry
    this.subscribe('_clusterTopicRemove', (message) => {
      const [serverName, topic, name] = message;
      const stateRegistry = this.getStateRegistry(topic);
      stateRegistry.remove(name, serverName);
    });
    // Messaging state sync
    this.subscribe('_clusterRequestState', (message) => {
      const { serverName } = message;
      this.sendState(serverName);
    });
    this.subscribe('_clusterState', (message) => {
      const { topic, name, serverNames } = message;
      const stateRegistry = this.getStateRegistry(topic);
      serverNames.forEach((serverName) => stateRegistry.add(name, serverName));
    });
    // Connect to peers included in the options
    clusterOptions.peerAddresses.forEach(this.addPeer.bind(this));
    setImmediate(() => {
      this.isReady = true;
      this.emit('ready');
    });
    setTimeout(() => {
      this.send('_clusterRequestState', {
        serverName: this.serverName,
      });
    }, 100);
  }

  receiveMessage(buffer       )      {
    const [topic, message, serverName] = JSON.parse(String(buffer));
    if (!this.subscriptions[topic]) {
      return;
    }
    this.subscriptions[topic].forEach((callback) => {
      callback(message, serverName);
    });
  }

  sendDirect(serverName       , topic       , message    )      {
    const push = this.namedPushSockets[serverName];
    if (!push) {
      this.emit('error', `${this.serverName} is unable to send message "${topic}":"${JSON.stringify(message)}" to "${serverName}"`);
      return;
    }
    push.send(JSON.stringify([topic, message, this.serverName]));
  }

  send(topic       , message    )      {
    this.pubSocket.send(JSON.stringify([topic, message, this.serverName]));
  }

  sendState(serverName       )      {
    Object.keys(this.stateRegistries).forEach((topic) => {
      Object.keys(this.stateRegistries[topic].data).forEach((name) => {
        const message = {
          topic,
          name,
          serverNames: Array.from(this.stateRegistries[topic].data[name]),
        };
        this.sendDirect(serverName, '_clusterState', message);
      });
    });
  }

  subscribe(topic       , callback         )      {
    this.subscriptions[topic] = this.subscriptions[topic] || [];
    this.subscriptions[topic].push(callback);
  }

  getStateRegistry(topic       )               {
    if (this.stateRegistries[topic]) {
      return this.stateRegistries[topic];
    }
    const stateRegistry = new StateRegistry(topic, this.options);
    stateRegistry.on('add', (name) => {
      this.send('_clusterTopicAdd', [this.serverName, topic, name]);
    });
    stateRegistry.on('remove', (name) => {
      this.send('_clusterTopicRemove', [this.serverName, topic, name]);
    });
    this.stateRegistries[topic] = stateRegistry;
    return stateRegistry;
  }

  async close(callback          )               {
    if (this.closed) {
      throw new Error('ClusterNode already closed.');
    }
    if (this.clusterUpdateTimeout) {
      clearTimeout(this.clusterUpdateTimeout);
    }
    this.send('_clusterRemovePeer', {
      socketHash: this.socketHash,
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    this.pullSocket.removeListener('data', this.boundReceiveMessage);
    await new Promise((resolve) => {
      this.pullSocket.on('close', resolve);
      this.pullSocket.close();
    });
    await new Promise((resolve) => {
      this.pubSocket.on('close', resolve);
      this.pubSocket.close();
    });
    await Promise.all(Object.keys(this.subSockets).map(this.closeSubConnectSocket.bind(this)));
    await Promise.all(Object.keys(this.pushSockets).map(this.closePushConnectSocket.bind(this)));
    this.closed = true;
    this.emit('close');
    if (callback) {
      callback();
    }
  }

  addPeer(peerAddress                )               {
    const pubsubConnectAddress = `tcp://${peerAddress.host}:${peerAddress.pubsubPort || 6021}`;
    const pushConnectAddress = `tcp://${peerAddress.host}:${peerAddress.pipelinePort || 6022}`;
    const newPeer = !this.subSockets[pubsubConnectAddress] || !this.pushSockets[pushConnectAddress];
    if (!newPeer) {
      return this.pushSockets[pushConnectAddress];
    }
    if (!this.subSockets[pubsubConnectAddress]) {
      const sub = nano.socket('sub');
      sub.on('error', function (error) {
        this.emit('error', `Nanomsg sub socket "${pubsubConnectAddress}": ${error.message}`);
      });
      sub.connect(pubsubConnectAddress);
      if (sub.connected[pubsubConnectAddress] <= -1) {
        throw new Error(`Could not connect sub socket to ${pubsubConnectAddress}`);
      }
      this.subSockets[pubsubConnectAddress] = sub;
      sub.on('data', this.boundReceiveMessage);
    }
    if (!this.pushSockets[pushConnectAddress]) {
      const push = nano.socket('push');
      push.on('error', function (error) {
        this.emit('error', `Nanomsg push socket "${pushConnectAddress}": ${error.message}`);
      });
      push.connect(pushConnectAddress);
      if (push.connected[pushConnectAddress] <= -1) {
        throw new Error(`Could not connect push socket to ${pushConnectAddress}`);
      }
      this.pushSockets[pushConnectAddress] = push;
      push.send(JSON.stringify(['_clusterAddPeers', {
        socketHash: this.socketHash,
        peerSocketHashes: Object.keys(this.peerSocketHashes),
      }]));
    }
    if (this.clusterUpdateTimeout) {
      clearTimeout(this.clusterUpdateTimeout);
    }
    this.clusterUpdateTimeout = setTimeout(() => {
      this.send('_clusterAddPeers', {
        socketHash: this.socketHash,
        peerSocketHashes: Object.keys(this.peerSocketHashes),
      });
      delete this.clusterUpdateTimeout;
    }, 10);
    return this.pushSockets[pushConnectAddress];
  }

  async removePeer(peerAddress               )               {
    const pubsubConnectAddress = `tcp://${peerAddress.host}:${peerAddress.pubsubPort || 6021}`;
    const pushConnectAddress = `tcp://${peerAddress.host}:${peerAddress.pipelinePort || 6022}`;
    const peerExists = this.subSockets[pubsubConnectAddress] || this.pushSockets[pushConnectAddress];
    if (!peerExists) {
      return;
    }
    Object.keys(this.namedPushSockets).forEach((serverName) => {
      if (this.namedPushSockets[serverName] === this.pushSockets[pushConnectAddress]) {
        delete this.namedPushSockets[serverName];
        const socketHash = getSocketHash(serverName, peerAddress);
        delete this.peerSocketHashes[socketHash];
        this.send('_clusterRemovePeer', {
          socketHash,
        });
        Object.keys(this.stateRegistries).forEach((topic) => this.stateRegistries[topic].removeAll(serverName));
      }
    });
    await Promise.all([
      this.closeSubConnectSocket(pubsubConnectAddress),
      this.closePushConnectSocket(pushConnectAddress),
    ]);
  }

  async closeSubConnectSocket(address       )               {
    const sub = this.subSockets[address];
    delete this.subSockets[address];
    sub.removeListener('data', this.boundReceiveMessage);
    await new Promise((resolve, reject) => {
      sub.on('close', resolve);
      sub.on('error', reject);
      sub.close();
    });
  }

  async closePushConnectSocket(address       )               {
    const push = this.pushSockets[address];
    delete this.pushSockets[address];
    await new Promise((resolve, reject) => {
      push.on('close', resolve);
      push.on('error', reject);
      push.close();
    });
  }

  getPeers()                                               {
    return Object.keys(this.peerSocketHashes).map((socketHash) => Object.assign({}, {
      serverName: socketHash.split('/').shift(),
    }, getSocketSettings(socketHash)));
  }
}

module.exports = ClusterNode;
