// ===== Aセクション：初期設定 =====
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const chatLog = document.getElementById("chat-log");
const chatInput = document.getElementById("chat-input");
const sendButton = document.getElementById("send-button");

const socket = io();

const background = new Image();
background.src = "/static/bg.png";

const keys = {};
const otherPlayers = {};

const shootingStars = [];
let lastShootingStarTime = Date.now();
const remoteHoldingCatches = {};

const ROOM_MAX_PLAYERS = 10;

const characterPalettes = [
    { body: "#2f7ad6", hat: "#1f4ea3", pants: "#222222", skin: "#f3c49a", hair: "#2b1b16" },
    { body: "#d65a2f", hat: "#8b2f1f", pants: "#263238", skin: "#f1b889", hair: "#1f1712" },
    { body: "#2fa86b", hat: "#1e6b46", pants: "#2b2b3a", skin: "#f0c29a", hair: "#3a2317" },
    { body: "#b45ad6", hat: "#6d3790", pants: "#20202a", skin: "#f2bd91", hair: "#211713" },
    { body: "#d6a42f", hat: "#8a6720", pants: "#273142", skin: "#efbb8d", hair: "#352017" },
    { body: "#36a7b8", hat: "#1f6570", pants: "#24242c", skin: "#f4c39b", hair: "#241811" },
    { body: "#d64f86", hat: "#8d2856", pants: "#2c2430", skin: "#f1c6a5", hair: "#2a1a14" },
    { body: "#8bbf2f", hat: "#5c7f1f", pants: "#222b22", skin: "#f0be91", hair: "#1c1713" },
    { body: "#5870d6", hat: "#354289", pants: "#1f2630", skin: "#ecc09d", hair: "#2f1e16" },
    { body: "#c46c2f", hat: "#784019", pants: "#2b2b2b", skin: "#f2c09c", hair: "#201713" }
];

const player = {
    name: "あなた",
    x: 640,
    y: 500,
    size: 42,
    speed: 4,
    clickSpeed: 2.2,
    message: "",
    messageTimer: 0,
    holdingLog: false,
    targetX: null,
    targetY: null,
    isFishing: false,
    fishReady: false,
    fishingStartTime: 0,
    fishingWaitTime: 0,
    fishCaughtCount: 0,
    caughtItemTimer: 0,
    lastCatchType: null,
    holdingCatch: null,
    colors: characterPalettes[0]
};

const fire = {
    x: 640,
    y: 495,
    currentPower: 1.0,
    boostPower: 0.0,
    frame: 0,
    sparks: [],
    lastFeedTime: Date.now()
};

const woodItems = [];
const cookedFoods = [];

const MAX_WOOD_COUNT = 10;

let hasEnteredRoom = false;
let lastSentMoveTime = 0;
let lastTapTime = 0;

const catchTable = [
    { name: "アジ", type: "fish" },
    { name: "イワシ", type: "fish" },
    { name: "タイ", type: "fish" },
    { name: "サバ", type: "fish" },
    { name: "ヒラメ", type: "fish" },
    { name: "小さな長靴", type: "boot" },
    { name: "空き缶", type: "can" },
    { name: "古い宝箱", type: "treasure" }
];


// ===== Bセクション：Socket.IO通信 =====
socket.on("current_players", (players) => {
    for (const sid in players) {
        if (sid !== socket.id) {
            otherPlayers[sid] = makeRemotePlayer(players[sid]);
        }
    }
});

socket.on("player_joined", (data) => {
    if (data.sid === socket.id) {
        return;
    }

    otherPlayers[data.sid] = makeRemotePlayer(data.player);
    addChatLine("システム", `${data.player.name}さんが入室しました。`);
});

socket.on("player_moved", (data) => {
    if (data.sid === socket.id) {
        return;
    }

    if (otherPlayers[data.sid]) {
        otherPlayers[data.sid].x = data.x;
        otherPlayers[data.sid].y = data.y;
        otherPlayers[data.sid].holdingLog = data.holdingLog || false;
        otherPlayers[data.sid].isFishing = data.isFishing || false;
        otherPlayers[data.sid].fishReady = data.fishReady || false;
        if (data.lastCatchType !== undefined) {
            otherPlayers[data.sid].lastCatchType = data.lastCatchType;
        }

        if (Object.prototype.hasOwnProperty.call(data, "holdingCatch")) {
            otherPlayers[data.sid].holdingCatch = data.holdingCatch;

            if (data.holdingCatch) {
                remoteHoldingCatches[data.sid] = {
                    holdingCatch: data.holdingCatch,
                    lastCatchType: data.lastCatchType || data.holdingCatch.type || "fish"
                };
            } else {
                delete remoteHoldingCatches[data.sid];
            }
        }

        if (otherPlayers[data.sid].fishReady) {
            otherPlayers[data.sid].message = "！";
            otherPlayers[data.sid].messageTimer = 999999;
        }
    }
});

socket.on("chat", (data) => {
    addChatLine(data.name, data.text);

    if (data.sid === socket.id) {
        return;
    }

    if (otherPlayers[data.sid]) {
        otherPlayers[data.sid].message = data.text;
        otherPlayers[data.sid].messageTimer = 240;
    }
});

socket.on("player_left", (data) => {
    if (otherPlayers[data.sid]) {
        const name = otherPlayers[data.sid].name;
        delete otherPlayers[data.sid];
        delete remoteHoldingCatches[data.sid];
        addChatLine("システム", `${name}さんが退出しました。`);
    }
});


socket.on("current_wood_items", (items) => {
    woodItems.length = 0;

    for (const item of items) {
        woodItems.push(item);
    }
});

socket.on("wood_spawned", (wood) => {
    woodItems.push(wood);
    addChatLine("システム", "どこかに薪が落ちました。");
});

socket.on("wood_removed", (data) => {
    const index = woodItems.findIndex(wood => wood.id === data.id);

    if (index !== -1) {
        woodItems.splice(index, 1);
    }
});

socket.on("fire_fed", () => {
    fire.currentPower = Math.min(fire.currentPower + 0.45, 3.5);
    fire.boostPower = Math.min(fire.boostPower + 0.25, 1.0);
    fire.lastFeedTime = Date.now();
});


socket.on("fishing_state", (data) => {
    if (data.sid === socket.id) {
        return;
    }

    if (otherPlayers[data.sid]) {
        otherPlayers[data.sid].isFishing = data.isFishing || false;
        otherPlayers[data.sid].fishReady = data.fishReady || false;
        if (data.lastCatchType !== undefined) {
            otherPlayers[data.sid].lastCatchType = data.lastCatchType;
        }

        if (Object.prototype.hasOwnProperty.call(data, "holdingCatch")) {
            otherPlayers[data.sid].holdingCatch = data.holdingCatch;

            if (data.holdingCatch) {
                remoteHoldingCatches[data.sid] = {
                    holdingCatch: data.holdingCatch,
                    lastCatchType: data.lastCatchType || data.holdingCatch.type || "fish"
                };
            } else {
                delete remoteHoldingCatches[data.sid];
            }
        }

        if (otherPlayers[data.sid].fishReady) {
            otherPlayers[data.sid].message = "！";
            otherPlayers[data.sid].messageTimer = 999999;
        } else if (otherPlayers[data.sid].isFishing) {
            otherPlayers[data.sid].message = "釣り中…";
            otherPlayers[data.sid].messageTimer = 160;
        } else {
            otherPlayers[data.sid].message = "";
            otherPlayers[data.sid].messageTimer = 0;
        }
    }
});


socket.on("shooting_star_spawned", (star) => {
    shootingStars.push({
        x: 380 + (Number(star.x) % 440),
        y: Number(star.y),
        vx: Number(star.vx),
        vy: Number(star.vy),
        life: Number(star.life) || 35
    });
});


function sendFishingState() {
    if (!hasEnteredRoom) {
        return;
    }

    socket.emit("fishing_state", {
        isFishing: player.isFishing,
        fishReady: player.fishReady,
        lastCatchType: player.lastCatchType,
        holdingCatch: player.holdingCatch
    });
}


socket.on("current_cooked_foods", (foods) => {
    cookedFoods.length = 0;

    for (const food of foods) {
        cookedFoods.push(food);
    }
});

socket.on("food_cooked", (data) => {
    const exists = cookedFoods.some(food => food.id === data.food.id);

    if (!exists) {
        cookedFoods.push(data.food);
    }

    if (data.sid !== socket.id && otherPlayers[data.sid]) {
        otherPlayers[data.sid].holdingCatch = null;
        otherPlayers[data.sid].lastCatchType = null;
        otherPlayers[data.sid].caughtItemTimer = 0;
    }
});

socket.on("food_eaten", (data) => {
    const index = cookedFoods.findIndex(food => food.id === data.id);

    if (index !== -1) {
        cookedFoods.splice(index, 1);
    }
});



socket.on("catch_result", (data) => {
    if (data.sid === socket.id) {
        return;
    }

    const receivedHoldingCatch =
        data.holdingCatch ||
        (
            data.lastCatchType === "fish"
                ? {
                    name: data.name,
                    type: "fish"
                }
                : null
        );

    if (receivedHoldingCatch) {
        remoteHoldingCatches[data.sid] = {
            holdingCatch: receivedHoldingCatch,
            lastCatchType: data.lastCatchType || receivedHoldingCatch.type || "fish"
        };
    } else {
        delete remoteHoldingCatches[data.sid];
    }

    if (otherPlayers[data.sid]) {
        otherPlayers[data.sid].isFishing = false;
        otherPlayers[data.sid].fishReady = false;
        otherPlayers[data.sid].lastCatchType = data.lastCatchType || null;
        otherPlayers[data.sid].holdingCatch = receivedHoldingCatch;
        otherPlayers[data.sid].caughtItemTimer = 240;
        otherPlayers[data.sid].message = `${data.name}！`;
        otherPlayers[data.sid].messageTimer = 180;
    }
});

socket.on("hold_catch_changed", (data) => {
    if (data.sid === socket.id) {
        return;
    }

    if (data.holdingCatch) {
        remoteHoldingCatches[data.sid] = {
            holdingCatch: data.holdingCatch,
            lastCatchType: data.lastCatchType || data.holdingCatch.type || "fish"
        };
    } else {
        delete remoteHoldingCatches[data.sid];
    }

    if (otherPlayers[data.sid]) {
        otherPlayers[data.sid].holdingCatch =
            data.holdingCatch || null;

        otherPlayers[data.sid].lastCatchType =
            data.lastCatchType || null;
    }
});

function sendHoldCatchState() {
    if (!hasEnteredRoom) {
        return;
    }

    socket.emit("hold_catch_changed", {
        holdingCatch: player.holdingCatch,
        lastCatchType: player.lastCatchType
    });
}


function sendCatchResult(catchData) {
    if (!hasEnteredRoom) {
        return;
    }

    const holdingCatchForSend =
        catchData.type === "fish"
            ? {
                name: catchData.name,
                type: catchData.type
            }
            : null;

    socket.emit("catch_result", {
        name: catchData.name,
        lastCatchType: catchData.type,
        holdingCatch: holdingCatchForSend
    });
}


socket.on("eat_motion", (data) => {
    if (data.sid === socket.id) {
        return;
    }

    if (otherPlayers[data.sid]) {
        otherPlayers[data.sid].message = "もぐもぐ";
        otherPlayers[data.sid].messageTimer = 160;
    }
});

function makeRemotePlayer(data) {
    const holdingCatch =
        data.holdingCatch || null;

    if (holdingCatch) {
        remoteHoldingCatches[data.sid] = {
            holdingCatch: holdingCatch,
            lastCatchType: data.lastCatchType || holdingCatch.type || "fish"
        };
    }

    return {
        name: data.name,
        x: data.x,
        y: data.y,
        size: 42,
        message: "",
        messageTimer: 0,
        holdingLog: data.holdingLog || false,
        isFishing: data.isFishing || false,
        fishReady: data.fishReady || false,
        lastCatchType: data.lastCatchType || null,
        holdingCatch: holdingCatch,
        caughtItemTimer: holdingCatch ? 240 : 0,
        colors: data.colors || characterPalettes[0]
    };
}


function sendMyPosition(force = false) {
    if (!hasEnteredRoom) {
        return;
    }

    const now = Date.now();

    if (!force && now - lastSentMoveTime < 80) {
        return;
    }

    lastSentMoveTime = now;

    socket.emit("move", {
        sid: socket.id,
        x: player.x,
        y: player.y,
        holdingLog: player.holdingLog,
        isFishing: player.isFishing,
        fishReady: player.fishReady,
        lastCatchType: player.lastCatchType,
        holdingCatch: player.holdingCatch
    });
}


// ===== Cセクション：入力処理 =====
document.addEventListener("keydown", (event) => {
    keys[event.key] = true;

    if (event.code === "Space") {
        event.preventDefault();

        if (hasEnteredRoom) {
            handleSpaceAction();
        }
    }
});

document.addEventListener("keyup", (event) => {
    keys[event.key] = false;
});

canvas.addEventListener("click", (event) => {
    if (hasEnteredRoom && !player.isFishing) {
        setPlayerTarget(event);
    }
});


canvas.addEventListener("touchend", (event) => {
    if (!hasEnteredRoom) {
        return;
    }

    const now = Date.now();

    if (now - lastTapTime < 320) {
        event.preventDefault();
        handleSpaceAction();
        lastTapTime = 0;
        return;
    }

    lastTapTime = now;

    if (!player.isFishing) {
        const touch = event.changedTouches[0];
        setPlayerTarget(touch);
    }
});

sendButton.addEventListener("click", sendChat);

chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        sendChat();
    }
});


// ===== Dセクション：入室画面処理 =====
function showEntryPanel() {
    const panel = document.createElement("div");
    panel.id = "entry-panel";
    panel.innerHTML = `
        <div id="entry-box">
            <div id="entry-title">海辺チャットへ入室</div>
            <div id="entry-text">名前を決めてください</div>
            <input id="entry-name" type="text" maxlength="12" placeholder="名前">
            <button id="entry-button">入室する</button>
            <div id="entry-note">キャラの色と服は自動で決まります</div>
        </div>
    `;

    document.body.appendChild(panel);

    const input = document.getElementById("entry-name");
    const button = document.getElementById("entry-button");

    input.focus();

    button.addEventListener("click", enterRoom);

    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            enterRoom();
        }
    });
}

function enterRoom() {
    const input = document.getElementById("entry-name");
    const panel = document.getElementById("entry-panel");

    const enteredName = input.value.trim();

    if (enteredName === "") {
        input.value = "";
        input.placeholder = "名前を入れてください";
        input.focus();
        return;
    }

    player.name = enteredName;
    player.colors = chooseRandomPalette();

    hasEnteredRoom = true;

    if (panel) {
        panel.remove();
    }

    socket.emit("join", {
        sid: socket.id,
        name: player.name,
        x: player.x,
        y: player.y,
        colors: player.colors,
        holdingLog: player.holdingLog,
        isFishing: player.isFishing,
        fishReady: player.fishReady,
        lastCatchType: player.lastCatchType,
        holdingCatch: player.holdingCatch
    });

    addChatLine("システム", `${player.name}さんが入室しました。`);
    addChatLine("システム", `この部屋の最大人数は${ROOM_MAX_PLAYERS}人です。`);
    addChatLine("システム", "海辺の近くでSpaceを押すと釣りができます。");
    addChatLine("システム", "チャットと位置は同じWi-Fi内で共有されます。");
}

function chooseRandomPalette() {
    const index = Math.floor(Math.random() * characterPalettes.length);
    return characterPalettes[index];
}

function createEntryPanelStyle() {
    const style = document.createElement("style");

    style.textContent = `
        #entry-panel {
            position: fixed;
            inset: 0;
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(3, 8, 18, 0.68);
            backdrop-filter: blur(4px);
            font-family: "Meiryo", sans-serif;
        }

        #entry-box {
            width: 330px;
            padding: 24px;
            color: white;
            text-align: center;
            background: rgba(12, 20, 34, 0.92);
            border: 1px solid rgba(180, 220, 255, 0.55);
            border-radius: 16px;
            box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45);
        }

        #entry-title {
            font-size: 22px;
            font-weight: bold;
            color: #8fe6ff;
            margin-bottom: 12px;
        }

        #entry-text {
            font-size: 14px;
            margin-bottom: 10px;
        }

        #entry-name {
            width: 100%;
            box-sizing: border-box;
            padding: 10px 12px;
            color: white;
            background: rgba(0, 0, 0, 0.35);
            border: 1px solid rgba(180, 220, 255, 0.4);
            border-radius: 10px;
            outline: none;
            font-size: 16px;
            text-align: center;
        }

        #entry-button {
            width: 100%;
            margin-top: 12px;
            padding: 10px;
            border: none;
            border-radius: 10px;
            background: rgba(130, 210, 255, 0.9);
            color: #07111f;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
        }

        #entry-note {
            margin-top: 10px;
            font-size: 12px;
            opacity: 0.8;
        }
    `;

    document.head.appendChild(style);
}


// ===== Eセクション：チャット処理 =====
function sendChat() {
    if (!hasEnteredRoom) {
        return;
    }

    const text = chatInput.value.trim();

    if (text === "") {
        return;
    }

    player.message = text;
    player.messageTimer = 240;

    socket.emit("chat", {
        sid: socket.id,
        name: player.name,
        text: text
    });

    chatInput.value = "";
}

function addChatLine(name, text) {
    const line = document.createElement("div");
    line.className = "chat-line";
    line.textContent = `${name}：${text}`;
    chatLog.appendChild(line);
    chatLog.scrollTop = chatLog.scrollHeight;
}


// ===== Fセクション：プレイヤー移動 =====
function setPlayerTarget(event) {
    const rect = canvas.getBoundingClientRect();

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clickX = (event.clientX - rect.left) * scaleX;
    const clickY = (event.clientY - rect.top) * scaleY;

    player.targetX = Math.max(40, Math.min(canvas.width - 40, clickX));
    player.targetY = Math.max(300, Math.min(canvas.height - 70, clickY));
}

function updatePlayer() {
    if (!hasEnteredRoom) {
        return;
    }

    if (chatInput === document.activeElement) {
        return;
    }

    if (player.isFishing) {
        if (player.messageTimer > 0 && player.messageTimer < 999999) {
            player.messageTimer -= 1;
        }

        return;
    }

    const beforeX = player.x;
    const beforeY = player.y;

    let dx = 0;
    let dy = 0;

    if (keys["ArrowLeft"] || keys["a"] || keys["A"]) {
        dx -= player.speed;
    }

    if (keys["ArrowRight"] || keys["d"] || keys["D"]) {
        dx += player.speed;
    }

    if (keys["ArrowUp"] || keys["w"] || keys["W"]) {
        dy -= player.speed;
    }

    if (keys["ArrowDown"] || keys["s"] || keys["S"]) {
        dy += player.speed;
    }

    if (dx !== 0 || dy !== 0) {
        player.targetX = null;
        player.targetY = null;

        player.x += dx;
        player.y += dy;
    } else {
        movePlayerToClickTarget();
    }

    player.x = Math.max(40, Math.min(canvas.width - 40, player.x));
    player.y = Math.max(300, Math.min(canvas.height - 70, player.y));

    if (player.messageTimer > 0 && player.messageTimer < 999999) {
        player.messageTimer -= 1;
    }

    if (beforeX !== player.x || beforeY !== player.y) {
        sendMyPosition(false);
    }
}

function movePlayerToClickTarget() {
    if (player.targetX === null || player.targetY === null) {
        return;
    }

    const dx = player.targetX - player.x;
    const dy = player.targetY - player.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < player.clickSpeed) {
        player.x = player.targetX;
        player.y = player.targetY;
        player.targetX = null;
        player.targetY = null;
        sendMyPosition(true);
        return;
    }

    player.x += (dx / distance) * player.clickSpeed;
    player.y += (dy / distance) * player.clickSpeed;
}


// ===== Gセクション：薪アイテム処理 =====
function spawnWood() {
    // 薪の生成はサーバー側で行う
    // チャット送信後、app.py 側が wood_spawned を全員に送る
}

function updateWoodItem() {
    if (!hasEnteredRoom) {
        return;
    }

    if (!player.holdingLog) {
        for (let i = woodItems.length - 1; i >= 0; i--) {
            const wood = woodItems[i];
            const distanceToWood = getDistance(player.x, player.y, wood.x, wood.y);

            if (distanceToWood < 42) {
                player.holdingLog = true;

                socket.emit("pick_wood", {
                    id: wood.id
                });

                sendMyPosition(true);

                addChatLine("システム", "薪を拾いました。焚火まで運んでください。");
                break;
            }
        }
    }

    if (player.holdingLog) {
        const distanceToFire = getDistance(player.x, player.y, fire.x, fire.y);

        if (distanceToFire < 58) {
            player.holdingLog = false;

            socket.emit("feed_fire");

            sendMyPosition(true);

            addChatLine("システム", "薪をくべました。炎が大きくなりました。");
        }
    }
}


// ===== Hセクション：焚火更新処理 =====
function updateFire() {
    fire.frame += 1;

    const elapsedSeconds = (Date.now() - fire.lastFeedTime) / 1000;
    const targetPower = Math.max(0.08, 1.0 - elapsedSeconds / 300);

    fire.currentPower += (targetPower - fire.currentPower) * 0.0015;

    if (fire.currentPower < 0.08) {
        fire.currentPower = 0.08;
    }

    if (fire.boostPower > 0) {
        fire.boostPower *= 0.9992;

        if (fire.boostPower < 0.01) {
            fire.boostPower = 0;
        }
    }

    const power = fire.currentPower + fire.boostPower;
    const sparkChance = 0.08 + power * 0.08;

    if (Math.random() < sparkChance) {
        fire.sparks.push({
            x: fire.x + rand(-20, 20),
            y: fire.y - rand(10, 35),
            vx: rand(-0.35, 0.35),
            vy: rand(-1.6, -0.6),
            life: rand(25, 55),
            maxLife: 55,
            size: rand(1.5, 3.5)
        });
    }

    for (const spark of fire.sparks) {
        spark.x += spark.vx;
        spark.y += spark.vy;
        spark.life -= 1;
    }

    fire.sparks = fire.sparks.filter(spark => spark.life > 0);
}



function updateShootingStars() {
    for (const star of shootingStars) {
        star.x += star.vx;
        star.y += star.vy;
        star.life -= 1;
    }

    for (let i = shootingStars.length - 1; i >= 0; i--) {
        const star = shootingStars[i];

        if (
            star.life <= 0 ||
            star.x > canvas.width + 200 ||
            star.y > canvas.height + 200
        ) {
            shootingStars.splice(i, 1);
        }
    }
}

// ===== Iセクション：釣り・料理処理 =====
function handleSpaceAction() {
    if (chatInput === document.activeElement) {
        return;
    }

    if (player.isFishing) {
        if (player.fishReady) {
            catchFish();
        }

        return;
    }

    if (tryEatFood()) {
        return;
    }

    if (tryCookCatch()) {
        return;
    }

    startFishing();
}

function startFishing() {
    if (!isNearSea()) {
        addChatLine("システム", "海辺の近くでSpaceを押すと釣りができます。");
        return;
    }

    if (player.holdingLog) {
        addChatLine("システム", "薪を持っている間は釣りができません。");
        return;
    }

    if (player.holdingCatch) {
        addChatLine("システム", "釣った魚を持っている間は釣りができません。焚火の近くで焼けます。");
        return;
    }

    player.isFishing = true;
    player.fishReady = false;
    player.fishingStartTime = Date.now();
    player.fishingWaitTime = rand(2500, 6500);
    player.targetX = null;
    player.targetY = null;
    player.message = "釣り中…";
    player.messageTimer = 160;

    addChatLine("システム", "釣りを開始しました。");

    sendFishingState();
}

function updateFishing() {
    if (!player.isFishing || player.fishReady) {
        return;
    }

    const elapsed = Date.now() - player.fishingStartTime;

    if (elapsed >= player.fishingWaitTime) {
        player.fishReady = true;
        player.message = "！";
        player.messageTimer = 999999;
        addChatLine("システム", "何かがかかりました！Spaceを押してください。");

        sendFishingState();
    }
}

function catchFish() {
    const catchData = catchTable[Math.floor(Math.random() * catchTable.length)];

    player.isFishing = false;
    player.fishReady = false;
    player.fishingStartTime = 0;
    player.fishingWaitTime = 0;
    player.fishCaughtCount += 1;
    player.caughtItemTimer = 240;
    player.lastCatchType = catchData.type;
    player.message = `${catchData.name}！`;
    player.messageTimer = 180;

    if (catchData.type === "fish") {
        player.holdingCatch = {
            name: catchData.name,
            type: catchData.type
        };

        addChatLine("システム", `${catchData.name}が釣れました！焚火の近くで焼けます。`);
    } else {
        player.holdingCatch = null;

        addChatLine("システム", `${catchData.name}が釣れました……。これは食べられません。`);
    }

    sendFishingState();
    sendHoldCatchState();
    sendCatchResult(catchData);
    sendMyPosition(true);
}

function tryCookCatch() {
    if (!player.holdingCatch) {
        return false;
    }

    const distanceToFire = getDistance(player.x, player.y, fire.x, fire.y);

    if (distanceToFire > 80) {
        return false;
    }

    const angle = Math.random() * Math.PI * 2;
    const radius = rand(38, 58);

    const foodX = fire.x + Math.cos(angle) * radius;
    const foodY = fire.y + Math.sin(angle) * radius * 0.55 + 18;

    const foodData = {
        x: foodX,
        y: foodY,
        name: player.holdingCatch.name,
        type: player.holdingCatch.type
    };

    socket.emit("cook_food", foodData);

    addChatLine("システム", `${player.holdingCatch.name}を焚火で焼き始めました。`);

    player.holdingCatch = null;
    player.lastCatchType = null;
    player.caughtItemTimer = 0;

    sendHoldCatchState();
    sendMyPosition(true);

    return true;
}

function tryEatFood() {
    for (let i = cookedFoods.length - 1; i >= 0; i--) {
        const food = cookedFoods[i];
        const distance = getDistance(player.x, player.y, food.x, food.y);

        if (distance < 55) {
            socket.emit("eat_food", {
                id: food.id
            });

            socket.emit("eat_motion");

            player.message = "もぐもぐ";
            player.messageTimer = 160;
            addChatLine("システム", `${food.name}を食べました。`);
            return true;
        }
    }

    return false;
}


function isNearSea() {
    const upperSea = player.y >= 300 && player.y <= 420;
    const lowerSea = player.y >= 620 && player.y <= 710;

    return upperSea || lowerSea;
}


// ===== Jセクション：背景描画 =====
function drawBackground() {
    ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
}


// ===== Kセクション：薪・料理描画 =====
function drawWoodItem() {
    for (const wood of woodItems) {
        drawWoodBundle(wood.x, wood.y, wood.size, false);
    }

    for (const sid in otherPlayers) {
        const other = otherPlayers[sid];

        if (other.holdingLog) {
            drawWoodBundle(other.x + 25, other.y - 16, 20, true);
        }
    }

    if (player.holdingLog) {
        drawWoodBundle(player.x + 25, player.y - 16, 20, true);
    }
}

function drawCookedFoods() {
    for (const food of cookedFoods) {
        drawRoastingFood(food);
    }
}

function drawWoodBundle(x, y, size, isCarried) {
    ctx.save();

    ctx.translate(x, y);
    ctx.rotate(isCarried ? -0.2 : 0);

    if (!isCarried) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
        ctx.beginPath();
        ctx.ellipse(0, size * 0.35, size * 0.6, size * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.lineWidth = Math.max(4, size * 0.18);
    ctx.lineCap = "round";

    ctx.strokeStyle = "#5b321b";
    ctx.beginPath();
    ctx.moveTo(-size * 0.45, size * 0.12);
    ctx.lineTo(size * 0.45, -size * 0.14);
    ctx.stroke();

    ctx.strokeStyle = "#7a4523";
    ctx.beginPath();
    ctx.moveTo(-size * 0.45, -size * 0.10);
    ctx.lineTo(size * 0.45, size * 0.16);
    ctx.stroke();

    ctx.strokeStyle = "#9b6335";
    ctx.beginPath();
    ctx.moveTo(-size * 0.32, 0);
    ctx.lineTo(size * 0.38, 0);
    ctx.stroke();

    ctx.strokeStyle = "#d8c082";
    ctx.lineWidth = Math.max(2, size * 0.08);
    ctx.beginPath();
    ctx.moveTo(-size * 0.1, -size * 0.22);
    ctx.lineTo(size * 0.08, size * 0.24);
    ctx.stroke();

    ctx.restore();
}

function drawRoastingFood(food) {
    ctx.save();

    const bob = Math.sin((Date.now() + food.frameOffset) / 220) * 2;

    ctx.translate(food.x, food.y + bob);

    ctx.strokeStyle = "#6b3f22";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-22, 12);
    ctx.lineTo(22, -10);
    ctx.stroke();

    if (food.type === "fish") {
        drawFishShape(0, 0, 0.75, "#ffb347", "#ffe0a3");
    } else {
        drawCaughtObjectShape(0, 0, food.type, 0.75);
    }

    ctx.restore();
}


// ===== Lセクション：焚火描画 =====
function drawFire() {
    const power = fire.currentPower + fire.boostPower;
    const flicker = Math.sin(fire.frame * 0.32) * 0.08 + rand(-0.06, 0.06);
    const flameScale = Math.max(0.08, power + flicker);

    drawFireLight(flameScale);
    drawLogs();
    drawFlames(flameScale);
    drawSparks();
}

function drawFireLight(scale) {
    const glowRadius = 50 + scale * 55;

    const gradient = ctx.createRadialGradient(
        fire.x,
        fire.y,
        5,
        fire.x,
        fire.y,
        glowRadius
    );

    gradient.addColorStop(0.0, "rgba(255, 185, 60, 0.32)");
    gradient.addColorStop(0.35, "rgba(255, 115, 35, 0.18)");
    gradient.addColorStop(1.0, "rgba(255, 70, 20, 0.00)");

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(fire.x, fire.y, glowRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawLogs() {
    ctx.save();

    ctx.translate(fire.x, fire.y + 8);

    ctx.lineWidth = 7;
    ctx.lineCap = "round";

    ctx.strokeStyle = "#5b321b";
    ctx.beginPath();
    ctx.moveTo(-24, 6);
    ctx.lineTo(24, -8);
    ctx.stroke();

    ctx.strokeStyle = "#6d3d20";
    ctx.beginPath();
    ctx.moveTo(-24, -8);
    ctx.lineTo(24, 6);
    ctx.stroke();

    ctx.fillStyle = "#2c1710";
    ctx.fillRect(-8, 0, 16, 7);

    ctx.restore();
}

function drawFlames(scale) {
    const outerHeight = 52 * scale;
    const innerHeight = 36 * scale;
    const coreHeight = 24 * scale;

    const sway1 = Math.sin(fire.frame * 0.21) * 7 + rand(-3, 3);
    const sway2 = Math.sin(fire.frame * 0.37 + 2) * 5 + rand(-2, 2);
    const sway3 = Math.sin(fire.frame * 0.44 + 4) * 4 + rand(-2, 2);

    drawFlameShape(fire.x, fire.y + 4, 32 * scale, outerHeight, sway1, "rgba(255, 78, 18, 0.90)");
    drawFlameShape(fire.x - 4, fire.y + 2, 23 * scale, innerHeight, sway2, "rgba(255, 150, 28, 0.96)");
    drawFlameShape(fire.x + 5, fire.y + 4, 14 * scale, coreHeight, sway3, "rgba(255, 235, 105, 0.98)");
    drawFlameShape(fire.x - 17, fire.y + 8, 13 * scale, 25 * scale, -sway2, "rgba(255, 125, 22, 0.82)");
    drawFlameShape(fire.x + 17, fire.y + 8, 13 * scale, 25 * scale, sway2, "rgba(255, 125, 22, 0.82)");
}

function drawFlameShape(x, y, width, height, sway, color) {
    ctx.save();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - height);
    ctx.bezierCurveTo(
        x - width * 0.9 + sway,
        y - height * 0.45,
        x - width * 0.55,
        y - height * 0.1,
        x,
        y
    );
    ctx.bezierCurveTo(
        x + width * 0.55,
        y - height * 0.1,
        x + width * 0.9 + sway,
        y - height * 0.45,
        x,
        y - height
    );
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

function drawSparks() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (const spark of fire.sparks) {
        const alpha = Math.max(spark.life / spark.maxLife, 0);
        ctx.fillStyle = `rgba(255, 190, 65, ${alpha})`;
        ctx.fillRect(spark.x, spark.y, spark.size, spark.size);
    }

    ctx.restore();
}


// ===== Mセクション：キャラクター描画 =====

function drawShootingStars() {
    for (const star of shootingStars) {
        ctx.save();

        ctx.globalCompositeOperation = "lighter";

        // 長い尾
        ctx.strokeStyle = "rgba(180, 240, 255, 0.95)";
        ctx.lineWidth = 5;

        ctx.beginPath();
        ctx.moveTo(star.x - star.vx * 12, star.y - star.vy * 12);
        ctx.lineTo(star.x, star.y);
        ctx.stroke();

        // 短い白い芯
        ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(star.x - star.vx * 5, star.y - star.vy * 5);
        ctx.lineTo(star.x, star.y);
        ctx.stroke();

        // 星本体
        ctx.fillStyle = "rgba(255, 255, 255, 1.0)";
        ctx.beginPath();
        ctx.arc(star.x, star.y, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

function drawCharacter(chara) {
    const x = chara.x;
    const y = chara.y;
    const s = chara.size;
    const colors = chara.colors || characterPalettes[0];

    ctx.save();

    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.42, s * 0.36, s * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = colors.pants;
    ctx.fillRect(x - s * 0.18, y + s * 0.15, s * 0.13, s * 0.25);
    ctx.fillRect(x + s * 0.05, y + s * 0.15, s * 0.13, s * 0.25);

    ctx.fillStyle = colors.body;
    ctx.fillRect(x - s * 0.26, y - s * 0.12, s * 0.52, s * 0.38);

    ctx.fillStyle = colors.skin;
    ctx.fillRect(x - s * 0.22, y - s * 0.42, s * 0.44, s * 0.32);

    ctx.fillStyle = colors.hair;
    ctx.fillRect(x - s * 0.25, y - s * 0.45, s * 0.5, s * 0.12);

    ctx.fillStyle = colors.hat;
    ctx.fillRect(x - s * 0.3, y - s * 0.58, s * 0.6, s * 0.12);
    ctx.fillRect(x - s * 0.2, y - s * 0.7, s * 0.4, s * 0.15);

    ctx.fillStyle = "#111";
    ctx.fillRect(x - s * 0.11, y - s * 0.31, 3, 3);
    ctx.fillRect(x + s * 0.08, y - s * 0.31, 3, 3);

    if (chara.isFishing) {
        drawFishingRod(chara);
    }

    if (chara.caughtItemTimer > 0 && chara.lastCatchType) {
        drawCaughtItem(chara);
    }

    if (chara.holdingCatch) {
        drawHeldCatch(chara);
    }

    ctx.font = "14px Meiryo";
    ctx.textAlign = "center";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.strokeText(chara.name, x, y - s * 0.78);
    ctx.fillStyle = "white";
    ctx.fillText(chara.name, x, y - s * 0.78);

    drawSpeechBubble(chara);

    ctx.restore();
}

function drawFishingRod(chara) {
    const x = chara.x;
    const y = chara.y;
    const sway = Math.sin(Date.now() / 220) * 3;

    ctx.strokeStyle = "#4b2d18";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 18, y - 20);
    ctx.lineTo(x + 70 + sway, y - 75);
    ctx.stroke();

    ctx.strokeStyle = "rgba(220, 240, 255, 0.8)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 70 + sway, y - 75);
    ctx.lineTo(x + 95 + sway, y - 18);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillRect(x + 92 + sway, y - 18, 5, 5);
}

function drawCaughtItem(chara) {
    const x = chara.x + 48;
    const y = chara.y - 8;
    const bob = Math.sin(Date.now() / 180) * 3;

    ctx.save();

    ctx.translate(x, y + bob);

    if (chara.lastCatchType === "fish") {
        drawFishShape(0, 0, 1.0, "rgba(120, 210, 255, 0.95)", "rgba(170, 235, 255, 0.95)");
    } else {
        drawCaughtObjectShape(0, 0, chara.lastCatchType, 1.0);
    }

    ctx.restore();
}

function drawHeldCatch(chara) {
    const x = chara.x + 27;
    const y = chara.y - 17;

    ctx.save();

    ctx.translate(x, y);
    ctx.rotate(-0.15);

    if (chara.holdingCatch.type === "fish") {
        drawFishShape(0, 0, 0.65, "#8bdcff", "#d5f6ff");
    } else {
        drawCaughtObjectShape(0, 0, chara.holdingCatch.type, 0.65);
    }

    ctx.restore();
}

function drawFishShape(x, y, scale, bodyColor, finColor) {
    ctx.save();

    ctx.translate(x, y);
    ctx.scale(scale, scale);

    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.lineTo(-28, -8);
    ctx.lineTo(-28, 8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = finColor;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, -16);
    ctx.lineTo(12, -6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(9, -2, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function drawCaughtObjectShape(x, y, type, scale) {
    ctx.save();

    ctx.translate(x, y);
    ctx.scale(scale, scale);

    if (type === "boot") {
        ctx.fillStyle = "#5b3b25";
        ctx.fillRect(-8, -12, 14, 22);
        ctx.fillRect(-8, 6, 24, 8);
        ctx.fillStyle = "#2f1f18";
        ctx.fillRect(-5, -9, 8, 14);
    } else if (type === "can") {
        ctx.fillStyle = "#cfd6df";
        ctx.fillRect(-8, -13, 16, 26);
        ctx.fillStyle = "#8fa0b5";
        ctx.fillRect(-8, -10, 16, 4);
        ctx.fillRect(-8, 7, 16, 4);
        ctx.fillStyle = "#e65b5b";
        ctx.fillRect(-5, -4, 10, 8);
    } else {
        ctx.fillStyle = "#8b5a2b";
        ctx.fillRect(-13, -10, 26, 20);
        ctx.fillStyle = "#c98a2b";
        ctx.fillRect(-10, -7, 20, 14);
        ctx.fillStyle = "#ffd36a";
        ctx.fillRect(-3, -2, 6, 5);
    }

    ctx.restore();
}

function drawSpeechBubble(chara) {
    if (!chara.message || chara.messageTimer <= 0) {
        return;
    }

    const x = chara.x;
    const y = chara.y - chara.size * 1.08;
    const text = chara.message;

    ctx.font = "14px Meiryo";
    const padding = 10;
    const textWidth = ctx.measureText(text).width;
    const bubbleWidth = textWidth + padding * 2;
    const bubbleHeight = 30;

    const bx = x - bubbleWidth / 2;
    const by = y - bubbleHeight;

    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.strokeStyle = "rgba(30, 30, 40, 0.85)";
    ctx.lineWidth = 2;

    roundRect(bx, by, bubbleWidth, bubbleHeight, 8, true, true);

    ctx.beginPath();
    ctx.moveTo(x - 6, by + bubbleHeight);
    ctx.lineTo(x + 6, by + bubbleHeight);
    ctx.lineTo(x, by + bubbleHeight + 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#111";
    ctx.textAlign = "center";
    ctx.fillText(text, x, by + 20);
}

function drawClickTarget() {
    if (player.targetX === null || player.targetY === null) {
        return;
    }

    const pulse = Math.sin(Date.now() / 140) * 4;

    ctx.save();

    ctx.strokeStyle = "rgba(160, 230, 255, 0.85)";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(player.targetX, player.targetY, 12 + pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(player.targetX - 8, player.targetY);
    ctx.lineTo(player.targetX + 8, player.targetY);
    ctx.moveTo(player.targetX, player.targetY - 8);
    ctx.lineTo(player.targetX, player.targetY + 8);
    ctx.stroke();

    ctx.restore();
}

function drawFishingHint() {
    if (!hasEnteredRoom) {
        return;
    }

    ctx.save();

    ctx.font = "14px Meiryo";
    ctx.textAlign = "center";

    if (isNearSea() && !player.isFishing && !player.holdingCatch) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
        ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
        ctx.lineWidth = 4;
        ctx.strokeText("Space：釣り", player.x, player.y + 52);
        ctx.fillText("Space：釣り", player.x, player.y + 52);
    }

    if (player.holdingCatch && getDistance(player.x, player.y, fire.x, fire.y) < 80) {
        ctx.fillStyle = "rgba(255, 245, 190, 0.92)";
        ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
        ctx.lineWidth = 4;
        ctx.strokeText("Space：焼く", player.x, player.y + 52);
        ctx.fillText("Space：焼く", player.x, player.y + 52);
    }

    ctx.restore();
}

function drawEatingHint() {
    if (!hasEnteredRoom) {
        return;
    }

    for (const food of cookedFoods) {
        if (getDistance(player.x, player.y, food.x, food.y) < 55) {
            ctx.save();

            ctx.font = "14px Meiryo";
            ctx.textAlign = "center";
            ctx.fillStyle = "rgba(255, 245, 190, 0.92)";
            ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
            ctx.lineWidth = 4;
            ctx.strokeText("Space：食べる", food.x, food.y - 22);
            ctx.fillText("Space：食べる", food.x, food.y - 22);

            ctx.restore();

            return;
        }
    }
}

function roundRect(x, y, width, height, radius, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();

    if (fill) {
        ctx.fill();
    }

    if (stroke) {
        ctx.stroke();
    }
}



function drawRemoteHoldingCatches() {
    for (const sid in remoteHoldingCatches) {
        const remote = otherPlayers[sid];

        if (!remote) {
            continue;
        }

        const holdData = remoteHoldingCatches[sid];

        if (!holdData || !holdData.holdingCatch) {
            continue;
        }

        drawHeldCatch({
            x: remote.x,
            y: remote.y,
            holdingCatch: holdData.holdingCatch
        });
    }
}

// ===== Nセクション：共通部品 =====
function rand(min, max) {
    return Math.random() * (max - min) + min;
}

function getDistance(x1, y1, x2, y2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
}


// ===== Oセクション：ゲームループ =====
function gameLoop() {
    updatePlayer();
    updateWoodItem();
    updateFire();
    updateFishing();
    updateShootingStars();

    for (const sid in otherPlayers) {
        const other = otherPlayers[sid];

        if (other.messageTimer > 0 && other.messageTimer < 999999) {
            other.messageTimer -= 1;
        }

        if (other.caughtItemTimer > 0) {
            other.caughtItemTimer -= 1;

            if (other.caughtItemTimer <= 0 && !other.holdingCatch) {
                other.lastCatchType = null;
            }
        }
    }

    if (player.caughtItemTimer > 0) {
        player.caughtItemTimer -= 1;

        if (player.caughtItemTimer <= 0 && !player.holdingCatch) {
            player.lastCatchType = null;
        }
    }

    drawBackground();
    drawShootingStars();

    drawFire();
    drawCookedFoods();
    drawWoodItem();

    for (const sid in otherPlayers) {
        drawCharacter(otherPlayers[sid]);
    }

    drawRemoteHoldingCatches();

    drawClickTarget();

    if (hasEnteredRoom) {
        drawCharacter(player);
    }

    drawFishingHint();
    drawEatingHint();

    requestAnimationFrame(gameLoop);
}


// ===== Pセクション：開始処理 =====
background.onload = () => {
    createEntryPanelStyle();
    showEntryPanel();
    gameLoop();
};
