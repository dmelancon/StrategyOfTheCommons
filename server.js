var express = require('express');
var bodyParser = require('body-parser')
var app = express();
var hbs = require('express-hbs');
app.use(bodyParser());
app.engine('hbs', hbs.express3({
  partialsDir: __dirname + '/views/partials'
}));
app.set('view engine', 'hbs');
app.set('views', __dirname + '/views');

if (!module.parent) {
  var server = app.listen(3000);

  console.log('Express started on port 3000');
}



//======================================================
//=================SET UP WEBSOCKETS====================
//======================================================
var io = require('socket.io').listen(server);


io.sockets.on('connection', function(socket){
  console.log('a user connected');
  socketCheckIn(socket);
  socket.on('disconnect', function(){
    console.log("client has disconnect");
  });
});

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
  inventory: {type: Number, default: 3}
  //currentPointsOffered: Number
});

var playerSchema = Schema({     
  playerId : Number,
  points: { type: Number, default: 0  },
  stock: {type: Boolean, default: false}
});  

var checkInSchema = Schema({
  playerID: Number,
  stationId: Number,
  pickUpDropOff: Boolean,
  timeDate: { type: Date, default: Date.now }
})    

var Station = mongoose.model('Station', stationSchema);
var Player = mongoose.model('Player', playerSchema);
var CheckIn = mongoose.model('CheckIn', checkInSchema);

//======================================================
//====================SET UP ROUTES=====================
//======================================================
var bonusTime = 10000;
var stationBonus= [];        //array of allstations bonuses
var stationBonusOn = [];
var allPlayersData = [];           //var to locally store updated player data
var allStationsData = [];
var prevPlayersStation = [0,0,0,0,0,0,0,0,0,0];          //var to locally store updated station data
var numPlayers = 10;
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

app.get('/addStation/:stationId', function(req, res){
    var stationId = req.params.stationId;
    console.log(stationId);
    var newStation = new Station();
    newStation.stationId = stationId;
    newStation.save();
    console.log("Station " + stationId + " created.");
    res.end("Station " + stationId + " created.");

});

app.get('/stationsUpdate', function(req, res){
  stationsUpdate();
    //console.log(allStationsData);
    res.end("Stations Update");
});

app.get('/addPlayer/:playerId', function(req, res){
    var playerId = req.params.playerId;
    console.log(playerId);
    var newPlayer = new Player();
    newPlayer.playerId = playerId;
    newPlayer.save();
    console.log("Player " + playerId + " created.");
    res.end("Player " + playerId + " created.");
});

app.get('/playersUpdate', function(req, res){
  playersUpdate();
   res.end("Players Update");
 });

app.get('/setBonus/:bonus', function(req, res){
  bonusTime = req.params.bonus*1000;
  console.log(bonusTime);
  clearInterval(bonusID);
  bonusID = setInterval(bonusUpdate, bonusTime);
  res.end("Bonus set to " + bonusTime/1000 + " seconds.");
});

app.get('/resetGame', function(req, res){
  resetGame(function(value){
    stationsUpdate(value);
    playersUpdate(value);
  });
  res.end("Game Reset")
});


//======================================================
//====================YUN ROUTE++++=====================
//======================================================

app.get('/station/:stationId/player/:playerId/', function(req, res) {
  //checks station status and send user an alert
  var stationId = req.params.stationId;  // station Number
  var playerId = req.params.playerId;
  var lastStation = prevPlayersStation[playerId-1];
  var checkInData = [playerId,stationId, lastStation];
  console.log("Player "+  playerId + " at station "+ stationId + ".");
  io.sockets.emit( 'playerCheckIn', checkInData);    //send to player client on phone stationID + playerStock
  res.end("Player "+  playerId + " at station "+ stationId + ".");
});
//======================================================
//===============Player Phone ROUTE=====================
//======================================================


app.get('/player/:playerId', function(req, res){
    var playerID = req.params.playerId;
    res.render('home', {
      mPlayer  :  playerID      
    });
});

app.get('/master', function(req, res){
    res.render('home', {
      mPlayer  :  0      
    });
});

//======================================================
//===========++====HELPER FUNCTIONS=====================
//======================================================

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
  console.log('=======================');
  console.log('in Player Update');
  console.log('=======================');

 allPlayersData = [];      
 for (var i = 0; i < numPlayers; i++ ){
    thisPlayer = [];
    Player.findOne({ 'playerId': i+1 }, function (err, player) {
        if (err) return handleError(err);
        thisPlayer.push(player.playerId);
        thisPlayer.push(player.points);
        thisPlayer.push(player.stock);
        allPlayersData.push(thisPlayer);
        thisPlayer = [];
       if (allPlayersData.length>numPlayers-1){
          console.log(allPlayersData);
          io.sockets.emit( 'playerUpdate', allPlayersData);    //every player and their points
        }
    });
  }
}

var stationsUpdate = function(){
  console.log('=======================');
  console.log('in Station Update');
  console.log('======================='); 

  allStationsData = [];
  for (var i = 0; i < numStations; i++ ){
    thisStation = [];
    Station.findOne({ 'stationId': i+1 }, function (err, station) {
        if (err) return handleError(err);
        thisStation.push(station.stationId);     //allStationData[i][0] = station ID
        thisStation.push(station.inventory);     //allStationData[i][1] = station Inventory
        thisStation.push(stationBonusOn[station.stationId-1]);
        thisStation.push(stationBonus[station.stationId-1]);  
        allStationsData.push(thisStation); 
        thisStation = [];      
        if (allStationsData.length>4){
           console.log(allStationsData);
           io.sockets.emit('stationUpdate', allStationsData);    // every station and its inventory  
        }                 
    });
  }
}

//this should be called every 10 sec or so

var bonusUpdate = function(){
  console.log('=======================');
  console.log('in Bonus Update');
  console.log('=======================');

  var numBonus = 0;
   console.log(stationBonus);
  for (var i = 0; i<numStations; i++){
    if (allStationsData[i]){
      var index = allStationsData[i][0]-1;

      if (allStationsData[i][1] == 0 || allStationsData[i][1] == 5){
            stationBonusOn[index] = true;
      }else{
            stationBonusOn[index] = false;
            stationBonus[index] = 0;
      }
      if (stationBonusOn[index] == true){
          stationBonus[index] = stationBonus[index] + numPlayers;
          numBonus ++;
      }
    }
  }
 for (var j = 0; j<numPlayers; j++){
      //console.log("player index : "+ j);
      Player.findOne({ 'playerId': j+1 }, function (err, player) {
        //console.log("DB player index : "+ j);
        if (err) return handleError(err);
        player.points = player.points - 1*numBonus;
        player.save();
      });
  }
 console.log(stationBonus);
return stationsUpdate(), playersUpdate();
}


//               //updateBonus every 10 secs
setInterval(bonusUpdate, 10000);
setInterval( stationsUpdate, 500);
setInterval( playersUpdate, 500);


var resetGame = function(){
  console.log('=======================');
  console.log('in Reset Game');
  console.log('=======================');
  prevPlayersStation = [0,0,0,0,0,0,0,0,0,0];
  stationBonus= [];               //array of allstations bonuses
  stationBonusOn = [];
  allPlayersData = [];           //var to locally store updated player data
  allStationsData = [];          //var to locally store updated station data
  //bonus set up
  for (var i = 0; i<numStations; i++){
    stationBonus.push(0);
    stationBonusOn.push(false);
  }  
  for (var i = 0; i<numPlayers; i++){
    Player.findOne({ 'playerId': i+1}, function (err, player) {
            if (err) return handleError(err);
            player.stock = false;
            player.points = 0;
            player.save();
    });
  };
  for (var i = 0; i<numStations; i++){
    Station.findOne({ 'stationId': i+1 }, function (err, station) {
            if (err) return handleError(err);
            station.inventory = 1;
            station.save();
    });
  };
  return stationsUpdate(), playersUpdate();
}


//======================================================
//=================CHECKIN LISTENER=====================
//======================================================

//this socket waits for client to respond 
//data comes back false if station is full/player is dropping off or empty/player is picking up or player says NO

var socketCheckIn = function(socket){ 
  socket.on('checkInConfirm', function(data){  
    console.log("CHECKIN RECEIVED");
    var stockChange = 0;  // -1 or 1, drop off or pickup //figure
    var pointChange = 0;
    var checkIn = Boolean;
    console.log(data);
    if (data){
      var playerId = data[0];
      var stationId = data[1];
      prevPlayersStation[playerId-1] = stationId;
      console.log(playerId);
      Player.findOne({ 'playerId': playerId }, function (err, player) {
          if (err) return handleError(err);
          if (player.stock == true) stockChange = 1;
          if (player.stock == false) stockChange = -1;
       });
      Station.findOne({ 'stationId': stationId}, function (err, station) {
          if (err) return handleError(err);
          console.log(stockChange);
          if (stockChange<0) pointChange = calcPickUpPoints(station.inventory, stationBonus[stationId-1]); 
          if (stockChange>0) pointChange = calcDropOffPoints(station.inventory, stationBonus[stationId-1]);  
          station.inventory = station.inventory + stockChange;
          station.save();
          Player.findOne({ 'playerId': playerId }, function (err, player) {
              if (err) return handleError(err);
              player.stock = !player.stock;
              player.points = player.points + pointChange;
              player.save();

         })
      })
       var newCheckIn = new CheckIn();
       newCheckIn.playerID = playerId; 
       newCheckIn.stationID = stationId;
       if(stockChange == -1) newCheckIn.pickUpDropOff = true;
       if(stockChange == 1) newCheckIn.pickUpDropOff = false;
       newCheckIn.save();
    }
  return stationsUpdate(), playersUpdate();
  });
}
resetGame();
resetGame();
resetGame();
