'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("./server");
const jif_handler_1 = require("../jif-handler");
const socket_wrapper_1 = require("./socket-wrapper");
const HTTPStatus = require("http-status");
const events_1 = require("events");
const constants_1 = require("../../constants");
class HTTPConnectionEndpoint extends events_1.EventEmitter {
    constructor(options, services) {
        super();
        this.isReady = false;
        this.description = 'HTTP connection endpoint';
        this.initialised = false;
        this.options = options;
        this.onSocketMessageBound = this.onSocketMessage.bind(this);
        this.onSocketErrorBound = this.onSocketError.bind(this);
    }
    /**
     * Called on initialization with a reference to the instantiating deepstream server.
     */
    setDeepstream(deepstream) {
        this.logger = deepstream.services.logger;
        this.authenticationHandler = deepstream.services.authenticationHandler;
        this.permissionHandler = deepstream.services.permissionHandler;
        this.messageDistributor = deepstream.messageDistributor;
        this.dsOptions = deepstream.config;
        this.jifHandler = new jif_handler_1.default({ logger: deepstream.services.logger });
    }
    /**
     * Initialise the http server.
     *
     * @throws Will throw if called before `setDeepstream()`.
     */
    init() {
        if (!this.dsOptions) {
            throw new Error('setDeepstream must be called before init()');
        }
        if (this.initialised) {
            throw new Error('init() must only be called once');
        }
        this.initialised = true;
        const serverConfig = {
            port: this.getOption('port'),
            host: this.getOption('host'),
            healthCheckPath: this.getOption('healthCheckPath'),
            authPath: this.options.authPath,
            postPath: this.options.postPath,
            getPath: this.options.getPath,
            allowAllOrigins: this.options.allowAllOrigins,
            enableAuthEndpoint: this.options.enableAuthEndpoint
        };
        this.server = new server_1.default(serverConfig, this.logger);
        this.server.on('auth-message', this.onAuthMessage.bind(this));
        this.server.on('post-message', this.onPostMessage.bind(this));
        this.server.on('get-message', this.onGetMessage.bind(this));
        this.server.on('ready', () => {
            this.isReady = true;
            this.emit('ready');
        });
        this.server.start();
        this.logInvalidAuthData = this.getOption('logInvalidAuthData');
        this.requestTimeout = this.getOption('requestTimeout');
        if (this.requestTimeout === undefined) {
            this.requestTimeout = 20000;
        }
    }
    /**
     * Get a parameter from the root of the deepstream options if present, otherwise get it from the
     * plugin config.
     */
    getOption(option) {
        const value = this.dsOptions[option];
        if ((value === null || value === undefined) && (this.options[option] !== undefined)) {
            return this.options[option];
        }
        return value;
    }
    close() {
        this.server.stop(() => this.emit('close'));
    }
    /**
     * Called for every message that's received
     * from an authenticated socket
     *
     * This method will be overridden by an external class and is used instead
     * of an event emitter to improve the performance of the messaging pipeline
     */
    onMessages(socketWrapper, messages) {
    }
    /**
     * Handle a message to the authentication endpoint (for token generation).
     *
     * Passes the entire message to the configured authentication handler.
     */
    onAuthMessage(authData, metadata, responseCallback) {
        this.authenticationHandler.isValidUser(metadata, authData, this.processAuthResult.bind(this, responseCallback, authData));
    }
    /**
     * Handle response from authentication handler relating to an auth request.
     *
     * Builds a response containing the user's userData and token
     */
    processAuthResult(responseCallback, authData, isAllowed, data) {
        if (isAllowed === true) {
            responseCallback(null, {
                token: data.token,
                clientData: data.clientData
            });
            return;
        }
        let error = typeof data === 'string' ? data : 'Invalid authentication data.';
        responseCallback({
            statusCode: HTTPStatus.UNAUTHORIZED,
            message: error
        });
        if (this.logInvalidAuthData === true) {
            error += `: ${JSON.stringify(authData)}`;
        }
        this.logger.debug(constants_1.AUTH_ACTIONS[constants_1.AUTH_ACTIONS.AUTH_UNSUCCESSFUL], error);
    }
    /**
     * Handle a message to the POST endpoint
     *
     * Authenticates the message using authData, a token, or OPEN auth if enabled/provided.
     */
    onPostMessage(messageData, metadata, responseCallback) {
        if (!Array.isArray(messageData.body) || messageData.body.length < 1) {
            const error = `Invalid message: the "body" parameter must ${messageData.body ? 'be a non-empty array of Objects.' : 'exist.'}`;
            responseCallback({
                statusCode: HTTPStatus.BAD_REQUEST,
                message: error
            });
            this.logger.debug(constants_1.PARSER_ACTIONS[constants_1.PARSER_ACTIONS.INVALID_MESSAGE], JSON.stringify(messageData.body));
            return;
        }
        let authData = {};
        if (messageData.authData !== undefined) {
            if (this.options.allowAuthData !== true) {
                const error = 'Authentication using authData is disabled. Try using a token instead.';
                responseCallback({ statusCode: HTTPStatus.BAD_REQUEST, message: error });
                this.logger.debug(constants_1.AUTH_ACTIONS[constants_1.AUTH_ACTIONS.INVALID_MESSAGE_DATA], 'Auth rejected because allowAuthData was disabled');
                return;
            }
            if (messageData.authData === null || typeof messageData.authData !== 'object') {
                const error = 'Invalid message: the "authData" parameter must be an object';
                responseCallback({ statusCode: HTTPStatus.BAD_REQUEST, message: error });
                this.logger.debug(constants_1.AUTH_ACTIONS[constants_1.AUTH_ACTIONS.INVALID_MESSAGE_DATA], `authData was not an object: ${this.logInvalidAuthData === true ? JSON.stringify(messageData.authData) : '-'}`);
                return;
            }
            authData = messageData.authData;
        }
        else if (messageData.token !== undefined) {
            if (typeof messageData.token !== 'string' || messageData.token.length === 0) {
                const error = 'Invalid message: the "token" parameter must be a non-empty string';
                responseCallback({ statusCode: HTTPStatus.BAD_REQUEST, message: error });
                this.logger.debug(constants_1.AUTH_ACTIONS[constants_1.AUTH_ACTIONS.INVALID_MESSAGE_DATA], `auth token was not a string: ${this.logInvalidAuthData === true ? messageData.token : '-'}`);
                return;
            }
            authData = Object.assign({}, authData, { token: messageData.token });
        }
        this.authenticationHandler.isValidUser(metadata, authData, this.onMessageAuthResponse.bind(this, responseCallback, messageData));
    }
    /**
     * Create and initialize a new SocketWrapper
     */
    createSocketWrapper(authResponseData, messageIndex, messageResults, responseCallback, requestTimeoutId) {
        const socketWrapper = new socket_wrapper_1.default({}, this.onSocketMessageBound, this.onSocketErrorBound);
        socketWrapper.init(authResponseData, messageIndex, messageResults, responseCallback, requestTimeoutId);
        return socketWrapper;
    }
    /**
     * Handle response from authentication handler relating to a POST request.
     *
     * Parses, permissions and distributes the individual messages
     */
    onMessageAuthResponse(responseCallback, messageData, success, authResponseData) {
        if (success !== true) {
            const error = typeof authResponseData === 'string' ? authResponseData : 'Unsuccessful authentication attempt.';
            responseCallback({
                statusCode: HTTPStatus.UNAUTHORIZED,
                message: error
            });
            return;
        }
        const messageCount = messageData.body.length;
        const messageResults = new Array(messageCount).fill(null);
        const parseResults = new Array(messageCount);
        for (let messageIndex = 0; messageIndex < messageCount; messageIndex++) {
            const parseResult = this.jifHandler.fromJIF(messageData.body[messageIndex]);
            parseResults[messageIndex] = parseResult;
            if (!parseResult.success) {
                const message = `Failed to parse JIF object at index ${messageIndex}.`;
                responseCallback({
                    statusCode: HTTPStatus.BAD_REQUEST,
                    message: parseResult.error ? `${message} Reason: ${parseResult.error}` : message
                });
                this.logger.debug(constants_1.PARSER_ACTIONS[constants_1.PARSER_ACTIONS.MESSAGE_PARSE_ERROR], parseResult.error);
                return;
            }
        }
        const requestTimeoutId = setTimeout(() => this.onRequestTimeout(responseCallback, messageResults), this.requestTimeout);
        const dummySocketWrapper = this.createSocketWrapper(authResponseData, null, null, null, null);
        for (let messageIndex = 0; messageIndex < messageCount; messageIndex++) {
            const parseResult = parseResults[messageIndex];
            if (parseResult.done) {
                // Messages such as event emits do not need to wait for a response. However, we need to
                // check that the message was successfully permissioned, so bypass the message-processor.
                this.permissionEventEmit(dummySocketWrapper, parseResult.message, messageResults, messageIndex);
                // check if a response can be sent immediately
                if (messageIndex === messageCount - 1) {
                    HTTPConnectionEndpoint.checkComplete(messageResults, responseCallback, requestTimeoutId);
                }
            }
            else {
                const socketWrapper = this.createSocketWrapper(authResponseData, messageIndex, messageResults, responseCallback, requestTimeoutId);
                /*
                 * TODO: work out a way to safely enable socket wrapper pooling
                 * if (this.socketWrapperPool.length === 0) {
                 *   socketWrapper = new HTTPSocketWrapper(
                 *     this.onSocketMessageBound,
                 *     this.onSocketErrorBound
                 *   )
                 * } else {
                 *   socketWrapper = this.socketWrapperPool.pop()
                 * }
                 */
                // emit the message
                this.onMessages(socketWrapper, [parseResult.message]);
            }
        }
    }
    /**
     * Handle messages from deepstream socketWrappers and inserts message responses into the HTTP
     * response where possible.
     */
    onSocketMessage(messageResults, index, message, responseCallback, requestTimeoutId) {
        const parseResult = this.jifHandler.toJIF(message);
        if (!parseResult) {
            const errorMessage = `${message.topic} ${message.action} ${JSON.stringify(message.data)}`;
            this.logger.error(constants_1.PARSER_ACTIONS[constants_1.PARSER_ACTIONS.MESSAGE_PARSE_ERROR], errorMessage);
            return;
        }
        if (parseResult.done !== true) {
            return;
        }
        if (messageResults[index] === null) {
            messageResults[index] = parseResult.message;
            HTTPConnectionEndpoint.checkComplete(messageResults, responseCallback, requestTimeoutId);
        }
    }
    /**
     * Handle errors from deepstream socketWrappers and inserts message rejections into the HTTP
     * response where necessary.
     */
    onSocketError(messageResults, index, message, event, errorMessage, responseCallback, requestTimeoutId) {
        const parseResult = this.jifHandler.errorToJIF(message, event);
        if (parseResult.done && messageResults[index] === null) {
            messageResults[index] = parseResult.message;
            HTTPConnectionEndpoint.checkComplete(messageResults, responseCallback, requestTimeoutId);
        }
    }
    /**
     * Check whether any more responses are outstanding and finalize http response if not.
     */
    static checkComplete(messageResults, responseCallback, requestTimeoutId) {
        const messageResult = HTTPConnectionEndpoint.calculateMessageResult(messageResults);
        if (messageResult === null) {
            // insufficient responses received
            return;
        }
        clearTimeout(requestTimeoutId);
        responseCallback(null, {
            result: messageResult,
            body: messageResults
        });
    }
    /**
     * Handle request timeout, sending any responses that have already resolved.
     */
    onRequestTimeout(responseCallback, messageResults) {
        let numTimeouts = 0;
        for (let i = 0; i < messageResults.length; i++) {
            if (messageResults[i] === null) {
                messageResults[i] = {
                    success: false,
                    error: 'Request exceeded timeout before a response was received.',
                    errorTopic: 'connection',
                    errorEvent: constants_1.EVENT.TIMEOUT
                };
                numTimeouts++;
            }
        }
        if (numTimeouts === 0) {
            return;
        }
        this.logger.warn(constants_1.EVENT.TIMEOUT, 'HTTP Request timeout');
        const result = HTTPConnectionEndpoint.calculateMessageResult(messageResults);
        responseCallback(null, {
            result,
            body: messageResults
        });
    }
    /**
     * Calculate the 'result' field in a response depending on how many responses resolved
     * successfully. Can be one of 'SUCCESS', 'FAILURE' or 'PARTIAL SUCCSS'
     */
    static calculateMessageResult(messageResults) {
        let numSucceeded = 0;
        for (let i = 0; i < messageResults.length; i++) {
            if (!messageResults[i]) {
                // todo: when does this happen
                return null;
            }
            if (messageResults[i].success) {
                numSucceeded++;
            }
        }
        if (numSucceeded === messageResults.length) {
            return 'SUCCESS';
        }
        if (numSucceeded === 0) {
            return 'FAILURE';
        }
        return 'PARTIAL_SUCCESS';
    }
    onGetMessage(data, headers, responseCallback) {
        const message = 'Reading records via HTTP GET is not yet implemented, please use a post request instead.';
        this.logger.warn(constants_1.RECORD_ACTIONS[constants_1.RECORD_ACTIONS.READ], message);
        responseCallback({ statusCode: 400, message });
        // TODO: implement a GET endpoint that reads the current state of a record
    }
    /**
     * Permission an event emit and capture the response directly
     */
    permissionEventEmit(socketWrapper, parsedMessage, messageResults, messageIndex) {
        this.permissionHandler.canPerformAction(socketWrapper.user, parsedMessage, this.onPermissionResponse.bind(this, socketWrapper, parsedMessage, messageResults, messageIndex), socketWrapper.authData, socketWrapper);
    }
    /**
     * Handle an event emit permission response
     */
    onPermissionResponse(socketWrapper, message, messageResults, messageIndex, error, permissioned) {
        if (error !== null) {
            this.options.logger.warn(constants_1.EVENT_ACTIONS[constants_1.EVENT_ACTIONS.MESSAGE_PERMISSION_ERROR], error.toString());
        }
        if (permissioned !== true) {
            messageResults[messageIndex] = {
                success: false,
                error: 'Message denied. Action \'emit\' is not permitted.',
                errorEvent: constants_1.EVENT_ACTIONS[constants_1.EVENT_ACTIONS.MESSAGE_DENIED],
                errorAction: 'emit',
                errorTopic: 'event'
            };
            return;
        }
        messageResults[messageIndex] = { success: true };
        this.messageDistributor.distribute(socketWrapper, message);
    }
}
exports.default = HTTPConnectionEndpoint;
//# sourceMappingURL=connection-endpoint.js.map