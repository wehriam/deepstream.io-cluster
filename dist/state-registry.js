//      

/* eslint-disable no-underscore-dangle */

/*
*
* Based on https://github.com/deepstreamIO/deepstream.io/blob/dab0fd740b8efe2c4ddaa9d1dc6531c2e97ec338/src/cluster/state-registry.js
*
*/

const { EventEmitter } = require('events');

module.exports = class DistributedStateRegistry extends EventEmitter {
                               
                
                  

  constructor(topic       , options       ) {
    super();
    this.topic = topic;
    this.options = options;
    this.data = {};
  }

  whenReady(callback         ) {
    callback();
  }

  has(name       )         {
    return !!this.data[name];
  }

  add(name       , serverName        )      {
    if (!this.data[name]) {
      if (!serverName) {
        this.emit('clusterAdd', name);
      }
      this.data[name] = new Set([]);
      this.emit('add', name);
    }
    if (serverName) {
      this.data[name].add(serverName);
    }
  }

  remove(name       , serverName        )      {
    if (!this.data[name]) {
      return;
    }
    if (serverName) {
      this.data[name].delete(serverName);
      if (this.data[name].size === 0) {
        this.emit('remove', name);
      }
    } else {
      if (this.data[name].size === 0) {
        delete this.data[name];
        this.emit('remove', name);
      }
      this.emit('clusterRemove', name);
    }
  }

  removeAll(serverName       )      {
    Object.keys(this.data).forEach((name) => {
      if (!this.data[name]) {
        return;
      }
      this.data[name].delete(serverName);
      if (this.data[name].size === 0) {
        delete this.data[name];
      }
    });
  }

  getAllServers(name       )               {
    if (!this.data[name]) {
      return [];
    }
    const servers = Array.from(this.data[name]);
    return servers;
  }

  getAll()               {
    return Object.keys(this.data);
  }

  getAllMap()                         {
    return this.data;
  }
};
