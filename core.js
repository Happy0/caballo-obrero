var work = require('webworkify');
var Pushable = require('pull-pushable')

module.exports = function() {
    var sequenceNumber = 0;
    var pending = {}

    var worker = work(require('./worker.js'))

    worker.addEventListener('message', function (ev) {

        var waiting = pending[ev.data.seq];

        if (waiting == null) {
            console.log("No pending listener for sequence number " + ev.data.seq)
            return;
        }

        if (ev.data.stream) {
            waiting.push(ev.data.result)
        } else {
            waiting(null, ev.data.result)
        }

    });

    function makeMessageModel(messageText) {
        return {
            message: messageText,
            date: Date.now()
        }
    }

    function sendToWorker(command, sequenceNumber, data) {
        var body = {
            seq: sequenceNumber,
            command: command,
            value: data
        }

        worker.postMessage(body)
    }

    return {
        addChatMessage: function(message, cb) {
            var body = makeMessageModel(message)
            pending[sequenceNumber] = cb

            sendToWorker("addMessage", sequenceNumber, body)            
            sequenceNumber = sequenceNumber + 1
        },
        getMessageStream: function(cb) {
            var pushable = Pushable()
            pending[sequenceNumber] = pushable

            sendToWorker("getMessageStream", sequenceNumber, {})
            sequenceNumber = sequenceNumber + 1

            cb(null, pushable)
        }
    }
}