import StorageMock from '../deepstream.io/test/test-mocks/storage-mock'

export default {
  registeredPlugins: [],
  connectionEndpoints: [],
  cache: new StorageMock()
  storage: new StorageMock()
  //permissionHandler: PermissionHandler
  //authenticationHandler: AuthenticationHandler
  //logger: Logger
  //message: Cluster
  //uniqueRegistry: LockRegistry
}