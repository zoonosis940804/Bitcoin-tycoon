import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || process.env.RT_PORT || 8787);
const wss = new WebSocketServer({ port: PORT });

const rooms = new Map();

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
  let joined = null;
  ws.on("message", (buf) => {
    let data = null;
    try {
      data = JSON.parse(String(buf));
    } catch (_e) {
      return;
    }
    if (!data || !data.type) return;

    if (data.type === "join") {
      const code = String(data.roomCode || "PUBLIC").toUpperCase();
      const id = String(data.clientId || `u_${Date.now()}`);
      const nickname = String(data.nickname || "플레이어");
      const room = getRoom(code);
      room.pauseLimit = Number(data.pauseLimit || room.pauseLimit || 3);
      room.endYear = Number(data.endYear || room.endYear || 2041);
      room.startCash = Number(data.startCash || room.startCash || 100000000);

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
    if (!joined) return;
    const room = rooms.get(joined.code);
    if (!room) return;
    room.players = room.players.filter((p) => p.id !== joined.id);
    if (room.hostId === joined.id) room.hostId = room.players[0]?.id || null;
    if (room.players.length === 0) {
      rooms.delete(joined.code);
      return;
    }
    broadcast(room, { type: "room_state", room: roomView(room) });
  });
});

console.log(`[rt-server] ws://127.0.0.1:${PORT}`);
