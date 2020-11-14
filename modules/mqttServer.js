const aedes = require('aedes')()
const server = require('net').createServer(aedes.handle)
const port = 2883

server.listen(port, function () {
    console.log('MQTT server started and listening on port ', port)
})


module.exports = {}
