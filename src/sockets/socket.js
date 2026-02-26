const socketIo = require("socket.io");

let ioInstance;

function initSocket(server) {
  if (!ioInstance) {
    ioInstance = socketIo(server, {
      cors: {
        origin: "*"
      }
    });
  }

  return ioInstance;
}

function getSocket() {
  return ioInstance;
}

function emitEvent(eventName, payload) {
  if (ioInstance) {
    ioInstance.emit(eventName, payload);
  }
}

module.exports = {
  initSocket,
  getSocket,
  emitEvent
};
