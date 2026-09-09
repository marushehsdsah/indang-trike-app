import { io } from 'socket.io-client';

const SOCKET_URL = 'http://192.168.1.3:3000';

export const createSocket = ({ role, userId } = {}) => io(SOCKET_URL, {
  autoConnect: false,
  transports: ['websocket'],
  auth: { role, userId },
});
