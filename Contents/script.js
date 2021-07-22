"use strict";

const gameWindow = document.getElementById("gameWindow");
const scoreWindow = document.getElementById("scoreWindow");
const gameWindowContext = gameWindow.getContext("2d");
const scoreWindowContext = scoreWindow.getContext("2d");

const windowHeight = window.innerHeight, windowWidth = window.innerWidth;
const blockSize = 50, roundRadius = 7;

let scoreWindowWidth, scoreWindowHeight, gameWindowWidth, gameWindowHeight, gameWindowHorizontalMargin, gameWindowVerticalMargin;
let gameObject;

const scoreFont = "Fira Mono, Cursive";
const gameFont = "Bungee Inline, Cursive";

const timeOut = 200;
const startWithBlocks = 4;

const KeyPressAudio = "./Assets/KeyPress.mp3";
const GameOverAudio = "./Assets/GameOver.mp3"
const CaptureAudio = "./Assets/Capture.mp3";

const headColorString = "#1F618D"
const tailColorString = "#2980B9"
const borderColorString = "#FFFFFF";
const foodColorString = "#85C1E9";
const foodNotCapturedColorString = "#FF0000";

const delta = new Map();
delta.set('L', [-blockSize, 0]);
delta.set('R', [blockSize, 0]);
delta.set('U', [0, -blockSize]);
delta.set('D', [0, blockSize]);

function displayWindowSizeError(){
    scoreWindow.style.display = "none";
    gameWindow.style.display = "none";
    document.getElementById("loading").style.display = "none";
    document.getElementById("window-size-error-message").style.display = "block";
}

function validWindowSize(windowWidth, windowHeight, blockSize){
    if(windowHeight < 400 || windowWidth < 1000)return false;

    scoreWindowWidth = windowWidth;
    scoreWindowHeight = Math.max(50, windowHeight/11);

    gameWindowWidth = windowWidth - windowWidth % blockSize;
    gameWindowHeight = (windowHeight - scoreWindowHeight) - (windowHeight - scoreWindowHeight) % blockSize;
    gameWindowHorizontalMargin = (windowWidth - gameWindowWidth)/2;
    gameWindowVerticalMargin = (windowHeight-scoreWindowHeight-gameWindowHeight)/2;

    gameWindow.width = gameWindowWidth;
    gameWindow.height = gameWindowHeight;
    scoreWindow.width = scoreWindowWidth;
    scoreWindow.height = scoreWindowHeight;
    gameWindow.style.marginLeft = gameWindowHorizontalMargin + "px";
    gameWindow.style.marginRight = gameWindowHorizontalMargin + "px";
    gameWindow.style.marginTop = gameWindowVerticalMargin + "px";
    if(gameObject !== undefined && gameObject !== null){
        gameObject.resetGame();
        gameObject.display();
    }
    return true;
}



function boxBlur(canvasImageData, blurRadius){
    let width = canvasImageData.width, height = canvasImageData.height;
    let imageData = canvasImageData.data;
    let canvasImagePrefixSum2D = [];
    let pos = (row, col, layer) => (row*width+col)*4+layer;
    for(let r = 0; r< height; r++)
        for(let c = 0; c< width; c++)
            for(let layer = 0; layer < 4; layer++){
                let val = imageData[pos(r, c, layer)];
                if(r > 0)val += canvasImagePrefixSum2D[pos(r-1, c, layer)];
                if(c > 0)val += canvasImagePrefixSum2D[pos(r, c-1, layer)];
                if(r > 0 && c > 0)val -= canvasImagePrefixSum2D[pos(r-1, c-1, layer)];
                canvasImagePrefixSum2D.push(val);
            }

    let blurredImageData = [];
    for(let r = 0; r< height; r++)
        for(let c = 0; c< width; c++){
            let minR = Math.max(r-blurRadius, 0)-1, minC = Math.max(c-blurRadius, 0)-1;
            let maxR = Math.min(r+blurRadius, height-1), maxC = Math.min(c+blurRadius, width-1);
            let size = (maxR-minR)*(maxC-minC);
            for(let layer = 0; layer < 4; layer++){
                let sum = canvasImagePrefixSum2D[pos(maxR, maxC, layer)];
                if(minR !== -1)sum -= canvasImagePrefixSum2D[pos(minR, maxC, layer)];
                if(minC !== -1)sum -= canvasImagePrefixSum2D[pos(maxR, minC, layer)];
                if(minR !== -1 && minC !== -1)sum += canvasImagePrefixSum2D[pos(minR, minC, layer)];
                blurredImageData.push(sum/size);
            }
        }
    return new ImageData(new Uint8ClampedArray(blurredImageData), width, height);
}
function blurImage(canvasImageData){
    return boxBlur(canvasImageData, 5);
}

CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    this.beginPath();
    this.moveTo(x+r, y);
    this.arcTo(x+w, y,   x+w, y+h, r);
    this.arcTo(x+w, y+h, x,   y+h, r);
    this.arcTo(x,   y+h, x,   y,   r);
    this.arcTo(x,   y,   x+w, y,   r);
    this.closePath();
    return this;
}

function playSound(file){
    let audio = document.createElement('audio');
    audio.src = file;
    audio.play()
}

function fontString(fontName, bold, size){
    return (bold === true?"Bold ":"") + size+"px "+fontName;
}

class SquareBlock{
    constructor(midX, midY, color) {
        this.midX = midX;
        this.midY = midY;
        while (this.midX < 0)this.midX += gameWindowWidth;
        while (this.midX >= gameWindowWidth)this.midX -= gameWindowWidth;
        while (this.midY < 0)this.midY += gameWindowHeight;
        while (this.midY >= gameWindowHeight)this.midY -= gameWindowHeight;
        this.color = color;
    }
    setColor(color){this.color = color;}
    getColor(){return this.color;}
    getMidX(){return this.midX;}
    getMidY(){return this.midY;}
    samePosition(block){return this.getMidX() === block.getMidX() && this.getMidY() === block.getMidY();}
    deepCopy(){return new SquareBlock(this.midX, this.midY, this.color);}
}


class Game{
    static highScore = 0;
    static foodGain = 100;
    static moveGain = {1: 0, 2: 5};
    static gameTimer = 10000;
    static gameTimerIncrement = timeOut;
    static HIGHSCORE_KEYS = {1: "FreeHighScore", 2: "TimedHighScore"};
    static STATUS = {"START": 1, "OVER": 2,"CHOICE": 3, "RUNNING": 4};
    static MODE = {"FREE": 1, "TIMED": 2};
    constructor(gameWindowContext, scoreWindowContext) {
        this.gameWindowContext = gameWindowContext;
        this.scoreWindowContext = scoreWindowContext;
        this.status = null;
        this.mode = 0;
        this.snakeBody = [];
        this.food = null
        this.foodTimeRemaining = Game.gameTimer;
        this.foodTime = Game.gameTimer;
    }
    resetGame(){
        this.status = Game.STATUS.START;
        this.snakeBody = [];
        this.mode = 0;
        this.food = null
        this.foodTime = Game.gameTimer;
        this.foodTimeRemaining = this.foodTime;
        this.direction = 'L';
        this.newDirection = null;
        this.foodCaptured = null;
        this.score = 0;
        let x = Math.floor(gameWindowWidth/(2*blockSize)) * blockSize, y = Math.floor(gameWindowHeight/(2*blockSize))*blockSize
        this.snakeBody.push(new SquareBlock(x, y, headColorString));
        for(let i = 1; i<= startWithBlocks; i++)this.snakeBody.push(new SquareBlock(x+i*blockSize, y, tailColorString));
        this.generateFood();
    }
    setGameMode(mode){
        this.mode = mode;
        this.fetchHighScore();
    }
    incrementScore(gain){
        this.score += gain;
    }
    fetchHighScore(){
        let keyName = Game.HIGHSCORE_KEYS[this.mode];
        let highScore = localStorage.getItem(keyName);
        if(highScore === null)Game.highScore = 0;
        else Game.highScore = parseInt(highScore);
    }
    updateHighScore(){
        Game.highScore = Math.max(Game.highScore, this.score);
        localStorage.setItem(Game.HIGHSCORE_KEYS[this.mode], Game.highScore.toString());
    }
    generateFood(){
        let randInt = (upto) => Math.floor(Math.random()*upto);
        let duplicate = undefined, x, y;
        do{
            x = (1+randInt(gameWindowWidth/blockSize-2))*blockSize;
            y = (1+randInt(gameWindowHeight/blockSize-2))*blockSize;
            let food = new SquareBlock(x, y, foodColorString)
            duplicate = this.snakeBody.find((block) => block.samePosition(food));
        }while (duplicate !== undefined);
        this.food = new SquareBlock(x, y, foodColorString);
        if(this.mode === Game.MODE.TIMED){
            this.foodTimeRemaining = this.foodTime;
            this.foodTime += Game.gameTimerIncrement;
        }
    }
    updateDirection(newDirection){
        this.newDirection = newDirection;
        playSound(KeyPressAudio)
    }
    loadDirection(){
        let dir = this.newDirection;
        this.newDirection = null;
        if(dir === null)return;
        switch (dir) {
            case 'L':
                if(this.direction !== 'R')this.direction = dir;
                break;
            case 'R':
                if(this.direction !== 'L')this.direction = dir;
                break;
            case 'U':
                if(this.direction !== 'D')this.direction = dir;
                break;
            case 'D':
                if(this.direction !== 'U')this.direction = dir;
                break;
        }
    }
    performMove(){
        this.loadDirection();
        let updatedPositions = this.snakeBody.map((x) => x.deepCopy());
        let nxt = new SquareBlock(updatedPositions[0].getMidX()+delta.get(this.direction)[0], updatedPositions[0].getMidY()+delta.get(this.direction)[1], headColorString);

        updatedPositions[0].setColor(tailColorString)
        if(this.foodCaptured !== null){
            updatedPositions.splice(0, 1, this.foodCaptured);
            this.foodCaptured = null;
        }else updatedPositions.pop();
        updatedPositions.splice(0, 0, nxt);

        if(this.collisionHappens(updatedPositions)) {
            let copy = this.snakeBody.find((block, index) => index > 0 && block.samePosition(nxt));
            copy.setColor(foodNotCapturedColorString);
            this.displayGameRunning();
            return false;
        }

        if(this.mode === Game.MODE.TIMED && this.food !== null && this.foodTimeRemaining === 0 && !this.food.samePosition(nxt)){
            this.food.setColor(foodNotCapturedColorString);
            this.displayGameRunning();
            return false;
        }

        this.foodTimeRemaining -= timeOut;
        this.incrementScore(Game.moveGain[this.mode]);
        this.snakeBody = updatedPositions;
        if(this.food.samePosition(nxt)){
            this.foodCaptured = this.food;
            this.food = null;
            this.incrementScore(Game.foodGain);
            playSound(CaptureAudio);
            this.generateFood();
        }
        return true;
    }
    collisionHappens(positions){
        let copy = positions.find((block, index) => index > 0 && block.samePosition(positions[0]));
        return copy !== undefined;
    }
    displayObject(block){
        if(block === null)return;
        let topX = block.getMidX()-blockSize/2, topY = block.getMidY()-blockSize/2;
        for(let i = -1; i <= 1; i++)
            for(let j = -1; j <= 1; j++){
                let x1 = topX+i*gameWindowWidth, y1 = topY+j*gameWindowHeight;
                this.gameWindowContext.fillStyle = block.getColor();
                this.gameWindowContext.roundRect(x1, y1, blockSize, blockSize, roundRadius).fill();
                this.gameWindowContext.strokeStyle = borderColorString;
                this.gameWindowContext.roundRect(x1, y1, blockSize, blockSize, roundRadius).stroke();
            }
    }
    clearContexts(){
        this.gameWindowContext.clearRect(0, 0, gameWindowWidth, gameWindowHeight);
        this.scoreWindowContext.clearRect(0, 0, scoreWindowWidth, scoreWindowHeight);
    }
    displayScoreWindow(){
        this.scoreWindowContext.textBaseline = "middle";
        this.scoreWindowContext.fillStyle = "#FFFFFF";

        let margin = 20, timerWidth = 0;
        let width = scoreWindowWidth-2*margin, height = scoreWindowHeight;

        if(this.mode === Game.MODE.TIMED){
            this.scoreWindowContext.font = fontString(scoreFont, true, 48);
            this.scoreWindowContext.textAlign = "center";
            let timerText = "" + (this.foodTimeRemaining / 1000).toFixed(1);
            timerWidth = this.scoreWindowContext.measureText(timerText).width;
            this.scoreWindowContext.fillText(timerText, margin+width/2, height/2, timerWidth);
        }
        let currentScoreString = "Current Score:" + (""+this.score).padStart(6);
        let highScoreString = "High Score:" + (""+Game.highScore).padStart(6);

        this.scoreWindowContext.font = fontString(scoreFont, true, 30);
        this.scoreWindowContext.textAlign = "start";
        this.scoreWindowContext.fillText(currentScoreString, margin, height/2);
        this.scoreWindowContext.textAlign = "end";
        this.scoreWindowContext.fillText(highScoreString, margin+width, height/2);
    }
    display(){
        switch (this.status){
            case Game.STATUS.START: this.displayGameStart();return;
            case Game.STATUS.CHOICE: this.displayChoice(); return;
            case Game.STATUS.RUNNING: this.displayGameRunning(); return;
            case Game.STATUS.OVER: this.displayGameOver(); return;
            default: console.log("Invalid Game Status")
        }
    }
    displayGameRunning(){
        this.clearContexts();
        this.displayScoreWindow();

        this.snakeBody.forEach((block) => this.displayObject(block));
        this.displayObject(this.food);
    }
    displayGameStart(){
        this.clearContexts();
        this.gameWindowContext.fillStyle = "#000000";
        this.gameWindowContext.textAlign = "center";
        this.gameWindowContext.font = fontString(gameFont, false, 72);
        this.gameWindowContext.fillText("The Snake Game", gameWindowWidth/2, gameWindowHeight/2-20);
        this.gameWindowContext.font = fontString(gameFont, false, 36);
        this.gameWindowContext.fillText("Press SpaceBar to play", gameWindowWidth/2, gameWindowHeight/2+20);
    }
    displayChoice(){
        this.clearContexts();
        this.gameWindowContext.fillStyle = "#000000";
        this.gameWindowContext.textAlign = "center";
        this.gameWindowContext.font = fontString(gameFont, false, 72);
        this.gameWindowContext.fillText("The Snake Game", gameWindowWidth/2, gameWindowHeight/2-30);
        this.gameWindowContext.font = fontString(gameFont, false, 36);
        this.gameWindowContext.fillText("Press T for Timed Play", gameWindowWidth/2, gameWindowHeight/2+15);
        this.gameWindowContext.fillText("Press F for Free Play", gameWindowWidth/2, gameWindowHeight/2+50);
    }
    displayGameOver(){
        let imageData = this.gameWindowContext.getImageData(0, 0, gameWindowWidth, gameWindowHeight);
        this.clearContexts();
        this.displayScoreWindow();
        let blurredImageData = blurImage(imageData);
        this.gameWindowContext.putImageData(blurredImageData, 0, 0);
        this.gameWindowContext.fillStyle = "#000000";
        this.gameWindowContext.textAlign = "center";
        this.gameWindowContext.font = fontString(gameFont, false, 72);
        this.gameWindowContext.fillText("Your Score: "+this.score, gameWindowWidth/2, gameWindowHeight/2-20);
        this.gameWindowContext.font = fontString(gameFont, false,36);
        this.gameWindowContext.fillText("Press SpaceBar to play again", gameWindowWidth/2, gameWindowHeight/2+30);
    }
}


function initializeGame(){
    document.getElementById("window-size-error-message").style.display = "none";
    document.getElementById("loading").style.display = "none";
    scoreWindow.style.display = "block";
    gameWindow.style.display = "block";


    gameObject = new Game(gameWindowContext, scoreWindowContext);
    gameObject.resetGame();
    gameObject.status = Game.STATUS.START;
    gameObject.display();
    let timer = null;
    document.addEventListener('keydown', (event) => {
        let keycode = event.code;
        switch (gameObject.status){
            case Game.STATUS.START:
                if(keycode === "Space"){
                    gameObject.status = Game.STATUS.CHOICE;
                    gameObject.display();
                }
                break;
            case Game.STATUS.CHOICE:
                if(keycode === "KeyF" || keycode === "KeyT"){
                    if(keycode === "KeyF")gameObject.setGameMode(Game.MODE.FREE);
                    if(keycode === "KeyT")gameObject.setGameMode(Game.MODE.TIMED);

                    gameObject.status = Game.STATUS.RUNNING;
                    timer = setInterval(function(){
                        if(gameObject.performMove()){
                            gameObject.display();
                        }else{
                            clearInterval(timer);
                            gameObject.updateHighScore();
                            gameObject.status = Game.STATUS.OVER;
                            gameObject.display();
                            playSound(GameOverAudio);
                        }
                    }, timeOut);
                }
                break;
            case Game.STATUS.RUNNING:
                if(keycode.startsWith("Arrow"))
                    gameObject.updateDirection(keycode.charAt(5));
                break;
            case Game.STATUS.OVER:
                if(keycode === "Space"){
                    gameObject.status = Game.STATUS.START;
                    gameObject.resetGame();
                    gameObject.display();
                }
                break;
        }
    });


}

window.onresize = function(){window.location.reload();}

if(validWindowSize(windowWidth, windowHeight, blockSize))
    setTimeout(initializeGame, 3000);
else
    displayWindowSizeError();