import { Bot } from "./player.js";
import { playerTimeInMinutes } from "./settings.js";

class Room {
    constructor(id, password, name, creator) {
        // ------- functions -------
        this.startRoom = () => {
            // room can run only if there are more that 1 players
            this.status = this.allPlayers.length > 1;
            if (this.status) {
                for (let i=0; i<this.allPlayers.length; i++) {
                    this.livePlayers.push(this.allPlayers[i]);
                }
                // select random player to start game with
                this.currPlayer = Math.floor(Math.random() * this.allPlayers.length);
                if (this.allPlayers[this.currPlayer].isBot) {
                    this.getNextPlayer()
                }
            }
            return this.status;
        };
        
        this.restartRoom = () => {
            if (this.livePlayers.length != 1) { return false; } // can't restart as there are multiple winners
            this.livePlayers = [];
            
            for (let player of this.allPlayers) {
                player.reset();
            }
            // room can run only if there are more that 1 players
            this.status = this.allPlayers.length > 1;
            if (this.status) {
                for (let i=0; i<this.allPlayers.length; i++) {
                    this.livePlayers.push(this.allPlayers[i]);
                }
                // select random player to start game with
                this.currPlayer = Math.floor(Math.random() * this.allPlayers.length);
            }
            this.usedPlaces = {
                "a":[],"b":[],"c":[],"d":[],"e":[],"f":[],
                "g":[],"h":[],"i":[],"j":[],"k":[],"l":[],
                "m":[],"n":[],"o":[],"p":[],"q":[],"r":[],
                "s":[],"t":[],"u":[],"v":[],"w":[],"x":[],
                "y":[],"z":[]
            };
            this.currWord = "a";
            return this.status;
        };

        this.changeCreator = () => {
            let i = 0;
            while (true) {
                if  (this.allPlayers[i].id != creator.id && !(this.allPlayers[i] instanceof Bot)) {
                    this.creator = this.allPlayers[i];
                    break;
                }
                i++;
            }
        }

        this.getNextPlayer = () => {
            this.currPlayer = (this.currPlayer + 1) % this.livePlayers.length;
            clearInterval(this.timerId)
            this.timeRemaining = playerTimeInMinutes*60 + 2
        };
        this.addPlayer = (newPlayer) => {
            this.allPlayers.push(newPlayer);
            newPlayer.roomID = this.id;
        }
        this.addBot = (bot) => {
            this.allPlayers.push(bot);
            bot.roomID = this.id;
        }

        this.updateGame = (location) => {
            if (this.usedPlaces[location[0]].includes(location)) {
                return false;
            }
            this.usedPlaces[location[0]].push(location);
            this.currWord = location;
            this.getNextPlayer();
            return true;
        }

        this.reduceCurrLive = () => {
            this.livePlayers[this.currPlayer].lives--;
            if (this.livePlayers[this.currPlayer].lives < 0) {
                this.livePlayers.splice(this.currPlayer, 1);
                this.currPlayer = this.currPlayer - 1;
            }
            this.getNextPlayer();
        }

        this.addLog = (data) => {
            this.roomLog.unshift(data);

            if (this.roomLog.length > 10) {
                this.roomLog.pop();
            }
        }

        // ------- data -------
        this.id = id;
        this.name = name;
        this.password = password;
        this.creator = creator;
        this.status = false; // if the room is running or not
        // this.hasBot = false;

        this.allPlayers = [];
        this.livePlayers = [];
        this.usedPlaces = {
            "a":[],"b":[],"c":[],"d":[],"e":[],"f":[],
            "g":[],"h":[],"i":[],"j":[],"k":[],"l":[],
            "m":[],"n":[],"o":[],"p":[],"q":[],"r":[],
            "s":[],"t":[],"u":[],"v":[],"w":[],"x":[],
            "y":[],"z":[]
        };
        this.currPlayer = -1; // index of current player
        this.currWord = "a";
        this.roomLog = [];
        this.timeRemaining = playerTimeInMinutes * 60 + 2
        this.timerId = null;

        this.addPlayer(creator);
    }
}

export default Room;