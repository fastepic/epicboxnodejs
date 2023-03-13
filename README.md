# epicboxnodejs
Epicbox version on nodejs with elements of rust and adopt changes in epicbox protocole

## Setup
- install rust ver 1.6
* you must have working one instance RabbitMQ
+ RabbitMQ Plugin stomp (https://www.rabbitmq.com/stomp.html) rabbitmq
+ change ports and paths in app.js file, try read description to understand how it works

## Compilation epicboxlib
- go to epicboxlib folder
+ run cargo update
+ run cargo build --release
+ if problems install all libraries which need epic-wallet setup - look at github EpicCash epic-wallet

## Prepare nodejs
- return to main folder where is package.json file
+ use nodejs v18.14.2 ( use it ) ( mvw can help: mvn use v18.14.2 )
+ node update

## Start epicbox
+ node app

## Nginx setup example ( you can do it like you prefer )

>server {
>  
>  # here your correct port on which listen your nginx
>  listen 10000 ssl;
>  server_name epicbox.fastepic.eu;
>
>
>  ssl_certificate           pathtoyourkeys/fullchain.pem;
>  ssl_certificate_key       pathtoyourkeys/privkey.pem;
>
>  ssl_session_cache  builtin:1000  shared:SSL:10m;
>  ssl_protocols  TLSv1 TLSv1.1 TLSv1.2;
>
>  ssl_prefer_server_ciphers on;
>
>  ssl_ciphers ECDH+AESGCM:ECDH+AES256:ECDH+AES128:DHE+AES128:!ADH:!AECDH:!MD5;
>
>  ssl_dhparam pathtoyourdh/dhparam.pem;
>
>
>        location / {
>           
>           limit_req zone=mylimit burst=20 nodelay;
>
>           proxy_set_header        Host $host;
>           proxy_set_header        X-Real-IP $remote_addr;
>           proxy_set_header        X-Forwarded-For $proxy_add_x_forwarded_for;
>           proxy_set_header        X-Forwarded-Proto $scheme;                     
>           proxy_pass http://epicbox; 
>         proxy_read_timeout  1h;
>          # proxy_connect_timeout 20;
>          # proxy_send_timeout 20; 
>           
>           # WebSocket support
>           proxy_http_version 1.1;
>           proxy_set_header Upgrade $http_upgrade;
>           proxy_set_header Connection "upgrade"; 
>       }
>
>}



