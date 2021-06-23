"use strict";

const gameWindow = document.getElementById("gameWindow");
const scoreWindow = document.getElementById("scoreWindow");
const gameWindowContext = gameWindow.getContext("2d");
const scoreWindowContext = scoreWindow.getContext("2d");

const gameWindowWidth = 1200, gameWindowHeight = 500, size = 50, roundRadius = 7;
const scoreWindowWidth = 1200, scoreWindowHeight = 50;

const scoreFont = "Fira Mono, Cursive";
const gameFont = "Bungee Inline, Cursive";

const timeOut = 200, gameTimer = 5;
const foodGain = 100, moveGain = 5;
const startWithBlocks = 4;

const KeyPressAudio = "./Assets/KeyPress.mp3";
const GameOverAudio = "./Assets/GameOver.mp3"
const CaptureAudio = "./Assets/Capture.mp3";

const headColorString = "#1F618D"
const tailColorString = "#2980B9"
const borderColorString = "#FFFFFF";
const foodColorString = "#85C1E9";
const foodNotCapturedColorString = "#FF0000";

let startPageImage = new Image();
startPageImage.src = "./Assets/GameStart.jpg";

const delta = new Map()
delta['L'] = [-size, 0]
delta['R'] = [size, 0]
delta['U'] = [0, -size]
delta['D'] = [0, size]

function gaussianBlur(canvasImageData, blurRadius, sigma){
    let gaussian = (x, y, sigma) => Math.pow(Math.E, -(x*x+y*y)/(2*sigma*sigma)) / (2*Math.PI*sigma*sigma);
    let side = 2*blurRadius+1;
    let weight = [];
    let weightSum = 0;
    for(let r = -blurRadius; r <= blurRadius; r++)
        for(let c = -blurRadius; c <= blurRadius; c++){
            let v = gaussian(r, c, sigma);
            weight.push(v);
            weightSum += v;
        }
    weight = weight.map((value) => value/weightSum);
    let width = canvasImageData.width, height = canvasImageData.height;
    let imageData = canvasImageData.data;
    let blurredImageData = [];
    for(let r = 0; r < height; r++){
        for(let c = 0; c < width; c++){
            for(let layer = 0;layer < 4; layer++){
                let sum = 0, div = 0;
                for(let rr = Math.max(r-blurRadius, 0); rr <= Math.min(height-1, r+blurRadius); rr++){
                    for(let cc = Math.max(c-blurRadius, 0); cc <= Math.min(width-1, c+blurRadius); cc++){
                        let p = (rr-r+blurRadius)*side+cc-c+blurRadius;
                        sum += weight[p] * imageData[layer+4*(cc+width*rr)];
                        div += weight[p];
                    }
                }
                blurredImageData.push(sum/div);
            }
        }
    }
    return new ImageData(new Uint8ClampedArray(blurredImageData), width, height);
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
    static STATUS = {"START": 1, "OVER": 2,"CHOICE": 3, "RUNNING": 4};
    constructor(gameWindowContext, scoreWindowContext) {
        this.gameWindowContext = gameWindowContext;
        this.scoreWindowContext = scoreWindowContext;
        this.status = null;
        this.timed = false;
        this.snakeBody = [];
        this.food = null
        this.foodTimeRemaining = gameTimer*1000;
        this.foodTime = gameTimer;
    }
    resetGame(){
        this.snakeBody = [];
        this.timed = false;
        this.food = null
        this.foodTime = gameTimer*1000;
        this.foodTimeRemaining = this.foodTime;
        this.direction = 'L';
        this.newDirection = null;
        this.foodCaptured = null;
        this.score = 0;
        this.snakeBody.push(new SquareBlock(gameWindowWidth/2, gameWindowHeight/2, headColorString));
        for(let i = 1; i<= startWithBlocks; i++)this.snakeBody.push(new SquareBlock(gameWindowWidth/2+i*size, gameWindowHeight/2, tailColorString));
        this.generateFood();
    }
    incrementScore(gain){
        this.score += gain;
        Game.highScore = Math.max(Game.highScore, this.score);
    }
    generateFood(){
        let randInt = (upto) => Math.floor(Math.random()*upto);
        let duplicate = undefined, x, y;
        do{
            x = randInt(gameWindowWidth/size)*size;
            y = randInt(gameWindowHeight/size)*size;
            let food = new SquareBlock(x, y, foodColorString)
            duplicate = this.snakeBody.find((block) => block.samePosition(food));
        }while (duplicate !== undefined);
        this.food = new SquareBlock(x, y, foodColorString);
        if(this.timed){
            this.foodTimeRemaining = this.foodTime;
            this.foodTime += timeOut;
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
        let nxt = new SquareBlock(updatedPositions[0].getMidX()+delta[this.direction][0], updatedPositions[0].getMidY()+delta[this.direction][1], headColorString);

        updatedPositions[0].setColor(tailColorString)
        if(this.foodCaptured !== null){
            updatedPositions.splice(0, 1, this.foodCaptured);
            this.foodCaptured = null;
        }else updatedPositions.pop();
        updatedPositions.splice(0, 0, nxt);

        if(this.collisionHappens(updatedPositions)) {
            let copy = this.snakeBody.find((block, index) => index > 0 && block.samePosition(nxt));
            copy.setColor(foodNotCapturedColorString);
            this.displayGameState();
            return false;
        }

        if(this.timed && this.food !== null && this.foodTimeRemaining === 0 && !this.food.samePosition(nxt)){
            this.food.setColor(foodNotCapturedColorString);
            this.displayGameState();
            return false;
        }

        this.foodTimeRemaining -= timeOut;
        this.incrementScore(moveGain);
        this.snakeBody = updatedPositions;
        if(this.food.samePosition(nxt)){
            this.foodCaptured = this.food;
            this.food = null;
            this.incrementScore(foodGain);
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
        let topX = block.getMidX()-size/2, topY = block.getMidY()-size/2;
        for(let i = -1; i <= 1; i++)
            for(let j = -1; j <= 1; j++){
                let x1 = topX+i*gameWindowWidth, y1 = topY+j*gameWindowHeight;
                this.gameWindowContext.fillStyle = block.getColor();
                this.gameWindowContext.roundRect(x1, y1, size, size, roundRadius).fill();
                this.gameWindowContext.strokeStyle = borderColorString;
                this.gameWindowContext.roundRect(x1, y1, size, size, roundRadius).stroke();
            }
    }
    clearContexts(){
        this.gameWindowContext.clearRect(0, 0, gameWindowWidth, gameWindowHeight);
        this.scoreWindowContext.clearRect(0, 0, scoreWindowWidth, scoreWindowHeight);
    }
    displayGameState(){
        this.clearContexts();
        this.scoreWindowContext.font = fontString(scoreFont, true, 30);
        if(this.timed){
            this.scoreWindowContext.fillStyle = "#FFFFFF";
            this.scoreWindowContext.textAlign = "start";
            this.scoreWindowContext.fillText("High Score:", 10, 35);
            this.scoreWindowContext.fillText("Current Score:", scoreWindowWidth/2+100, 35);
            this.scoreWindowContext.textAlign = "end";
            this.scoreWindowContext.fillText(""+Game.highScore, scoreWindowWidth/2-100, 35 , scoreWindowWidth-500);
            this.scoreWindowContext.fillText(this.score, scoreWindowWidth-10, 35, scoreWindowWidth-500);

            if(this.food !== null) {
                this.scoreWindowContext.font = fontString(scoreFont, true, 50);
                this.scoreWindowContext.textAlign = "center";
                this.scoreWindowContext.fillText("" + (this.foodTimeRemaining / 1000).toFixed(1), scoreWindowWidth / 2, 42, scoreWindowWidth);
            }
        }else{
            this.scoreWindowContext.fillStyle = "#FFFFFF";
            this.scoreWindowContext.textAlign = "start";
            this.scoreWindowContext.fillText("High Score:", 10, 35);
            this.scoreWindowContext.fillText("Current Score:", scoreWindowWidth/2+10, 35);
            this.scoreWindowContext.textAlign = "end";
            this.scoreWindowContext.fillText(""+Game.highScore, scoreWindowWidth/2, 35, scoreWindowWidth-500);
            this.scoreWindowContext.fillText(this.score, scoreWindowWidth-10, 35, scoreWindowWidth-500);
        }

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

        startPageImage.onload = () => {
            this.gameWindowContext.drawImage(startPageImage, 100, 0);
        }

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


let gameObject = new Game(gameWindowContext, scoreWindowContext);
gameObject.resetGame();
gameObject.status = Game.STATUS.START;
gameObject.displayGameStart();
console.log("HU");
gameWindowContext.drawImage(startPageImage, 100, 0);
let timer = null;

document.addEventListener('keydown', (event) => {
    let keycode = event.code;
    switch (gameObject.status){
        case Game.STATUS.START:
            if(keycode === "Space"){
                gameObject.status = Game.STATUS.CHOICE;
                gameObject.displayChoice();
            }
            break;
        case Game.STATUS.CHOICE:
            if(keycode === "KeyF" || keycode === "KeyT"){
                if(keycode === "KeyF")gameObject.timed = false;
                if(keycode === "KeyT")gameObject.timed = true;

                gameObject.status = Game.STATUS.RUNNING;
                timer = setInterval(function(){
                    if(gameObject.performMove()){
                        gameObject.displayGameState();
                    }else{
                        clearInterval(timer);
                        gameObject.status = Game.STATUS.OVER;
                        gameObject.displayGameOver();
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
                gameObject.displayGameStart();
            }
            break;
    }
});