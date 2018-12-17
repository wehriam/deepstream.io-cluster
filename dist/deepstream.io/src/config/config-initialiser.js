"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const file_based_authentication_handler_1 = require("../authentication/file-based-authentication-handler");
const open_authentication_handler_1 = require("../authentication/open-authentication-handler");
const http_authentication_handler_1 = require("../authentication/http-authentication-handler");
const constants_1 = require("../constants");
const local_cache_1 = require("../default-plugins/local-cache");
const noop_storage_1 = require("../default-plugins/noop-storage");
const std_out_logger_1 = require("../default-plugins/std-out-logger");
const connection_endpoint_1 = require("../message/http/connection-endpoint");
const connection_endpoint_2 = require("../message/uws/connection-endpoint");
const config_permission_handler_1 = require("../permission/config-permission-handler");
const open_permission_handler_1 = require("../permission/open-permission-handler");
const utils = require("../utils/utils");
const fileUtils = require("./file-utils");
let commandLineArguments;
const customPlugins = new Map();
/**
 * Registers plugins by name. Useful when wanting to include
 * custom plugins in a binary
 */
exports.registerPlugin = function (name, construct) {
    customPlugins.set(name, construct);
};
/**
 * Takes a configuration object and instantiates functional properties.
 * CLI arguments will be considered.
 */
exports.initialise = function (config) {
    commandLineArguments = global.deepstreamCLI || {};
    handleUUIDProperty(config);
    handleSSLProperties(config);
    const services = {
        registeredPlugins: ['authenticationHandler', 'permissionHandler', 'cache', 'storage'],
    };
    services.cache = new local_cache_1.default();
    services.storage = new noop_storage_1.default();
    services.logger = handleLogger(config);
    handlePlugins(config, services);
    services.authenticationHandler = handleAuthStrategy(config, services.logger);
    services.permissionHandler = handlePermissionStrategy(config, services);
    services.connectionEndpoints = handleConnectionEndpoints(config, services);
    if (services.cache.apiVersion !== 2) {
        storageCompatability(services.cache);
    }
    if (services.storage.apiVersion !== 2) {
        storageCompatability(services.storage);
    }
    return { config, services };
};
/**
 * Transform the UUID string config to a UUID in the config object.
 */
function handleUUIDProperty(config) {
    if (config.serverName === 'UUID') {
        config.serverName = utils.getUid();
    }
}
/**
 * Load the SSL files
 * CLI arguments will be considered.
 */
function handleSSLProperties(config) {
    const sslFiles = ['sslKey', 'sslCert', 'sslCa'];
    let key;
    let resolvedFilePath;
    let filePath;
    for (let i = 0; i < sslFiles.length; i++) {
        key = sslFiles[i];
        filePath = config[key];
        if (!filePath) {
            continue;
        }
        resolvedFilePath = fileUtils.lookupConfRequirePath(filePath);
        try {
            config[key] = fs.readFileSync(resolvedFilePath, 'utf8');
        }
        catch (e) {
            throw new Error(`The file path "${resolvedFilePath}" provided by "${key}" does not exist.`);
        }
    }
}
/**
 * Initialize the logger and overwrite the root logLevel if it's set
 * CLI arguments will be considered.
 */
function handleLogger(config) {
    const configOptions = (config.logger || {}).options;
    if (commandLineArguments.colors !== undefined) {
        configOptions.colors = commandLineArguments.colors;
    }
    let Logger;
    if (config.logger.type === 'default') {
        Logger = std_out_logger_1.default;
    }
    else {
        Logger = resolvePluginClass(config.logger, 'logger');
    }
    if (configOptions instanceof Array) {
        // Note: This will not work on options without filename, and
        // is biased against for the winston logger
        let options;
        for (let i = 0; i < configOptions.length; i++) {
            options = configOptions[i].options;
            if (options && options.filename) {
                options.filename = fileUtils.lookupConfRequirePath(options.filename);
            }
        }
    }
    const logger = new Logger(configOptions);
    if (logger.log) {
        logger.debug = logger.debug || logger.log.bind(logger, constants_1.LOG_LEVEL.DEBUG);
        logger.info = logger.info || logger.log.bind(logger, constants_1.LOG_LEVEL.INFO);
        logger.warn = logger.warn || logger.log.bind(logger, constants_1.LOG_LEVEL.WARN);
        logger.error = logger.error || logger.log.bind(logger, constants_1.LOG_LEVEL.ERROR);
    }
    if (constants_1.LOG_LEVEL[config.logLevel]) {
        // NOTE: config.logLevel has highest priority, compare to the level defined
        // in the nested logger object
        config.logLevel = config.logLevel;
        logger.setLogLevel(constants_1.LOG_LEVEL[config.logLevel]);
    }
    return logger;
}
/**
 * Handle the plugins property in the config object the connectors.
 * Allowed types: {cache|storage}
 * Plugins can be passed either as a __path__ property or as a __name__ property with
 * a naming convetion: *{cache: {name: 'redis'}}* will be resolved to the
 * npm module *deepstream.io-cache-redis*
 * Options to the constructor of the plugin can be passed as *options* object.
 *
 * CLI arguments will be considered.
 */
function handlePlugins(config, services) {
    if (config.plugins == null) {
        return;
    }
    const plugins = Object.assign({}, config.plugins);
    for (const key in plugins) {
        const plugin = plugins[key];
        if (plugin) {
            const PluginConstructor = resolvePluginClass(plugin, key);
            services[key] = new PluginConstructor(plugin.options);
            if (services.registeredPlugins.indexOf(key) === -1) {
                services.registeredPlugins.push(key);
            }
        }
    }
}
/**
 * Handle connection endpoint plugin config.
 * The type is typically the protocol e.g. ws
 * Plugins can be passed either as a __path__ property or as a __name__ property with
 * a naming convetion: *{amqp: {name: 'my-plugin'}}* will be resolved to the
 * npm module *deepstream.io-connection-my-plugin*
 * Exception: the name *uws* will be resolved to deepstream.io's internal uWebSockets plugin
 * Options to the constructor of the plugin can be passed as *options* object.
 *
 * CLI arguments will be considered.
 */
function handleConnectionEndpoints(config, services) {
    // delete any endpoints that have been set to `null`
    for (const type in config.connectionEndpoints) {
        if (!config.connectionEndpoints[type]) {
            delete config.connectionEndpoints[type];
        }
    }
    if (!config.connectionEndpoints || Object.keys(config.connectionEndpoints).length === 0) {
        throw new Error('No connection endpoints configured');
    }
    const connectionEndpoints = [];
    for (const connectionType in config.connectionEndpoints) {
        const plugin = config.connectionEndpoints[connectionType];
        plugin.options = plugin.options || {};
        let PluginConstructor;
        if (plugin.type === 'default' && connectionType === 'websocket') {
            PluginConstructor = connection_endpoint_2.default;
        }
        else if (plugin.type === 'default' && connectionType === 'http') {
            PluginConstructor = connection_endpoint_1.default;
        }
        else {
            PluginConstructor = resolvePluginClass(plugin, 'connection');
        }
        connectionEndpoints.push(new PluginConstructor(plugin.options, services));
    }
    return connectionEndpoints;
}
/**
 * Instantiate the given plugin, which either needs a path property or a name
 * property which fits to the npm module name convention. Options will be passed
 * to the constructor.
 *
 * CLI arguments will be considered.
 */
function resolvePluginClass(plugin, type) {
    if (customPlugins.has(plugin.name)) {
        return customPlugins.get(plugin.name);
    }
    // nexe needs *global.require* for __dynamic__ modules
    // but browserify and proxyquire can't handle *global.require*
    const req = global && global.require ? global.require : require;
    let requirePath;
    let pluginConstructor;
    let es6Adaptor;
    if (plugin.path != null) {
        requirePath = fileUtils.lookupLibRequirePath(plugin.path);
        es6Adaptor = req(requirePath);
        pluginConstructor = es6Adaptor.default ? es6Adaptor.default : es6Adaptor;
    }
    else if (plugin.name != null && type) {
        requirePath = `deepstream.io-${type}-${plugin.name}`;
        requirePath = fileUtils.lookupLibRequirePath(requirePath);
        es6Adaptor = req(requirePath);
        pluginConstructor = es6Adaptor.default ? es6Adaptor.default : es6Adaptor;
    }
    else if (plugin.name != null) {
        requirePath = fileUtils.lookupLibRequirePath(plugin.name);
        es6Adaptor = req(requirePath);
        pluginConstructor = es6Adaptor.default ? es6Adaptor.default : es6Adaptor;
    }
    else if (plugin.type === 'default' && type === 'cache') {
        pluginConstructor = local_cache_1.default;
    }
    else if (plugin.type === 'default' && type === 'storage') {
        pluginConstructor = noop_storage_1.default;
    }
    else {
        throw new Error(`Neither name nor path property found for ${type}`);
    }
    return pluginConstructor;
}
/**
 * Instantiates the authentication handler registered for *config.auth.type*
 *
 * CLI arguments will be considered.
 */
function handleAuthStrategy(config, logger) {
    let AuthenticationHandler;
    const authStrategies = {
        none: open_authentication_handler_1.default,
        file: file_based_authentication_handler_1.default,
        http: http_authentication_handler_1.default,
    };
    if (!config.auth) {
        throw new Error('No authentication type specified');
    }
    if (commandLineArguments.disableAuth) {
        config.auth.type = 'none';
        config.auth.options = {};
    }
    if (config.auth.name || config.auth.path) {
        AuthenticationHandler = resolvePluginClass(config.auth, 'authentication');
        if (!AuthenticationHandler) {
            throw new Error(`unable to resolve authentication handler ${config.auth.name || config.auth.path}`);
        }
    }
    else if (config.auth.type && authStrategies[config.auth.type]) {
        AuthenticationHandler = authStrategies[config.auth.type];
    }
    else {
        throw new Error(`Unknown authentication type ${config.auth.type}`);
    }
    if (config.auth.options && config.auth.options.path) {
        config.auth.options.path = fileUtils.lookupConfRequirePath(config.auth.options.path);
    }
    return new AuthenticationHandler(config.auth.options, logger);
}
/**
 * Instantiates the permission handler registered for *config.permission.type*
 *
 * CLI arguments will be considered.
 */
function handlePermissionStrategy(config, services) {
    let PermissionHandler;
    const permissionStrategies = {
        config: config_permission_handler_1.default,
        none: open_permission_handler_1.default,
    };
    if (!config.permission) {
        throw new Error('No permission type specified');
    }
    if (commandLineArguments.disablePermissions) {
        config.permission.type = 'none';
        config.permission.options = {};
    }
    if (config.permission.name || config.permission.path) {
        PermissionHandler = resolvePluginClass(config.permission, 'permission');
        if (!PermissionHandler) {
            throw new Error(`unable to resolve plugin ${config.permission.name || config.permission.path}`);
        }
    }
    else if (config.permission.type && permissionStrategies[config.permission.type]) {
        PermissionHandler = permissionStrategies[config.permission.type];
    }
    else {
        throw new Error(`Unknown permission type ${config.permission.type}`);
    }
    if (config.permission.options && config.permission.options.path) {
        config.permission.options.path = fileUtils.lookupConfRequirePath(config.permission.options.path);
    }
    if (config.permission.type === 'config') {
        return new PermissionHandler(config, services);
    }
    else {
        return new PermissionHandler(config.permission.options, services);
    }
}
function storageCompatability(storage) {
    const oldGet = storage.get;
    storage.get = (recordName, callback) => {
        oldGet.call(storage, recordName, (error, record) => {
            callback(error, record ? record._v : -1, record ? record._d : {});
        });
    };
    const oldSet = storage.set;
    storage.set = (recordName, version, data, callback) => {
        oldSet.call(storage, recordName, { _v: version, _d: data }, callback);
    };
}
exports.storageCompatability = storageCompatability;
//# sourceMappingURL=config-initialiser.js.map