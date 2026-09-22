const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Role = require('./models/Role');
const { permissionsForRole } = require('./config/permissions');

// Live updates. The socket only ever says WHAT changed ("incomes", "created", an id), never the data itself:
// the app then re-fetches through the normal API, where every permission rule already applies.
// Who hears about what follows the same permissions as the API, via rooms.
let io = null;

const ROOM_FOR = {
  incomes: 'perm:income.view',
  expenses: 'perm:expenses.view',
  reports: 'perm:reports.view', // the dashboard and the spending report
  audit: 'perm:activity.view',
  statements: 'perm:statements.view',
  users: 'perm:users.manage',
  roles: 'perm:users.manage',
  accounts: 'all', // any signed-in user can list accounts and categories
  categories: 'all',
};

// What each kind of record change means for the screens.
const RESOURCES_FOR_MODEL = {
  Income: ['incomes', 'reports'],
  Expense: ['expenses', 'reports'],
  Account: ['accounts', 'reports'],
  User: ['users', 'roles'], // a role's user count changes too
  Role: ['roles'],
  Category: ['categories'],
  Statement: ['statements'],
};

async function loadAccess(userId) {
  const user = await User.findById(userId);
  if (!user || !user.active) return null;
  const role = await Role.findOne({ key: user.role }).lean();
  return { user, permissions: permissionsForRole(role) };
}

function joinRooms(socket, permissions) {
  socket.data.perms = [...permissions].sort().join(',');
  for (const room of [...socket.rooms]) if (room.startsWith('perm:')) socket.leave(room);
  socket.join('all');
  for (const p of permissions) socket.join(`perm:${p}`);
}

async function authenticate(socket) {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (!token) throw new Error('unauthorized');
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new Error('unauthorized');
  }
  const access = await loadAccess(payload.sub);
  if (!access) throw new Error('unauthorized');
  return { payload, ...access };
}

function initRealtime(httpServer, { origins }) {
  io = new Server(httpServer, { cors: { origin: origins }, serveClient: false });

  io.use(async (socket, next) => {
    try {
      const { payload, user, permissions } = await authenticate(socket);
      socket.data.userId = String(user._id);
      socket.data.exp = payload.exp;
      joinRooms(socket, permissions);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    // A live connection must not outlive the sign-in it was opened with.
    if (socket.data.exp) {
      const timer = setTimeout(() => socket.disconnect(true), Math.max(socket.data.exp * 1000 - Date.now(), 0));
      if (timer.unref) timer.unref();
      socket.on('disconnect', () => clearTimeout(timer));
    }
  });
  return io;
}

function emitChange(resource, action, id) {
  if (!io) return;
  io.to(ROOM_FOR[resource]).emit('data:changed', { resource, action, id: id ? String(id) : null });
}

// After someone's role or status changed: re-check every live connection against the database.
async function refreshAccess() {
  if (!io) return;
  await Promise.all([...io.sockets.sockets.values()].map(async (socket) => {
    const access = await loadAccess(socket.data.userId);
    if (!access) {
      socket.emit('access:revoked');
      socket.disconnect(true);
      return;
    }
    // Only tell the screen when what this person may do actually changed.
    const before = socket.data.perms;
    joinRooms(socket, access.permissions);
    if (socket.data.perms !== before) socket.emit('access:changed');
  }));
}

// Called for every activity-log entry, and every change in the app writes one, so nothing is missed.
function notifyAudit({ action, targetModel, targetId }) {
  if (!io) return;
  const verb = String(action).split('.')[1] || 'changed';
  if (!String(action).startsWith('auth.')) {
    for (const resource of RESOURCES_FOR_MODEL[targetModel] || []) emitChange(resource, verb, targetId);
  }
  emitChange('audit', verb, targetId);
  if (['user.update', 'role.update', 'role.delete'].includes(action)) {
    refreshAccess().catch((err) => console.error('realtime refresh failed', err));
  }
}

function closeRealtime() {
  return new Promise((resolve) => {
    if (!io) return resolve();
    const server = io;
    io = null;
    server.close(() => resolve());
  });
}

module.exports = { initRealtime, notifyAudit, emitChange, refreshAccess, closeRealtime };
