"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
class StorageMock extends events_1.EventEmitter {
    constructor() {
        super();
        this.reset();
        this.isReady = true;
        this.description = '';
    }
    reset() {
        this.values = {};
        this.failNextSet = false;
        this.nextOperationWillBeSuccessful = true;
        this.nextOperationWillBeSynchronous = true;
        this.nextGetWillBeSynchronous = true;
        this.lastGetCallback = null;
        this.lastRequestedKey = null;
        this.lastSetKey = null;
        this.lastSetVersion = null;
        this.lastSetValue = null;
        this.completedSetOperations = 0;
        this.completedDeleteOperations = 0;
        this.getCalls = [];
        clearTimeout(this.getTimeout);
        clearTimeout(this.setTimeout);
    }
    delete(key, callback) {
        if (this.nextOperationWillBeSynchronous) {
            this.completedDeleteOperations++;
            if (this.nextOperationWillBeSuccessful) {
                delete this.values[key];
                callback();
            }
            else {
                callback('storageError');
                return;
            }
        }
        else {
            setTimeout(() => {
                this.completedDeleteOperations++;
                callback(this.nextOperationWillBeSuccessful ? null : 'storageError');
            }, 10);
        }
    }
    hadGetFor(key) {
        for (let i = 0; i < this.getCalls.length; i++) {
            if (this.getCalls[i][0] === key) {
                return true;
            }
        }
        return false;
    }
    triggerLastGetCallback(errorMessage, value) {
        if (this.lastGetCallback) {
            this.lastGetCallback(errorMessage, value);
        }
    }
    get(key, callback) {
        this.getCalls.push(arguments);
        this.lastGetCallback = callback;
        this.lastRequestedKey = key;
        const set = this.values[key] || {};
        if (this.nextGetWillBeSynchronous === true) {
            callback(this.nextOperationWillBeSuccessful ? null : 'storageError', set.version !== undefined ? set.version : -1, set.value ? Object.assign({}, set.value) : null);
        }
        else {
            this.getTimeout = setTimeout(() => {
                callback(this.nextOperationWillBeSuccessful ? null : 'storageError', set.version !== undefined ? set.version : -1, set.value ? Object.assign({}, set.value) : null);
            }, 25);
        }
    }
    set(key, version, value, callback) {
        const set = { version, value };
        this.lastSetKey = key;
        this.lastSetVersion = version;
        this.lastSetValue = value;
        if (this.nextOperationWillBeSuccessful) {
            this.values[key] = set;
        }
        if (this.nextOperationWillBeSynchronous) {
            this.completedSetOperations++;
            if (this.failNextSet) {
                this.failNextSet = false;
                callback('storageError');
                return;
            }
            callback(this.nextOperationWillBeSuccessful ? null : 'storageError');
        }
        else {
            this.setTimeout = setTimeout(() => {
                this.completedSetOperations++;
                callback(this.nextOperationWillBeSuccessful ? null : 'storageError');
            }, 50);
        }
    }
}
exports.default = StorageMock;
//# sourceMappingURL=storage-mock.js.map