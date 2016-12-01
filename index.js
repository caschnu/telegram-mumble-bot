var config = require('./config');
var express = require('express');
var bodyParser = require('body-parser');
var TelegramBot = require('telegrambot');
var Mumble = require('mumble');
var http = require('http');
var fs = require('fs');
const BOTNAME = 'gemumble_bot';
const IDLESUBCHANNELS = '2edgy4u';
const AFKCHANNEL = 'AFKnast';
var idleCount = 0;

// TELEGRAM SETUP
var api = new TelegramBot(config.TELEGRAM_TOKEN);
api.setWebhook({url: config.WEBHOOK_BASE_URL+config.WEBHOOK_PATH}, function(err, message) {
  if (err) {
    console.log(err);
  } else {
    console.log('Telegram webhook set');
  }
});

// MUMBLE SETUP
var options = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
};
var mumbleClient;
Mumble.connect(config.MUMBLE_URL, options, function(error, client) {
  if (error) {
    console.log(error);
    return;
  }
  console.log('Connected to Mumble.');
  mumbleClient = client;
  client.authenticate(config.MUMBLE_USER, config.MUMBLE_PASSWORD);
  client.on('initialized', onInit);
  client.on('user-connect', onUserConnected);
  client.on('user-disconnect', onUserDisconnected);
  client.on('message', onMessage);
  client.on('error', onError);
});

// SERVER SETUP
var app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('./'));
app.get('/', function status(req, res, next) {
  res.json({ status: 'UP' });
});
app.post(config.WEBHOOK_PATH, function(req, res) {
  if (!req.hasOwnProperty('body')) {
    return res.send();
  }
  var body = req.body;
  if (body.hasOwnProperty('message')) {
    readCommand(body.message);
  }
  res.send();
});
var server = app.listen(config.SERVER_PORT, function () {
  var host = server.address().address;
  var port = server.address().port;
  console.log('Server listening at http://%s:%s', host, port);
});

var readCommand = function(message) {
  console.log('Reading command...');
  console.log(message);
  if (message) {
    if (message.text !== undefined) {
      if (message.text === '/start') {
        api.sendMessage({ chat_id: message.chat.id, text: 'All that is gold does not glitter, not all those wo wander are lost!' }, function (err, message) {
          if (err) {
            console.log(err);
          }
        });
      } else if (message.text.startsWith('/gemumble@gemumble_bot')) {
        console.log('client ready?'+mumbleClient.ready);
        if (mumbleClient.ready) {
		  	postUserGroups(message.chat.id);
        }
      } else if (message.text === '/info@gemumble_bot') {
      api.sendMessage({ chat_id: message.chat.id, text: 'Die Mumbissbude läuft auf dem Server: norom.xyz Port: 64738)' }, function (err, message) {
          if (err) {
            console.log(err);
          }
        });
      } else if (message.text === '/help@gemumble_bot') {
      api.sendMessage({ chat_id: message.chat.id, text: 'Der gemumble-bot verrät sowohl die Zugangsdaten zum pp-mumble als auch die Nutzernamen der verfügbaren WG-Mitglieder. Originally written by yagop, forked & modified by @willowfield and uploaded with love <3' }, function (err, message) {
          if (err) {
            console.log(err);
          }
        });
      }
    }  else {
      console.log('Message text missing');
    }
  } else {
    console.log('Message missing');
  }
};


var postUserGroups = function(chatId){
	var responseText = getUsersOnlineCountString(':');
	if(usersList.length > 1){
		responseText += '\n';
	}
	idleCount = 0;
	responseText = searchUserGroups(responseText, mumbleClient.rootChannel);
	if(idleCount === 1){
		responseText += 'Es lungert eine Person afk herum.';
	}
	else if(idleCount > 1) {
		responseText += 'Es lungern ' + idleCount + ' Personen afk herum.';
	}
	
    api.sendMessage({ chat_id: chatId, text: responseText }, function (err, message) {
      if (err) {
        console.log(err);
      }
    });
};

/**
* Recursivly searches all subchannels from a given channel and appends all not empty channels with their containing users to a given groupString which is returned. 
* The channels are traversed (and outputted) in pre-order.
*/
var searchUserGroups = function(groupString, channel) {
	// the root-channel, the AFKnast-channel and empty channels will not be printed out
	if(channel !== mumbleClient.rootChannel && channel.name !== AFKCHANNEL && channel.users.length > 0){
		// distinguish between normal and idle channels.
		if (channel.name !== IDLESUBCHANNELS){
			groupString += channel.name + ':\n';
			for (var i = 0, len = channel.users.length; i < len; i++){
				groupString += '    ' + channel.users[i].name + '\n';
			}
		}
		else{
			// the 2edgy4u-channels will not show up as own channels.
			// users in the 2edgy4u channels will only appear as '(username)' in the parent channel
			for (var j = 0, len1 = channel.users.length; j < len1; j++){
				groupString += '    (' + channel.users[j].name + ')\n';
			}
		}
	}
	else {
		for (var k = 0, len2 = channel.users.length; k < len2; k++){
			if(channel.users[k].name !== BOTNAME){
				idleCount += 1;
			}
		}
	}
	// traverse all subchannels
	for (var l = 0, len3 = channel.children.length; l < len3; l++){
		groupString = searchUserGroups(groupString, channel.children[l]);
	} 
	return groupString;
};


var postConnectedUsersMessage = function(chatId) {
  var responseText = getUsersOnlineCountString(':\n');
  usersList.forEach(function(user) {
	if (user.name !== BOTNAME) {
      responseText += user.name + '\n';
    }
  });
  api.sendMessage({ chat_id: chatId, text: responseText }, function (err, message) {
    if (err) {
      console.log(err);
    }
  });
};

/**
* Just gives a string of the format 'Es sind jetzt x WG-Mitglieder online' with x the number of users online not including this bot. The text is appended with a given endOfLine string, which can be a punctuation character or a CRLF.
*/
var getUsersOnlineCountString = function(endOfLine){
	if(usersList.length === 1){
		return 'Es ist gerade kein WG-Mitglied online.';
	} 
	else if (usersList.length === 2){
		return 'Es ist gerade nur ein WG-Mitglied  #ForEverAlone online' + endOfLine;
	}
	else{
		return 'Es sind jetzt ' + (usersList.length - 1) + ' WG-Mitglieder online' + endOfLine;
	}
	
};

// MUMBLE LISTENER FUNCTIONS
var usersList = [];
var onInit = function() {
  console.log('Mumble connection initialized');
  usersList = mumbleClient.users();
  postConnectedUsersMessage(config.TELEGRAM_CHAT_ID);
};

var onUserConnected = function(user) {
  console.log(user.name + ' connected');
  usersList.push(user);
  console.log('Current users list:');
  usersList.forEach(function(user) {
    console.log(user.name + '\n');
  });
  var messageText = user.name + ' ist jetzt online!\n' + getUsersOnlineCountString('!');
  api.sendMessage({ chat_id: config.TELEGRAM_CHANNEL_ID, text: messageText }, function (err, message) {
    if (err) {
      console.log(err);
    }
  });
};

var onUserDisconnected = function(userDisconnected) {
  console.log(userDisconnected.name + ' disconnected');
  usersList = usersList.filter(function(user) {
    return user.name != userDisconnected.name;
  });
  console.log('Current users list:');
  usersList.forEach(function(user) {
    console.log(user.name);
  });
  var messageText = userDisconnected.name + ' ist jetzt offline!\n' + getUsersOnlineCountString('!');
  api.sendMessage({ chat_id: config.TELEGRAM_CHANNEL_ID, text: messageText }, function (err, message) {
    if (err) {
      console.log(err);
    }
  });
};

 var onMessage = function (message, user) {
  console.log('Mumble message received');
  console.log(user.name + ' : ' + message);
  api.sendMessage({ chat_id: config.TELEGRAM_CHANNEL_ID, text: user.name + ' : ' + message }, function (err, message) {
    if (err) {
      console.log(err);
    }
  });
};

var onError = function (error) {
  console.log('Mumble error:');
  console.log(error);
   api.sendMessage({ chat_id: config.TELEGRAM_CHANNEL_ID, text: 'ERROR: ' + error }, function (err, message) {
     if (err) {
       console.log(err);
     }
   });
};
