//      

/*
*
* Based on https://github.com/deepstreamIO/deepstream.io/blob/dab0fd740b8efe2c4ddaa9d1dc6531c2e97ec338/src/cluster/cluster-node.js
*
*/

const NanomsgClusterNode = require('nanomsg-cluster');
const events = require('events');

const StateRegistry = require('./state-registry');

                              
                
               
                      
                       
  

                
             
                                 
                                          
    
                    
  

class ClusterNode extends events.EventEmitter {
                   
                   
                     
                                  
                                     
                  
                                            
                                  
                                 

  constructor(options        ) {
    super();
    this.options = options;
    this.serverName = options.serverName;
    this.stateRegistries = {};
    this.isReady = false;
    this.closed = false;

    const clusterOptions = Object.assign({}, { name: options.serverName }, options.cluster);

    this.clusterNode = new NanomsgClusterNode(clusterOptions);
    this.clusterNode.on('error', (error) => this.emit('error', error));

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
    this.clusterNode.subscribe('_clusterRequestState', (message) => {
      const { serverName } = message;
      this.sendState(serverName);
    });

    this.clusterNode.subscribe('_clusterState', (message) => {
      const { topic, name, serverNames } = message;
      const stateRegistry = this.getStateRegistry(topic);
      serverNames.forEach((serverName) => stateRegistry.add(name, serverName));
    });

    this.clusterNode.on('removePeer', (peerAddress               ) => {
      const serverName = peerAddress.name;
      if (serverName) {
        Object.keys(this.stateRegistries).forEach((topic) => this.stateRegistries[topic].removeAll(serverName));
      }
    }, true);

    this.clusterNode.on('addPeer', () => {
      if (this.requestStateTimeout) {
        clearTimeout(this.requestStateTimeout);
      }
      this.requestStateTimeout = setTimeout(() => {
        this.clusterNode.sendToAll('_clusterRequestState', {
          serverName: this.serverName,
        });
      }, 100);
    }, true);

    setImmediate(() => {
      this.isReady = true;
      this.emit('ready');
    });

    setTimeout(() => {
      this.clusterNode.sendToAll('_clusterRequestState', {
        serverName: this.serverName,
      });
    }, 100);
  }

  sendDirect(serverName       , topic       , message    )      {
    this.clusterNode.sendToPeer(serverName, topic, message);
  }

  send(topic       , message    )      {
    this.clusterNode.sendToAll(topic, message);
  }

  sendState(serverName       )      {
    Object.keys(this.stateRegistries).forEach((topic) => {
      Object.keys(this.stateRegistries[topic].data).forEach((name) => {
        const serverNames = Array.from(this.stateRegistries[topic].data[name]);
        const message = {
          topic,
          name,
          serverNames,
        };
        this.clusterNode.sendToPeer(serverName, '_clusterState', message);
      });
    });
  }

  subscribe(topic       , callback         )      {
    this.clusterNode.subscribe(topic, callback);
  }

  getStateRegistry(topic       )               {
    if (this.stateRegistries[topic]) {
      return this.stateRegistries[topic];
    }
    const stateRegistry = new StateRegistry(topic, this.options);
    stateRegistry.on('clusterAdd', (name) => {
      this.clusterNode.sendToAll('_clusterTopicAdd', [this.serverName, topic, name]);
    });
    stateRegistry.on('clusterRemove', (name) => {
      this.clusterNode.sendToAll('_clusterTopicRemove', [this.serverName, topic, name]);
    });
    this.stateRegistries[topic] = stateRegistry;
    return stateRegistry;
  }

  async close(callback          )               {
    if (this.closed) {
      throw new Error('ClusterNode already closed.');
    }
    await this.clusterNode.close();
    this.closed = true;
    this.emit('close');
    if (callback) {
      callback();
    }
  }

  addPeer(peerAddress                )      {
    this.clusterNode.addPeer(peerAddress);
  }

  removePeer(peerAddress               )               {
    return this.clusterNode.removePeer(peerAddress);
  }

  getPeers()                              {
    return this.clusterNode.getPeers().map((peer) => ({
      serverName: peer.name,
      host: peer.host,
      pubsubPort: peer.pubsubPort,
      pipelinePort: peer.pipelinePort,
    }));
  }
}

module.exports = ClusterNode;
