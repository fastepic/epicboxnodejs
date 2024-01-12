//
// Add indexes in mongo
// Before start create user and indexes
/*

 db.slates.createIndex({queue:1, made:1, createdat: 1});
 db.slates.createIndex({messageid:1, made:1});
 db.slates.createIndex({ "createdat": 1 }, {expireAfterSeconds: 604800 });
 db.createUser(
  {
    user: "epicbox",
    pwd: passwordPrompt(), // or cleartext password
    roles: [
      { role: "readWrite", db: "epicbox" },
      { role: "readWrite", db: "epicbox" }
    ]
  }
 );
 
*/

const fs = require("fs");
const {createServer} = require("http");
const { execFile } = require('node:child_process');
const uid = require('uid2');
const { WebSocket, WebSocketServer } = require('ws');
const { MongoClient } = require('mongodb');

const customConfig = process.argv.indexOf('--config');
//this epicbox protocol version
const protver = "3.0.0";
/**
 * @deprecated in wallet version 3.5.2
 * use dynamic challenge strings
 */
const static_challenge = "7WUDtkSaKyGRUnQ22rE3QUXChV8DmA6NnunDYP4vheTpc";

const config = { 
    mongourl: "mongodb://127.0.0.1:27019",
    epicbox_domain: "epicbox.fastepic.eu",
    epicbox_port: "443",
    localepicboxserviceport: "3423",
    pathtoepicboxlib: "./epicboxlib",
    db_name: "epicbox",
    collection_name: "slates",
    challenge_interval: 60000,
    debugMessage: true,
    stats: false,
    
};
let mongoclient = null;
let collection = null;
let statistics = { 
  from: new Date(),
  connectionsInHour: 0,
  slatesReceivedInHour: 0,
  slatesRelayedInHour:0,
  slatesSentInHour: 0,
  subscribeInHour: 0,
  activeconnections: 0,
  slatesAttempt:0
}

//clean stats every hour
setInterval(()=>{
  statistics = {
    from: new Date(),
    connectionsInHour: 0,
    slatesReceivedInHour: 0,
    slatesRelayedInHour: 0,
    slatesSentInHour: 0,
    subscribeInHour: 0,
    activeconnections: 0,
    slatesAttempt: 0   
  }
}, 60*60*1000);


const requestListener = (req, res) => {
      res.writeHead(200)
      res.end(`<!DOCTYPE html>\n\
        <html>\n\
        <head>\n\
        <title>Epicbox</title>\n\
        <style>a:link {\n\
          color: orange;\n\
        } a:visited {\n\
          color: orange;\n\
        }</style>\n\
        </head>\n\
        <body style='background-color: #242222; color: lightgray; margin-left: 20px;''>\n\
        \n\
        <h1>Epicbox servers. Local server number 1</h1>\n\
        <p>Protocol 2.0.0</p>\n\
        <a href='https://github.com/fastepic/epic-wallet/tree/epicbox-0.0.1'>epic-wallet to build with protocol 2.0.0</a>\n\
        <p>Asia, Australia - epicbox.hyperbig.com</p>\n\
        <p>North America, South America - epicbox.epic.tech</p>\n\
        <p>US East Cost - epicbox.epicnet.us</p>\n\
        <p>Africa, Europe - epicbox.fastepic.eu</p>\n\
        <br>\n\
        <p>More about Epic</p>\n\
        <a href='https://epic.tech'>Epic Cash main webpage</a>\n\
        <br>\n\
        <br>\n\
            Example use in toml file.\n\
        \n\
        <pre>\n\
        <code>\n\
        \n\
        [epicbox]\n\
        epicbox_domain = 'epicbox.fastepic.eu'\n\
        epicbox_port = 443\n\
        epicbox_protocol_unsecure = false\n\
        epicbox_address_index = 0\n\
        epicbox_listener_interval = 10\n\
        \n\
        </code>\n\
        </pre>\n\
        <p> start listen: epic-wallet listen -m epicbox</p>\n\
        <br>\n\
        <h1>\n\
        Epicbox Statistics from ${statistics.from.toUTCString()}:\n\
        </h1>\n\
        <h3>\n\
        connections: ${statistics.connectionsInHour}<br>\n\
        active connections: ${statistics.activeconnections}<br>\n\
        subscribes: ${statistics.connectionsInHour}<br>\n\
        received slates: ${statistics.slatesReceivedInHour}<br>\n\
        relayed slates: ${statistics.slatesRelayedInHour}<br>\n\
        sending slate attempts: ${statistics.slatesAttempt}<br>\n\
        </h3>\n\
        </body>\n\
        </html>`);
}

const server = createServer(requestListener);
const wss = new WebSocketServer({
  server: server,  
})

wss.on('connection', (ws, req) => {
    
    if(config.stats){     
        statistics.connectionsInHour++;
    }
    
    ws.uid = uid(5);
    ws.epicboxver = null;
    ws.ip = null;
    ws.challenge = null;
    ws.epicPublicAddress = null;
    //don't send challenges or slates to busy client
    ws.process_slate = false;
    ws.pending_challenge = false;
    
    
    if(req.headers['x-forwarded-for']){
        ws.ip = req.headers['x-forwarded-for'].split(',')[0].trim();
    }else{
        ws.ip = req.socket.remoteAddress;
    }
    
    console.log(`[${new Date().toLocaleTimeString()}] [${ws.uid}] New connection from `, ws.ip);
    
    // send a Challenge to wallet or other epicbox when first time connect
    // challenges are send in interval every x seconds later
    challenge(ws);
    
    ws.on('close', (code, reason) => {
        ws.epicPublicAddress = null;
        console.log('[%s] - [%s][%s] -> [%s] code: %s, reason: %s', new Date().toLocaleTimeString(), ws.uid, ws.ip, "Close connection", code, reason.toString());   
    });
    
    ws.on('error', (err) => {
        ws.epicPublicAddress = null;
        console.log('[%s] - [%s][%s] -> [%s] error: %s', new Date().toLocaleTimeString(), ws.uid, ws.ip, "Error", err);
    });

    ws.on('message', (data) => {
        
        let message = null;
        
        try{
   	        message = JSON.parse(data);
        }catch(err){
            console.log("Error parsing json data from client.", err);
            
            ws.epicPublicAddress = null;
            return ws.close(code = 3000, reason = 'Error parsing message.');
        }
          
        let type = message.type;
        
        /* TODO: 
            - clients should set version via setVersion type 
            - split wallet client from epicbox client
        */ 
        switch (type.toLowerCase()) {
            case "ping":
                ws.send("pong");
            break;
            case "pong":
                ws.send("ping");
            break;
            /**
             * @deprecated in wallet version 3.5.2
             * clients should not be allowed to trigger challenge/subscribe requests 
             */
            case "challenge":
                challenge(ws);
            break;
            case "subscribe":
                ws.pending_challenge = false;
                subscribe(ws, message);
            break;
            case "unsubscribe":
                unsubscribe(ws);
            break;
            case "postslate":
                validatePostslate(ws, message);
            break;
            //made is send after slate was successfully processed in wallet
            case "made":
                ws.process_slate = false;
                made(ws, message);
            break;
            case "getversion":
                ws.send(JSON.stringify({type: "GetVersion", str: protver}))
            break;
            /**
             * @deprecated in wallet version 3.5.2
             */
            case "fastsend":
                ws.send(JSON.stringify({type:"Ok"}));
            break;
        }
        //end switch message type
        
        console.log('[%s] - [%s][%s] -> [%s]', new Date().toLocaleTimeString(), ws.uid, ws.ip, type);
        config.debugMessage ? console.log("Message", message) : null;
        
    
    });
});

const getTimestamp = () => {
  return Math.floor(Date.now() / 1000);
}

/* 
    send challenge to client.
    the first challenge must use the old static challenge string for backward compatibility.
    older epicbox clients with  protocol version 2.0.0
    new epicbox/clients can use a dynamic challenge.
    //TODO if client blocks then this send messages are waiting in the queue
*/ 
const challenge = (ws) => {
    //we do not know clients epicbox version on first challenge request.
    //todo. client should send its version when connect to epicbox via setVersion
    let challenge = ws.epicboxver == "2.0.0" || ws.epicboxver == null ? static_challenge : uid(32);
    ws.challenge = challenge;
    ws.send(JSON.stringify({"type": "Challenge", "str": challenge}));
}

//
// Subscribe
// validate client address and send back a pending slate
//
const subscribe = (ws, message) => {

    try{
   
        //set used epicbox protocol version
        if(message.hasOwnProperty("ver")){
            switch (message.ver) {
                case "2.0.0":
                    ws.epicboxver = "2.0.0";
                break;
                default:
                    //new version is
                    ws.epicboxver = "3.0.0";
                break;
            }
        }
           
        // verify that client is the owner of the public key
        let args = ["verifysignature", message.address, ws.challenge, message.signature];
        const child = execFile(config.pathtoepicboxlib, args, (error, stdout, stderr) => {
            if (error) throw error;
         
            // if signature is OK
            if(stdout === 'true'){
    
                if(config.stats){
                    statistics.subscribeInHour++;
                }
                
                // client proved that he is the owner of the public address
                ws.epicPublicAddress = message.address;
                ws.lastSubscriptionTime = getTimestamp();
                
                //get not processed tx for client
                //prevent sending same slate multible times
                if(ws.process_slate === false){
                    collection.find({ queue: ws.epicPublicAddress, made: false}).sort({ "createdat" : 1 }).limit(1).toArray().then( (res) => {
                        
                        if(res && res.length > 0) {
                    
                            if(config.stats){
                                statistics.slatesAttempt++;
                            }
                            
                            let dbslate = res[0];
                            let payload = JSON.parse(dbslate.payload);
                            let slate = {
                                type: "Slate",
                                from: dbslate.replyto,
                                str: payload.str,
                                signature: payload.signature,
                                challenge: payload.challenge,
                            };
                            
                            if(ws.epicboxver == "2.0.0" || ws.epicboxver == "3.0.0"){
                                slate.epicboxmsgid = dbslate.messageid;
                                slate.ver = ws.epicboxver;
                            }else{
                                collection.updateOne({ messageid:dbslate.messageid }, { $set: { made:true } });
                            }
                            
                            //TODO: check if this was already send on previous interval to client but client does block 
                            //if client blocks, this will end in multible made requests
                            //we must set a flag here if the slate to client was already send but client did not process yet for any reasons.
                            ws.process_slate = true;
                            ws.send(JSON.stringify(slate)); 
                            console.log("Sent slate to", ws.epicPublicAddress);
                            config.debugMessage ? console.log(slate) : null;
                            
                        }else{
                            
                            //no slate found but subscribe was ok
                            ws.send(JSON.stringify({type:"Ok"}));  
                              
                        }
                        //end if result > 0 
                        
                    }); 
                }else{
                    //send back some response
                    ws.send(JSON.stringify({type:"Ok"}));  
                }
                
            }else{
                //client cannot prove that he is the owner of the public address
                ws.epicPublicAddress = null;
                ws.send(JSON.stringify({type: "Error", kind: "signature error", description: "Invalid signature."}));
            }
        });
  
    }catch(err){
        console.log("Erro execute epicboxlib", err);
    }
}


//
// Unsubscribe client
//
const unsubscribe = (ws) => {
    
    ws.epicPublicAddress = null;
    ws.send(JSON.stringify({type:"Ok"}));
}


//
// client sends a new tx or a response to an tx
// validate address format and signature
//
const validatePostslate = (ws, message) => {
    
    try {
        console.log("postslate from ", message.from, "to ", message.to);

        let publickey = message.from.split('@');
        publickey = publickey[0];

        // use epicboxlib to verify address format 
        let args = ['verifyaddress',  message.from, message.to];
        execFile(config.pathtoepicboxlib, args, (error, stdout, stderr) => {
            if(error) throw error;

            if(stdout === 'true') {

                //verify that the message we receive was signed from publickey
                let args = ["verifysignature", publickey, message.str, message.signature];
                execFile(config.pathtoepicboxlib, args, (error, stdout, stderr) => {

                    if (error) throw error;

                    if(stdout === 'true') { 
                        
                        if(config.stats){            
                            statistics.slatesReceivedInHour++;
                        }
                        
                        postSlate(ws, message);
                   
                    }else{
                        console.log("Error postslate signature", publickey);
                        ws.send(JSON.stringify({type: "Error", kind: "postslate error", description: "Invalid signature."}));
                    }

                });

            }else{
                console.log("Error validate address format", message.from, message.to);
                ws.send(JSON.stringify({type:"Error", kind:"postslate error", description: "Wrong address format."}));
            }
        });

    }catch(err){
        console.error("Error postslate", err);  
    } 

}

const made = (ws, message) => {

    if(message.hasOwnProperty("epicboxmsgid") && message.hasOwnProperty("ver") && (message.ver == "2.0.0" || message.ver == "3.0.0")){
        let args = [];
        if(message.ver == "3.0.0"){
            args = ["verifysignature", ws.epicPublicAddress, message.epicboxmsgid, message.signature];
        }else{
            args = ["verifysignature", ws.epicPublicAddress, ws.challenge, message.signature];
        }

        const child = execFile(config.pathtoepicboxlib, args, (error, stdout, stderr) => {
            if (error) throw error;

            if(stdout === 'true') {
                console.log("Update for ", message.epicboxmsgid);
                collection.updateOne({queue: ws.epicPublicAddress, messageid: message.epicboxmsgid, made:false}, { $set: {made:true} }).then( (updateResult) => {
                    config.debugMessage ? console.log("DB update result", updateResult) : null;
                    ws.send(JSON.stringify({type:"Ok"}));
                    //if this slate was processed then send the next slate to client via challenge->subscribe
                    challenge(ws);
                    
                });
            }else{       
                ws.send(JSON.stringify({type: "Error", kind: "made error", description: "Invalid signature."}));
            }
        });
    } 
}



//
// store tx in db or forward to foreign epicbox if domain does not match our epicbox domain
//
const postSlate = (ws, json) => {

    let str = {};
    try{
        str = JSON.parse(json.str);
    }catch(err){
        console.log("Error parsing message string", err);
        return;
    }
    
    let addressto = {};
    addressto.publicKey = str.destination.public_key;
    addressto.domain = str.destination.domain;
    addressto.port = str.destination.port != null ? str.destination.port : 443;
    
    if(addressto.domain === config.epicbox_domain && addressto.port === config.epicbox_port){
 
        //challenge is not required, we keep it for backward compatibility
        let signed_payload = JSON.stringify({str: json.str, challenge: "", signature: json.signature});
            
        // insert slate to db
        collection.insertOne({ 
                queue: addressto.publicKey, 
                made: false, 
                payload: Buffer.from(signed_payload), 
                replyto: json.from, 
                createdat: new Date(), 
                expiration: 86400000, 
                messageid: uid(32)
                  
        }).catch((err)=>{  
            console.error("Error insert to db", err);
        });
        
        ws.send(JSON.stringify({type:"Ok"}));
    
    }else{

        // forward tx to foreign epicbox
		sock = new WebSocket("wss://" + addressto.domain +":"+ addressto.port);
        sock.on('error', console.error);
        sock.on('open', () => { 
            console.log("Connect "+ addressto.domain +":"+ addressto.port);
        });
        sock.on('message', (data) => {
            try{
                message = JSON.parse(data);
                if(message.type === "Challenge") {
                    let slate = {type: "PostSlate", from: json.from, to: json.to, str: json.str, signature: json.signature};
                    sock.send(JSON.stringify(slate));
                }
                
                if( message.type === "Ok" ) {
                    
                    if(config.stats){     
                        statistics.slatesRelayedInHour++;
                    }
                    
                    console.log("Sent to wss://"+ addressto.domain +":"+ addressto.port);
                    ws.send(JSON.stringify({type:"Ok"}));
                } 

            }catch(err){
                console.error("Error forward slate to foreign epicbox", err);
                ws.send(JSON.stringify({type: "Error", kind: "foreign epicbox", description:"Error send Slate to foreign epicbox"}));
            }
            
        });
        
    }
}

const challengeInterval = () => {
    
    wss.clients.forEach( (ws) => {
        
        if (ws.readyState === 1 
            && ws.epicPublicAddress !== null
            //do not spam clients with challenge requests
            //do not send new challenge if old challenge request was not subscribed (when client blocks)
            && (ws.pending_challenge === false || (getTimestamp() - ws.lastSubscriptionTime >= config.challenge_interval))
        ) {
            try{
                ws.pending_challenge = true;
                challenge(ws);
            }catch(err){
                console.log("Send Interval challenge error ", err);
            }
        }
        
    });
    
}

const loadConfig = async(filePath) =>{
    
    try{
        
        let jsonData = fs.readFileSync(filePath, 'utf8');
        let data = JSON.parse(jsonData);
        
        config.mongourl = data.mongo_url != undefined ? data.mongo_url : config.mongourl;
        config.epicbox_domain = data.epicbox_domain != undefined ? data.epicbox_domain : config.epicbox_domain;
        config.epicbox_port = data.epicbox_port != undefined ? data.epicbox_port : config.epicbox_port;
        config.localepicboxserviceport = data.local_epicbox_service_port != undefined ? data.local_epicbox_service_port: config.localepicboxserviceport;
        config.pathtoepicboxlib = data.path_to_epicboxlib_exec_file != undefined ? data.path_to_epicboxlib_exec_file : config.pathtoepicboxlib;
        config.db_name = data.mongo_dbName != undefined ? data.mongo_dbName : config.db_name;
        config.collection_name = data.mongo_collection_name != undefined ? data.mongo_collection_name : config.collection_name;
        config.challenge_interval = data.challenge_interval != undefined ? data.challenge_interval : config.challenge_interval;
        config.debugMessage = data.debug != undefined ? data.debug : config.debugMessage;
        config.stats = data.stats != undefined ? data.stats : config.stats;
        
    } catch(err){
        console.error(err);
    }
    
}


//
// main starting function
//
const main = async() => {
    
    let configPath = customConfig != -1 && process.argv[customConfig+1] != undefined ? process.argv[customConfig+1] : './config.json';
    console.log("Use config:", configPath);
    await loadConfig(configPath);
    mongoclient = new MongoClient(config.mongourl);
    let db = mongoclient.db(config.db_name);
    collection = db.collection(config.collection_name);
    await mongoclient.connect();
    console.log('Connected successfully to MongoDB');
    server.listen(config.localepicboxserviceport);
    setInterval(challengeInterval, config.challenge_interval); 
    console.log("Epicbox ready to work.");

}


// We are using this single function to handle multiple signals
const handle = (signal) => {
    console.log(`So the signal which I have Received is: ${signal}`);

    wss.clients.forEach(function each(client) {
      client.close();
    });

    mongoclient.close();
    process.exit()
}
 
process.on('SIGINT', handle);
process.on('SIGBREAK', handle);
//process.on("SIGTERM", handle);
//process.on("SIGKILL", handle);


main();

