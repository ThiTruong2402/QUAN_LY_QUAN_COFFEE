import { io } from 'socket.io-client';
import { BACKEND_URL } from './axios';

// Kết nối Socket.IO có kèm JWT động trong handshake (hỗ trợ dev localhost & production)
export const socket = io(BACKEND_URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  auth: (cb) => {
    cb({ token: sessionStorage.getItem('accessToken') || '' });
  },
});

export const reconnectSocket = () => {
  if (socket.connected) socket.disconnect();
  if (sessionStorage.getItem('accessToken')) {
    socket.connect();
  }
};

// Tự kết nối nếu tab hiện tại đang có phiên đăng nhập (sau F5)
if (typeof window !== 'undefined' && sessionStorage.getItem('accessToken')) {
  socket.connect();
}

export default socket;
