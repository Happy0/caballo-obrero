const useRamStorage = true // todo: make RAM storage configurable again

console.log("Using RAM storage: " + useRamStorage)

const hyperswarm = require("hyperswarm-web")
const crypto = require("hypercore-crypto")

const ram = require("random-access-memory")
const RAW = require("random-access-web")

const hypercore = require("hypercore")
const pump = require("pump")

const key = "13379ad64e284691b7c6f6310e39204b5f92765e36102046caaa6a7ff8c02d74"
const discoveryKey = crypto.discoveryKey(Buffer.from(key, 'hex'))

const swarm = hyperswarm({ bootstrap: ["wss://swarm.cblgh.org"] })

const kappa = require('kappa-core')

const view = require('kappa-view')

const kappaStore = useRamStorage ? ram : RAW("caballo")
const core = kappa(kappaStore, { valueEncoding: 'json' })

const levelup = require('levelup')
const leveljs = require('level-js')

const memdb = require('memdb')

const store = useRamStorage ? memdb() : levelup(leveljs("bigdata"))

const Pushable = require('pull-pushable')
const pull = require("pull-stream")

module.exports = function (self) {
    var chatView = view(store, function (db) {

        return {
            map: function(entries, next) {
                console.log("Mapping...")
    
                const newDbEntries = entries.map(element => {
                    const coreId = element.key;
                    const value = element.value;
                    value.feedId = coreId
    
                    const entry = {
                        type: 'put',
                        // level DB sorts lexigraphically for streams, so we store by date and the coreId to make it unique
                        // todo: think of edge cases
                        key: value.date + coreId,
                        value: JSON.stringify(value)
                    }
    
                    return entry
                });
    
                db.batch(newDbEntries, next)
            },
            api: {
                // We could choose to add some options to only get the latest messages + newly arriving ones in the future,
                // and pull older ones while scrolling up in the future. Using pull-stream because I'm familiar with the interface
                // and i find it more composable than traditional node streams. just sketching for now
                getMessageStream: function (core, cb) {
    
                    const p = Pushable()
    
                    db.createReadStream({live: true })
                        .on('data', function (data) {
                            p.push(data)
                        })
                        .on('end', function() {
                            // Hacky for now... This is new messages we receive and store in the DB live. Not sure if there's race condition issues
                            // here...
    
                            console.log("Old DB stream end! Pushing newly arriving messages to stream")
    
                            db.on('batch', function (value) {
                                console.log("Batch event value: ")
                                console.log(value)
    
                                value.forEach(p.push)
                            })
            
    
                        })
    
                    cb(null, p)
                }
            }
        }
    })
    
    core.use('kv', chatView)
    
    var writerPromise = new Promise(function(resolve, reject) {
        core.writer('default', function(err, writer) {
            if (err) {
                console.log("Error which loading core writer.")
                console.log("ERROR: " + err.message + " name: " + err.name)
    
                reject(err)
            } else {
                const pubkey = writer.key.toString("hex")
                console.log("my feed key is", pubkey)
            
                swarm.join(discoveryKey, { lookup: true, announce: true }, function() {
                    console.log("On join called...")
                })
                swarm.on("connection", (socket, info) => {
                    console.log("connection!")
                    const r = core.replicate(info.client)
            
                    pump(socket, r, socket, (err) => {
                        if (err) console.error("ERROR", err)
                    })        
                })
    
                resolve(writer)
            }
        })
    })
    
    self.onmessage = function (e) {
        var data = e.data;
        var seq = e.data.seq;
    
        if (data.command == "addMessage") {
            writerPromise.then(writer => writer.append(data.value)).then(result => {
                postMessage({
                    seq: seq,
                    stream: false,
                    result: true
                })
            })
        }
        else if (data.command == "getMessageStream") {
            core.api.kv.getMessageStream(function (err, result) {
    
                pull(result, pull.drain(function(data) {
                    postMessage({
                        seq: seq,
                        stream: true,
                        result: data
                    })
                }))
    
            })
    
        }
    
    }
}



