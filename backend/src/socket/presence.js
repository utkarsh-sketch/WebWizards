const socketsByUser = new Map();

export function addSocketForUser(userId, socketId) {
  const key = String(userId);
  const current = socketsByUser.get(key) || new Set();
  current.add(socketId);
  socketsByUser.set(key, current);
}

export function removeSocketForUser(userId, socketId) {
  const key = String(userId);
  const current = socketsByUser.get(key);
  if (!current) {
    return;
  }
  current.delete(socketId);
  if (current.size === 0) {
    socketsByUser.delete(key);
  }
}

export function getConnectedUsersCount() {
  return socketsByUser.size;
}

export function getConnectedUserIds() {
  return Array.from(socketsByUser.keys());
}
