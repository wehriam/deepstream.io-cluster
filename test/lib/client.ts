
import uuid from 'uuid'
import { Client } from 'deepstream.io-client-js'
import { EVENT, CONNECTION_STATE } from 'deepstream.io-client-js/src/constants';
import { Record } from 'deepstream.io-client-js/dist/src/record/record';

export class TestClient extends Client {
   async loginAgain() {
    await new Promise((resolve, reject) => {
      this.on('connectionStateChanged', connectionState => {
        if (connectionState === CONNECTION_STATE.OPEN) {
          this.off('connectionStateChanged')
          resolve()
        } else if (connectionState === CONNECTION_STATE.ERROR) {
          reject(new Error('Connection error.'))
        }
      })
      this.login({ username: this.username })
    })
  }
  async shutdown () {
    await new Promise(resolve => {
      const currentConnectionState = this.getConnectionState()
      if (currentConnectionState === CONNECTION_STATE.CLOSED || currentConnectionState === CONNECTION_STATE.ERROR) {
        this.off('connectionStateChanged')
        resolve()
      }
      this.on('connectionStateChanged', connectionState => {
        if (connectionState === CONNECTION_STATE.CLOSED || connectionState === CONNECTION_STATE.ERROR) {
          this.off('connectionStateChanged')
          resolve()
        }
      })
      this.close()
    })
  }
  username: string
}

export const getClient = async function (address: string, username: string = uuid.v4()): Promise<TestClient> {
  const client = new TestClient(address)
  client.on('error', (errorMessage, errorType) => {
    throw new Error(`${errorType}: ${errorMessage}`)
  })
  await new Promise((resolve, reject) => {
    client.on('connectionStateChanged', connectionState => {
      if (connectionState === CONNECTION_STATE.OPEN) {
        client.off('connectionStateChanged')
        resolve()
      } else if (connectionState === CONNECTION_STATE.ERROR) {
        reject(new Error('Connection error.'))
      }
    })
    client.login({ username })
    client.username = username
  })
  return client
}
