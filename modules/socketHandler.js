const clientsRegistry = require("../modules/clientsRegistry");
const moment = require('moment');
const ss = require('socket.io-stream');

global.storeSocketData = (params) => {
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
        let res;
        try {
            res = fn(params);
        } catch(e) {
            res = {error:{message:e.message, stack:e.stack, code:'DEVICE_METHOD_ERROR'}};
        }
        if(typeof ack === 'function') {
            ack(res);
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
        socket.emit('requestDeviceMethod',msgAck);
    };
    return ack;
}

module.exports = (socket) => {

    socket.on('requestDevicesList', function (ack) {
        console.log('requested DevicesList');
        let list = clientsRegistry.getClientsList();
        ack(list);
    });

    socket.on('getDeviceConnectionInfo', function (deviceId, ack) {
        console.log('requested getDeviceConnectionInfo');
        let list = [];
        let client = clientsRegistry.getByDeviceId(deviceId);
        let res = {};
        if (client) {
            res = {
                device_id: client.handshake.query.device_id,
                connection_id: client.id,
                pid_id: client.handshake.query.pid,
                connectedTime: moment(new Date(client.handshake.time)).toISOString(),
                status: client.connected
            };
        }
        ack(res);
    });

    socket.on('requestDeviceMethod', function (params, ack) {
        console.log(`Received requestDeviceMethod ${JSON.stringify(params)}`);
        ack = checkManualAck(socket,params,ack);
        let method = params.method;
        let deviceId = params.to;
        if(!deviceId) {
            processLocalMethod(params, ack);
            return;
        }
        let deviceSocket = clientsRegistry.getByDeviceId(deviceId);
        if (!deviceSocket || !deviceSocket.connected) {
            console.log(`Not connected device ${deviceId}`);
            if (typeof ack === "function") {
                ack({error: {message: `Not connected device ${deviceId}`, status: 'DEVICE_NOT_CONNECTED'}});
            }
            return;
        }
        if(typeof ack === "function") {
            deviceSocket.emit('requestDeviceMethod', method, params.params, (deviceResponse) => {
                ack(deviceResponse);
            });
        } else {
            if(deviceSocket.handshake.query.legacy) {
                deviceSocket.emit('requestDeviceMethod', {method:method, params: params.params});
            } else {
                deviceSocket.emit('requestDeviceMethod', method, params.params);
            }
        }
    });
    ss(socket).on('requestDeviceStream', (stream, params, ack) => {
        console.log(`Received requestDeviceStream ${params.method}`);

        let method = params.method;
        let deviceId = params.to;

        if(!deviceId) {
            processLocalStream(stream, params, ack);
            return;
        }

        let deviceStream = ss.createStream();
        deviceStream.pipe(stream);

        stream.on('unpipe', function () {
            console.log('fcstream unpipe');
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
        ss(deviceSocket).emit('requestDeviceStream', deviceStream, {
            method: method,
            params: params.params
        }, typeof ack === "function" ? function (deviceResponse) {
            ack(deviceResponse);
        } : null);
    })

};
