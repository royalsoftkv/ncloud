const http = require('http');
const sio = require('socket.io');
const ss = require('socket.io-stream');

const server = http.createServer();
const config = require('./config.json');
const socketHandler = require("./modules/socketHandler");
const clientsRegistry = require("./modules/clientsRegistry");
const dbHandler = require("./modules/dbHandler");
global.initList = function(params, cb) {
    cb({
        allowedIps: config.allowedIps,
        clients: clientsRegistry.getClientsList()
    })
};

global.listClients = function(stream, params, ack) {
    console.log(`Handling listClients`);
    stream.on('pipe', () => {
        clientsRegistry.updateClientsStream()
    })
    clientsRegistry.getClientsStream().pipe(stream)
    ack('Connected');
};

global.getClientModules = function(deviceId) {
    let nodeSocket = findNodSocketeById(deviceId);
    if(nodeSocket) {
        return nodeSocket.handshake.query.modules;
    }
}


Handler = {


};

function findNodSocketeById(nodeId) {
    return clientsRegistry.getByDeviceId(nodeId);
}

function procesMessage(Handler, msg, ack) {
    console.log(`Processing local message ${JSON.stringify(msg)}`);
    let method = msg.method;
    let payload = msg.payload;
    let fn = Handler[method];
    if (typeof fn === "function") {
        console.debug(`Executing function ${method}`);
        const isAsync = fn.constructor.name === "AsyncFunction";
        console.log('isAsync',isAsync);
        if(isAsync) {
            new Promise(async function(resolve, reject) {
                resolve(ack(await fn(payload)));
            });
        } else {
            let res = fn(payload);
            if(typeof ack === 'function') {
                ack(res);
            }
        }
    } else {
        let msg = `Not found function ${method} on server`;
        console.warn(msg);
        if(typeof ack === 'function') {
            ack({error: true, message: msg});
        }
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
        socket.emit('message',msgAck);
    };
    return ack;
}

server.listen(config.port, config.host, () => {
    const io = sio.listen(server);
    // io.use(acknowledge);
    console.log("server started");
    io.on('connect', function(socket){
        console.log('client connected', socket.id,  socket.handshake.query.deviceId);
        let address = socket.handshake.address;
        if(config.allowedIps.length > 0) {
            if(!config.allowedIps.includes(address)) {
                console.warn(`Not allowed access for ip: ${address}`);
                return;
            }
        }
        if(socket.handshake.query.secret !== config.secret) {
            console.log('Wrong secret - disconnect');
            socket.disconnect();
            return;
        }

        clientsRegistry.add(socket);
        socket.on('disconnect', function () {
            console.log('disconnected client', socket.id);
            clientsRegistry.remove(socket);
        });
        socket.on('error', (error) => {
            clientsRegistry.remove(socket);
            console.log('error',error);
        });
        socket.on('disconnecting', (reason) => {
            console.log('disconnecting',reason);
        });
        socketHandler(socket);

    });

});

var connect = require('connect');
var serveStatic = require('serve-static');

connect()
    .use(serveStatic('./public'))
    .listen(8090, () => console.log('File server running on 8090...'));
