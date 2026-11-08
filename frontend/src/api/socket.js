import { io } from 'socket.io-client';

// Kết nối Socket.IO: qua Vite dev proxy hoặc trực tiếp origin backend
const socketUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000';

export const socket = io(socketUrl, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
});

export default socket;
