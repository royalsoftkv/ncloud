const clientsRegistry = require("../modules/clientsRegistry");
const moment = require('moment');
const ss = require('socket.io-stream');
const crypt = require("./crypt")
const jwt = require('jsonwebtoken')
const IOStream = ss.IOStream

IOStream.prototype.destroy = function() {
    // debug('destroy');

    if (this.destroyed) {
        // debug('already destroyed');
        return;
    }

    this.readable = this.writable = false;

    if (this.socket) {
        // debug('clean up');
        this.socket.cleanup(this.id);
        this.socket = null;
    }
    this.emit('destroyed')
    this.destroyed = true;
};

global.storeSocketData = (params, cb) => {
    console.log(`Received storeSocketData ${JSON.stringify(params)}`)
    let key = params.key
    let value = params.value
    let from = params.from
    let client = clientsRegistry.getByDeviceId(from)
    if(client) {
        if(!client.socketData) {
            client.socketData = {}
        }
        client.socketData[key]=value
    }
}

global.getDeviceConnectionInfo = (deviceId, ack) => {
    let list = [];
    let client = clientsRegistry.getByDeviceId(deviceId);
    let res = {};
    if (client) {
        res = {
            device_id: client.handshake.query.device_id,
            connection_id: client.id,
            pid_id: client.handshake.query.pid,
            connectedTime: moment(new Date(client.handshake.time)).toISOString(),
            status: client.connected,
            version: client.handshake.query.version,
            socketData: client.socketData
        };
    }
    console.log('requested getDeviceConnectionInfo',res);
    ack(res);
}

global.requestDevicesList = (params, ack) => {
    console.log('requested DevicesList');
    let list = clientsRegistry.getClientsList();
    ack(list);
}

function processLocalMethod(fndata, ack) {
    let method = fndata.method;
    let params = fndata.params;
    let fn = global[method];
    if(typeof fn !== 'function') {
        console.log(`Method ${method} not found`);
        if(typeof ack === 'function') {
            ack({error:{message:`Method ${method} not found on server`,status:'SERVER_METHOD_NOT_FOUND',stack:Error().stack}});
        }
        return;
    }
    const isAsync = fn.constructor.name === "AsyncFunction";
    if(isAsync) {
        new Promise(async function(resolve, reject) {
            let res;
            try {
                res = await fn(params);
            } catch(e) {
                res = {error:{message:e.message, stack:e.stack, code:'DEVICE_METHOD_ERROR'}};
            }
            if (typeof ack === 'function') {
                resolve(ack(res));
            } else  {
                resolve(res);
            }
        });
    } else {
        try {
            fn(params, ack);
        } catch(e) {
            console.log({error:{message:e.message, stack:e.stack, code:'DEVICE_METHOD_ERROR'}})
        }
    }
}

function processLocalStream(stream, fndata, ack) {
    let method = fndata.method;
    let params = fndata.payload;
    let fn = global[method];
    if(typeof fn !== 'function') {
        console.log(`Method ${method} not found`);
        if(typeof ack === 'function') {
            ack({error:{message:`Method ${method} not found on server`,status:'SERVER_METHOD_NOT_FOUND',stack:Error().stack}});
        }
        return;
    }
    let res;
    try {
        fn(stream, params, ack);
    } catch(e) {
        let res = {error:{message:e.message, stack:e.stack, code:'DEVICE_METHOD_ERROR'}};
        ack(res);
    }
}

function checkManualAck(socket, msg, ack) {
    if(!msg.callbackId) {
        return ack;
    }
    let callbackId = msg.callbackId;
    ack=function(res){
        let msgAck = {
            from: msg.to,
            to: msg.from,
            method: 'callbackMethod',
            callbackId: callbackId,
            payload: res
        };
        socket.emit('execNodeMethod',msgAck);
    };
    return ack;
}

decryptPayload = (socket, payload, keys) => {
    let legacy = socket.handshake.query.legacy
    if(legacy) {
        return payload
    } else {
        try {
            let decrypt = crypt.decrypt(payload, keys.privateKey)
            return JSON.parse(decrypt)
        } catch (e) {
            return false
        }
    }
}

checkToken = (socket, token, keys, ack) => {
    if(!token) {
        if (typeof ack === "function") {
            ack({error: {message: `Missing jwt token in payload`, status: 'MISSING_TOKEN'}});
            return false
        }
    }
    try {
        let decoded = jwt.verify(token, keys.publicKey);
    } catch (e) {
        if(e.message === "jwt expired") {
            if (typeof ack === "function") {
                ack({error: {message: `Error decoding token`, status: 'TOKEN_EXPIRED'}});
            }
            // setTimeout(()=>{
            //     socket.disconnect(true)
            // },1000)
        } else {
            if (typeof ack === "function") {
                ack({error: {message: `Error decoding token`, status: 'TOKEN_ERROR'}});
            }
        }
        return false
    }
    return true
}

module.exports = (socket, keys) => {

    socket.on('execNodeMethod', function (payload, ack) {

        let token = payload.token
        // if(!token) {
        //     if (typeof ack === "function") {
        //         ack({error: {message: `Missing jwt token in payload`, status: 'MISSING_TOKEN'}});
        //         return
        //     }
        // }
        //
        // try {
        //     let decoded = jwt.verify(token, keys.publicKey);
        //     console.log(decoded)
        // } catch (e) {
        //     if(e.message === "jwt expired") {
        //         ack({error: {message: `Error decoding token`, status: 'TOKEN_EXPIRED'}});
        //         setTimeout(()=>{
        //             socket.disconnect(true)
        //         },1000)
        //     } else {
        //         ack({error: {message: `Error decoding token`, status: 'TOKEN_ERROR'}});
        //     }
        //     return
        //
        // }

        if(!checkToken(socket, token, keys, ack)) {
            return
        }

        // let payloadDecrypted = decryptPayload(socket, payload, keys)
        // if(!payloadDecrypted) {
        //     if (typeof ack === "function") {
        //         ack({error: {message: `Error decrypting method`, status: 'DECRYPT_ERROR'}});
        //     }
        // }
        ack = checkManualAck(socket,payload,ack);
        let deviceId = payload.to;
        if(!deviceId) {
            processLocalMethod(payload, ack);
            return;
        }
        let method = payload.method;
        let params = payload.params;
        let deviceSocket = clientsRegistry.getByDeviceId(deviceId);
        if (!deviceSocket || !deviceSocket.connected) {
            console.log(`Not connected device ${deviceId}`);
            if (typeof ack === "function") {
                ack({error: {message: `Not connected device ${deviceId}`, status: 'DEVICE_NOT_CONNECTED'}});
            }
            return;
        }

        let cb = null
        if(typeof ack === "function") {
            cb = (deviceResponse) => {
                ack(deviceResponse)
            }
        }
        // let legacy = socket.handshake.query.legacy
        token = deviceSocket.token

        // if(!checkToken(deviceSocket, token, keys, ack)) {
        //     return
        // }

        payload = {method, params, token}
        // if(!legacy) {
        //     newPayload = crypt.encrypt(JSON.stringify(newPayload), deviceSocket.pubKey)
        // }
        deviceSocket.emit('execNodeMethod', payload, cb);

        // if(typeof ack === "function") {
        //     deviceSocket.emit('execNodeMethod', method, params.params, (deviceResponse) => {
        //         ack(deviceResponse);
        //     });
        // } else {
        //     if(deviceSocket.handshake.query.legacy) {
        //         deviceSocket.emit('execNodeMethod', {method:method, params: params.params});
        //     } else {
        //         deviceSocket.emit('execNodeMethod', method, params.params);
        //     }
        // }
    });





    ss(socket).on('execNodeStream', (stream, params, ack) => {
        console.log(`Received execNodeStream 123 ${params.method}`);

        let token = params.token
        if(!checkToken(socket, token, keys, ack)) {
            return
        }

        let method = params.method;
        let deviceId = params.to;

        if(!deviceId) {
            processLocalStream(stream, params, ack);
            return;
        }

        let deviceStream = ss.createStream({objectMode:true});
        deviceStream.pipe(stream);

        stream.on('destroyed', function () {
            console.log('fcstream destroyed');
            deviceStream.destroy();
        });

        let deviceSocket = clientsRegistry.getByDeviceId(deviceId);
        if (!deviceSocket || !deviceSocket.connected) {
            console.log(`Not connected device ${deviceId}`);
            if (typeof ack === "function") {
                ack();
            }
            return;
        }

        ss(deviceSocket).emit('execNodeStream', deviceStream, {
            method: method,
            params: params.params,
            token: deviceSocket.token
        }, typeof ack === "function" ? function (deviceResponse) {
            ack(deviceResponse);
        } : null);
    })

};
