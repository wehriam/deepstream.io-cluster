
// Based on deepstream.io-msg-connector-template
// https://github.com/deepstreamIO/deepstream.io-msg-connector-template

import uuid from 'uuid'
import { EventEmitter } from 'events'
import ClusterNode from '../src'
import expect from 'expect'

describe('The cluster node adapter has the correct structure', () => {

  let clusterNode

  beforeAll(async () => {
    clusterNode = new ClusterNode({
      serverName: uuid.v4(),
    })
    expect(clusterNode.isReady).toEqual(false)
    await new Promise((resolve, reject) => {
      clusterNode.on('ready', resolve)
      clusterNode.on('error', reject)
    })
    expect(clusterNode.isReady).toEqual(true)
  })

  beforeAll(async () => {
    await clusterNode.close()
  })

  it('implements the clusterNode interface', () => {
    expect(typeof clusterNode.sendDirect).toEqual('function')
    expect(typeof clusterNode.send).toEqual('function')
    expect(typeof clusterNode.subscribe).toEqual('function')
    expect(typeof clusterNode.getStateRegistry).toEqual('function')
    expect(typeof clusterNode.close).toEqual('function')
    expect(typeof clusterNode.isReady).toEqual('boolean')
    expect(clusterNode instanceof EventEmitter).toEqual(true)
  })
})
