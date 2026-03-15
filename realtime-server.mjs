import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || process.env.RT_PORT || 8787);
const wss = new WebSocketServer({ port: PORT });

const rooms = new Map();
const clients = new Set();

function makeRoomCode() {
  let code = "";
  do {
    code = `BTC${Math.floor(1000 + Math.random() * 9000)}`;
  } while (rooms.has(code));
  return code;
}

function getRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, {
      code,
      players: [],
      hostId: null,
      started: false,
      pausedBy: null,
      pauseLimit: 3,
      endYear: 2041,
      startCash: 100000000,
      speed: 1,
    });
  }
  return rooms.get(code);
}

function roomListView() {
  return [...rooms.values()]
    .map((r) => ({
      code: r.code,
      players: r.players.length,
      started: !!r.started,
      hostNickname: r.players.find((p) => p.id === r.hostId)?.nickname || "-",
      joinable: !r.started,
      endYear: r.endYear,
      pauseLimit: r.pauseLimit,
      speed: r.speed || 1,
    }))
    .sort((a, b) => {
      if (a.joinable !== b.joinable) return a.joinable ? -1 : 1;
      return b.players - a.players;
    });
}

function sendRoomList(ws) {
  if (!ws || ws.readyState !== 1) return;
  ws.send(
    JSON.stringify({
      type: "rooms_list",
      rooms: roomListView(),
      ts: Date.now(),
    }),
  );
}

function broadcastRoomList() {
  clients.forEach((c) => sendRoomList(c));
}

function broadcast(room, msg) {
  const payload = JSON.stringify(msg);
  room.players.forEach((p) => {
    if (p.ws.readyState === 1) p.ws.send(payload);
  });
}

function roomView(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    started: room.started,
    pausedBy: room.pausedBy,
    pauseLimit: room.pauseLimit,
    endYear: room.endYear,
    startCash: room.startCash,
    speed: room.speed || 1,
    players: room.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      isHost: p.id === room.hostId,
      ready: !!p.ready,
      pauseLeft: p.pauseLeft,
    })),
  };
}

wss.on("connection", (ws) => {
  clients.add(ws);
  sendRoomList(ws);

  let joined = null;

  ws.on("message", (buf) => {
    let data = null;
    try {
      data = JSON.parse(String(buf));
    } catch (_e) {
      return;
    }
    if (!data || !data.type) return;

    if (data.type === "list_rooms") {
      sendRoomList(ws);
      return;
    }

    if (data.type === "join") {
      const requested = String(data.roomCode || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 12);
      const code = requested || makeRoomCode();
      const id = String(data.clientId || `u_${Date.now()}`);
      const nickname = String(data.nickname || "Player").slice(0, 20);
      const room = getRoom(code);
      const isNewRoom = room.players.length === 0;

      if (isNewRoom) {
        room.pauseLimit = Number(data.pauseLimit || room.pauseLimit || 3);
        room.endYear = Number(data.endYear || room.endYear || 2041);
        room.startCash = Number(data.startCash || room.startCash || 100000000);
        room.speed = [1, 2, 4, 10, 20].includes(Number(data.speed)) ? Number(data.speed) : room.speed || 1;
      }

      if (room.started && !room.players.find((p) => p.id === id)) {
        ws.send(
          JSON.stringify({
            type: "join_failed",
            reason: "이미 시작된 방입니다. 다른 대기실을 선택하세요.",
          }),
        );
        sendRoomList(ws);
        return;
      }

      if (!room.hostId) room.hostId = id;
      room.players = room.players.filter((p) => p.id !== id);
      room.players.push({
        id,
        nickname,
        ws,
        ready: false,
        pauseLeft: room.pauseLimit,
      });
      joined = { code, id };
      broadcast(room, { type: "room_state", room: roomView(room) });
      broadcastRoomList();
      return;
    }

    if (!joined) return;
    const room = rooms.get(joined.code);
    if (!room) return;
    const me = room.players.find((p) => p.id === joined.id);
    if (!me) return;

    if (data.type === "ready") {
      me.ready = !!data.ready;
      broadcast(room, { type: "room_state", room: roomView(room) });
      return;
    }

    if (data.type === "start") {
      if (joined.id !== room.hostId) return;
      room.started = true;
      room.pausedBy = null;
      broadcast(room, { type: "start_game", room: roomView(room) });
      broadcastRoomList();
      return;
    }

    if (data.type === "update_settings") {
      if (joined.id !== room.hostId) return;
      if (typeof data.endYear === "number") room.endYear = Math.max(2028, Math.min(2060, Math.floor(data.endYear)));
      if (typeof data.pauseLimit === "number") {
        room.pauseLimit = Math.max(1, Math.min(10, Math.floor(data.pauseLimit)));
        room.players.forEach((p) => {
          p.pauseLeft = Math.max(0, Math.min(p.pauseLeft, room.pauseLimit));
        });
      }
      if (typeof data.speed === "number") {
        const ok = [1, 2, 4, 10, 20].includes(data.speed) ? data.speed : 1;
        room.speed = ok;
      }
      broadcast(room, { type: "room_state", room: roomView(room) });
      broadcastRoomList();
      return;
    }

    if (data.type === "kick") {
      if (joined.id !== room.hostId) return;
      const targetId = String(data.targetId || "");
      if (!targetId || targetId === room.hostId) return;
      const target = room.players.find((p) => p.id === targetId);
      if (!target) return;
      try {
        if (target.ws.readyState === 1) target.ws.send(JSON.stringify({ type: "kicked", by: room.hostId }));
        target.ws.close();
      } catch (_e) {}
      room.players = room.players.filter((p) => p.id !== targetId);
      broadcast(room, { type: "room_state", room: roomView(room) });
      broadcastRoomList();
      return;
    }

    if (data.type === "pause") {
      if (me.pauseLeft <= 0) return;
      me.pauseLeft -= 1;
      room.pausedBy = me.nickname;
      broadcast(room, { type: "room_state", room: roomView(room) });
      broadcast(room, { type: "pause_game", by: me.nickname });
      return;
    }

    if (data.type === "resume") {
      if (joined.id !== room.hostId) return;
      room.pausedBy = null;
      broadcast(room, { type: "room_state", room: roomView(room) });
      broadcast(room, { type: "resume_game" });
      return;
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    if (!joined) {
      broadcastRoomList();
      return;
    }
    const room = rooms.get(joined.code);
    if (!room) {
      broadcastRoomList();
      return;
    }
    room.players = room.players.filter((p) => p.id !== joined.id);
    if (room.hostId === joined.id) room.hostId = room.players[0]?.id || null;
    if (room.players.length === 0) {
      rooms.delete(joined.code);
      broadcastRoomList();
      return;
    }
    broadcast(room, { type: "room_state", room: roomView(room) });
    broadcastRoomList();
  });
});

console.log(`[rt-server] ws://127.0.0.1:${PORT}`);
