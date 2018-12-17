"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const constants_1 = require("../constants");
const utils_1 = require("../utils/utils");
const json_path_1 = require("./json-path");
const record_request_1 = require("./record-request");
class RecordTransition {
    constructor(name, config, services, recordHandler, metaData) {
        this.metaData = metaData;
        this.name = name;
        this.config = config;
        this.services = services;
        this.recordHandler = recordHandler;
        this.steps = [];
        this.recordRequestMade = false;
        this.version = -1;
        this.data = null;
        // this.currentStep = null
        this.lastVersion = null;
        this.lastError = null;
        this.existingVersions = [];
        this.isDestroyed = false;
        this.pendingUpdates = {};
        this.ending = false;
        this.writeAckSockets = new Map();
        this.pendingCacheWrites = 0;
        this.pendingStorageWrites = 0;
        this.onCacheSetResponse = this.onCacheSetResponse.bind(this);
        this.onStorageSetResponse = this.onStorageSetResponse.bind(this);
        this.onRecord = this.onRecord.bind(this);
        this.onFatalError = this.onFatalError.bind(this);
    }
    /**
     * Checks if a specific version number is already processed or
     * queued for processing
     */
    hasVersion(version) {
        if (this.lastVersion === null) {
            return false;
        }
        return version !== -1 && version <= this.lastVersion;
    }
    /**
     * Send version exists error if the record has been already loaded, else
     * store the version exists error to send to the sockerWrapper once the
     * record is loaded
     */
    sendVersionExists(step) {
        const socketWrapper = step.sender;
        if (this.data) {
            socketWrapper.sendMessage({
                topic: constants_1.TOPIC.RECORD,
                action: constants_1.RECORD_ACTIONS.VERSION_EXISTS,
                originalAction: step.message.action,
                name: this.name,
                version: this.version,
                parsedData: this.data,
                isWriteAck: false,
            });
            this.services.logger.warn(constants_1.RECORD_ACTIONS.VERSION_EXISTS, `${socketWrapper.user} tried to update record ${this.name} to version ${step.message.version} but it already was ${this.version}`, this.metaData);
        }
        else {
            this.existingVersions.push({
                sender: socketWrapper,
                message: step.message,
            });
        }
    }
    /**
     * Adds a new step (either an update or a patch) to the record. The step
     * will be queued or executed immediatly if the queue is empty
     *
     * This method will also retrieve the current record's data when called
     * for the first time
     */
    add(socketWrapper, message, upsert) {
        const version = message.version;
        const update = {
            message,
            sender: socketWrapper,
        };
        const result = socketWrapper.parseData(message);
        if (result instanceof Error) {
            socketWrapper.sendMessage({
                topic: constants_1.TOPIC.RECORD,
                action: constants_1.RECORD_ACTIONS.INVALID_MESSAGE_DATA,
                data: message.data
            });
            return;
        }
        if (message.action === constants_1.RECORD_ACTIONS.UPDATE) {
            if (!utils_1.isOfType(message.parsedData, 'object') && !utils_1.isOfType(message.parsedData, 'array')) {
                socketWrapper.sendMessage(Object.assign({}, message, {
                    action: constants_1.RECORD_ACTIONS.INVALID_MESSAGE_DATA,
                    originalAction: message.action
                }));
                return;
            }
        }
        if (this.lastVersion !== null && this.lastVersion !== version - 1) {
            this.sendVersionExists(update);
            return;
        }
        if (version !== -1) {
            this.lastVersion = version;
        }
        this.steps.push(update);
        if (this.recordRequestMade === false) {
            this.recordRequestMade = true;
            record_request_1.recordRequest(this.name, this.config, this.services, socketWrapper, (r, v, d) => this.onRecord(v, d, upsert), this.onCacheRequestError, this, this.metaData);
        }
        else if (this.steps.length === 1) {
            this.next();
        }
    }
    /**
     * Destroys the instance
     */
    destroy(error) {
        if (this.isDestroyed) {
            return;
        }
        if (error) {
            this.sendWriteAcknowledgementErrors(error.toString());
        }
        this.recordHandler.transitionComplete(this.name);
        this.isDestroyed = true;
    }
    /**
     * Callback for successfully retrieved records
     */
    onRecord(version, data, upsert) {
        if (data === null) {
            if (!upsert) {
                this.onFatalError(`Received update for non-existant record ${this.name}`);
                return;
            }
            this.data = {};
            this.version = 0;
        }
        else {
            this.version = version;
            this.data = data;
        }
        this.flushVersionExists();
        this.next();
    }
    /**
     * Once the record is loaded this method is called recoursively
     * for every step in the queue of pending updates.
     *
     * It will apply every patch or update and - once done - either
     * call itself to process the next one or destroy the RecordTransition
     * of the queue has been drained
     */
    next() {
        if (this.isDestroyed === true) {
            return;
        }
        if (this.data === null) {
            return;
        }
        const currentStep = this.steps.shift();
        if (!currentStep) {
            this.destroy(null);
            return;
        }
        this.currentStep = currentStep;
        let message = currentStep.message;
        if (message.version === -1) {
            message = Object.assign({}, message, { version: this.version + 1 });
            currentStep.message = message;
        }
        if (this.version !== message.version - 1) {
            this.sendVersionExists(currentStep);
            this.next();
            return;
        }
        this.version = message.version;
        if (message.path) {
            json_path_1.setValue(this.data, message.path, message.parsedData);
        }
        else {
            this.data = message.parsedData;
        }
        /*
       * Please note: saving to storage is called first to allow for synchronous cache
       * responses to destroy the transition, it is however not on the critical path
       * and the transition will continue straight away, rather than wait for the storage response
       * to be returned.
       *
       * If the storage response is asynchronous and write acknowledgement is enabled, the transition
       * will not be destroyed until writing to storage is finished
       */
        if (!utils_1.isExcluded(this.config.storageExclusionPrefixes, this.name)) {
            this.pendingStorageWrites++;
            if (message.isWriteAck) {
                this.setUpWriteAcknowledgement(message, this.currentStep.sender);
                this.services.storage.set(this.name, this.version, this.data, error => this.onStorageSetResponse(error, this.currentStep.sender, message), this.metaData);
            }
            else {
                this.services.storage.set(this.name, this.version, this.data, this.onStorageSetResponse, this.metaData);
            }
        }
        this.pendingCacheWrites++;
        if (message.isWriteAck) {
            this.setUpWriteAcknowledgement(message, this.currentStep.sender);
            this.services.cache.set(this.name, this.version, this.data, error => this.onCacheSetResponse(error, this.currentStep.sender, message), this.metaData);
        }
        else {
            this.services.cache.set(this.name, this.version, this.data, this.onCacheSetResponse, this.metaData);
        }
    }
    setUpWriteAcknowledgement(message, socketWrapper) {
        const correlationId = message.correlationId;
        const response = this.writeAckSockets.get(socketWrapper);
        if (!response) {
            this.writeAckSockets.set(socketWrapper, { [correlationId]: 1 });
            return;
        }
        response[correlationId] = response[correlationId] ? ++response[correlationId] : 1;
        this.writeAckSockets.set(socketWrapper, response);
    }
    /**
     * Send all the stored version exists errors once the record has been loaded.
     */
    flushVersionExists() {
        for (let i = 0; i < this.existingVersions.length; i++) {
            this.sendVersionExists(this.existingVersions[i]);
        }
        this.existingVersions = [];
    }
    handleWriteAcknowledgement(error, socketWrapper, originalMessage) {
        const correlationId = originalMessage.correlationId;
        const response = this.writeAckSockets.get(socketWrapper);
        if (!response) {
            return;
        }
        response[correlationId]--;
        if (response[correlationId] === 0) {
            socketWrapper.sendMessage({
                topic: constants_1.TOPIC.RECORD,
                action: constants_1.RECORD_ACTIONS.WRITE_ACKNOWLEDGEMENT,
                // originalAction: originalMessage.action,
                name: originalMessage.name,
                correlationId
            });
            delete response[correlationId];
        }
        if (Object.keys(response).length === 0) {
            this.writeAckSockets.delete(socketWrapper);
        }
    }
    onCacheRequestError() {
        // TODO
    }
    /**
     * Callback for responses returned by cache.set(). If an error
     * is returned the queue will be destroyed, otherwise
     * the update will be broadcast to other subscribers and the
     * next step invoked
     */
    onCacheSetResponse(error, socketWrapper, message) {
        if (message && socketWrapper) {
            this.handleWriteAcknowledgement(error, socketWrapper, message);
        }
        if (error) {
            this.onFatalError(error);
        }
        else if (this.isDestroyed === false) {
            const copiedMessage = Object.assign({}, this.currentStep.message, { isWriteAck: false });
            delete copiedMessage.correlationId;
            this.recordHandler.broadcastUpdate(this.name, copiedMessage, false, this.currentStep.sender);
            this.next();
        }
        else if (this.steps.length === 0 && this.pendingCacheWrites === 0 && this.pendingStorageWrites === 0) {
            this.destroy(null);
        }
    }
    /**
     * Callback for responses returned by storage.set()
     */
    onStorageSetResponse(error, socketWrapper, message) {
        if (message && socketWrapper) {
            this.handleWriteAcknowledgement(error, socketWrapper, message);
        }
        if (error) {
            this.onFatalError(error);
        }
        else if (this.steps.length === 0 && this.pendingCacheWrites === 0 && this.pendingStorageWrites === 0) {
            this.destroy(null);
        }
    }
    /**
     * Sends all write acknowledgement messages at the end of a transition
     */
    sendWriteAcknowledgementErrors(errorMessage) {
        for (const [socketWrapper, pendingWrites] of this.writeAckSockets) {
            for (const correlationId in pendingWrites) {
                socketWrapper.sendMessage({
                    topic: constants_1.TOPIC.RECORD, action: constants_1.RECORD_ACTIONS.RECORD_UPDATE_ERROR, reason: errorMessage, correlationId
                });
            }
        }
        this.writeAckSockets.clear();
    }
    /**
     * Generic error callback. Will destroy the queue and notify the senders of all pending
     * transitions
     */
    onFatalError(error) {
        if (this.isDestroyed === true) {
            return;
        }
        this.services.logger.error(constants_1.RECORD_ACTIONS[constants_1.RECORD_ACTIONS.RECORD_UPDATE_ERROR], error.toString(), this.metaData);
        for (let i = 0; i < this.steps.length; i++) {
            if (!this.steps[i].sender.isRemote) {
                this.steps[i].sender.sendMessage({
                    topic: constants_1.TOPIC.RECORD,
                    action: constants_1.RECORD_ACTIONS.RECORD_UPDATE_ERROR,
                    name: this.steps[i].message.name
                });
            }
        }
        this.destroy(error);
    }
}
exports.default = RecordTransition;
//# sourceMappingURL=record-transition.js.map