import { lives, hints } from "./settings.js";
class Player {
    constructor(name, ip) {
        this.name = name;
        this.lives = lives;
        this.roomID = -1;
        this.hints = hints;
        this.id = ip;
        
        this.reset = () => {
            this.lives = lives;
            this.hints = hints;
        }
    }
}

class Bot {
    constructor(difficulty) {
        this.name = "Atlas-AI";
        this.id = 'Atlas-AI'
        this.isBot = true;
        this.lives = lives;
        this.hints = 0
        this.roomID = -1;
        this.difficulty = difficulty; // max difficulty = 100 => unbeatable

        this.makeGuess = () => {
            // if (Math.random() * 100 <= this.difficulty) { // bot gives correct answer
            //     return true;
            // } else { // bot gives incorrect answer
            //     return false;
            // }
            return Math.random() * 100 <= this.difficulty;
        }

        this.reset = () => {
            this.lives = lives;
            this.hints = 0;
        }
    }
}
export { Player, Bot };