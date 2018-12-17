
import uuid from 'uuid'
import DeepstreamClient from '../../deepstream.io-client-js/src/deepstream'
import { EVENT, CONNECTION_STATE }  from '../../deepstream.io-client-js/src/constants'

export const getClient = async function (address: string, username?: string = uuid.v4()): Promise<DeepstreamClient> {
  const client = DeepstreamClient(address)
  client.on('error', (errorMessage, errorType) => {
    if (errorType !== EVENT.UNSOLICITED_MESSAGE && errorType !== EVENT.NOT_SUBSCRIBED) {
      throw new Error(`${errorType}: ${errorMessage}`)
    }
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
  client.loginAgain = async function () {
    await new Promise((resolve, reject) => {
      client.on('connectionStateChanged', connectionState => {
        if (connectionState === CONNECTION_STATE.OPEN) {
          client.off('connectionStateChanged')
          resolve()
        } else if (connectionState === CONNECTION_STATE.ERROR) {
          reject(new Error('Connection error.'))
        }
      })
      client.login({ username: client.username })
    })
  }
  client.shutdown = async function () {
    await new Promise(resolve => {
      const currentConnectionState = client.getConnectionState()
      if (currentConnectionState === CONNECTION_STATE.CLOSED || currentConnectionState === CONNECTION_STATE.ERROR) {
        client.off('connectionStateChanged')
        resolve()
      }
      client.on('connectionStateChanged', connectionState => {
        if (connectionState === CONNECTION_STATE.CLOSED || connectionState === CONNECTION_STATE.ERROR) {
          client.off('connectionStateChanged')
          resolve()
        }
      })
      client.close()
    })
  }
  return client
}
