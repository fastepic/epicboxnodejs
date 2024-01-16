# epicboxnodejs
Epicbox Relay Server created with nodejs containing elements of rust, fast send, and updated epicbox protocol.

Added app_mongo_many.js to run multiple instances under one domain. Each instance needs to use the same mongo database, and all instances use the fastsend method.
For fastsend method only one instance must have config_many.json set with fast_send_master=true, slave IPs must be set in array fast_send_slaves.
All instances must have the same epicbox domain and epicbox port set.

The instance with fast_send_master = true can work like a single epicbox ( like app_mongo.js ).

For each instance you must use a different config_many.json file ( set other local port, or fast_send_master = false etc. ) so to run epicbox use command:

node app_mongo_many.js config_many.json

And for the next one:

node app_mongo_many.js config_many_slave1.json

Enjoy.
