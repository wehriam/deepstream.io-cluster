"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const constants_1 = require("../constants");
const subscription_registry_1 = require("../utils/subscription-registry");
const utils_1 = require("../utils/utils");
const rpc_1 = require("./rpc");
const rpc_proxy_1 = require("./rpc-proxy");
class RpcHandler {
    /**
    * Handles incoming messages for the RPC Topic.
    */
    constructor(config, services, subscriptionRegistry, metaData) {
        this.metaData = metaData;
        this.config = config;
        this.services = services;
        this.subscriptionRegistry =
            subscriptionRegistry || new subscription_registry_1.default(config, services, constants_1.TOPIC.RPC, constants_1.TOPIC.RPC_SUBSCRIPTIONS);
        this.subscriptionRegistry.setAction('NOT_SUBSCRIBED', constants_1.RPC_ACTIONS.NOT_PROVIDED);
        this.subscriptionRegistry.setAction('MULTIPLE_SUBSCRIPTIONS', constants_1.RPC_ACTIONS.MULTIPLE_PROVIDERS);
        this.subscriptionRegistry.setAction('SUBSCRIBE', constants_1.RPC_ACTIONS.PROVIDE);
        this.subscriptionRegistry.setAction('UNSUBSCRIBE', constants_1.RPC_ACTIONS.UNPROVIDE);
        this.services.message.subscribe(constants_1.TOPIC.RPC, this.onPrivateMessage.bind(this));
        this.rpcs = new Map();
    }
    /**
    * Main interface. Handles incoming messages
    * from the message distributor
    */
    handle(socketWrapper, message) {
        if (message.action === constants_1.RPC_ACTIONS.PROVIDE) {
            this.subscriptionRegistry.subscribe(message, socketWrapper);
        }
        else if (message.action === constants_1.RPC_ACTIONS.UNPROVIDE) {
            this.subscriptionRegistry.unsubscribe(message, socketWrapper);
        }
        else if (message.action === constants_1.RPC_ACTIONS.REQUEST) {
            this.makeRpc(socketWrapper, message, false);
        }
        else if (message.action === constants_1.RPC_ACTIONS.RESPONSE ||
            message.action === constants_1.RPC_ACTIONS.REJECT ||
            message.action === constants_1.RPC_ACTIONS.ACCEPT ||
            message.action === constants_1.RPC_ACTIONS.REQUEST_ERROR) {
            const rpcData = this.rpcs.get(message.correlationId);
            if (rpcData) {
                this.services.logger.debug(constants_1.RPC_ACTIONS[message.action], `name: ${message.name} with correlation id: ${message.correlationId} from ${socketWrapper.user}`, this.metaData);
                rpcData.rpc.handle(message);
            }
            else {
                this.services.logger.warn(constants_1.RPC_ACTIONS[constants_1.RPC_ACTIONS.INVALID_RPC_CORRELATION_ID], `name: ${message.name} with correlation id: ${message.correlationId}`, this.metaData);
                socketWrapper.sendMessage({
                    topic: constants_1.TOPIC.RPC,
                    action: constants_1.RPC_ACTIONS.INVALID_RPC_CORRELATION_ID,
                    originalAction: message.action,
                    name: message.name,
                    correlationId: message.correlationId
                });
            }
        }
        else {
            /*
            *  RESPONSE-, ERROR-, REJECT- and ACK messages from the provider are processed
            * by the Rpc class directly
            */
            this.services.logger.warn(constants_1.PARSER_ACTIONS[constants_1.PARSER_ACTIONS.UNKNOWN_ACTION], message.action.toString(), this.metaData);
        }
    }
    /**
    * This method is called by Rpc to reroute its request
    *
    * If a provider is temporarily unable to service a request, it can reject it. Deepstream
    * will then try to reroute it to an alternative provider. Finding an alternative provider
    * happens in this method.
    *
    * Initially, deepstream will look for a local provider that hasn't been used by the RPC yet.
    * If non can be found, it will go through the currently avaiblable remote providers and try
    * find one that hasn't been used yet.
    *
    * If a remote provider couldn't be found or all remote-providers have been tried already
    * this method will return null - which in turn will prompt the RPC to send a NO_RPC_PROVIDER
    * error to the client
    */
    getAlternativeProvider(rpcName, correlationId) {
        const rpcData = this.rpcs.get(correlationId);
        if (!rpcData) {
            // log error
            return null;
        }
        const subscribers = Array.from(this.subscriptionRegistry.getLocalSubscribers(rpcName));
        let index = utils_1.getRandomIntInRange(0, subscribers.length);
        for (let n = 0; n < subscribers.length; ++n) {
            if (!rpcData.providers.has(subscribers[index])) {
                rpcData.providers.add(subscribers[index]);
                return subscribers[index];
            }
            index = (index + 1) % subscribers.length;
        }
        if (!rpcData.servers) {
            return null;
        }
        const servers = this.subscriptionRegistry.getAllRemoteServers(rpcName);
        index = utils_1.getRandomIntInRange(0, servers.length);
        for (let n = 0; n < servers.length; ++n) {
            if (!rpcData.servers.has(servers[index])) {
                rpcData.servers.add(servers[index]);
                return new rpc_proxy_1.default(this.config, this.services, servers[index], this.metaData);
            }
            index = (index + 1) % servers.length;
        }
        return null;
    }
    /**
    * Executes a RPC. If there are clients connected to
    * this deepstream instance that can provide the rpc, it
    * will be routed to a random one of them, otherwise it will be routed
    * to the message connector
    */
    makeRpc(socketWrapper, message, isRemote) {
        const rpcName = message.name;
        const correlationId = message.correlationId;
        this.services.logger.debug(constants_1.RPC_ACTIONS[constants_1.RPC_ACTIONS.REQUEST], `name: ${rpcName} with correlation id: ${correlationId} from ${socketWrapper.user}`, this.metaData);
        const subscribers = Array.from(this.subscriptionRegistry.getLocalSubscribers(rpcName));
        const provider = subscribers[utils_1.getRandomIntInRange(0, subscribers.length)];
        if (provider) {
            const rpcData = {
                providers: new Set(),
                servers: !isRemote ? new Set() : null,
                rpc: new rpc_1.default(this, socketWrapper, provider, this.config, this.services, message),
            };
            this.rpcs.set(correlationId, rpcData);
            rpcData.providers.add(provider);
        }
        else if (isRemote) {
            socketWrapper.sendMessage({
                topic: constants_1.TOPIC.RPC,
                action: constants_1.RPC_ACTIONS.NO_RPC_PROVIDER,
                name: rpcName,
                correlationId
            });
        }
        else {
            this.makeRemoteRpc(socketWrapper, message);
        }
    }
    /**
    * Callback to remoteProviderRegistry.getProviderProxy()
    *
    * If a remote provider is available this method will route the rpc to it.
    *
    * If no remote provider could be found this class will return a
    * NO_RPC_PROVIDER error to the requestor. The RPC won't continue from
    * thereon
    */
    makeRemoteRpc(requestor, message) {
        const rpcName = message.name;
        const correlationId = message.correlationId;
        const servers = this.subscriptionRegistry.getAllRemoteServers(rpcName);
        const server = servers[utils_1.getRandomIntInRange(0, servers.length)];
        if (server) {
            const rpcProxy = new rpc_proxy_1.default(this.config, this.services, server, this.metaData);
            const rpcData = {
                providers: new Set(),
                servers: new Set(),
                rpc: new rpc_1.default(this, requestor, rpcProxy, this.config, this.services, message),
            };
            this.rpcs.set(correlationId, rpcData);
            return;
        }
        this.rpcs.delete(correlationId);
        this.services.logger.warn(constants_1.RPC_ACTIONS[constants_1.RPC_ACTIONS.NO_RPC_PROVIDER], `name: ${message.name} with correlation id: ${message.correlationId}`, this.metaData);
        if (!requestor.isRemote) {
            requestor.sendMessage({
                topic: constants_1.TOPIC.RPC,
                action: constants_1.RPC_ACTIONS.NO_RPC_PROVIDER,
                name: rpcName,
                correlationId
            });
        }
    }
    /**
    * Callback for messages that are send directly to
    * this deepstream instance.
    *
    * Please note: Private messages are generic, so the RPC
    * specific ones need to be filtered out.
    */
    onPrivateMessage(msg, originServerName) {
        if (!msg.data || msg.data.length < 2) {
            // this.services.logger.warn(INVALID_MSGBUS_MESSAGE, msg.data,  this.metaData)
            return;
        }
        if (msg.action === constants_1.RPC_ACTIONS.REQUEST) {
            const proxy = new rpc_proxy_1.default(this.config, this.services, originServerName, this.metaData);
            this.makeRpc(proxy, msg, true);
            return;
        }
        const rpcData = this.rpcs.get(msg.correlationId);
        if (!rpcData) {
            this.services.logger.warn(constants_1.RPC_ACTIONS.INVALID_RPC_CORRELATION_ID, `Message bus response for RPC that may have been destroyed: ${JSON.stringify(msg)}`, this.metaData);
        }
        if (rpcData) {
            this.services.logger.debug(constants_1.RPC_ACTIONS[constants_1.RPC_ACTIONS[msg.action]], `name: ${msg.name} with correlation id: ${msg.correlationId} from remote server ${originServerName}`, this.metaData);
            rpcData.rpc.handle(msg);
        }
        else {
            // this.services.logger.warn(UNSOLICITED_MSGBUS_MESSAGE, msg, this.metaData)
        }
    }
    /**
     * Called by the RPC with correlationId to destroy itself
     * when lifecycle is over.
     */
    onRPCDestroyed(correlationId) {
        this.rpcs.delete(correlationId);
    }
}
exports.default = RpcHandler;
//# sourceMappingURL=rpc-handler.js.map