import { io } from "socket.io-client";

const socketUrl = import.meta.env.VITE_SOCKET_URL || (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

const socket = io(socketUrl, {
  autoConnect: true
});

export default socket;
