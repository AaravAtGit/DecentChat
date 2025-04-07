import Gun from 'gun';
import http from 'http';

const server = http.createServer().listen(8765);

const gun = Gun({
  web: server,
  file: 'data',
  multicast: false,
  peers: ['http://localhost:8765/gun'],
  axe: false,
  localStorage: false,
  radisk: true,
  timeout: 30000
});

// Create shared spaces
const messageSpace = gun.get('messages');
messageSpace.put({ initialized: true });

const userSpace = gun.get('users');
userSpace.put({ initialized: true });

const channelSpace = gun.get('channels');
channelSpace.put({ initialized: true });

const presenceSpace = gun.get('presence');
presenceSpace.put({ initialized: true });

// Initialize default channel
channelSpace.get('general').put({
  name: 'general',
  createdBy: 'system',
  timestamp: Date.now()
});

// Clean up stale presence data periodically
setInterval(() => {
  presenceSpace.map().once((data, userId) => {
    if (data && data.lastSeen) {
      const lastSeen = data.lastSeen;
      const now = Date.now();
      if (now - lastSeen > 60000) {
        presenceSpace.get(userId).put({
          online: false,
          lastSeen: now
        });
      }
    }
  });
}, 30000);

// Log connected peers
gun.on('hi', peer => {
  console.log('Client connected:', peer.id);
});

gun.on('bye', peer => {
  console.log('Client disconnected:', peer.id);
});

console.log('Relay peer started on port 8765 🚀');