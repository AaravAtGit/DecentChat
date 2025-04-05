import Gun from 'gun';
import http from 'http';

const server = http.createServer().listen(8765);

const gun = Gun({
  web: server,
  file: 'data',
  multicast: false,
  peers: ['http://localhost:8765/gun'],
  axe: false,
  multicast: false,
  localStorage: false
});

// Create shared space for messages
const messageSpace = gun.get('messages');
messageSpace.put({ initialized: true });

// Create shared space for users
const userSpace = gun.get('users');
userSpace.put({ initialized: true });

// Log connected peers
gun.on('hi', peer => {
  console.log('Client connected:', peer.id);
});

gun.on('bye', peer => {
  console.log('Client disconnected:', peer.id);
});

console.log('Relay peer started on port 8765 🚀');