import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ['https://tychka-surgesite.surge.sh', 'https://tychka-backend-production.up.railway.app', '*'],
    methods: ['GET', 'POST'],
  },
});

type UserSession = {
  id: string;
  socketId: string;
  name: string;
  isAdmin: boolean;
};

const queue: UserSession[] = [];
const sessions = new Map<string, UserSession>();
const pairings = new Map<string, string>();

function broadcastOnlineCount() {
  const regularUsers = Array.from(sessions.values()).filter((s) => !s.isAdmin);
  io.emit('onlineCount', regularUsers.length);
}

function findPartner(current: UserSession) {
  // Найти первого доступного пользователя в очереди (не админа и не самого себя)
  const partner = queue.find((user) => user.id !== current.id && !user.isAdmin);
  if (!partner) {
    // Никого нет в очереди - добавить себя
    queue.push(current);
    console.log(`[${new Date().toISOString()}] 📋 ${current.name} добавлен в очередь. В очереди: ${queue.length}`);
    io.to(current.socketId).emit('status', 'Ожидайте партнёра...');
    broadcastOnlineCount();
    return;
  }

  // Партнер найден - создать пару
  queue.splice(queue.indexOf(partner), 1);
  pairings.set(current.id, partner.id);
  pairings.set(partner.id, current.id);

  console.log(`[${new Date().toISOString()}] 🔗 ${current.name} ↔️ ${partner.name} (пара создана)`);
  io.to(current.socketId).emit('partnerFound', { name: partner.name, id: partner.id });
  io.to(partner.socketId).emit('partnerFound', { name: current.name, id: current.id });
  io.to(current.socketId).emit('status', 'Собеседник найден');
  io.to(partner.socketId).emit('status', 'Собеседник найден');
  broadcastOnlineCount();
}

io.use((socket, next) => {
  const userId = socket.handshake.auth?.userId as string;
  const name = socket.handshake.auth?.name as string;
  if (!userId || !name) {
    return next(new Error('Необходимы данные пользователя'));
  }
  next();
});

io.on('connection', (socket) => {
  const userId = socket.handshake.auth.userId as string;
  const name = socket.handshake.auth.name as string;
  const isAdmin = ['admin', 'moderator'].includes(name.toLowerCase());

  const session: UserSession = { id: userId, socketId: socket.id, name, isAdmin };
  sessions.set(userId, session);

  console.log(`[${new Date().toISOString()}] ✅ ${name} подключился (${userId})`);
  console.log(`📊 Онлайн: ${Array.from(sessions.values()).filter(s => !s.isAdmin).length}, В очереди: ${queue.length}`);

  socket.on('join', () => {
    console.log(`[${new Date().toISOString()}] ${name} ищет партнёра`);
    if (isAdmin) {
      socket.emit('status', 'Вы вошли как администратор');
      broadcastOnlineCount();
      return;
    }
    findPartner(session);
  });

  socket.on('chatMessage', (message) => {
    const partnerId = pairings.get(userId);
    if (!partnerId) return;
    const partner = sessions.get(partnerId);
    if (!partner) return;
    io.to(partner.socketId).emit('chatMessage', message);
  });

  socket.on('webrtc-offer', ({ target, sdp }) => {
    const partner = sessions.get(target);
    if (!partner) return;
    io.to(partner.socketId).emit('webrtc-offer', { from: userId, sdp });
  });

  socket.on('webrtc-answer', ({ target, sdp }) => {
    const partner = sessions.get(target);
    if (!partner) return;
    io.to(partner.socketId).emit('webrtc-answer', { from: userId, sdp });
  });

  socket.on('webrtc-ice', ({ target, candidate }) => {
    const partner = sessions.get(target);
    if (!partner) return;
    io.to(partner.socketId).emit('webrtc-ice', { from: userId, candidate });
  });

  socket.on('skip', () => {
    const partnerId = pairings.get(userId);
    if (partnerId) {
      const partner = sessions.get(partnerId);
      if (partner) {
        io.to(partner.socketId).emit('status', 'Собеседник пропустил чат...');
        // Удалить партнёра из очереди если он там есть
        const partnerQueueIndex = queue.findIndex((item) => item.id === partnerId);
        if (partnerQueueIndex !== -1) queue.splice(partnerQueueIndex, 1);
        pairings.delete(partner.id);
      }
      pairings.delete(userId);
    }
    // Удалить себя из очереди перед новым поиском
    const myQueueIndex = queue.findIndex((item) => item.id === userId);
    if (myQueueIndex !== -1) queue.splice(myQueueIndex, 1);
    
    findPartner(session);
  });

  socket.on('disconnect', () => {
    sessions.delete(userId);
    
    // Уведомить партнёра если был подключен
    const partnerId = pairings.get(userId);
    if (partnerId) {
      const partner = sessions.get(partnerId);
      if (partner) {
        io.to(partner.socketId).emit('status', 'Собеседник отключился');
        // Удалить партнёра из очереди если он там есть
        const partnerQueueIndex = queue.findIndex((item) => item.id === partnerId);
        if (partnerQueueIndex !== -1) queue.splice(partnerQueueIndex, 1);
      }
      pairings.delete(partnerId);
      pairings.delete(userId);
    }
    
    // Удалить себя из очереди
    const queueIndex = queue.findIndex((item) => item.id === userId);
    if (queueIndex !== -1) queue.splice(queueIndex, 1);
    
    broadcastOnlineCount();
  });
});

app.get('/', (_req, res) => {
  res.send('Тычка сервер работает');
});

const PORT = process.env.PORT || 4174;
httpServer.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});
