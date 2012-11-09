// https://github.com/LearnBoost/socket.io
// http://twitter.github.com/bootstrap/base-css.html#buttons

var expres = require('express'),

    port = process.env.PORT || 8080,
    io = require('socket.io').listen(port),
    game = require('./game.js').gameTicTacToe(), /* custom module with that encapsulates game's logic */
    gameState = {}, /* contains TicTacToe object for each created game */
    users = {},     /* contains all users connected to the server */
    games = {},     /* contains all created games */
    opponents = {}; /* contains sockets of all playes for each game */

io.set('log level', 1);

io.sockets.on('connection', function (socket) {
    var userName,
        currentGame,
        isMaster = false;
    
    function changeUsersCount(){
        socket.broadcast.json.emit('usersListChanged', {'users': users, 'games': games});
    }
    
    socket.json.emit({'event': 'connected', 'time': (new Date).toLocaleTimeString()});
    

    socket.on('login', function (data) {
        if(!!data && !!data.name && !users[data.name.toLowerCase()]) {
            userName = data.name;
            users[userName.toLowerCase()] = userName;
            socket.json.emit('userloggedin', {'name': userName, 'users': users, 'games': games});
            changeUsersCount();
        } else if (users[data.name.toLowerCase()]) {
            socket.json.emit('onLogInError', {'msg': 'user with name ' + data.name + ' has already connected'});
        } else {
            socket.json.emit('onLogInError', {'msg': 'server error: wrong data format'});
        }
    });
    

    socket.on('createGame', function (data){
        currentGame = ([userName, '_', data.gameName]).join('');
        isMaster = true;
        games[currentGame] = { id: currentGame, 
                                name: data.gameName,
                                user: userName, 
                                opponent: null,
                                turn: userName,
                                isAvailable: true
                            };

        opponents[currentGame] = {userSocket: socket, opponentSocket: null}
        gameState[currentGame] = game.createInstance();
        
        socket.json.emit('gameHosted', {'game': games[currentGame]});
        socket.broadcast.json.emit('gamesListChanged', {'games': games});
    });
    

    socket.on('connectToGame', function (data){
        currentGame = data.gameName;
        games[currentGame].opponent = userName;
        opponents[currentGame].opponentSocket = socket;
        var gameData = { name: currentGame, 
                        user: games[currentGame].user, 
                        opponent: userName, 
                        turn: games[currentGame].user, 
                        isMaster: true
                    };

        opponents[currentGame].userSocket.json.emit('gameStarted', gameData);
        gameData.isMaster = false;
        opponents[currentGame].opponentSocket.json.emit('gameStarted', gameData);
        // remove game from list of available games:
        games[currentGame].isAvailable = false;
        socket.broadcast.json.emit('gamesListChanged', {'games': games});
    });
    

    socket.on('makeMove', function (data) {
        var currentGame = games[data.gameName];
        var socketId = isMaster ? opponents[data.gameName].userSocket.id : opponents[data.gameName].opponentSocket.id;
        if(socketId == socket.id && currentGame.turn == data.userName) {
            if(gameState[data.gameName].canMove(data.x, data.y)) {
                gameState[data.gameName].move(data.x, data.y, isMaster);
                currentGame.turn = isMaster ? currentGame.opponent : currentGame.user

                // send "move" update to players
                opponents[data.gameName].userSocket.json.emit('onMove', 
                    { 'turn': currentGame.turn, 'x':data.x, 'y': data.y, 'isMaster': isMaster });
                opponents[data.gameName].opponentSocket.json.emit('onMove', 
                    { 'turn': currentGame.turn, 'x':data.x, 'y': data.y, 'isMaster': isMaster });

                // check game status
                if(gameState[data.gameName].isGameEnded() || gameState[data.gameName].isWinner()) {
                    if(gameState[data.gameName].isWinner()) {
                        socket.json.emit('gameOver', {'msg': 'You are winer!!!'});
                        var looserSocket = isMaster 
                            ? opponents[data.gameName].opponentSocket 
                            : opponents[data.gameName].userSocket;

                        looserSocket.json.emit('gameOver', {'msg': 'You are loser('});
                    } else {
                        opponents[data.gameName].userSocket.json.emit('gameOver', {'msg': 'game ended in a draw'});
                        opponents[data.gameName].opponentSocket.json.emit('gameOver', {'msg': 'game ended in a draw'});
                    }
                }
            }
        }
    });
    

    socket.on('disconnect', function() {
        isMaster = false;
        if(!!userName) {
            delete users[userName.toLowerCase()];
        }
        if(!!currentGame) {
            delete games[currentGame]; 
            delete gameState[currentGame];
        }
        changeUsersCount();
    });
});