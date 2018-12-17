import uuid from 'uuid'
import expect from 'expect'
import { getServer } from './lib/server'
import { getClient } from './lib/client'
import { getRandomPort } from './lib/ports'

const HOST = '127.0.0.1'
const DEEPSTREAM_PORT_A = getRandomPort()
const NANOMSG_PUBSUB_PORT_A = getRandomPort()
const NANOMSG_PIPELINE_PORT_A = getRandomPort()
const DEEPSTREAM_PORT_B = getRandomPort()
const NANOMSG_PUBSUB_PORT_B = getRandomPort()
const NANOMSG_PIPELINE_PORT_B = getRandomPort()
const DEEPSTREAM_PORT_C = getRandomPort()
const NANOMSG_PUBSUB_PORT_C = getRandomPort()
const NANOMSG_PIPELINE_PORT_C = getRandomPort()
const DEEPSTREAM_PORT_D = getRandomPort()
const NANOMSG_PUBSUB_PORT_D = getRandomPort()
const NANOMSG_PIPELINE_PORT_D = getRandomPort()
const DEEPSTREAM_PORT_E = getRandomPort()
const NANOMSG_PUBSUB_PORT_E = getRandomPort()
const NANOMSG_PIPELINE_PORT_E = getRandomPort()

const messageTimeout = () => new Promise(resolve => setTimeout(resolve, 250))

describe('Cluster', () => {
  jest.setTimeout(10000)
  let serverA
  let serverB
  let serverC
  let clientA
  let clientB
  let clientC

  const seedServerAddress = {
    host: HOST,
    pubsubPort: NANOMSG_PUBSUB_PORT_A,
    pipelinePort: NANOMSG_PIPELINE_PORT_A,
  }

  beforeAll(async () => {
    [serverA, serverB, serverC] = await Promise.all([
      getServer(
        'server-A',
        HOST,
        DEEPSTREAM_PORT_A,
        NANOMSG_PUBSUB_PORT_A,
        NANOMSG_PIPELINE_PORT_A,
      ),
      getServer(
        'server-B',
        HOST,
        DEEPSTREAM_PORT_B,
        NANOMSG_PUBSUB_PORT_B,
        NANOMSG_PIPELINE_PORT_B,
        [seedServerAddress],
      ),
      getServer(
        'server-C',
        HOST,
        DEEPSTREAM_PORT_C,
        NANOMSG_PUBSUB_PORT_C,
        NANOMSG_PIPELINE_PORT_C,
        [seedServerAddress],
      ),
    ]);
    [clientA, clientB, clientC] = await Promise.all([
      getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-A'),
      getClient(`${HOST}:${DEEPSTREAM_PORT_B}`, 'client-B'),
      getClient(`${HOST}:${DEEPSTREAM_PORT_C}`, 'client-C'),
    ])
  })

  afterAll(async () => {
    await Promise.all([
      clientA.shutdown(),
      clientB.shutdown(),
      clientC.shutdown(),
    ])
    await serverA.shutdown()
    await serverB.shutdown()
    await serverC.shutdown()
  })

  it('Should share record state.', async () => {
    const name = `subscription-${uuid.v4()}`
    const value = uuid.v4()
    const subscribeAPromise = new Promise(resolve => {
      const recordA = clientA.record.getRecord(name)
      recordA.subscribe(data => {
        if (data.value === value) {
          recordA.unsubscribe()
          recordA.discard()
          resolve()
        }
      })
    })
    const subscribeBPromise = new Promise(resolve => {
      const recordB = clientB.record.getRecord(name)
      recordB.subscribe(data => {
        if (data.value === value) {
          recordB.unsubscribe()
          recordB.discard()
          resolve()
        }
      })
    })
    await new Promise(resolve => setTimeout(resolve, 500))
    const recordC = clientC.record.getRecord(name)
    recordC.set({ value })
    await subscribeAPromise
    await subscribeBPromise
    recordC.unsubscribe()
    recordC.discard()
  })

  it('Should make RPC calls.', async () => {
    const name = `rpc-${uuid.v4()}`
    const value = `rpc-prefix-${uuid.v4()}`
    clientA.rpc.provide(name, (data: string, response: {send: Function}) => {
      response.send(data + value)
    })
    await new Promise(resolve => setTimeout(resolve, 500))
    await new Promise((resolve, reject) => {
      const prefixB = uuid.v4()
      clientB.rpc.make(name, prefixB, (errorMessage, result) => {
        if (errorMessage) {
          reject(new Error(errorMessage))
          return
        }
        if (result !== prefixB + value) {
          reject(new Error('RPC value does not match'))
          return
        }
        resolve()
      })
    })
    clientA.rpc.unprovide(name)
  })

  it('Should listen.', async () => {
    const name = `listen/${uuid.v4()}`
    const value = `listen-response-${uuid.v4()}`
    clientA.record.listen('listen/*', (match, isSubscribed, response) => {
      if (!isSubscribed) {
        return
      }
      const recordA = clientA.record.getRecord(match)
      response.accept()
      recordA.set({ value }, () => {
        recordA.discard()
      })
    })
    await new Promise(resolve => {
      const recordB = clientB.record.getRecord(name)
      recordB.subscribe(data => {
        if (data.value === value) {
          recordB.unsubscribe()
          recordB.on('discard', resolve)
          recordB.discard()
        }
      })
    })
    clientA.record.unlisten('listen/*')
    await messageTimeout()
  })

  it('Should listen for events.', async () => {
    const name = `event-${uuid.v4()}`
    const value = `event-value-${uuid.v4()}`
    const eventAPromise = new Promise(resolve => {
      clientA.event.subscribe(name, data => {
        if (data.value === value) {
          clientA.event.unsubscribe(name)
          resolve()
        }
      })
    })
    clientB.event.emit(name, { value })
    await eventAPromise
  })

  it('Should share presence.', async () => {
    const usernamesA = await new Promise(resolve => clientA.presence.getAll(resolve))
    const usernamesB = await new Promise(resolve => clientB.presence.getAll(resolve))
    const usernamesC = await new Promise(resolve => clientC.presence.getAll(resolve))
    expect(usernamesA).toEqual(expect.arrayContaining(['client-B', 'client-C']))
    expect(usernamesB).toEqual(expect.arrayContaining(['client-A', 'client-C']))
    expect(usernamesC).toEqual(expect.arrayContaining(['client-A', 'client-B']))
  })

  it('Should receive presence events.', async () => {
    const loginA2Promise = new Promise(resolve => {
      clientB.presence.subscribe((deviceId: string, login: boolean) => {
        if (deviceId === 'client-A2' && login) {
          resolve()
        }
      })
    })
    const logoutA2Promise = new Promise(resolve => {
      clientC.presence.subscribe((deviceId: string, login: boolean) => {
        if (deviceId === 'client-A2' && !login) {
          resolve()
        }
      })
    })
    await new Promise(resolve => setTimeout(resolve, 1000))
    const clientA2 = await getClient(`${HOST}:${DEEPSTREAM_PORT_A}`, 'client-A2')
    await loginA2Promise
    await new Promise(resolve => setTimeout(resolve, 1000))
    await clientA2.shutdown()
    await logoutA2Promise
  })

  it.skip('Should unsubscribe from presence events.', async () => {
    // This doesn't work because the unsubscribe event messaging seems to be off.
    clientB.presence.unsubscribe()
    clientC.presence.unsubscribe()
  })

  it('Should sync presence with a new server.', async () => {
    const serverD = await getServer(
      'server-D',
      HOST,
      DEEPSTREAM_PORT_D,
      NANOMSG_PUBSUB_PORT_D,
      NANOMSG_PIPELINE_PORT_D,
      [seedServerAddress],
    )
    await new Promise(resolve => setTimeout(resolve, 1000))
    const clientD = await getClient(`${HOST}:${DEEPSTREAM_PORT_D}`, 'client-D')
    const usernamesD = await new Promise(resolve => clientD.presence.getAll(resolve))
    expect(usernamesD).toEqual(expect.arrayContaining(['client-A', 'client-B', 'client-C']))
    await clientD.shutdown()
    await serverD.shutdown()
  })

  it('Should sync RPC calls with a new server.', async () => {
    const name = `rpc-${uuid.v4()}`
    const value = `rpc-prefix-${uuid.v4()}`
    clientA.rpc.provide(name, (data: string, response: {send: Function}) => {
      response.send(data + value)
    })
    const serverD = await getServer(
      'server-D',
      HOST,
      DEEPSTREAM_PORT_D,
      NANOMSG_PUBSUB_PORT_D,
      NANOMSG_PIPELINE_PORT_D,
      [seedServerAddress],
    )
    await new Promise(resolve => setTimeout(resolve, 1000))
    const clientD = await getClient(`${HOST}:${DEEPSTREAM_PORT_D}`, 'client-D')
    await new Promise((resolve, reject) => {
      const prefixD = uuid.v4()
      clientD.rpc.make(name, prefixD, (errorMessage, result) => {
        if (errorMessage) {
          reject(new Error(errorMessage))
          return
        }
        if (result !== prefixD + value) {
          reject(new Error('RPC value does not match'))
          return
        }
        resolve()
      })
    })
    await clientD.shutdown()
    await serverD.shutdown()
    clientA.rpc.unprovide(name)
  })

  it('Should sync listeners with a new server.', async () => {
    const name = `listen/${uuid.v4()}`
    const value = `listen-response-${uuid.v4()}`
    clientA.record.listen('listen/*', (match, isSubscribed, response) => {
      if (!isSubscribed) {
        return
      }
      const recordA = clientA.record.getRecord(match)
      response.accept()
      recordA.set({ value }, () => {
        recordA.discard()
      })
    })
    const serverD = await getServer(
      'server-D',
      HOST,
      DEEPSTREAM_PORT_D,
      NANOMSG_PUBSUB_PORT_D,
      NANOMSG_PIPELINE_PORT_D,
      [seedServerAddress],
    )
    await new Promise(resolve => setTimeout(resolve, 1000))
    const clientD = await getClient(`${HOST}:${DEEPSTREAM_PORT_D}`, 'client-D')
    await new Promise(resolve => {
      const recordD = clientD.record.getRecord(name)
      recordD.subscribe(data => {
        if (data.value === value) {
          recordD.unsubscribe()
          recordD.discard()
          resolve()
        }
      })
    })
    clientA.record.unlisten('listen/*')
    await messageTimeout()
    await clientD.shutdown()
    await serverD.shutdown()
  })

  it('Should sync events with a new server.', async () => {
    const name = `event-${uuid.v4()}`
    const value = `event-value-${uuid.v4()}`
    const eventAPromise = new Promise(resolve => {
      clientA.event.subscribe(name, data => {
        if (data.value === value) {
          clientA.event.unsubscribe(name)
          resolve()
        }
      })
    })
    const serverD = await getServer(
      'server-D',
      HOST,
      DEEPSTREAM_PORT_D,
      NANOMSG_PUBSUB_PORT_D,
      NANOMSG_PIPELINE_PORT_D,
      [seedServerAddress],
    )
    await new Promise(resolve => setTimeout(resolve, 1000))
    const clientD = await getClient(`${HOST}:${DEEPSTREAM_PORT_D}`, 'client-D')
    clientD.event.emit(name, { value })
    await eventAPromise
    await clientD.shutdown()
    await serverD.shutdown()
    await messageTimeout()
  })

  it('Should add and remove peers.', async () => {
    const beforePeersServerNames = serverA.getPeers().map(peer => peer.serverName)
    expect(beforePeersServerNames).toEqual(['server-B', 'server-C'])
    const serverE = await getServer(
      'server-E',
      HOST,
      DEEPSTREAM_PORT_E,
      NANOMSG_PUBSUB_PORT_E,
      NANOMSG_PIPELINE_PORT_E,
    )
    const addPeerAPromise = new Promise(resolve => {
      serverA.onAddPeer(peerAddress => {
        if (peerAddress.serverName === 'server-E') {
          resolve()
        }
      })
    })
    const addPeerBPromise = new Promise(resolve => {
      serverB.onAddPeer(peerAddress => {
        if (peerAddress.serverName === 'server-E') {
          resolve()
        }
      })
    })
    const removePeerAPromise = new Promise(resolve => {
      serverA.onRemovePeer(peerAddress => {
        if (peerAddress.serverName === 'server-E') {
          resolve()
        }
      })
    })
    const removePeerBPromise = new Promise(resolve => {
      serverB.onRemovePeer(peerAddress => {
        if (peerAddress.serverName === 'server-E') {
          resolve()
        }
      })
    })
    serverA.addPeer({
      host: HOST,
      pubsubPort: NANOMSG_PUBSUB_PORT_E,
      pipelinePort: NANOMSG_PIPELINE_PORT_E,
    })
    await new Promise(resolve => setTimeout(resolve, 1000))
    await addPeerAPromise
    await addPeerBPromise
    const peers = serverA.getPeers().map(peer => peer.serverName)
    expect(peers).toEqual(['server-B', 'server-C', 'server-E'])
    await serverE.shutdown()
    await serverA.removePeer({
      host: HOST,
      pubsubPort: NANOMSG_PUBSUB_PORT_E,
      pipelinePort: NANOMSG_PIPELINE_PORT_E,
    })
    await removePeerAPromise
    await removePeerBPromise
    const afterPeersServerNames = serverA.getPeers().map(peer => peer.serverName)
    expect(afterPeersServerNames).toEqual(['server-B', 'server-C'])
    const afterPeersHosts = serverA.getPeers().map(peer => peer.host)
    expect(afterPeersHosts).toEqual([HOST, HOST])
    const afterPeersPubsubPorts = serverA.getPeers().map(peer => peer.pubsubPort)
    expect(afterPeersPubsubPorts).toEqual([NANOMSG_PUBSUB_PORT_B, NANOMSG_PUBSUB_PORT_C])
    const afterPeersPipelinePorts = serverA.getPeers().map(peer => peer.pipelinePort)
    expect(afterPeersPipelinePorts).toEqual([NANOMSG_PIPELINE_PORT_B, NANOMSG_PIPELINE_PORT_C])
  })
})
