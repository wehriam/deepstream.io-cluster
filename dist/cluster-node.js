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

    const clusterOptions = Object.assign({}, { name: options.serverName }, options.cluster);

    this.clusterNode = new NanomsgClusterNode(clusterOptions);
    this.clusterNode.on('error', (error) => this.emit('error', error));

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
        const message = {
          topic,
          name,
          serverNames: Array.from(this.stateRegistries[topic].data[name]),
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
    stateRegistry.on('add', (name) => {
      this.clusterNode.sendToAll('_clusterTopicAdd', [this.serverName, topic, name]);
    });
    stateRegistry.on('remove', (name) => {
      this.clusterNode.sendToAll('_clusterTopicRemove', [this.serverName, topic, name]);
    });
    this.stateRegistries[topic] = stateRegistry;
    return stateRegistry;
  }

  async close(callback          )               {
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
    return this.clusterNode.getPeers();
  }
}

module.exports = ClusterNode;
