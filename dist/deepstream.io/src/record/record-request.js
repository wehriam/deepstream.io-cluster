"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const constants_1 = require("../constants");
const utils_1 = require("../utils/utils");
/**
 * Sends an error to the socketWrapper that requested the
 * record
 */
function sendError(event, errorMessage, recordName, socketWrapper, onError, services, context, metaData, message) {
    services.logger.error(event, errorMessage, metaData);
    if (message) {
        onError.call(context, event, errorMessage, recordName, socketWrapper, message);
    }
    else {
        onError.call(context, event, errorMessage, recordName, socketWrapper);
    }
}
/**
 * Callback for responses returned by the storage connector. The request will complete or error
 * here, if the record couldn't be found in storage no further attempts to retrieve it will be made
 */
function onStorageResponse(error, recordName, version, data, socketWrapper, onComplete, onError, services, context, metaData, message) {
    if (error) {
        sendError(constants_1.RECORD_ACTIONS.RECORD_LOAD_ERROR, `error while loading ${recordName} from storage:${error}`, recordName, socketWrapper, onError, services, context, metaData, message);
    }
    else {
        if (message) {
            onComplete.call(context, recordName, version, data || null, socketWrapper, message);
        }
        else {
            onComplete.call(context, recordName, version, data || null, socketWrapper);
        }
        if (data) {
            services.cache.set(recordName, version, data, () => { }, metaData);
        }
    }
}
/**
 * Callback for responses returned by the cache connector
 */
function onCacheResponse(error, recordName, version, data, socketWrapper, onComplete, onError, config, services, context, metaData, message) {
    if (error) {
        sendError(constants_1.RECORD_ACTIONS.RECORD_LOAD_ERROR, `error while loading ${recordName} from cache:${error}`, recordName, socketWrapper, onError, services, context, metaData, message);
    }
    else if (data) {
        if (message) {
            onComplete.call(context, recordName, version, data, socketWrapper, message);
        }
        else {
            onComplete.call(context, recordName, version, data, socketWrapper);
        }
    }
    else if (!utils_1.isExcluded(config.storageExclusionPrefixes, recordName)) {
        let storageTimedOut = false;
        const storageTimeout = setTimeout(() => {
            storageTimedOut = true;
            sendError(constants_1.RECORD_ACTIONS.STORAGE_RETRIEVAL_TIMEOUT, recordName, recordName, socketWrapper, onError, services, context, metaData, message);
        }, config.storageRetrievalTimeout);
        // tslint:disable-next-line:no-shadowed-variable
        services.storage.get(recordName, (storageError, version, result) => {
            if (!storageTimedOut) {
                clearTimeout(storageTimeout);
                onStorageResponse(storageError, recordName, version, result, socketWrapper, onComplete, onError, services, context, metaData, message);
            }
        }, metaData);
    }
    else {
        if (message) {
            onComplete.call(context, recordName, version, data, socketWrapper, message);
        }
        else {
            onComplete.call(context, recordName, version, data, socketWrapper);
        }
    }
}
/**
 * This function retrieves a single record from the cache or - if it isn't in the
 * cache - from storage. If it isn't there either it will notify its initiator
 * by passing null to onComplete (but not call onError).
 *
 * It also handles all the timeout and destruction steps around this operation
 */
function recordRequest(recordName, config, services, socketWrapper, onComplete, onError, context, metaData, message) {
    let cacheTimedOut = false;
    const cacheTimeout = setTimeout(() => {
        cacheTimedOut = true;
        sendError(constants_1.RECORD_ACTIONS.CACHE_RETRIEVAL_TIMEOUT, recordName, recordName, socketWrapper, onError, services, context, metaData, message);
    }, config.cacheRetrievalTimeout);
    services.cache.get(recordName, (error, version, data) => {
        if (!cacheTimedOut) {
            clearTimeout(cacheTimeout);
            onCacheResponse(error, recordName, version, data, socketWrapper, onComplete, onError, config, services, context, metaData, message);
        }
    }, metaData);
}
exports.recordRequest = recordRequest;
function recordRequestBinding(config, services, context, metaData) {
    return function (recordName, socketWrapper, onComplete, onError, message) {
        recordRequest(recordName, config, services, socketWrapper, onComplete, onError, context, metaData, message);
    };
}
exports.recordRequestBinding = recordRequestBinding;
//# sourceMappingURL=record-request.js.map