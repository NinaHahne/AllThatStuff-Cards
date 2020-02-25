const express = require("express");
const app = express();
// const uuid = require("uuid");

// for socket.io:
const server = require("http").Server(app);
const io = require("socket.io")(server, {
    origins: "localhost:8080 http://192.168.0.14:8080:*"
});

// cards:
const cards = require("./cards_enUS");

app.use(express.static("./public"));

app.get("/", function(req, res) {
    res.sendFile(__dirname + "/main.html");
});

server.listen(process.env.PORT || 8080, () =>
    console.log("port 8080 listening! - AllThatStuff")
);

// SOCKET.IO***********************************
// let gameStarted = false;
let joinedPlayers = {};
let selectedPieces = [];
let currentPlayer;

// card deck: ----------------------
let stuffCards = [];
let discardPile = [];
let firstCard;
let newPile = false;

// guessing & points: --------------
let correctAnswer;
let guessedAnswers = {};
let answeringOrder = [];
let playerPointsTotal = {};

//modern version of the Fisher–Yates shuffle algorithm:
function shuffleCards(cards) {
    //shuffles array in place
    let j, x, i;
    for (i = cards.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        x = cards[i];
        cards[i] = cards[j];
        cards[j] = x;
    }
    stuffCards = discardPile;
    discardPile = [];
    return cards;
}

// function drawCard(cards) {
//     firstCard = cards.shift();
// }

function discardCard() {
    if (newPile === false) {
        discardPile.push(firstCard);
    }
}

function replaceCard() {
    discardCard();
    if (stuffCards.length > 0) {
        newPile = false;
        // drawCard(stuffCards);
        firstCard = stuffCards.shift();
    } else {
        shuffleCards(discardPile);
        newPile = true;
    }
}

function nextPlayersTurn(activePlayer, activeObjects, queuedObjects) {
    let currentPlayerIndex = selectedPieces.indexOf(activePlayer);
    let nextPlayer;
    if (currentPlayerIndex + 1 <= selectedPieces.length - 1) {
        nextPlayer = selectedPieces[currentPlayerIndex + 1];
    } else if (currentPlayerIndex + 1 > selectedPieces.length - 1) {
        nextPlayer = selectedPieces[0];
    }
    currentPlayer = nextPlayer;

    replaceCard();
    correctAnswer = randomNumber(1, 7);
    guessedAnswers = {};
    answeringOrder = [];
    io.sockets.emit("next turn", {
        activePlayer: activePlayer,
        nextPlayer: nextPlayer,
        activeObjects: activeObjects,
        queuedObjects: queuedObjects,
        newCard: firstCard,
        correctAnswer: correctAnswer
    });
}

// Function to generate random number, min incl, max excl.
function randomNumber(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function collectGuesses(data) {
    guessedAnswers[data.guessingPlayer] = data.guessedItem;
    answeringOrder.push(data.guessingPlayer);

    let guessedAnswersLength = Object.keys(guessedAnswers).length;
    let joinedPlayersLength = Object.keys(joinedPlayers).length;

    // console.log('joinedPlayersLength: ', joinedPlayersLength);
    // console.log('guessedAnswersLength: ', guessedAnswersLength);
    // console.log("guessedAnswers: ", guessedAnswers);

    io.sockets.emit("someone guessed", {
        guessingPlayer: data.guessingPlayer,
        guessedItem: data.guessedItem
    });

    // when everyone guessed:
    if (guessedAnswersLength == joinedPlayersLength - 1) {

        let playerPointsIfCorrect = {};
        let actualPlayerPoints = {};
        let numberOfCorrectGuesses = 0;

        if (joinedPlayersLength <= 6) {
            let pointsCounter = answeringOrder.length;
            for (let i = 0; i < answeringOrder.length; i++) {
                playerPointsIfCorrect[answeringOrder[i]] = pointsCounter;
                if (guessedAnswers[answeringOrder[i]] == correctAnswer) {
                    actualPlayerPoints[answeringOrder[i]] = pointsCounter;
                    playerPointsTotal[answeringOrder[i]] += pointsCounter;
                    numberOfCorrectGuesses++;

                } else {
                    actualPlayerPoints[answeringOrder[i]] = 0;
                }
                pointsCounter--;
            }

            playerPointsTotal[currentPlayer] += numberOfCorrectGuesses;

        } else if (joinedPlayersLength > 6) {
            // for more than 6 players (max 8):
            // maximum points: 5
            let pointsCounter = 0;
            for (let i = answeringOrder.length; i > 0; i--) {
                playerPointsIfCorrect[answeringOrder[i]] = pointsCounter;
                if (guessedAnswers[answeringOrder[i]] == correctAnswer) {
                    actualPlayerPoints[answeringOrder[i]] = pointsCounter;
                    playerPointsTotal[answeringOrder[i]] += pointsCounter;
                    numberOfCorrectGuesses++;

                } else {
                    actualPlayerPoints[answeringOrder[i]] = 0;
                }
                if (pointsCounter < 5) {
                    pointsCounter++;
                }
            }
        }

        io.sockets.emit("everyone guessed", {
            correctAnswer: correctAnswer,
            guessedAnswers: guessedAnswers,
            playerPointsIfCorrect: playerPointsIfCorrect,
            actualPlayerPoints: actualPlayerPoints,
            playerPointsTotal: playerPointsTotal
        });
    }
}

function getWinner() {
    // console.log('data.playerArray in getWinner:', data.playerArray);
    // console.log('data.playerPiecesHTML: ', data.playerPiecesHTML);

    let ranking = [];
    for (let player in playerPointsTotal) {
        // console.log(player, ":", playerPointsTotal[player]);
        let playerPontsObj = {
            player: player,
            points: playerPointsTotal[player]
        };
        ranking.push(playerPontsObj);
        // console.log('playerPontsObj in getWinner loop:', playerPontsObj);
    }

    // sort array in place by points, descending:
    ranking.sort(function (a, b) {
        return b.points - a.points;
    });

    let winner = ranking[0].player;
    console.log(winner, 'wins!');

    let msg = `game is over`;
    io.sockets.emit("game ends", {
        message: msg,
        rankingArray: ranking,
        winner: winner
    });
}

io.on("connection", function(socket) {
    console.log(`socket with the id ${socket.id} is now connected`);
    // console.log('joinedPlayers on connection: ', joinedPlayers);

    // joinedPlayers[socket.id] = "";

    // Generate a v1 (time-based) id:
    // socket.userId = uuid.v1();

    // tell the player they connected, giving them their socket id and the list with players that joined so far:
    socket.emit("welcome", {
        socketId: socket.id,
        // userId: socket.userId,
        selectedPieces: selectedPieces
    });

    socket.on("selected piece", function(data) {
        if (data.selectedPieceId) {
            // console.log('joinedPlayers on "selected piece": ', joinedPlayers);
            console.log(
                `user socket ${data.socketId} joined the game as player '${data.selectedPieceId}'`
            );
            selectedPieces.push(data.selectedPieceId);
            joinedPlayers[socket.id] = data.selectedPieceId;

            io.sockets.emit("add selected piece", data.selectedPieceId);
            // console.log("selectedPieces: ", selectedPieces);
        }
    });

    socket.on("game started", function(data) {
        currentPlayer = data.startPlayer;
        selectedPieces = data.joinedPlayerIds;
        console.log("joined players at game start: ", selectedPieces);
        let msg = `"${data.startPlayer}" started the game and starts with building!`;
        // console.log(msg);

        // console.log('cards on "game started": ', cards);
        discardPile = cards;
        shuffleCards(discardPile); // discard pile gets shuffled and builds the new stuffCards pile
        // drawCard(stuffCards);
        // console.log(`${stuffCards.length} cards left.`);
        firstCard = stuffCards.shift();

        for (let i = 0; i < selectedPieces.length; i++) {
            playerPointsTotal[selectedPieces[i]] = 0;
        }

        correctAnswer = randomNumber(1, 7);
        guessedAnswers = {};
        answeringOrder = [];

        io.sockets.emit("game has been started", {
            message: msg,
            startPlayer: data.startPlayer,
            activeObjects: data.activeObjects,
            queuedObjects: data.queuedObjects,
            firstCard: firstCard,
            correctAnswer: correctAnswer
        });
    });

    socket.on("next player's turn", function(data) {
        nextPlayersTurn(
            data.activePlayer,
            data.activeObjects,
            data.queuedObjects
        );
    });

    socket.on("done building", function(data) {
        let msg = `player "${data.activePlayer}" finished building! Guess what it is!`;
        io.sockets.emit("building is done", {
            message: msg,
            activePlayer: data.activePlayer,
            movedObjects: data.movedObjects
        });
    });

    socket.on("moving objects", function(data) {
        io.sockets.emit("objects are moving", {
            activePlayer: data.activePlayer,
            movedObjects: data.movedObjects
        });
    });

    socket.on("made a guess", function(data) {
        collectGuesses(data);
    });

    socket.on("end game", function() {
        getWinner();
    });

    // send a message to all connected sockets:
    // io.sockets.emit("achtung", {
    //     warning: "This site will go offline for maintenance in one hour."
    // });

    // send messages to specific sockets:
    // io.sockets.sockets[recipientSocketId].emit("request", {
    //   message: "You have a new friend request!"
    // });

    // send a message to every socket except a particular one:
    // io.sockets.sockets[recipientSocketId].broadcast.emit("brag", {
    //   message: "Hey everybody, I just received a new friend request!"
    // });
    // OR: to everyone except for the emmiting socket:
    // socket.broadcast.emit('hi everyone else')

    socket.on("disconnect", function() {
        // console.log('joinedPlayers on "disconnect": ', joinedPlayers);
        console.log(`socket with the id ${socket.id} is now disconnected`);
        let piece = joinedPlayers[socket.id];
        console.log(`player piece "${piece}" is now free again`);
        selectedPieces = selectedPieces.filter(item => item !== piece);
        if (piece) {
            io.sockets.emit("remove selected piece", piece);
            delete joinedPlayers[socket.id];
        }
    });
});
