import { io } from 'socket.io-client';
import { BACKEND_URL } from './axios';

// Kết nối Socket.IO tới backend (hỗ trợ cả dev localhost và production Vercel -> Render)
export const socket = io(BACKEND_URL, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
});

export default socket;
