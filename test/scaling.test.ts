
import uuid from 'uuid'
import expect from 'expect'
import { TestServer, getServer } from './lib/server'
import { TestClient, getClient } from './lib/client'
import { getRandomPort } from './lib/ports'

const HOST = '127.0.0.1'
const DEEPSTREAM_SEED_PORT = getRandomPort()
const PUBSUB_SEED_PORT = getRandomPort()
const PIPELINE_SEED_PORT = getRandomPort()
const NODE_COUNT = 16

describe('Scaling', () => {
  jest.setTimeout(10000)
  const servers:Array<TestServer> = []
  const clients:Array<TestClient> = []

  const getRandomClients = () => {
    const clientA = clients[Math.floor(Math.random() * clients.length)]
    let clientB = clientA
    while (clientB === clientA) {
      clientB = clients[Math.floor(Math.random() * clients.length)]
    }
    return [clientA, clientB]
  }

  const seedServerAddress = {
    host: HOST,
    pubsubPort: PUBSUB_SEED_PORT,
    pipelinePort: PIPELINE_SEED_PORT,
  }

  beforeAll(async () => {
    const seedServer = await getServer(
      'server-0',
      HOST,
      DEEPSTREAM_SEED_PORT,
      PUBSUB_SEED_PORT,
      PIPELINE_SEED_PORT,
    )
    const seedClient = await getClient(`${HOST}:${DEEPSTREAM_SEED_PORT}`, 'client-0')
    servers.push(seedServer)
    clients.push(seedClient)
    for (let i = 1; i < NODE_COUNT; i += 1) {
      const deepstreamPort = getRandomPort()
      const server = await getServer(
        `server-${i}`,
        HOST,
        deepstreamPort,
        getRandomPort(),
        getRandomPort(),
        [seedServerAddress],
      )
      const client = await getClient(`${HOST}:${deepstreamPort}`, `client-${i}`)
      servers.push(server)
      clients.push(client)
    }
  })

  afterAll(async () => {
    for (let i = 0; i < servers.length; i += 1) {
      await clients[i].shutdown()
      await servers[i].shutdown()
    }
  })

  it('Should share record state.', async () => {
    const name = `subscription-${uuid.v4()}`
    const value = uuid.v4()
    const [clientA, clientB] = getRandomClients()
    const subscribeAPromise = new Promise(resolve => {
      const recordA = clientA.record.getRecord(name)
      // @ts-ignore
      recordA.subscribe(data => {
        if (data.value === value) {
          recordA.discard()
          resolve()
        }
      })
    })
    const recordB = clientB.record.getRecord(name)
    recordB.set({ value })
    await subscribeAPromise
    recordB.discard()
  })

  it('Should make RPC calls.', async () => {
    const name = `rpc-${uuid.v4()}`
    const value = `rpc-prefix-${uuid.v4()}`
    const [clientA, clientB] = getRandomClients()
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
    const [clientA, clientB] = getRandomClients()
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
      // @ts-ignore
      recordB.subscribe(data => {
        if (data.value === value) {
          recordB.on('discard', resolve)
          recordB.discard()
        }
      })
    })
    clientA.record.unlisten('listen/*')
  })

  it('Should listen for events.', async () => {
    const name = `event-${uuid.v4()}`
    const value = `event-value-${uuid.v4()}`
    const [clientA, clientB] = getRandomClients()
    const eventAPromise = new Promise(resolve => {
      const handler = data => {
        if (data.value === value) {
          clientA.event.unsubscribe(name, handler)
          resolve()
        }
      }
      clientA.event.subscribe(name, handler)
    })
    clientB.event.emit(name, { value })
    await eventAPromise
  })

  it('Should share presence.', async () => {
    const allUsernames:Array<string> = []
    for (let i = 0; i < clients.length; i += 1) {
      allUsernames.push(`client-${i}`)
    }
    for (let i = 0; i < clients.length; i += 1) {
      const client = clients[i]
      const expectedUsernames:Array<string> = allUsernames.filter(x => x !== `client-${i}`)
      const usernames:Array<string> = await client.presence.getAll()
      usernames.sort()
      expectedUsernames.sort()
      expect(usernames).toEqual(expectedUsernames)
    }
  })
})
