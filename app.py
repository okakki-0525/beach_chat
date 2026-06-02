# ===== Aセクション：ライブラリ =====
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit
import random
import time

# ===== Bセクション：Flask初期化 =====
app = Flask(__name__)

app.config["SECRET_KEY"] = "beach_chat_secret"

socketio = SocketIO(
    app,
    cors_allowed_origins="*"
)

# ===== Cセクション：共有データ管理 =====
players = {}

wood_items = []

cooked_foods = []

MAX_WOOD_COUNT = 10

wood_next_id = 1

food_next_id = 1

last_shooting_star_time = 0

WOOD_SPAWN_AREAS = [
    {"xMin": 360, "xMax": 560, "yMin": 420, "yMax": 610},
    {"xMin": 720, "xMax": 1050, "yMin": 420, "yMax": 610},
    {"xMin": 520, "xMax": 820, "yMin": 560, "yMax": 650},
]

# ===== Dセクション：画面ルート =====
@app.route("/")
def index():
    return render_template("index.html")

# ===== Eセクション：Socket.IO 接続 =====
@socketio.on("connect")
def handle_connect():

    emit(
        "current_players",
        players
    )

    emit(
        "current_wood_items",
        wood_items
    )

    emit(
        "current_cooked_foods",
        cooked_foods
    )

# ===== Fセクション：入室処理 =====
@socketio.on("join")
def handle_join(data):

    sid = request.sid

    players[sid] = {
        "name": data["name"],
        "x": data["x"],
        "y": data["y"],
        "colors": data["colors"],
        "holdingLog": data.get("holdingLog", False),
        "isFishing": data.get("isFishing", False),
        "fishReady": data.get("fishReady", False),
        "lastCatchType": data.get("lastCatchType", None),
        "holdingCatch": data.get("holdingCatch", None)
    }

    emit(
        "player_joined",
        {
            "sid": sid,
            "player": players[sid]
        },
        broadcast=True
    )

    emit(
        "current_wood_items",
        wood_items
    )

    emit(
        "current_cooked_foods",
        cooked_foods
    )

# ===== Gセクション：移動処理 =====
@socketio.on("move")
def handle_move(data):

    sid = request.sid

    if sid in players:

        players[sid]["x"] = data["x"]
        players[sid]["y"] = data["y"]
        players[sid]["holdingLog"] = data.get("holdingLog", False)
        players[sid]["isFishing"] = data.get("isFishing", False)
        players[sid]["fishReady"] = data.get("fishReady", False)
        players[sid]["lastCatchType"] = data.get("lastCatchType", players[sid].get("lastCatchType"))
        players[sid]["holdingCatch"] = data.get("holdingCatch", players[sid].get("holdingCatch"))

        emit(
            "player_moved",
            {
                "sid": sid,
                "x": data["x"],
                "y": data["y"],
                "holdingLog": players[sid]["holdingLog"],
                "isFishing": players[sid]["isFishing"],
                "fishReady": players[sid]["fishReady"],
                "lastCatchType": players[sid]["lastCatchType"],
                "holdingCatch": players[sid]["holdingCatch"]
            },
            broadcast=True
        )

# ===== Hセクション：チャット処理 =====
@socketio.on("chat")
def handle_chat(data):

    sid = request.sid

    data["sid"] = sid

    emit(
        "chat",
        data,
        broadcast=True
    )

    spawn_wood_if_possible()

# ===== Iセクション：薪処理 =====
def spawn_wood_if_possible():

    global wood_next_id

    if len(wood_items) >= MAX_WOOD_COUNT:
        return

    area = random.choice(WOOD_SPAWN_AREAS)

    wood = {
        "id": wood_next_id,
        "x": random.uniform(area["xMin"], area["xMax"]),
        "y": random.uniform(area["yMin"], area["yMax"]),
        "size": 26
    }

    wood_next_id += 1

    wood_items.append(wood)

    emit(
        "wood_spawned",
        wood,
        broadcast=True
    )

@socketio.on("pick_wood")
def handle_pick_wood(data):

    wood_id = data.get("id")

    removed_wood = None

    for wood in wood_items:

        if wood["id"] == wood_id:

            removed_wood = wood

            break

    if removed_wood:

        wood_items.remove(removed_wood)

        emit(
            "wood_removed",
            {
                "id": wood_id
            },
            broadcast=True
        )

@socketio.on("feed_fire")
def handle_feed_fire():

    emit(
        "fire_fed",
        {},
        broadcast=True
    )

# ===== Jセクション：釣り状態処理 =====
@socketio.on("fishing_state")
def handle_fishing_state(data):

    sid = request.sid

    if sid in players:

        players[sid]["isFishing"] = data.get("isFishing", False)
        players[sid]["fishReady"] = data.get("fishReady", False)

        emit(
            "fishing_state",
            {
                "sid": sid,
                "isFishing": players[sid]["isFishing"],
                "fishReady": players[sid]["fishReady"]
            },
            broadcast=True
        )

@socketio.on("catch_result")
def handle_catch_result(data):

    sid = request.sid

    if sid in players:

        players[sid]["isFishing"] = False
        players[sid]["fishReady"] = False
        players[sid]["lastCatchType"] = data.get("lastCatchType", None)
        players[sid]["holdingCatch"] = data.get("holdingCatch", None)

        emit(
            "catch_result",
            {
                "sid": sid,
                "name": data.get("name", ""),
                "lastCatchType": players[sid]["lastCatchType"],
                "holdingCatch": players[sid]["holdingCatch"]
            },
            broadcast=True
        )

# ===== Kセクション：料理処理 =====
@socketio.on("cook_food")
def handle_cook_food(data):

    global food_next_id

    sid = request.sid

    food = {
        "id": food_next_id,
        "x": data["x"],
        "y": data["y"],
        "name": data["name"],
        "type": data["type"],
        "frameOffset": random.uniform(0, 1000)
    }

    food_next_id += 1

    cooked_foods.append(food)

    if sid in players:
        players[sid]["holdingCatch"] = None
        players[sid]["lastCatchType"] = None

    emit(
        "food_cooked",
        {
            "sid": sid,
            "food": food
        },
        broadcast=True
    )

@socketio.on("eat_food")
def handle_eat_food(data):

    food_id = data.get("id")

    removed_food = None

    for food in cooked_foods:

        if food["id"] == food_id:

            removed_food = food

            break

    if removed_food:

        cooked_foods.remove(removed_food)

        emit(
            "food_eaten",
            {
                "id": food_id,
                "name": removed_food["name"]
            },
            broadcast=True
        )


@socketio.on("eat_motion")
def handle_eat_motion():

    sid = request.sid

    emit(
        "eat_motion",
        {
            "sid": sid
        },
        broadcast=True
    )


# ===== Lセクション：流れ星処理 =====
@socketio.on("request_shooting_star")
def handle_request_shooting_star():

    global last_shooting_star_time

    now = time.time()

    # 複数端末から同時に要求が来ても、60秒に1回だけ流す
    if now - last_shooting_star_time < 60:
        return

    last_shooting_star_time = now

    star = {
        "x": random.uniform(120, 1060),
        "y": random.uniform(40, 170),
        "vx": random.uniform(7, 11),
        "vy": random.uniform(2.0, 4.0),
        "life": 150
    }

    emit(
        "shooting_star_spawned",
        star,
        broadcast=True
    )


# ===== Mセクション：流れ星自動発生 =====
def create_shooting_star():

    return {
        "x": random.uniform(120, 1060),
        "y": random.uniform(40, 170),
        "vx": random.uniform(7, 11),
        "vy": random.uniform(2.0, 4.0),
        "life": 150
    }

def shooting_star_loop():

    # 起動後、最初は5秒で1回流す
    socketio.sleep(5)

    while True:

        print("流れ星を送信しました")

        socketio.emit(
            "shooting_star_spawned",
            create_shooting_star()
        )

        # 以後は60秒おき
        socketio.sleep(60)


# ===== Mセクション：切断処理 =====
@socketio.on("disconnect")
def handle_disconnect():

    sid = request.sid

    if sid in players:

        del players[sid]

        emit(
            "player_left",
            {
                "sid": sid
            },
            broadcast=True
        )

# ===== Nセクション：起動 =====
if __name__ == "__main__":

    socketio.start_background_task(
        shooting_star_loop
    )

    socketio.run(
        app,
        host="0.0.0.0",
        port=5000,
        debug=True,
        use_reloader=False
    )
