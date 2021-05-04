const http = require('http');
const sio = require('socket.io');
const ss = require('socket.io-stream');

const server = http.createServer();
const config = require('./config.json');
const socketHandler = require("./modules/socketHandler");
const clientsRegistry = require("./modules/clientsRegistry");
const dbHandler = require("./modules/dbHandler");
const crypt = require("./modules/crypt")
const jwt = require('jsonwebtoken')
const timer = require('long-timeout')


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

let keys

generateKeys = () => {
    keys = crypt.generateKeys(config.secret)
}

server.listen(config.port, config.host, () => {
    const io = sio.listen(server, {
        pingInterval: 25000,
        pingTimeout: 6000
    });
    // io.use(acknowledge);
    console.log("server started");
    io.on('connect', function(socket){
        let deviceId = socket.handshake.query.deviceId
        console.log('client connected', deviceId);
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

        // if(!socket.handshake.query.pubKey && !socket.handshake.query.legacy) {
        //     console.log(`Connectiong without public key - upgrade you nclient-lib on ${socket.handshake.query.deviceId}`);
        //     socket.disconnect();
        //     return;
        // }

        // socket.pubKey = socket.handshake.query.pubKey


        let expires = 60 * 60 * 24
        let token = jwt.sign({
            iss: "ncloud",
            exp: Date.now()/1000 + expires,
            sub: "auth",
            deviceId: deviceId,
            socketId: socket.id
        }, {
            key: keys.privateKey,
            passphrase: config.secret
        }, {algorithm: 'RS256'});

        socket.token = token
        socket.publicKey = keys.publicKey

        let cb = () => {
            console.log(`Client ${socket.handshake.query.deviceId} received token`)
        }
        if(socket.handshake.query.legacy) {
            cb = null
        }
        socket.emit("token", {token, publicKey: keys.publicKey}, cb)

        const expiresIn = expires * 1000
        console.log(`Set socket expires in ${expiresIn}`)
        const timeout = timer.setTimeout(() => {
            console.log(`Disconnecting socket becauyse of expired tken`)
            socket.disconnect(true)
        }, expiresIn)

        clientsRegistry.add(socket);
        socket.on('disconnect', function () {
            console.log('disconnected client', deviceId);
            timer.clearTimeout(timeout)
            clientsRegistry.remove(socket);
        });
        socket.on('error', (error) => {
            clientsRegistry.remove(socket);
            console.log('error on socket ',deviceId, error);
        });
        socket.on('disconnecting', (reason) => {
            console.log('disconnecting',deviceId, reason);
        });
        socketHandler(socket, keys);

    });

});

var connect = require('connect');
var serveStatic = require('serve-static');

connect()
    .use(serveStatic('./public'))
    .listen(8090, () => console.log('File server running on 8090...'));

generateKeys()
