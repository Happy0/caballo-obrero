const CaballoCore = require('./core')
const pull = require('pull-stream')

function addMessage (msg) {
    console.log("Adding message: " + msg)
    const prev = document.getElementById("chat").textContent 
    // place new messages at the top, so we don't have to attach autoscrolling javascript to the textarea
    document.getElementById("chat").textContent = msg + "\n" + prev 
}

function addMessageSendHandler(caballoCore) {
    console.log("Starting enter key listener on message input box.")
    const node = document.getElementById("input");
    node.addEventListener("keyup", function(event) {
        if (event.key === "Enter") {
            console.log("Adding my own message to core!")

            const messageText = node.value

            caballoCore.addChatMessage(messageText, (err, result) => {
                console.info("Err on sending message: " + err)
                console.info("Result on sending message: " + result)

            })

            node.value = ""
        }
    });
}

function handleMessageStream(cabalCore) {
    cabalCore.getMessageStream(function(err, stream) {
        console.log("Subbing to DB stream of messages")

        // Add messages in order of client's message date claim to the chat box
        pull(stream, pull.drain(function(data) {
            console.log("Drain...")
            console.log(data)

            const payload = JSON.parse(data.value)
            addMessage(
                payload.feedId.slice(0, 8) + ": " + payload.message
            )
        }))

    })
}

function initiate () {
    const caballoCore = CaballoCore()
    addMessageSendHandler(caballoCore)
    handleMessageStream(caballoCore)
}


window.addEventListener('load', (event) => {
    initiate();
});