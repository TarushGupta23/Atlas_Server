import http from "http";
import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

import { Server } from 'socket.io'
import Room from "./room.js";
import { Player, Bot } from './player.js'
import { botSleepTime } from "./settings.js";

const port = 3090;
const app = express();
const server = http.createServer(app)
const io = new Server(server, {
    cors: {
        origin: "*", // NOTE: change this to your website url.
        methods: ["GET", "POST"]
    }
});
const apiUrl = 'https://world-locations-api.vercel.app'

let rooms = [];
let newRoomId = 1;
let allPlayerList = {}; // list of all Players with id , sockets and roomId

async function giveHint(usedPlaces, hint) {
    console.log('    asking api for hint')
    const response = await axios.get(`${apiUrl}/starts-with/${hint}`);
    console.log('    received hint from api')
    let list = response.data;
    list = list.filter(item => !usedPlaces.includes(item.toLowerCase()));
    if (list.length > 0) { return list[0]; }
    return null;
}

async function botTurn(room, bot) {
    const correctAns = bot.makeGuess();
    if (correctAns) {
        const ans = await giveHint(room.usedPlaces[room.currWord[room.currWord.length - 1]], room.currWord[room.currWord.length - 1])
        room.addLog(`bot's input: ${ans}`)
        console.log(`${room.name}'s bot answered correctly: ${ans}`)
        room.updateGame(ans.toLowerCase())
    } else {
        console.log(`${room.name}'s bot answered incorrectly`)
        room.addLog("bot was unable to answer")
        room.reduceCurrLive();
    }
    startGameTimer(room)
    announceGameUpdate(room)
}

function announceGameUpdate(selectedRoom) {
    console.log('announcing ', selectedRoom.name, ' info to all')
    const currPlayer = selectedRoom.livePlayers[selectedRoom.currPlayer]
    const roomInfo = {
        roomName: selectedRoom.name,
        roomStatus: selectedRoom.status,
        allPlayers: selectedRoom.allPlayers,
        livePlayers: selectedRoom.livePlayers,
        currPlayerId: currPlayer.id,
        roomLog: selectedRoom.roomLog,
        creator: {name: selectedRoom.creator.name, id: selectedRoom.creator.id}, 
        prevAns: selectedRoom.currWord,
        remainingTime: selectedRoom.timeRemaining,
        currPlayerHints: currPlayer.hints
    }
    selectedRoom.allPlayers.forEach(player => {
        if (!player.isBot) {
            io.to(allPlayerList[player.id].socketId).emit('running-game-info', roomInfo)
        }
    })
}

function startGameTimer(selectedRoom) {
    if (selectedRoom.livePlayers.length <= 1) {
        return
    }
    const timerId = setInterval(() => {
        selectedRoom.timeRemaining--;
        if (selectedRoom.timeRemaining == -1) {
            selectedRoom.reduceCurrLive()
            selectedRoom.addLog('player unable to answer within time');
            announceGameUpdate(selectedRoom)
            startGameTimer(selectedRoom)
        }
    }, 1000)
    selectedRoom.timerId = timerId;
    console.log('new game timer started')
    if (selectedRoom.livePlayers[selectedRoom.currPlayer].isBot) {
        setTimeout(async () => await botTurn(selectedRoom, selectedRoom.livePlayers[selectedRoom.currPlayer]), botSleepTime)
    }
}

io.on('connection', (socket) => {
    console.log('\nA user connected', socket.id);

    socket.on('disconnect', () => {
        console.log('\n', socket.id, 'user disconnected');
    });

    socket.on('update-me', (data) => {
        console.log("\n", data.userId, " requested update-me")
        console.log("    initial user info: ", allPlayerList[data.userId])
        const player = allPlayerList[data.userId];
        if (player) {
            allPlayerList[data.userId].socketId = socket.id
            console.log(`    player found with roomId: ${player.roomId}`)
            io.to(socket.id).emit('your-initial-data', { roomId: player.roomId });
        } else {
            io.to(socket.id).emit('your-initial-data', { roomId: -1 });
        }
        console.log("    updated user info: ", allPlayerList[data.userId])
    })

    socket.on('get-room-list', (data) => {
        console.log(`\n${data.userId} requested get-room-list`)
        if (!data.userId) {
            console.log(`    user doesnot have id`)
            data.userId = socket.id
        }
        if (!allPlayerList[data.userId]) {
            console.log(`    adding user to database`)
            allPlayerList[data.userId] = {
                socketId: socket.id,
                roomId: -1
            }
        }
        console.log("    updated user info: ", allPlayerList[data.userId])
        console.log("    sending room list to user")
        io.to(socket.id).emit('room-list', rooms.filter((room) => !room.status))
    })

    socket.on('room-lobby-data', (data) => {
        console.log(`\n${data.userId} requested room-lobby-data`)
        const roomId = allPlayerList[data.userId].roomId;
        const selectedRoom = rooms.find(item => item.id === roomId);
        console.log("    selected room: ", selectedRoom.name)
        io.to(socket.id).emit('room-lobby-data', {
            roomName: selectedRoom.name,
            creator: selectedRoom.creator.name,
            creatorId: selectedRoom.creator.id,
            allPlayers: selectedRoom.allPlayers.filter(player => player.id != selectedRoom.creator.id).map(player => player.name),
            roomStatus: selectedRoom.status
        })
    })

    socket.on('create-new-room', data => {
        console.log('\ncreate room request sent by ', data.userId)
        const newCreator = new Player(data.userName, data.userId);
        const roomName = data.roomName;
        const newRoom = new Room(newRoomId, data.password, roomName, newCreator);
        newRoomId++;

        const botEnable = data.enableBot;
        const botDifficulty = data.botDifficulty;

        let isMatch = false;
        for (let i = 0; i < rooms.length; i++) {
            if (rooms[i].name == roomName) {
                isMatch = true;
                break;
            }
        }
        if (isMatch) {
            console.log("   error: room name already in use")
            io.to(socket.id).emit('your-room-id', { roomId: -1, error: 'room name already in use' })
            newRoomId--;
        } else {
            rooms.push(newRoom);
            console.log("   room successfully created");
            if (botEnable) {
                const bot = new Bot(botDifficulty)
                newRoom.addBot(bot);
            }
            allPlayerList[data.userId].roomId = newRoom.id
            io.to(socket.id).emit('your-room-id', { roomId: newRoom.id })
            console.log('   sending room-list to home page players')
            for (const id in allPlayerList) {
                if (allPlayerList[id].roomId == -1) {
                    io.to(allPlayerList[id].socketId).emit('room-list', rooms.filter((room) => !room.status))
                }
            }
        }
    })

    socket.on('join-room', (data) => {
        const roomId = data.id;
        const newPlayer = new Player(data.userName, data.userId);
        const password = data.password;
        
        const selectedRoom = rooms.find(item => item.id === roomId);
        console.log(`\n${data.userId} trying to join room: ${selectedRoom.name}`)
        if (selectedRoom != undefined && selectedRoom != null && !selectedRoom.status) { // room not selected or not already running ... 
            if (selectedRoom.password == password) {
                console.log("    join room request accepted")
                selectedRoom.addPlayer(newPlayer); // Add player to selected room
                allPlayerList[data.userId].roomId = selectedRoom.id; // update room id of player in global list
                io.to(socket.id).emit('your-room-id', { roomId: selectedRoom.id }) // tell user his id
                console.log(`    updating user's room id\n    updating all players in room`)
                const info = {
                    roomName: selectedRoom.name,
                    creator: selectedRoom.creator.name,
                    creatorId: selectedRoom.creator.id,
                    allPlayers: selectedRoom.allPlayers.filter(player => player.id != selectedRoom.creator.id).map(player => player.name),
                    roomStatus: selectedRoom.status
                }
                selectedRoom.allPlayers.forEach(player => { // update all OTHER users in same room
                    if (!player.isBot && allPlayerList[player.id].socketId != socket.id) {
                        io.to(allPlayerList[player.id].socketId).emit('room-lobby-data', info)
                    }
                })
            } else {
                console.log('    password incorrect')
                io.to(socket.id).emit('your-room-id', { roomId: -1, error: 'incorrect password' }) // incorrect password
            }
        } else {
            console.log('    room unavailable')
            io.to(socket.id).emit('your-room-id', { roomId: -1, error: 'room not available' }) // non existant room selected
        }
    })

    socket.on('leave-room', data => {
        const roomId = allPlayerList[data.userId].roomId;
        const selectedRoom = rooms.find(item => item.id === roomId);
        console.log("\n", data.userId, " leaving room: ", selectedRoom.name)
        if (selectedRoom) {
            selectedRoom.allPlayers = selectedRoom.allPlayers.filter(player => player.id != data.userId);
            allPlayerList[data.userId].roomId = -1;
            if (selectedRoom.allPlayers.length == 0) { // remove room
                console.log("   No player left in room, deleting room")
                rooms = rooms.filter(room => room.id != roomId);
            } else if (selectedRoom.allPlayers.length == 1 && selectedRoom.allPlayers[0] instanceof Bot) {
                console.log("   No player left in room, deleting room")
                rooms = rooms.filter(room => room.id != roomId);
            } else if (selectedRoom.creator.id == data.userId) { // change leader
                console.log("   Changing room owner")
                selectedRoom.changeCreator();
                console.log(`   ${selectedRoom.creator.id} is new owner`)
            }
            const info = {
                roomName: selectedRoom.name,
                creator: selectedRoom.creator.name,
                creatorId: selectedRoom.creator.id,
                allPlayers: selectedRoom.allPlayers.filter(player => player.id != selectedRoom.creator.id).map(player => player.name),
                roomStatus: selectedRoom.status
            }
            console.log("    sending room-lobby-data to all players")
            selectedRoom.allPlayers.forEach(player => { // update all OTHER users in same room
                if (!player.isBot && allPlayerList[player.id].socketId != socket.id) {
                    io.to(allPlayerList[player.id].socketId).emit('room-lobby-data', info)
                }
            })
        }
    })

    socket.on('start-room', data => {
        const roomId = allPlayerList[data.userId].roomId;
        const selectedRoom = rooms.find(item => item.id === roomId);
        console.log(`\n${data.userId} requested start-room: `, selectedRoom.name)
        if (selectedRoom && selectedRoom.creator.id == data.userId) {
            selectedRoom.startRoom();
            console.log('    room started, updating all players')
            if (selectedRoom.status) {
                startGameTimer(selectedRoom)
                selectedRoom.allPlayers.forEach(player => {
                    if (!player.isBot) { io.to(allPlayerList[player.id].socketId).emit('your-room-started', {}) }
                })
            } else {
                console.log('    room has insufficient players')
                io.to(socket.id).emit('unable-to-start-room', { error: 'insufficient players' })
            }
        } else {
            console.log("    unable to start ", selectedRoom)
            io.to(socket.id).emit('unable-to-start-room', { error: 'not a valid request' })
        }
    })

    socket.on('get-running-game-info', data => {
        console.log("\n", data.userId, "asking for room running game data")
        const roomId = allPlayerList[data.userId].roomId;
        const selectedRoom = rooms.find(item => item.id === roomId);
        const roomInfo = {
            roomName: selectedRoom.name,
            roomStatus: selectedRoom.status,
            allPlayers: selectedRoom.allPlayers,
            livePlayers: selectedRoom.livePlayers,
            currPlayerId: selectedRoom.livePlayers[selectedRoom.currPlayer].id,
            roomLog: selectedRoom.roomLog,
            creator: {name: selectedRoom.creator.name, id: selectedRoom.creator.id},
            prevAns: selectedRoom.currWord,
            remainingTime: selectedRoom.timeRemaining,
            currPlayerHints: selectedRoom.livePlayers[selectedRoom.currPlayer].hints,
        }
        io.to(socket.id).emit('running-game-info', roomInfo)
    })

    socket.on('my-game-input', async (data) => {
        console.log("\n", data.userId, " sent input to room, input : ", data.ans)
        const roomId = allPlayerList[data.userId].roomId;
        const selectedRoom = rooms.find(item => item.id === roomId);
        const ans = data.ans.toLowerCase()
        const player = selectedRoom.livePlayers[selectedRoom.currPlayer]
        if (data.userId == player.id) { // correct user sent message
            let locationInvalid = true;
            console.log('    answer sent top api')
            const response = await axios.post(`${apiUrl}/location/${ans}`);

            console.log(`    api response for input: ${ans}`)
            console.log(response.data)

            // name invalid, starting char invalid
            locationInvalid = (response.data.error) || ans[0] != selectedRoom.currWord[selectedRoom.currWord.length - 1];

            if (ans == "quit") { // user quits
                console.log(`   user quits, removing user`)
                selectedRoom.livePlayers.splice(selectedRoom.currPlayer, 1);
                selectedRoom.currPlayer = selectedRoom.currPlayer - 1;
                selectedRoom.getNextPlayer();
                selectedRoom.addLog(`${player.name} quits the game`)
            } else if (locationInvalid) { // case of "pass" is included here
                if (ans == 'pass') {
                    console.log('   user passed')
                    selectedRoom.addLog(`${player.name} passed his turn`)
                } else {
                    selectedRoom.addLog(`${player.name}'s input: ${ans} is invalid`)
                    console.log(`   invalid input, ${ans} doesnot exist`)
                }
                selectedRoom.reduceCurrLive();
            } else {
                let placeUnused = selectedRoom.updateGame(ans);
                if (!placeUnused) {
                    selectedRoom.addLog(`${player.name}'s input: ${ans} is already used`)
                    console.log("   place already used")
                    selectedRoom.reduceCurrLive()
                } else {
                    selectedRoom.addLog(`${player.name}'s input: ${ans}`)
                }
            }
            startGameTimer(selectedRoom)
            announceGameUpdate(selectedRoom)
        }
    })

    socket.on('get-game-hint', async (data) => {
        const roomId = allPlayerList[data.userId].roomId;
        const selectedRoom = rooms.find(item => item.id === roomId);
        const player = selectedRoom.livePlayers[selectedRoom.currPlayer]
        console.log('received hint request from ', data.userId)
        if (data.userId == player.id && player.hints > 0) {
            selectedRoom.livePlayers[selectedRoom.currPlayer].hints--;
            const ans = await giveHint(selectedRoom.usedPlaces[selectedRoom.currWord[selectedRoom.currWord.length - 1]], selectedRoom.currWord[selectedRoom.currWord.length - 1])
            if (ans == null) { 
                // TODO:  res.send("no-hint");
            }
            io.to(socket.id).emit('your-game-hint', { ans })
            console.log('generated hint: ', ans)
        }
    })

    socket.on('restart-room', data => {
        const roomId = allPlayerList[data.userId].roomId;
        const selectedRoom = rooms.find(item => item.id === roomId);
        console.log(`\n${data.userId} requested restart-room : ${selectedRoom.name}`)
        selectedRoom.restartRoom();
        if (selectedRoom.status) {
            startGameTimer(selectedRoom)
        }
        announceGameUpdate(selectedRoom)
    })

    socket.on('leave-running-room', data => {
        const roomId = allPlayerList[data.userId].roomId;
        const selectedRoom = rooms.find(item => item.id === roomId);
        console.log("\n", data.userId, " leaving room: ", selectedRoom.name)
        if (selectedRoom) {
            selectedRoom.allPlayers = selectedRoom.allPlayers.filter(player => player.id != data.userId);
            allPlayerList[data.userId].roomId = -1;
            if (selectedRoom.allPlayers.length == 0) { // remove room
                console.log("   No player left in room, deleting room")
                rooms = rooms.filter(room => room.id != roomId);
            } else if (selectedRoom.allPlayers.length == 1 && selectedRoom.allPlayers[0] instanceof Bot) {
                console.log("   No player left in room, deleting room")
                rooms = rooms.filter(room => room.id != roomId);
            } else if (selectedRoom.creator.id == data.userId) { // change leader
                console.log("   Changing room owner")
                selectedRoom.changeCreator();
                console.log(`   ${selectedRoom.creator.id} is new owner`)
            }
            announceGameUpdate(selectedRoom)
        }
    })
});

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

server.listen(port, () => { console.log(`Server started at port: ${port}`) })