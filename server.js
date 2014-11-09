var express = require('express');
var bodyParser = require('body-parser')
var app = express();

app.use(bodyParser());

if (!module.parent) {
  app.listen(3000);

  console.log('Express started on port 3000');
}
//======================================================
//=================SET UP WEBSOCKETS====================
//======================================================
var Server = require('socket.io');
var io = new Server();

io.on('connection', function(socket){
  console.log('a user connected');
});

// io.on('connection', function(socket){
//   socket.on('chat message', function(msg){
//     io.emit('chat message', msg);
//   });
// });


//======================================================
//===============CONNECT TO DATA BASE===================
//======================================================
var mongoose = require('mongoose');
mongoose.connect('mongodb://dansakidavid:cloudcom@ds051960.mongolab.com:51960/cloudcommuting');

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function callback () {
  console.log("Database Connected")
});

//======================================================
//===============SET UP DATABASE SCHEMES================
//======================================================
var Schema = mongoose.Schema;

var stationSchema = Schema({
  stationId : Number,
  inventory: {type: Number, default: 0}
  //currentPointsOffered: Number
});

var playerSchema = Schema({     
  playerId : Number,
  points: { type: Number, default: 0  },
  stock: {type: Boolean, default: false}
});  

// var checkInSchema = Schema({
//   playerID: Number,
//   stationId: Number,
//   pickUpDropOff: Boolean,
//   time: Date
// })    

var Station = mongoose.model('Station', stationSchema);
var Player = mongoose.model('Player', playerSchema);

//======================================================
//====================SET UP ROUTES=====================
//======================================================

var stationBonus= [];        //array of allstations bonuses
var stationBonusOn = [];
var allPlayersData = [];           //var to locally store updated player data
var allStationsData = [];          //var to locally store updated station data
var numPlayers = 8;
var numStations = 5;
//bonus set up
for (var i = 0; i<numStations; i++){
  stationBonus.push(0);
  stationBonusOn.push(false);
}  

var Station = mongoose.model('Station', stationSchema);
var Player = mongoose.model('Player', playerSchema);


app.get('/', function(req, res) {
    res.send('Hello World');
});


//this is the route the station Yun calls when a player drops off or picks up

app.get('/station/:stationId/player/:playerId/', function(req, res) {
  //checks station status and send user an alert
  var stationId = req.params.stationId;  // station Number
  var playerId = req.params.playerId;

  var checkInData = [playerId,stationId];
  io.sockets.emit( 'playerCheckIn', checkInData);    //send to player client on phone stationID + playerStock
});
//this is the route to the players individualized status page

// app.get('/:playerID', function(req, res){
//     var playerID = req.params[0];
//     req.render(
//     {
//         playerID : playerid
//     });
// });

//{{playerID}}

app.get('/addStation/:stationId', function(req, res){
    var stationId = req.params.stationId;
    console.log(stationId);
    var newStation = new Station();
    newStation.stationId = stationId;
    newStation.save();
    console.log("Station " + stationId + " created.");
});

app.get('/stationsUpdate', function(req, res){
  stationsUpdate();
    //console.log(allStationsData);
});
app.get('/addPlayer/:playerId', function(req, res){
    var playerId = req.params.playerId;
    console.log(playerId);
    var newPlayer = new Player();
    newPlayer.playerId = playerId;
    newPlayer.save();
    console.log("Player " + playerId + " created.");
});
app.get('/playersUpdate', function(req, res){
  playersUpdate();
    //console.log(allStationsData);
});
app.get('/resetGame', function(req, res){
  resetGame();
    //console.log(allStationsData);
});





//How we calcuate how many points players get for dropping off and picking up

var calcDropOffPoints = function(inventory, bonus){
  var pointsEarned = 0;
  switch(inventory) {
      case 0:
          pointsEarned = 25 + bonus;   //figure out the bonus
          break;
      case 1:
          pointsEarned = 25;
          break;
      case 2:
          pointsEarned = 15;
          break;
      case 3:
          pointsEarned = 5;
          break;
      case 4:
          pointsEarned = 0;           //figure out this
          break;  
      default:
         pointsEarned = 45;
         break;  //not
  }
  return pointsEarned;
}

var calcPickUpPoints = function(inventory, bonus){
  var pointsEarned = 0;
  switch(inventory) {
      case 0:
          pointsEarned = 0;      //figure out this
          break;
      case 1:
          pointsEarned = 5;
          break;
      case 2:
          pointsEarned = 10;
          break;
      case 3:
          pointsEarned = 25 ;
          break;
      case 4:
          pointsEarned = 25 + bonus;   //figure out the bonus
          break;  
      default:
          pointsEarned = 45;
          break;   //not
  }
  return pointsEarned;
}

//update Local player and station data to send to Client

var playersUpdate = function(){
 for (var i = 0; i < numPlayers; i++ ){
    thisPlayer = [];
    Player.findOne({ 'playerId': i }, function (err, player) {
        if (err) return handleError(err);
        thisPlayer.push(player.playerId);
        thisPlayer.push(player.points);
         thisPlayer.push(player.stock);
        allPlayersData.push(thisPlayer);
        thisPlayer = [];
    });
  }
  console.log(allPlayersData);
 io.sockets.emit( 'playerUpdate', allPlayersData);     // every player and their points
 allPlayersData = [];
}

var stationsUpdate = function(){
  //allStationsData = [];
  for (var i = 0; i < numStations; i++ ){
    thisStation = [];
    Station.findOne({ 'stationId': i }, function (err, station) {
        if (err) return handleError(err);
        thisStation.push(station.stationId);     //allStationData[i][0] = station ID
        thisStation.push(station.inventory);     //allStationData[i][1] = station Inventory
        thisStation.push(stationBonusOn[station.stationId]);
        thisStation.push(stationBonus[station.stationId]);  
        allStationsData.push(thisStation); 
        thisStation = [];                       //allStationData[i][3] = station Bonus Amount
    });
    if (i == numStations-1){
     console.log(allStationsData);
     io.sockets.emit('stationUpdate', allStationsData);    // every station and its inventory  
     allStationsData = [];
    }
  }
}

//this should be called every 5 sec or so
var bonusUpdate = function(){
  for (var i = 0; i<numStations; i++){
    if (stationBonusOn[i] == false){
        if (allStationsData[i][1] == 0 || allStationsData[i][1] == 5){
          stationBonusOn[i] = true;
        }else{
          stationBonusOn[i] = false;
        }
    }else{
        stationBonus[i] = stationBonus[i] + numPlayers;
        for (var j = 0; j<numPlayers; j++){
          Player.findOne({ 'playerId': j }, function (err, player) {
            if (err) return handleError(err);
            player.points = player.points - 1;
            player.save();
          });
      }
    }
  }
 console.log(stationBonus);
}


setInterval(bonusUpdate, 10000);


var resetGame = function(){
  stationBonus= [];        //array of allstations bonuses
  stationBonusOn = [];
  allPlayersData = [];           //var to locally store updated player data
  allStationsData = [];          //var to locally store updated station data
  //bonus set up
  for (var i = 0; i<numStations; i++){
    stationBonus.push(0);
    stationBonusOn.push(false);
  }  
  for (var i = 0; i<numPlayers; i++){
    Player.findOne({ 'playerId': i}, function (err, player) {
            if (err) return handleError(err);
            player.stock = false;
            player.points = 0;
            player.save();
    });
  };
  for (var i = 0; i<numStations; i++){
    Station.findOne({ 'stationId': i }, function (err, station) {
            if (err) return handleError(err);
            station.inventory = 0;
            station.save();
    });
  };
  stationsUpdate();
  playersUpdate();
}




//checkin Listener
//this socket waits for client to respond 
//data comes back false if station is full/player is dropping off or empty/player is pickingup or player says NO
io.sockets.on('checkInConfirm', function(data){  
  var stockChange;  // -1 or 1, drop off or pickup //figure
  var pointChange = 0;
  var checkIn = Boolean;
  //data  = [ false , playerId, stationId ];
  if (data[0] == true){
    var playerId = data[1];
    var stationId = data[2];
    Station.findOne({ 'stationId': stationId}, function (err, station) {
      if (err) return handleError(err);
       Player.findOne({ 'playerId': playerId }, function (err, player) {
          if (err) return handleError(err);
          if (player.stock == true) stockChange= -1;
          if (player.stock == false) stockChange = 1;
       })
      station.inventory = station.inventory + stockChange;
      if (stockChange<0) pointChange = calcPickUpPoints(station.inventory, stationBonus[stationId]); 
      if (stockChange>0) pointChange = calcDropOffPoints(station.inventory, stationBonus[stationId]);  
      station.save();
      Player.findOne({ 'playerId': playerID }, function (err, player) {
          if (err) return handleError(err);
          player.stock != player.stock;
          player.point = player.point + pointChange;
          player.save();
      })
    })
     playersUpdate();
     stationsUpdate();
  }
});



