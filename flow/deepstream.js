//@ flow

declare type RuleType = string;

declare type ValveSection = string;

declare type LOG_LEVEL = any;

declare type TOPIC = number;

declare type EVENT = any;

declare type SimpleSocketWrapper = {
  user: string,
  isRemote: boolean,
  sendMessage(message: Message, buffer?: boolean): void,
  sendAckMessage(message: Message, buffer?: boolean): void,
  clientData?: "NO PRINT IMPLEMENTED: ObjectKeyword" | null
} & events$EventEmitter;

declare type SocketWrapper = {
  uuid: number,
  ___id: number,
  authData: "NO PRINT IMPLEMENTED: ObjectKeyword" | null,
  clientData: "NO PRINT IMPLEMENTED: ObjectKeyword" | null,
  getHandshakeData: Function,
  onMessage: Function,
  authCallback: Function,
  prepareMessage: Function,
  getMessage: Function,
  finalizeMessage: Function,
  sendPrepared: Function,
  sendNative: Function,
  parseData: Function,
  flush: Function,
  destroy: Function
} & SimpleSocketWrapper;

declare interface Message {
  topic: TOPIC;
  action: number;
  name?: string;
  isError?: boolean;
  isAck?: boolean;
  data?: string | Buffer;
  parsedData?: any;
  originalTopic?: number;
  originalAction?: number;
  subscription?: string;
  names?: Array<string>;
  isWriteAck?: boolean;
  correlationId?: string;
  path?: string;
  version?: number;
  reason?: string;
}

declare interface JifMessage {
  done: boolean;
  message: JifResult;
}

declare interface JifResult {
  success: boolean;
  data?: any;
  error?: string;
  version?: number;
  users?: Array<string>;
  errorTopic?: string;
  errorAction?: string;
  errorEvent?: EVENT;
}

declare interface SubscriptionListener {
  onSubscriptionRemoved(name: string, socketWrapper: SocketWrapper): void;
  onLastSubscriptionRemoved(name: string): void;
  onSubscriptionMade(name: string, socketWrapper: SocketWrapper): void;
  onFirstSubscriptionMade(name: string): void;
}

declare type Logger = {
  setLogLevel(logLevel: number): void,
  info(event: EVENT, message?: string, metaData?: any): void,
  debug(event: EVENT, message?: string, metaData?: any): void,
  warn(event: EVENT, message?: string, metaData?: any): void,
  error(event: EVENT, message?: string, metaData?: any): void,
  log(level: LOG_LEVEL, event: EVENT, message: string, metaData?: any): void
} & DeepstreamPlugin;

declare type ConnectionEndpoint = {
  onMessages(socketWrapper: SocketWrapper, messages: Array<Message>): void,
  close(): void,
  scheduleFlush(socketWrapper: SocketWrapper): void
} & DeepstreamPlugin;

declare interface PluginConfig {
  name?: string;
  path?: string;
  type?: string;
  options: any;
}

declare type DeepstreamPlugin = {
  isReady: boolean,
  description: string,
  init(): void,
  close(): void,
  setDeepstream(deepstream: any): void,
  setRecordHandler(recordHandler: any): void
} & events$EventEmitter;

declare type StorageReadCallback = (
  error: string | null,
  version: number,
  result: any
) => void;

declare type StorageWriteCallback = (error: string | null) => void;

declare type StoragePlugin = {
  apiVersion?: number,
  set(
    recordName: string,
    version: number,
    data: any,
    callback: StorageWriteCallback,
    metaData?: any
  ): void,
  get(recordName: string, callback: StorageReadCallback, metaData?: any): void,
  delete(
    recordName: string,
    callback: StorageWriteCallback,
    metaData?: any
  ): void
} & DeepstreamPlugin;

declare type PermissionHandler = {
  canPerformAction(
    username: string,
    message: Message,
    callback: Function,
    authData: any,
    socketWrapper: SocketWrapper
  ): void
} & DeepstreamPlugin;

declare type AuthenticationHandler = {
  isValidUser(
    connectionData: any,
    authData: any,
    callback: UserAuthenticationCallback
  ): void,
  onClientDisconnect(username: string): void
} & DeepstreamPlugin;

declare interface UserAuthenticationCallback {
  (isValid: boolean, clientData?: any): void;
}

declare interface Cluster {
  getStateRegistry(stateRegistryTopic: TOPIC): any;
  send(stateRegistryTopic: TOPIC, message: Message, metaData?: any): void;
  sendDirect(serverName: string, message: Message, metaData?: any): void;
  subscribe(stateRegistryTopic: TOPIC, callback: Function): void;
  isLeader(): boolean;
  close(callback: Function): void;
}

declare interface LockRegistry {
  get(lock: string, callback: Function): void;
  release(lock: string): void;
}

declare interface DeepstreamConfig {
  showLogo?: boolean;
  libDir?: string | null;
  logLevel?: number;
  serverName?: string;
  externalUrl?: string | null;
  sslKey?: string | null;
  sslCert?: string | null;
  sslCa?: string | null;
  connectionEndpoints?: any;
  plugins?: {
    cache?: PluginConfig,
    storage?: PluginConfig
  };
  logger?: PluginConfig;
  auth?: PluginConfig;
  permission?: PluginConfig;
  storageExclusionPrefixes?: Array<string>;
  provideRPCRequestorDetails?: boolean;
  rpcAckTimeout?: number;
  rpcTimeout?: number;
  cacheRetrievalTimeout?: number;
  storageRetrievalTimeout?: number;
  storageHotPathPrefixes?: Array<string>;
  dependencyInitialisationTimeout?: number;
  stateReconciliationTimeout?: number;
  clusterKeepAliveInterval?: number;
  clusterActiveCheckInterval?: number;
  clusterNodeInactiveTimeout?: number;
  listenResponseTimeout?: number;
  lockTimeout?: number;
  lockRequestTimeout?: number;
  broadcastTimeout?: number;
  shuffleListenProviders?: boolean;
}

declare interface InternalDeepstreamConfig {
  showLogo?: boolean;
  libDir?: string | null;
  logLevel?: number;
  serverName?: string;
  externalUrl?: string | null;
  sslKey?: string | null;
  sslCert?: string | null;
  sslCa?: string | null;
  connectionEndpoints?: any;
  plugins?: {
    cache: PluginConfig,
    storage: PluginConfig
  };
  logger?: PluginConfig;
  auth?: PluginConfig;
  permission?: PluginConfig;
  storageExclusionPrefixes?: Array<string>;
  provideRPCRequestorDetails?: boolean;
  rpcAckTimeout?: number;
  rpcTimeout?: number;
  cacheRetrievalTimeout?: number;
  storageRetrievalTimeout?: number;
  storageHotPathPrefixes?: Array<string>;
  dependencyInitialisationTimeout?: number;
  stateReconciliationTimeout?: number;
  clusterKeepAliveInterval?: number;
  clusterActiveCheckInterval?: number;
  clusterNodeInactiveTimeout?: number;
  listenResponseTimeout?: number;
  lockTimeout?: number;
  lockRequestTimeout?: number;
  broadcastTimeout?: number;
  shuffleListenProviders?: boolean;
}

declare interface DeepstreamServices {
  registeredPlugins: Array<string>;
  connectionEndpoints: Array<ConnectionEndpoint>;
  cache: StoragePlugin;
  storage: StoragePlugin;
  permissionHandler: PermissionHandler;
  authenticationHandler: AuthenticationHandler;
  logger: Logger;
  message: Cluster;
  uniqueRegistry: LockRegistry;
}

declare interface ValveConfig {
  cacheEvacuationInterval: number;
  maxRuleIterations: number;
  path: string;
}

declare interface Provider {
  socketWrapper: SocketWrapper;
  pattern: string;
  closeListener?: () => void;
}

declare interface UserData {
  clientData: any;
  serverData: any;
}

declare interface NodeJS$Global {
  deepstreamCLI: any;
  deepstreamLibDir: string | null;
  deepstreamConfDir: string | null;
  require(path: string): any;
}

declare type SocketSettings = {
  name?: string,
  host: string,
  pubsubPort?: number,
  pipelinePort?: number
};
