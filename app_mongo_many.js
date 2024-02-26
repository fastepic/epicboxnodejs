/*
This is a program for an elite, narrow group of several Epic Box operators in the world.
If you are not one of them, reading this code is pointless.
*/

//
// Add indexes in mongo ( the first two for faster finding second to delete slate from database after set seconds ( 7 days in example = 7*24*60*60=) )
// use epicbox
// db.slates.createIndex({queue:1, made:1, createdat: 1})
//
// db.slates.createIndex({messageid:1, made:1})
//
// db.slates.createIndex({ "createdat": 1 }, {expireAfterSeconds: 604800 })
//

const fs = require("fs")

// Html server used for websockets server
const {createServer} = require("http")

// Used for execute rust module which fast check addreses and verify signatures
const { execFile } = require('node:child_process')

// For generate uid message id for Slate sending to wallet.
const uid = require('uid2')

// Websocket for communicate with other epicboxes, and Websocket Server for receive all ws connections from wallets
const { WebSocket, WebSocketServer } = require('ws')

// Mogodb driver for externally store messageid and slates for ver 2.0.0. of epicbox, tp work with answer by wallet with slate id message
const { MongoClient } = require('mongodb');

// Connection URL for mongo, please change if your mongo server is on other location, you can add authorization and open firewall for it.
// each instance of epicbox which you run on your domain must use the same mongodb -- so change to correct ip and remeber open ports in firewall
// it's good idea to add one field (createdat:new Date()) in stored document and set index with timeout which which can delete documents which are old about 3-4 days
// because in special situation when wallet use 2.0.0 and later use older version stored messagid information from mognodb can't be removed by epicbox
var mongourl = "mongodb://localhost:27017"

var dbName = "epicbox"
var collectionname = "slates"

var challenge = "7WUDtkSaKyGRUnQ22rE3QUXChV8DmA6NnunDYP4vheTpc"


// change to your epicbox domaina
var epicbox_domain = "epicbox.fastepic.eu"
var epicbox_port =  443

// change to your port - standard is 3423 - remeber to open locale firewall - in linux sudo ufw 3424 allow
// you can run many instance of this epicbox - simpel copy folder with other name and change this port to next which you want
// remeber to correct set nginx to switch between different instances of epic box - read more in my git about it.
var localepicboxserviceport = 3424

// interval for check in intervals if new Slates are for connected wallets ( it is not the same what interval in wallets ! )
var interval = null

// time of interval ( ms ) in which epicbox can try repeat send the oldest slate for address.
//
var intervalperiod = 4000 // 4 seconds


//Where is executable rust named epicboxlib compiled from epicboxlib subfolder
var pathtoepicboxlib = "./epicboxlib"

// amount of repeats FastSend message to wallet
var fast_send_repeats = 20

// interval in ms of repeat FastSend message to wallet
var fast_send_repeat_interval_ms = 1000

// Is this instance FastSendMaster ?

var fast_send_master = true;

// Slaves for FastSendMaster ( used only by Master to remove connection from not trusted instances )

var fast_send_slaves = ["::ffff:127.0.0.1"];

// where is fast_send_master ip

var fast_send_master_ip = "localhost"

// Port under which FastSendMaster works

var fast_send_port = 3427

// interval for read data from config.json
var varinterval = 1000*60*5;



//current version of protocol of epicboxnodejs ( wallet can use lower )
//
const protver = "2.0.0"


if(process.argv[2]==null) process.exit();

const vardata = fs.readFileSync('config_many.json',
            {encoding:'utf8', flag:'r'});


function getvars(data){

 try {

  let v = JSON.parse(data)

   mongourl = v.mongo_url
   dbName = v.mongo_dbName
   collectionname = v.mongo_collection_name
   challenge = v.challenge
   epicbox_domain = v.epicbox_domain
   epicbox_port = v.epicbox_port
   localepicboxserviceport = v.local_epicbox_service_port
   intervalperiod = v.interval_period_ms
   pathtoepicboxlib = v.path_to_epicboxlib_exec_file
   fast_send_repeats = v.fast_send_repeats
   fast_send_repeat_interval_ms = v.fast_send_repeat_interval_ms

       fast_send_master = v.fast_send_master,
       fast_send_slaves = v.fast_send_slaves,
       fast_send_master_ip = v.fast_send_master_ip,
       fast_send_port = v.fast_send_port
   varinterval = v.var_interval
   console.log(data)

 } catch(err) {

   console.error(err)

 }


}

getvars(vardata)




setInterval(()=>{

  try{

    fs.readFile('config_many.json', 'utf8', (err, data) => {
      if (err) {
        console.error(err);
        return;
      }

       let v = JSON.parse(data)

       challenge = v.challenge
       epicbox_domain = v.epicbox_domain
       epicbox_port = v.epicbox_port
       localepicboxserviceport = v.local_epicbox_service_port
       intervalperiod = v.interval_period_ms
       pathtoepicboxlib = v.path_to_epicboxlib_exec_file
       fast_send_repeats = v.fast_send_repeats
       fast_send_repeat_interval_ms = v.fast_send_repeat_interval_ms
       fast_send_slaves = v.fast_send_slaves
       varinterval = v.var_interval


    });


  } catch(err){

    console.error(err)
  }

}, varinterval)




const mongoclient = new MongoClient(mongourl)


var statistics = {

  from: new Date(),
  connectionsInHour: 0,
  slatesReceivedInHour: 0,
  slatesRelayedInHour:0,
  slatesSentInHour: 0,
  subscribeInHour: 0,
  activeconnections: 0,
  slatesAttempt:0
}

setInterval(()=>{


  statistics = {

    from: new Date(),
    connectionsInHour: 0,
    slatesReceivedInHour: 0,
    slatesRelayedInHour: 0,
    slatesSentInHour: 0,
    subscribeInHour: 0,
    activeconnections: 0,
    slatesAttempt:0
  }

},60*60*1000);




const requestListener = function (req, res) {
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



//
//
// FastSend for many instances udner the same domain ( start code )
//
//

var  ws_fastsend_master = null;
var  ws_fastsend = null;

function startfastsendslave(){

      ws_fastsend = new WebSocket('ws://'+fast_send_master_ip+":"+fast_send_port);

      ws_fastsend.on('error', (err)=>{

          console.log(err)
          // if possible restart after 5 mins
          // if(!ws_restarted) setTimeout(startfastsendslave, 5*1000*60);

      });

      ws_fastsend.on('close', (err)=>{

          // if possible restart after 5 mins
          setTimeout(startfastsendslave, 5*1000*60);

      });


      ws_fastsend.on('open', function open() {
        ws_fastsend.send(JSON.stringify({type:"HelloMaster", domain:epicbox_domain, port: epicbox_port }));
      });

      ws_fastsend.on('message', function message(data) {
        try{

          let json = JSON.parse(data)

          if(json.type=="FastSendMasterDomain"){

            if(json.domain != epicbox_domain || json.port != epicbox_port) {

              console.error("Not good your FastSend Master domain is diffirent from yours. Master have "+json.domain +" port "+json.port )
              console.log("Must disconnect")
              ws_fastsend.close();

            }

          } else if(json.type=="FastSendMessage"){


                 // check owns connected wallets if could receive this slate
                  wss.clients.forEach(function each(client) {
                          if (client.readyState === 1 && client.queueforsubscribe!=null && client.queueforsubscribe==json.queueforsubscribe) {

                            const db = mongoclient.db(dbName);
                            const collection = db.collection(collectionname);

                            // find message id send without made = false because can be more the same wallet connected .. ????
                            // maybe findOne will be better here
                            collection.find({ messageid: json.uid}).toArray().then((findResult)=>{

                                if(findResult.length>0){

                                    statistics.slatesAttempt = statistics.slatesAttempt + 1
                                    console.log("try check and send ", client.queueforsubscribe)


                                    let fromrabbit =  JSON.parse(findResult[0].payload)
                                    let answer= {}
                                    answer.type="Slate"
                                    answer.from = findResult[0].replyto
                                    answer.str = fromrabbit.str
                                    answer.signature = fromrabbit.signature
                                    answer.challenge = fromrabbit.challenge

                                    let answerstr = null

                                    if(client.epicboxver == "2.0.0"){

                                            let messageid = findResult[0].messageid

                                            answer.epicboxmsgid = messageid
                                            answer.ver = client.epicboxver
                                            answerstr = JSON.stringify(answer)
                                            client.send(answerstr)
                                            console.log("Sent to 2.0.0 ", client.queueforsubscribe)

                                    } else {

                                          answerstr = JSON.stringify(answer)
                                          client.send(answerstr)
                                          console.log("Looks sent to ", client.queueforsubscribe)
                                          collection.updateOne({messageid:findResult[0].messageid, made:false}, {$set:{made:true} }).then((updateResult)=>{

                                          });

                                    }

                                } // end if

                            }) // collection find

                          } //end if

                  }) // end wss.clients

           }


        } catch(err){
          console.error(err)
        }

     });

}



if(fast_send_master) {

    ws_fastsend_master = new WebSocketServer({ port: fast_send_port });

    ws_fastsend_master.on('connection', function connection(ws, req) {

        if(req.headers['x-forwarded-for']) ws.iphere = req.headers['x-forwarded-for'].split(',')[0].trim();
        const ip2 =  req.socket.remoteAddress;

        fast_send_slaves.forEach((slave, index)=>{

            if(ip2!=slave && ws.iphere!=slave) {

              ws.send(JSON.stringify({type:"ERROR",msg:"I don't trust your ip "+ip2+" or "+ws.iphere}))

              console.log("Untrusted ip: "+ip2+"  "+ws.iphere)

              ws.close()

              return;

            } else {

               console.log("Trusted connected ip: "+ip2+"  "+ws.iphere)

            }

        })

        ws.on('error', console.error);

        ws.on('message', function message(data) {

          try{

            let json = JSON.parse(data);

            if(json.type=="FastSendMessage") {

                  // send message about new slate to slaves received from other slave
                  ws_fastsend_master.clients.forEach(function each(client) {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                      client.send(data);
                      console.log("Send message about new slate to slaves received from other slave")
                    }
                  });

                  // check owns connected wallets if could receive this slate
                  wss.clients.forEach(function each(client) {
                          if (client.readyState === 1 && client.queueforsubscribe!=null && client.queueforsubscribe==json.queueforsubscribe) {

                            console.log("Found wallet where need send Slate - Master")

                            const db = mongoclient.db(dbName);
                            const collection = db.collection(collectionname);

                            // find message id send without made = false because can be more the same wallet connected .. ????
                            // maybe findOne will be better here
                            collection.find({ messageid: json.uid}).toArray().then((findResult)=>{

                                if(findResult.length>0){

                                    statistics.slatesAttempt = statistics.slatesAttempt + 1
                                    console.log("try check and send ", client.queueforsubscribe)


                                    let fromrabbit =  JSON.parse(findResult[0].payload)
                                    let answer= {}
                                    answer.type="Slate"
                                    answer.from = findResult[0].replyto
                                    answer.str = fromrabbit.str
                                    answer.signature = fromrabbit.signature
                                    answer.challenge = fromrabbit.challenge

                                    let answerstr = null

                                    if(client.epicboxver == "2.0.0"){

                                            let messageid = findResult[0].messageid

                                            answer.epicboxmsgid = messageid
                                            answer.ver = client.epicboxver
                                            answerstr = JSON.stringify(answer)
                                            client.send(answerstr)
                                            console.log("Sent to 2.0.0 ", client.queueforsubscribe)

                                    } else {

                                          answerstr = JSON.stringify(answer)
                                          client.send(answerstr)
                                          console.log("Looks sent to ", client.queueforsubscribe)
                                          collection.updateOne({messageid:findResult[0].messageid, made:false}, {$set:{made:true} }).then((updateResult)=>{

                                          });

                                    }

                                } // end if

                            }) // collection find

                          } //end if

                  }) // end wss.clients

            } else if (json.type=="HelloMaster"){

                if(json.domain!=epicbox_domain || json.port!=epicbox_port) {

                  ws.send(JSON.stringify({type:"ERROR", msg:"Wrong domain and port. You sent "+json.domain+" port "+json.port+" but correct is "+epicbox_domain +"  port "+epicbox_port}))

                  console.log("Slave sent wrong epicbox domain or port in HelloMaster command")

                  ws.close()

                } else {

                  console.log("Slave sent correct domain and port")
                }

            }


          } catch(err){

            console.log(err)
          }

        });

        ws.send(JSON.stringify({type:"FastSendMasterDomain", domain:epicbox_domain, port: epicbox_port}));
    });

} else {

    startfastsendslave()
}



//
//
// FastSend for many instances udner the same domain ( end code )
//



//
// HTTMl server creation with function for receives requests
// Used by WebSocketServer
//
const server =  createServer(requestListener);


// uncommented WebSocket creation with option for zip messages
/*
const wss = new WebSocketServer({
  //port:  3425,
  server:server,
  perMessageDeflate: {
    zlibDeflateOptions: {
      // See zlib defaults.
      chunkSize: 1024,
      memLevel: 7,
      level: 3
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    // Other options settable:
    clientNoContextTakeover: true, // Defaults to negotiated value.
    serverNoContextTakeover: true, // Defaults to negotiated value.
    serverMaxWindowBits: 10, // Defaults to negotiated value.
    // Below options specified as default values.
    concurrencyLimit: 10, // Limits zlib concurrency for perf.
    threshold: 1024 // Size (in bytes) below which messages
    // should not be compressed if context takeover is disabled.
  }
})*/


//WebSocket creation using HTTML server
const wss = new WebSocketServer({
  server:server,
})

// function pon connectione - run when wallets connect by webscoket to epicbox
wss.on('connection', function connection(ws, req) {

  statistics.connectionsInHour = statistics.connectionsInHour+1;

  ws.uid = uid(5);
  ws.epicboxver = null;
  ws.iphere =  null;
  // it is taken from nginx
  if(req.headers['x-forwarded-for']) ws.iphere = req.headers['x-forwarded-for'].split(',')[0].trim();
  const ip2 =  req.socket.remoteAddress;

  console.log(`[${new Date().toLocaleTimeString()}] [${ws.uid}] Connection from ip `, ws.iphere, " nginx/firewall ", ip2)

  ws.queueforsubscribe = null

  ws.on('close', (code, reason)=>{

     try {

        if(ws.queueforsubscribe!=null) {
            console.log(`[${ws.uid}]`," Socket close for ", ws.queueforsubscribe)
            ws.queueforsubscribe = null;
        }
        console.log( `[${new Date().toLocaleTimeString()}] Close by code: `, code, " and reason ", reason.toString())

      } catch(err){
        console.error(err)
      }

  })

  ws.on('error', (errws) =>{
    console.error(errws)
    try {

      if(ws.queueforsubscribe!=null) {
        ws.queueforsubscribe = null;
      }

    } catch(err){
      console.error(err)
    }
  });


  //
  //  Standard method send by wallets or by epicboxes to epicbox
  //  one Made is added for receive accept from wallets ( epicbox 2.0.0 suggestion )
  //
  ws.on('message', function message(data) {

   // console.log('received: %s', data)
    try{
      if(data.toString()=="ping") { ws.send("pong"); /*console.log("ping");*/ return; }
      if(data.toString()=="pong") {ws.send("ping"); /*console.log("pong");*/return; }
   	  let json=JSON.parse(data)

       if(json.type=="Challenge") {
         console.log(json)
         console.log('[%s][%s] -> [%s] send return [%s]', new Date().toLocaleTimeString(), ws.iphere, "Challenge", challenge) 
        // remove for less move on internet, because Challenge is send automatic in interval but old wallets maybe need it
         ws.send(JSON.stringify({"type": "Challenge","str": challenge}))

       } else if(json.type=="Subscribe") {
           console.log(json)
           console.log('[%s][%s] -> [%s]', new Date().toLocaleTimeString(), ws.iphere, "Subscribe")
           subscribe(ws, json)
       } else if(json.type=="Unsubscribe") {
           console.log(json)
           console.log('[%s][%s] -> [%s]', new Date().toLocaleTimeString(), ws.iphere, "Unsubscribe")
           unsubscribe(ws, json)
       } else if(json.type=="PostSlate"){
          console.log('[%s][%s] -> [%s]', new Date().toLocaleTimeString(), ws.iphere, "PostSlate")
          postslate(ws, json)
       } else if(json.type=="Made"){
          console.log('[%s][%s] -> [%s]', new Date().toLocaleTimeString(), ws.iphere, "Made")
          made(ws, json)

       } else if(json.type=="GetVersion"){
          console.log('[%s][%s] -> [%s]', new Date().toLocaleTimeString(), ws.iphere, "GetVersion")
          let st = JSON.stringify({type:"GetVersion", str:protver})
          console.log(st)
          ws.send(JSON.stringify({type:"GetVersion", str:protver}))

       } else if(json.type=="FastSend"){
          console.log('[%s][%s] -> [%s]', new Date().toLocaleTimeString(), ws.iphere, "GetVersion")
          fastsend(ws)

       } else console.log('received: %s', data);

    } catch(err){

    }

  });

  // here we send Challenge to wallet or other epicbox when connected

  let jsonhello = {"type":"Challenge","str":challenge}

  ws.send(JSON.stringify(jsonhello));

});


//
// Start fast send for 5 seconds
//

async function fastsend(ws){

  ws.fastsendcounter = 0;

  ws.fastsendInterval = setInterval(function(){

    ws.send(JSON.stringify({type:"FastSend"}));
    ws.fastsendcounter = ws.fastsendcounter + 1;
    if(ws.fastsendcounter>fast_send_repeats) {

      ws.fastsendcounter = 0;
      clearInterval(ws.fastsendInterval);
    }

  }, fast_send_repeat_interval_ms);


}

//
// Subscribe function run when wallet send Subscribe message
//
async function subscribe(ws, json){
  console.log(`[${ws.uid}]`," subscribe ", json.address)

  try{

   // check if wallet wants use ver 2.0.0
   if(json.hasOwnProperty("ver") && json.ver=="2.0.0") ws.epicboxver = "2.0.0";


   // start check using externally rust program for verify signature send from wallet
   const child = execFile(pathtoepicboxlib, ["verifysignature", json.address , challenge, json.signature], (error, stdout, stderr) => {
     if (error) {
        throw error;
     }

     var isTrueSet = (stdout === 'true');

     // if sugnature is OK
     if(isTrueSet) {



// for backward for older wallets
/*
 try {

                const db = mongoclient.db(dbName);
                const collection = db.collection(collectionname);

               // find message id send in Made message from vallet
               collection.find({ queue: json.address, made: false}).sort({ "createdat" : 1 }).limit(1).toArray().then((findResult)=>{


                   if(findResult.length>0) {

                      statistics.slatesAttempt = statistics.slatesAttempt + 1
                      console.log("try check and send from subscribe for  ", json.address)


                      let fromrabbit =  JSON.parse(findResult[0].payload)
                      let answer= {}
                      answer.type="Slate"
                      answer.from = findResult[0].replyto
                      answer.str = fromrabbit.str
                      answer.signature = fromrabbit.signature
                      answer.challenge = fromrabbit.challenge

                      let answerstr = null

                      if(ws.epicboxver == "2.0.0"){

                              let messageid = findResult[0].messageid

                              answer.epicboxmsgid = messageid
                              answer.ver = ws.epicboxver
                              answerstr = JSON.stringify(answer)
                              ws.send(answerstr)
                              console.log("Sent to 2.0.0 ", json.address)

                      } else {

                            answerstr = JSON.stringify(answer)
                            ws.send(answerstr)
                            console.log("Looks sent to ", json.address)
                            collection.updateOne({messageid:findResult[0].messageid, made:false}, {$set:{made:true} }).then((updateResult)=>{


                            });

                      }


                    } else {
                      // console.log("msgrabbit ", msgrabbit)
                      //console.log("Error ", err)
                    }


               });

        } catch(err){
          console.log(err)
        }

*/
// and for backward for older wallets



           statistics.subscribeInHour = statistics.subscribeInHour+1
           if(ws.epicboxver) console.log(ws.epicboxver)
           // here we store address of wallet which is queue in RabbitMq
           ws.queueforsubscribe = json.address

           ws.send(JSON.stringify({type:"Ok"}))

     } else {
      console.log("Signature error")
      ws.send(JSON.stringify({type:"Error", kind:"signature error", description:"Signature error"}))
     }
   });

 } catch(err){
        console.log(err)
	      ws.send(JSON.stringify({type:"Error", kind:"signature error", description:"Signature error"}))
  }
}


//
// run when wallet sent Unsuscribe Message
//
async function unsubscribe(ws, json){

  try{

    ws.queueforsubscribe = null;

    // fast send Ok message to wallet, because unsubscribe rather always without error
    ws.send(JSON.stringify({type:"Ok"})); //return;

  } catch(e) {
    console.log(e)
  }

}


//
// Run when wallet or other epicbox want send to epicbox Slate
// it can send to other epicbox when to address domain is differnet when our epicbox domain
//
async function postslate(ws, json){

  try {
     console.log("postslate from ", json.from, "to ", json.to)

   let from = json.from.split('@')
   from  = from[0]

   // use externally rust program to verify addresses - it is the same which is used to verify signatures
   const childadd = execFile(pathtoepicboxlib, ['verifyaddress',  json.from, json.to], (erroradr, stdoutadr, stderradr) => {
    if(erroradr){
    	throw erroradr
    }

    var isTrueSetadr = (stdoutadr === 'true');

    if(isTrueSetadr) {

     // use rust program to verify signatures
     const child = execFile(pathtoepicboxlib, ["verifysignature", from , json.str, json.signature], (error, stdout, stderr) => {

       if (error) {
          throw error;
       }

       var isTrueSet = (stdout === 'true');


       if(isTrueSet) {

           statistics.slatesReceivedInHour = statistics.slatesReceivedInHour + 1
           preparePostSlate(ws, json, "")

       } else {

             // check again signatures --- why ? it is rather never used, but it is in orginal rust code.
             const child2 = execFile(pathtoepicboxlib, ["verifysignature", from , challenge, json.signature], (error, stdout, stderr) => {

                 var isTrueSet2 = (stdout === 'true');
                 if(isTrueSet2){

                   statistics.slatesReceivedInHour = statistics.slatesReceivedInHour + 1
                   preparePostSlate(ws, json, challenge);

                  } else {
                   ws.send(JSON.stringify({type:"Error", kind:"postslate error", description:"PostSlate error"}))
                 }
             })
       }

    })

    }  else {
                 ws.send(JSON.stringify({type:"Error", kind:"postslate error", description:"PostSlate Addresses error"}))

    }
   })


  } catch(err){
    console.error("postslate ", err)
    ws.send(JSON.stringify({type:"Error", kind:"postslate error", description:"PostSlate error"}))

  }

}



//
// run only for wallets used ver 2.0.0
// for standard wallets never used
// it say by message Made that slate was received and correct made in wallet
// then epicbox can remove Slate from RabbotMq and message id from mongodb
//
function made(ws, json){

  console.log(json);

  try {

    if(json.hasOwnProperty("epicboxmsgid") && ws.epicboxver=="2.0.0" && json.hasOwnProperty("ver") && json.ver=="2.0.0"){


     // check signature by externally rust app
     const child = execFile(pathtoepicboxlib, ["verifysignature", json.address , challenge, json.signature], (error, stdout, stderr) => {
         if (error) {
            throw error;
         }

         var isTrueSet = (stdout === 'true');

         if(isTrueSet) {

             console.log("Made signature OK")

             const db = mongoclient.db(dbName);
             const collection = db.collection(collectionname);
             console.log("Update for ", json.epicboxmsgid)
             collection.updateOne({messageid:json.epicboxmsgid, made:false}, {$set:{made:true}}).then((updateResult)=>{

                  console.log("make update result ", updateResult)

                  //ws.send(JSON.stringify({type:"Ok"}))

             }).catch(console.error)

        }

      });


    }

 } catch( err ){

    console.log(err)
 }

}



//
// run from postslate or forpostpostslat
// prepare received Slate for store in RabbitMq or send to other epicbox if domain of to address is different from this epicbox domain
//
function  preparePostSlate(ws, json, chall){

     let str = JSON.parse(json.str)
     let addressto= {}
     addressto.publicKey = str.destination.public_key
     addressto.domain = str.destination.domain
     addressto.port = str.destination.port
     if(addressto.port==null ) addressto.port = 443; else addressto.port = Number(addressto.port);

     if(addressto.domain==epicbox_domain && addressto.port===epicbox_port){

            let signed_payload = {str: json.str, challenge: chall, signature: json.signature}
            signed_payload = JSON.stringify(signed_payload)

            let buf = Buffer.from(signed_payload)
            let epicboxreplyto = json.from


            const db = mongoclient.db(dbName);
            const collection = db.collection(collectionname);


            // here insert slate to mongo - here is added messageId which is used in ver. 2.0.0

            let newuid = uid(32)

            collection.insertOne({ queue:addressto.publicKey, made:false, payload:buf, replyto: epicboxreplyto, createdat: new Date(), expiration:86400000, messageid:newuid  }).then((insertResult)=>{

                  ws.send(JSON.stringify({type:"Ok"}));

                  // for many instances in one domain
                  if(fast_send_master) {

                        try{
                          // send a message about new slate to my slaves
                          ws_fastsend_master.clients.forEach(function each(client) {
                            if (client.readyState === WebSocket.OPEN) {
                              client.send(JSON.stringify({type:"FastSendMessage", uid:newuid, queueforsubscribe: addressto.publicKey }));
                              console.log("Send FastSendMessage to slave ...")
                            }
                          });

                         } catch(errtoslaves){

                            //console.log(errtoslaves)
                         }


                  } else {

                          // I am only slave and must send a message to master

                         try{

                            ws_fastsend.send(JSON.stringify({type:"FastSendMessage", uid:newuid, queueforsubscribe: addressto.publicKey }))
                            console.log("Send FastSendMessage to Master ...")

                          } catch(errtomaster){

                            //console.log(errtomaster)
                          }

                  }
                  // end for many instances in one domain

                  // fast send if only one slate in database

                  // find message id send in Made message from vallet
                  collection.find({ queue: addressto.publicKey, made: false}).sort({ "createdat" : 1 }).toArray().then((findResult)=>{

                    if(findResult.length==1){


                      wss.clients.forEach(function each(client) {
                          if (client.readyState === 1 && client.queueforsubscribe!=null && client.queueforsubscribe==addressto.publicKey) {



                              statistics.slatesAttempt = statistics.slatesAttempt + 1
                              console.log("try check and send ", client.queueforsubscribe)


                              let fromrabbit =  JSON.parse(findResult[0].payload)
                              let answer= {}
                              answer.type="Slate"
                              answer.from = findResult[0].replyto
                              answer.str = fromrabbit.str
                              answer.signature = fromrabbit.signature
                              answer.challenge = fromrabbit.challenge

                              let answerstr = null

                              if(client.epicboxver == "2.0.0"){

                                      let messageid = findResult[0].messageid

                                      answer.epicboxmsgid = messageid
                                      answer.ver = client.epicboxver
                                      answerstr = JSON.stringify(answer)
                                      client.send(answerstr)
                                      console.log("Sent to 2.0.0 ", client.queueforsubscribe)

                              } else {

                                    answerstr = JSON.stringify(answer)
                                    client.send(answerstr)
                                    console.log("Looks sent to ", client.queueforsubscribe)
                                    collection.updateOne({messageid:findResult[0].messageid, made:false}, {$set:{made:true} }).then((updateResult)=>{


                                    });

                              }

                          }
                      })

                    }

                  })

            }).catch((err)=>{

              ws.send(JSON.stringify({type:"Error", kind:"Slate send error", description:"Slate problem"}))
              console.error(err)

            })

      } else {
        // connect by wss to other epicbox
        // when received Challange send by Message PostSlate Slate received from wallet.
        //
        //
		    sock = new WebSocket("wss://"+addressto.domain+":"+addressto.port)
        sock.on('error', console.error)
        sock.on('open', ()=>{console.log("Connect "+addressto.domain+":"+addressto.port)})
        sock.on('message',(mes)=>{
                	try{
				                ames = JSON.parse(mes)
                        if(ames.type=="Challenge") {
                            let reqqq = {type:"PostSlate", from:json.from, to:json.to, str:json.str, signature:json.signature}
                            sock.send(JSON.stringify(reqqq))

                            fs.writeFile('./test51pool.txt', JSON.stringify(reqqq), err => {
                              if (err) {
                                console.error(err);
                              }
                              // file written successfully
                            });

                            console.log("Send to wss://"+addressto.domain+":"+addressto.port)
			                  }
                        if(ames.type=="Ok") {
                          statistics.slatesRelayedInHour = statistics.slatesRelayedInHour + 1
                          console.log("Sent correct to wss://"+addressto.domain+":"+addressto.port)
                          ws.send(JSON.stringify({type:"Ok"}));
                        }
                  } catch(ee){
                      console.error(ee)
                      ws.send(JSON.stringify({type:"Error", kind:"Slate send error remote server", description:"Slate problem remote server"}));
                  }
        })
      }

}


//
//  function warking in interval repeted in 3 sec. after finish loop
//  it check all connected websockets to epicbox and if they are in Subscribe mode check if new Slate are waitng for it
//  if new slate is ... when send it.
//  check if wallet use 2.0.0 version
//
function forInterval(){

    clearInterval(interval)

    let foractiveconnections = 0

    wss.clients.forEach(function each(client) {
      if (client.readyState === 1 && client.queueforsubscribe!=null) {
        foractiveconnections = foractiveconnections + 1
        //console.log("Checking ", client.queueforsubscribe)
        try {

                const db = mongoclient.db(dbName);
                const collection = db.collection(collectionname);

               // find message id send in Made message from vallet
               collection.find({ queue: client.queueforsubscribe, made: false}).sort({ "createdat" : 1 }).limit(1).toArray().then((findResult)=>{


                   if(findResult.length>0) {

                      statistics.slatesAttempt = statistics.slatesAttempt + 1
                      console.log("try check and send ", client.queueforsubscribe)


                      let fromrabbit =  JSON.parse(findResult[0].payload)
                      let answer= {}
                      answer.type="Slate"
                      answer.from = findResult[0].replyto
                      answer.str = fromrabbit.str
                      answer.signature = fromrabbit.signature
                      answer.challenge = fromrabbit.challenge

                      let answerstr = null

                      if(client.epicboxver == "2.0.0"){

                              let messageid = findResult[0].messageid

                              answer.epicboxmsgid = messageid
                              answer.ver = client.epicboxver
                              answerstr = JSON.stringify(answer)
                              client.send(answerstr)
                              console.log("Sent to 2.0.0 ", client.queueforsubscribe)

                      } else {

                            answerstr = JSON.stringify(answer)
                            client.send(answerstr)
                            console.log("Looks sent to ", client.queueforsubscribe)
                            collection.updateOne({messageid:findResult[0].messageid, made:false}, {$set:{made:true} }).then((updateResult)=>{

                            });

                      }

                    } else {
                      // console.log("msgrabbit ", msgrabbit)
                      //console.log("Error ", err)
                    }

               });

        } catch(err) {
          console.log(err)
        }
      }

    });

    statistics.activeconnections = foractiveconnections

    interval = setInterval( forInterval, intervalperiod);

}


function forIntervalChallenge(){

    console.log("Challenge Interval")

    wss.clients.forEach(function each(client) {
      if (client.readyState === 1 && client.queueforsubscribe!=null && client.epicboxver == "2.0.0") {

          try{

            client.send(JSON.stringify({"type": "Challenge","str": challenge}))

          } catch(err){

            console.log("Send Interval challenge error ", err)
          }
      }

    });

}



// must be replice
let changeStream;
async function run() {
  try {

    const db = mongoclient.db(dbName);
    const collection = db.collection(collectionname);

    // Open a Change Stream on the "haikus" collection
    changeStream = collection.watch();
    // Print change events
    for await (const change of changeStream) {
      console.log("Received change:\n", change);
    }
    await changeStream.close();

  } finally {
    console.log("End")
  }
}


//
// main starting function
//
async function main() {

  await mongoclient.connect();
  console.log('Connected successfully to mongo');

  //run().catch(console.log);

  server.listen(localepicboxserviceport)

  interval = setInterval( forInterval, 2000);
  
  setInterval(forIntervalChallenge, 1*60*1000); // 60 sec

  return "Epicbox ready to work.";

}


// We are using this single function to handle multiple signals
function handle(signal) {
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


main()
  .then(console.log)
  .catch(console.error)

// That's all
// It is one day created software and seven days finding bugs :)))
// If you has suggestion or something is starnge for you simple ask me on keybase or telegram
// Thank you for reading. Sorry my English.

