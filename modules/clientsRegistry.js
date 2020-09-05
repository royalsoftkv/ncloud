const moment = require('moment');
const stream = require('stream');

let clients = {};

let clientsStream = new stream.Readable({
    read() {},
    objectMode: true
})

module.exports = {

    getAll() {
        return clients;
    },

    add(socket) {
        clients[socket.id] = socket;
        this.updateClientsStream()
    },

    remove(socket) {
        delete(clients[socket.id])
        this.updateClientsStream()
    },

    getByDeviceId(deviceId) {
        for(let id in clients) {
            if(clients[id].handshake.query.deviceId === deviceId) {
                return clients[id];
            }
        }
    },

    getBySocketId(id) {
        return clients[id];
    },

    getClientsList() {
        let list = [];
        let clients = this.getAll();
        for (let k in clients) {
            let client = clients[k];
            list.push({
                socketId: client.id,
                connectedTime: moment(new Date(client.handshake.time)),
                deviceId: client.handshake.query.deviceId,
                deviceName: client.handshake.query.name,
                address: client.handshake.headers['x-real-ip'] || client.handshake.remoteAddress || client.handshake.address,
                modules: client.handshake.query.modules,
                processId: client.handshake.query.processId,
                version: client.handshake.query.version,
                socketData: client.socketData
            });
        }
        return list;
    },

    updateClientsStream() {
        clientsStream.push(this.getClientsList())
    },

    getClientsStream() {
        return clientsStream
    }

};
