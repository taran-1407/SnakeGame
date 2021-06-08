const gameWindow = document.getElementById("gameWindow");
const scoreWindow = document.getElementById("scoreWindow");
const gameWindowContext = gameWindow.getContext("2d");
const scoreWindowContext = scoreWindow.getContext("2d");
const gameWindowWidth = 1000, gameWindowHeight = 500, size = 50, roundRadius = 7;
const scoreWindowWidth = 1000, scoreWindowHeight = 500;
const scoreFont = "Comic Sans MS";
const gameFont = "Agent Orange";
gameWindowContext.width = window.innerWidth;

const timeOut = 200;
const giftGain = 100, moveGain = 5;
const delta = new Map()
delta['L'] = [-size, 0]
delta['R'] = [size, 0]
delta['U'] = [0, -size]
delta['D'] = [0, size]
const startWithBlocks = 4;

const KeyPressAudio = "./Assets/KeyPress.mp3";
const GameOverAudio = "./Assets/GameOver.wav"
const CaptureAudio = "./Assets/Capture.wav";

const headColorString = "#1F618D"
const tailColorString = "#2980B9"
const borderColorString = "#FFFFFF";
const giftColorString = "#85C1E9";


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

class SquareBlock{
    /**
     * @param {number} midX
     * @param {number} midY
     * @param {String} color
     */
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
}

class Game{
    static highScore = 0;
    constructor(gameWindowContext, scoreWindowContext) {
        this.gameWindowContext = gameWindowContext;
        this.scoreWindowContext = scoreWindowContext;
        this.snakeBody = [];
        this.food = []
        this.direction = 'L';
        this.newDirection = null;
        this.giftCaptured = null;
        this.score = 0

        this.snakeBody.push(new SquareBlock(gameWindowWidth/2, gameWindowHeight/2, headColorString));
        for(let i = 1; i<= startWithBlocks; i++)this.snakeBody.push(new SquareBlock(gameWindowWidth/2+i*size, gameWindowHeight/2, tailColorString));
        this.generateGift();
    }
    incrementScore(gain){
        this.score += gain;
        Game.highScore = Math.max(Game.highScore, this.score);
    }
    generateGift(){
        let randInt = (upto) => Math.floor(Math.random()*upto);
        let duplicate = undefined, x, y;
        do{
            x = randInt(gameWindowWidth/size)*size;
            y = randInt(gameWindowHeight/size)*size;
            duplicate = this.snakeBody.find((block) => block.getMidX() === x && block.getMidY() === y);
        }while (duplicate !== undefined);
        this.food.push(new SquareBlock(x, y, giftColorString));
    }
    keyEvent(newDirection){
        this.newDirection = newDirection;
        playSound(KeyPressAudio)
    }
    updateDirection(){
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
        this.updateDirection();
        let updatedPositions = this.snakeBody.map((x) => x);
        let nxt = new SquareBlock(updatedPositions[0].getMidX()+delta[this.direction][0], updatedPositions[0].getMidY()+delta[this.direction][1], headColorString);
        updatedPositions[0].setColor(tailColorString)
        if(this.giftCaptured !== null){
            updatedPositions.splice(0, 1, this.giftCaptured);
            this.giftCaptured = null;
            this.generateGift()
        }else updatedPositions.pop();
        updatedPositions.splice(0, 0, nxt);

        if(this.collisionHappens(updatedPositions)){
            return false;
        }
        this.incrementScore(moveGain);
        this.snakeBody = updatedPositions;
        let giftId = -1;
        for(let i = 0; i< this.food.length; i++){
            if(this.food[i].getMidX() === nxt.getMidX() && this.food[i].getMidY() === nxt.getMidY()){
                giftId = i;
            }
        }
        if(giftId !== -1){
            this.giftCaptured = this.food[giftId];
            this.food.splice(giftId, 1);
            this.incrementScore(giftGain);
            playSound(CaptureAudio);
        }
        this.paintOnCanvas();
        return true;
    }
    collisionHappens(positions){
        for(let i = 1; i< positions.length; i++)
            if(positions[i].getMidX() === positions[0].getMidX() && positions[i].getMidY() === positions[0].getMidY())
                return true;
        return false;
    }
    displayObject(block){
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
    paintOnCanvas(){
        this.gameWindowContext.clearRect(0, 0, gameWindowWidth, gameWindowHeight);
        this.scoreWindowContext.clearRect(0, 0, scoreWindowWidth, scoreWindowHeight);
        this.scoreWindowContext.font = "bold 30px "+scoreFont;
        this.scoreWindowContext.fillStyle = "#FFFFFF";
        this.scoreWindowContext.textAlign = "start";
        this.scoreWindowContext.fillText("HighScore:", 10, 35);
        this.scoreWindowContext.fillText("Current Score:", scoreWindowWidth/2+10, 35);

        this.scoreWindowContext.textAlign = "end";
        this.scoreWindowContext.fillText(""+Game.highScore, scoreWindowWidth/2, 35, scoreWindowWidth-500);
        this.scoreWindowContext.fillText(this.score, scoreWindowWidth-10, 35, scoreWindowWidth-500);
        this.snakeBody.forEach((block) => this.displayObject(block));
        this.food.forEach((block) => this.displayObject(block));
    }
    displayGameOver(){
        let imageData = this.gameWindowContext.getImageData(0, 0, gameWindowWidth, gameWindowHeight);
        let blurredImageData = blurImage(imageData);
        this.gameWindowContext.putImageData(blurredImageData, 0, 0);
        this.gameWindowContext.fillStyle = "#000000";
        this.gameWindowContext.textAlign = "center";
        this.gameWindowContext.font = "bold 48px "+gameFont;
        this.gameWindowContext.fillText("Your Score: "+this.score, gameWindowWidth/2, gameWindowHeight/2-20);
        this.gameWindowContext.font = "bold 24px "+gameFont;
        this.gameWindowContext.fillText("Press SpaceBar to play again", gameWindowWidth/2, gameWindowHeight/2+30);
        playSound(GameOverAudio);
    }
}

let gameState = null;
let timer = null;
gameWindowContext.fillStyle = "#000000";
gameWindowContext.textAlign = "center";
gameWindowContext.font = "bold 48px "+gameFont;
gameWindowContext.fillText("The Snake Game", gameWindowWidth/2, gameWindowHeight/2-20);
gameWindowContext.font = "bold 24px "+gameFont;
gameWindowContext.fillText("Press SpaceBar to play", gameWindowWidth/2, gameWindowHeight/2+20);

document.addEventListener('keydown', (event) => {
    let keycode = event.code;
    if(keycode === "ArrowDown" && gameState !== null)gameState.keyEvent('D');
    if(keycode === "ArrowUp" && gameState !== null)gameState.keyEvent('U');
    if(keycode === "ArrowLeft" && gameState !== null)gameState.keyEvent('L');
    if(keycode === "ArrowRight" && gameState !== null)gameState.keyEvent('R');
    if(keycode === "Space" && gameState === null) {
        clearInterval(timer);
        gameState = new Game(gameWindowContext, scoreWindowContext);
        timer = setInterval(function (){
            if(!gameState.performMove()){
                clearInterval(timer);
                gameState.displayGameOver();
                gameState = null;
            }
        }, timeOut);
    }
});