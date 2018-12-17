"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const constants_1 = require("../constants");
const listener_registry_1 = require("../listen/listener-registry");
const subscription_registry_1 = require("../utils/subscription-registry");
const record_deletion_1 = require("./record-deletion");
const record_request_1 = require("./record-request");
const record_transition_1 = require("./record-transition");
const utils_1 = require("../utils/utils");
const WRITE_ACK_TO_ACTION = {
    [constants_1.RECORD_ACTIONS.CREATEANDPATCH_WITH_WRITE_ACK]: constants_1.RECORD_ACTIONS.CREATEANDPATCH,
    [constants_1.RECORD_ACTIONS.CREATEANDUPDATE_WITH_WRITE_ACK]: constants_1.RECORD_ACTIONS.CREATEANDUPDATE,
    [constants_1.RECORD_ACTIONS.PATCH_WITH_WRITE_ACK]: constants_1.RECORD_ACTIONS.PATCH,
    [constants_1.RECORD_ACTIONS.UPDATE_WITH_WRITE_ACK]: constants_1.RECORD_ACTIONS.UPDATE,
    [constants_1.RECORD_ACTIONS.ERASE_WITH_WRITE_ACK]: constants_1.RECORD_ACTIONS.ERASE,
};
class RecordHandler {
    /**
     * The entry point for record related operations
     */
    constructor(config, services, subscriptionRegistry, listenerRegistry, metaData) {
        this.metaData = metaData;
        this.config = config;
        this.services = services;
        this.subscriptionRegistry =
            subscriptionRegistry || new subscription_registry_1.default(config, services, constants_1.TOPIC.RECORD, constants_1.TOPIC.RECORD_SUBSCRIPTIONS);
        this.listenerRegistry =
            listenerRegistry || new listener_registry_1.default(constants_1.TOPIC.RECORD, config, services, this.subscriptionRegistry, null);
        this.subscriptionRegistry.setSubscriptionListener(this.listenerRegistry);
        this.transitions = {};
        this.recordRequestsInProgress = {};
        this.recordRequest = record_request_1.recordRequestBinding(config, services, this, metaData);
    }
    /**
     * Handles incoming record requests.
     *
     * Please note that neither CREATE nor READ is supported as a
     * client send action. Instead the client sends CREATEORREAD
     * and deepstream works which one it will be
     */
    handle(socketWrapper, message) {
        const action = message.isWriteAck ? WRITE_ACK_TO_ACTION[message.action] : message.action;
        if (action === constants_1.RECORD_ACTIONS.SUBSCRIBECREATEANDREAD) {
            /*
             * Return the record's contents and subscribes for future updates.
             * Creates the record if it doesn't exist
             */
            this.createOrRead(socketWrapper, message);
        }
        else if (action === constants_1.RECORD_ACTIONS.CREATEANDUPDATE ||
            action === constants_1.RECORD_ACTIONS.CREATEANDPATCH) {
            /*
             * Allows updates to the record without being subscribed, creates
             * the record if it doesn't exist
             */
            this.createAndUpdate(socketWrapper, message);
        }
        else if (action === constants_1.RECORD_ACTIONS.READ) {
            /*
             * Return the current state of the record in cache or db
             */
            this.snapshot(socketWrapper, message);
        }
        else if (action === constants_1.RECORD_ACTIONS.HEAD) {
            /*
             * Return the current version of the record or -1 if not found
             */
            this.head(socketWrapper, message);
        }
        else if (action === constants_1.RECORD_ACTIONS.SUBSCRIBEANDHEAD) {
            /*
             * Return the current version of the record or -1 if not found, subscribing either way
             */
            this.subscribeAndHead(socketWrapper, message);
        }
        else if (action === constants_1.RECORD_ACTIONS.UPDATE || action === constants_1.RECORD_ACTIONS.PATCH || action === constants_1.RECORD_ACTIONS.ERASE) {
            /*
             * Handle complete (UPDATE) or partial (PATCH/ERASE) updates
             */
            this.update(socketWrapper, message, message.isWriteAck || false);
        }
        else if (action === constants_1.RECORD_ACTIONS.DELETE) {
            /*
             * Deletes the record
             */
            this.delete(socketWrapper, message);
        }
        else if (action === constants_1.RECORD_ACTIONS.DELETE_SUCCESS) {
            /*
             * Handle delete acknowledgement from message bus
             * TODO: Different action
             */
            this.remoteDelete(socketWrapper, message);
        }
        else if (action === constants_1.RECORD_ACTIONS.UNSUBSCRIBE) {
            /*
             * Unsubscribes (discards) a record that was previously subscribed to
             * using read()
             */
            this.subscriptionRegistry.unsubscribe(message, socketWrapper);
        }
        else if (action === constants_1.RECORD_ACTIONS.LISTEN ||
            /*
             * Listen to requests for a particular record or records
             * whose names match a pattern
             */
            action === constants_1.RECORD_ACTIONS.UNLISTEN ||
            action === constants_1.RECORD_ACTIONS.LISTEN_ACCEPT ||
            action === constants_1.RECORD_ACTIONS.LISTEN_REJECT) {
            this.listenerRegistry.handle(socketWrapper, message);
        }
        else {
            this.services.logger.error(constants_1.PARSER_ACTIONS[constants_1.PARSER_ACTIONS.UNKNOWN_ACTION], constants_1.RECORD_ACTIONS[action], this.metaData);
        }
    }
    /**
     * Sends the records data current data once loaded from the cache, and null otherwise
     */
    snapshot(socketWrapper, message) {
        this.recordRequest(message.name, socketWrapper, onSnapshotComplete, onRequestError, message);
    }
    /**
     * Returns just the current version number of a record
     * Results in a HEAD_RESPONSE
     * If the record is not found, the version number will be -1
     */
    head(socketWrapper, message) {
        this.recordRequest(message.name, socketWrapper, onHeadComplete, onRequestError, message);
    }
    /**
     * Same as head, and also subscribes the client to record updates.
     * Always results in SUBSCRIBE_ACK
     */
    subscribeAndHead(socketWrapper, message) {
        this.head(socketWrapper, message);
        this.subscriptionRegistry.subscribe(Object.assign({}, message, { action: constants_1.RECORD_ACTIONS.SUBSCRIBE }), socketWrapper);
    }
    onCreateOrReadComplete(recordName, version, data, socket, message) {
        if (data) {
            this.readAndSubscribe(message, version, data, socket);
        }
        else {
            this.permissionAction(constants_1.RECORD_ACTIONS.CREATE, message, message.action, socket, this.create.bind(this, message, socket));
        }
    }
    /**
     * Tries to retrieve the record and creates it if it doesn't exist. Please
     * note that create also triggers a read once done
     */
    createOrRead(socketWrapper, message) {
        this.recordRequest(message.name, socketWrapper, this.onCreateOrReadComplete, onRequestError, message);
    }
    /**
     * An upsert operation where the record will be created and written to
     * with the data in the message. Important to note that each operation,
     * the create and the write are permissioned separately.
     *
     * This method also takes note of the storageHotPathPatterns option, when a record
     * with a name that matches one of the storageHotPathPatterns is written to with
     * the CREATEANDUPDATE action, it will be permissioned for both CREATE and UPDATE, then
     * inserted into the cache and storage.
     */
    createAndUpdate(socketWrapper, message) {
        const recordName = message.name;
        const isPatch = message.path !== undefined;
        const originalAction = message.action;
        Object.assign(message, { action: isPatch ? constants_1.RECORD_ACTIONS.PATCH : constants_1.RECORD_ACTIONS.UPDATE });
        // allow writes on the hot path to bypass the record transition
        // and be written directly to cache and storage
        for (let i = 0; i < this.config.storageHotPathPrefixes.length; i++) {
            const pattern = this.config.storageHotPathPrefixes[i];
            if (recordName.indexOf(pattern) === 0) {
                if (isPatch) {
                    const errorMessage = {
                        topic: constants_1.TOPIC.RECORD,
                        action: constants_1.RECORD_ACTIONS.INVALID_PATCH_ON_HOTPATH,
                        originalAction,
                        name: recordName
                    };
                    if (message.correlationId) {
                        errorMessage.correlationId = message.correlationId;
                    }
                    socketWrapper.sendMessage(errorMessage);
                    return;
                }
                this.permissionAction(constants_1.RECORD_ACTIONS.CREATE, message, originalAction, socketWrapper, () => {
                    this.permissionAction(constants_1.RECORD_ACTIONS.UPDATE, message, originalAction, socketWrapper, () => {
                        this.forceWrite(recordName, message, socketWrapper);
                    });
                });
                return;
            }
        }
        const transition = this.transitions[recordName];
        if (transition) {
            this.permissionAction(message.action, message, originalAction, socketWrapper, () => {
                transition.add(socketWrapper, message);
            });
            return;
        }
        this.permissionAction(constants_1.RECORD_ACTIONS.CREATE, message, originalAction, socketWrapper, () => {
            this.permissionAction(constants_1.RECORD_ACTIONS.UPDATE, message, originalAction, socketWrapper, () => {
                this.update(socketWrapper, message, true);
            });
        });
    }
    /**
     * Forcibly writes to the cache and storage layers without going via
     * the RecordTransition. Usually updates and patches will go via the
     * transition which handles write acknowledgements, however in the
     * case of a hot path write acknowledgement we need to handle that
     * case here.
     */
    forceWrite(recordName, message, socketWrapper) {
        socketWrapper.parseData(message);
        const writeAck = message.isWriteAck;
        let cacheResponse = false;
        let storageResponse = false;
        let writeError;
        this.services.storage.set(recordName, 0, message.parsedData, error => {
            if (writeAck) {
                storageResponse = true;
                writeError = writeError || error || null;
                this.handleForceWriteAcknowledgement(socketWrapper, message, cacheResponse, storageResponse, writeError);
            }
        }, this.metaData);
        this.services.cache.set(recordName, 0, message.parsedData, error => {
            if (!error) {
                this.broadcastUpdate(recordName, message, false, socketWrapper);
            }
            if (writeAck) {
                cacheResponse = true;
                writeError = writeError || error || null;
                this.handleForceWriteAcknowledgement(socketWrapper, message, cacheResponse, storageResponse, writeError);
            }
        }, this.metaData);
    }
    /**
     * Handles write acknowledgements during a force write. Usually
     * this case is handled via the record transition.
     */
    handleForceWriteAcknowledgement(socketWrapper, message, cacheResponse, storageResponse, error) {
        if (storageResponse && cacheResponse) {
            socketWrapper.sendMessage({
                topic: constants_1.TOPIC.RECORD,
                action: constants_1.RECORD_ACTIONS.WRITE_ACKNOWLEDGEMENT,
                name: message.name,
                correlationId: message.correlationId
            }, true);
        }
    }
    /**
     * Creates a new, empty record and triggers a read operation once done
     */
    create(message, socketWrapper, callback) {
        const recordName = message.name;
        // store the records data in the cache and wait for the result
        this.services.cache.set(recordName, 0, {}, error => {
            if (error) {
                this.services.logger.error(constants_1.RECORD_ACTIONS[constants_1.RECORD_ACTIONS.RECORD_CREATE_ERROR], recordName, this.metaData);
                socketWrapper.sendMessage({
                    topic: constants_1.TOPIC.RECORD,
                    action: constants_1.RECORD_ACTIONS.RECORD_CREATE_ERROR,
                    originalAction: message.action,
                    name: message.name
                });
            }
            else if (callback) {
                callback(recordName, socketWrapper);
            }
            else {
                this.readAndSubscribe(message, 0, {}, socketWrapper);
            }
        }, this.metaData);
        if (!utils_1.isExcluded(this.config.storageExclusionPrefixes, message.name)) {
            // store the record data in the persistant storage independently and don't wait for the result
            this.services.storage.set(recordName, 0, {}, error => {
                if (error) {
                    this.services.logger.error(constants_1.RECORD_ACTIONS[constants_1.RECORD_ACTIONS.RECORD_CREATE_ERROR], `storage:${error}`, this.metaData);
                }
            }, this.metaData);
        }
    }
    /**
     * Subscribes to updates for a record and sends its current data once done
     */
    readAndSubscribe(message, version, data, socketWrapper) {
        this.permissionAction(constants_1.RECORD_ACTIONS.READ, message, message.action, socketWrapper, () => {
            this.subscriptionRegistry.subscribe(Object.assign({}, message, { action: constants_1.RECORD_ACTIONS.SUBSCRIBE }), socketWrapper);
            sendRecord(message.name, version, data, socketWrapper);
        });
    }
    /**
    * Applies both full and partial updates. Creates a new record transition that will live as
    * long as updates are in flight and new updates come in
    */
    update(socketWrapper, message, upsert) {
        const recordName = message.name;
        const version = message.version;
        const isPatch = message.path !== undefined;
        Object.assign(message, { action: isPatch ? constants_1.RECORD_ACTIONS.PATCH : constants_1.RECORD_ACTIONS.UPDATE });
        /*
         * If the update message is received from the message bus, rather than from a client,
         * assume that the original deepstream node has already updated the record in cache and
         * storage and only broadcast the message to subscribers
         */
        if (socketWrapper.isRemote) {
            this.broadcastUpdate(recordName, message, false, socketWrapper);
            return;
        }
        let transition = this.transitions[recordName];
        if (transition && transition.hasVersion(version)) {
            transition.sendVersionExists({ message, version, sender: socketWrapper });
            return;
        }
        if (!transition) {
            transition = new record_transition_1.default(recordName, this.config, this.services, this, this.metaData);
            this.transitions[recordName] = transition;
        }
        transition.add(socketWrapper, message, upsert);
    }
    /**
     * Invoked by RecordTransition. Notifies local subscribers and other deepstream
     * instances of record updates
     */
    broadcastUpdate(name, message, noDelay, originalSender) {
        this.subscriptionRegistry.sendToSubscribers(name, message, noDelay, originalSender);
    }
    /**
     * Called by a RecordTransition, either if it is complete or if an error occured. Removes
     * the transition from the registry
     */
    transitionComplete(recordName) {
        delete this.transitions[recordName];
    }
    /**
     * Executes or schedules a callback function once all transitions are complete
     *
     * This is called from the PermissionHandler destroy method, which
     * could occur in cases where 'runWhenRecordStable' is never called,
     * such as when no cross referencing or data loading is used.
     */
    removeRecordRequest(recordName) {
        if (!this.recordRequestsInProgress[recordName]) {
            return;
        }
        if (this.recordRequestsInProgress[recordName].length === 0) {
            delete this.recordRequestsInProgress[recordName];
            return;
        }
        const callback = this.recordRequestsInProgress[recordName].splice(0, 1)[0];
        callback(recordName);
    }
    /**
     * Executes or schedules a callback function once all record requests are removed.
     * This is critical to block reads until writes have occured for a record, which is
     * only from permissions when a rule is required to be run and the cache has not
     * verified it has the latest version
     */
    runWhenRecordStable(recordName, callback) {
        if (!this.recordRequestsInProgress[recordName] ||
            this.recordRequestsInProgress[recordName].length === 0) {
            this.recordRequestsInProgress[recordName] = [];
            callback(recordName);
        }
        else {
            this.recordRequestsInProgress[recordName].push(callback);
        }
    }
    /**
     * Deletes a record. If a transition is in progress it will be stopped. Once the deletion is
     * complete, an ACK is returned to the sender and broadcast to the message bus.
     */
    delete(socketWrapper, message) {
        const recordName = message.name;
        if (this.transitions[recordName]) {
            this.transitions[recordName].destroy();
            delete this.transitions[recordName];
        }
        // tslint:disable-next-line
        new record_deletion_1.default(this.config, this.services, socketWrapper, message, this.onDeleted.bind(this), this.metaData);
    }
    /**
     * Handle a remote record deletion from the message bus. We assume that the original deepstream node
     * has already deleted the record from cache and storage and we only need to broadcast the message
     * to subscribers.
     *
     * If a transition is in progress it will be stopped.
     */
    remoteDelete(socketWrapper, message) {
        const recordName = message.name;
        if (this.transitions[recordName]) {
            this.transitions[recordName].destroy();
            delete this.transitions[recordName];
        }
        this.onDeleted(recordName, message, socketWrapper);
    }
    /*
     * Callback for completed deletions. Notifies subscribers of the delete and unsubscribes them
     */
    onDeleted(name, message, originalSender) {
        this.broadcastUpdate(name, message, true, originalSender);
        for (const subscriber of this.subscriptionRegistry.getLocalSubscribers(name)) {
            this.subscriptionRegistry.unsubscribe(message, subscriber, true);
        }
    }
    /**
     * A secondary permissioning step that is performed once we know if the record exists (READ)
     * or if it should be created (CREATE)
     */
    permissionAction(actionToPermission, message, originalAction, socketWrapper, successCallback) {
        const copyWithAction = Object.assign({}, message, { action: actionToPermission });
        this.services.permissionHandler.canPerformAction(socketWrapper.user, copyWithAction, onPermissionResponse.bind(this, socketWrapper, message, originalAction, successCallback), socketWrapper.authData, socketWrapper);
    }
}
exports.default = RecordHandler;
/*
 * Callback for complete permissions. Important to note that only compound operations like
 * CREATE_AND_UPDATE will end up here.
 */
function onPermissionResponse(socketWrapper, message, originalAction, successCallback, error, canPerformAction) {
    if (error || !canPerformAction) {
        let action;
        if (error) {
            this.services.logger.error(constants_1.RECORD_ACTIONS[constants_1.RECORD_ACTIONS.MESSAGE_PERMISSION_ERROR], error.toString());
            action = constants_1.RECORD_ACTIONS.MESSAGE_PERMISSION_ERROR;
        }
        else {
            action = constants_1.RECORD_ACTIONS.MESSAGE_DENIED;
        }
        const msg = {
            topic: constants_1.TOPIC.RECORD,
            action,
            originalAction,
            name: message.name
        };
        if (message.correlationId) {
            msg.correlationId = message.correlationId;
        }
        socketWrapper.sendMessage(msg);
    }
    else {
        successCallback();
    }
}
function onRequestError(event, errorMessage, recordName, socket, message) {
    socket.sendMessage({
        topic: constants_1.TOPIC.RECORD,
        action: event,
        originalAction: message.action,
        name: recordName
    });
}
function onSnapshotComplete(recordName, version, data, socket, message) {
    if (data) {
        sendRecord(recordName, version, data, socket);
    }
    else {
        socket.sendMessage({
            topic: constants_1.TOPIC.RECORD,
            action: constants_1.RECORD_ACTIONS.RECORD_NOT_FOUND,
            originalAction: message.action,
            name: message.name
        });
    }
}
function onHeadComplete(name, version, data, socketWrapper) {
    socketWrapper.sendMessage({
        topic: constants_1.TOPIC.RECORD,
        action: constants_1.RECORD_ACTIONS.HEAD_RESPONSE,
        name,
        version
    });
}
/**
* Sends the records data current data once done
*/
function sendRecord(recordName, version, data, socketWrapper) {
    socketWrapper.sendMessage({
        topic: constants_1.TOPIC.RECORD,
        action: constants_1.RECORD_ACTIONS.READ_RESPONSE,
        name: recordName,
        version,
        parsedData: data,
    });
}
//# sourceMappingURL=record-handler.js.map