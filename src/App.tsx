import { useEffect, useState, useRef } from 'react';
import Gun from 'gun';
import 'gun/sea';

// Initialize Gun with better configuration
const gun = Gun({
  peers: ['http://localhost:8765/gun'],
  localStorage: true, // Enable localStorage in browser
  retry: Infinity, // Keep trying to connect
  axe: false, // Disable automatic peer discovery
  multicast: false // Disable multicast discovery
});

const user = gun.user();

function App() {
  const [messages, setMessages] = useState<Array<{id: string; text: string; sender: string; timestamp: number}>>([]);
  const [newMessage, setNewMessage] = useState('');
  const [username, setUsername] = useState(() => localStorage.getItem('username') || '');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [onlineUsers, setOnlineUsers] = useState(new Set<string>());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Create a messages reference
  const messagesRef = gun.get('messages');

  // Try to restore session on load
  useEffect(() => {
    const savedUser = localStorage.getItem('username');
    const savedPair = localStorage.getItem('pair');
    
    if (savedUser && savedPair) {
      try {
        user.auth(JSON.parse(savedPair), (ack) => {
          if (!('err' in ack)) {
            setUsername(savedUser);
            setIsLoggedIn(true);
            console.log('Session restored for:', savedUser);
          }
        });
      } catch (err) {
        console.error('Failed to restore session:', err);
      }
    }
  }, []);

  // Subscribe to messages and handle user presence
  useEffect(() => {
    if (isLoggedIn) {
      // Clear existing messages
      setMessages([]);

      // Subscribe to messages with better error handling
      const messageListener = messagesRef.map().on((data, id) => {
        if (data && !data.initialized) {
          console.log('Received message:', data);
          setMessages(prev => {
            const exists = prev.some(msg => msg.id === id);
            if (!exists) {
              const newMessages = [...prev, { id, ...data }];
              // Sort by timestamp, most recent last
              return newMessages.sort((a, b) => a.timestamp - b.timestamp);
            }
            return prev;
          });
        }
      });

      // Handle user presence with better reliability
      const presence = gun.get('presence');
      
      // Update own presence more frequently
      const updatePresence = () => {
        if (username) {
          presence.get(username).put({
            online: true,
            lastSeen: Date.now(),
            username
          });
        }
      };

      // Update presence every 15 seconds
      updatePresence();
      const interval = setInterval(updatePresence, 15000);

      // Subscribe to all users' presence with better handling
      const presenceListener = presence.map().on((data, userId) => {
        if (data && data.online && userId) {
          const lastSeen = data.lastSeen || 0;
          const isRecent = Date.now() - lastSeen < 30000; // 30 seconds

          if (isRecent) {
            setOnlineUsers(prev => new Set([...prev, userId]));
          } else {
            setOnlineUsers(prev => {
              const next = new Set(prev);
              next.delete(userId);
              return next;
            });
          }
        }
      });

      // Cleanup function
      return () => {
        clearInterval(interval);
        if (username) {
          presence.get(username).put({ online: false, lastSeen: Date.now() });
        }
        messageListener.off();
        presenceListener.off();
      };
    }
  }, [isLoggedIn, username]);

  const handleAuth = async (e: React.FormEvent, isLogin: boolean) => {
    e.preventDefault();
    setLoginError('');

    try {
      if (isLogin) {
        await new Promise((resolve, reject) => {
          user.auth(username, password, (ack: any) => {
            if ('err' in ack) reject(ack.err);
            else {
              // Save session
              localStorage.setItem('username', username);
              localStorage.setItem('pair', JSON.stringify(ack.sea));
              resolve(ack);
            }
          });
        });
      } else {
        await new Promise((resolve, reject) => {
          user.create(username, password, (ack: any) => {
            if ('err' in ack) reject(ack.err);
            else {
              // After creation, log in to save session
              user.auth(username, password, (loginAck: any) => {
                if ('err' in loginAck) reject(loginAck.err);
                else {
                  localStorage.setItem('username', username);
                  localStorage.setItem('pair', JSON.stringify(loginAck.sea));
                  resolve(loginAck);
                }
              });
            }
          });
        });
      }
      setIsLoggedIn(true);
    } catch (err) {
      setLoginError(err as string);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('username');
    localStorage.removeItem('pair');
    setIsLoggedIn(false);
    setUsername('');
    setPassword('');
    user.leave();
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !isLoggedIn) return;

    const messageData = {
      text: newMessage,
      sender: username,
      timestamp: Date.now()
    };

    // Send message with better error handling
    try {
      const messageId = Date.now().toString();
      messagesRef.get(messageId).put(messageData, (ack) => {
        if (ack.err) {
          console.error('Failed to send message:', ack.err);
        } else {
          console.log('Message sent successfully');
        }
      });
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#202225] flex items-center justify-center p-4">
        <div className="bg-discord-dark p-8 rounded-lg shadow-2xl w-full max-w-md transform transition-all hover:scale-105">
          <h2 className="text-3xl font-bold text-white mb-6 text-center">DecentChat</h2>
          <form onSubmit={(e) => handleAuth(e, true)} className="space-y-4">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 rounded bg-discord-channel text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 rounded bg-discord-channel text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
            {loginError && <div className="text-red-500 text-sm">{loginError}</div>}
            <div className="flex space-x-4">
              <button
                type="submit"
                className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 transition-colors"
              >
                Login
              </button>
              <button
                type="button"
                onClick={(e) => handleAuth(e, false)}
                className="flex-1 bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition-colors"
              >
                Sign Up
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-discord-dark text-white">
      {/* Servers Sidebar */}
      <div className="w-16 bg-[#202225] p-3 space-y-2">
        <div className="h-12 w-12 rounded-2xl bg-indigo-600 hover:bg-indigo-500 cursor-pointer transition-all duration-200 hover:rounded-xl flex items-center justify-center text-2xl font-bold">
          D
        </div>
      </div>

      {/* Channels Sidebar */}
      <div className="w-60 bg-discord-sidebar p-3">
        <div className="text-lg font-bold mb-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-indigo-400">DecentChat</span>
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 hover:text-red-400 transition-colors"
          >
            Logout
          </button>
        </div>
        <div className="space-y-2">
          <div className="text-gray-400 hover:text-white cursor-pointer transition-colors"># general</div>
        </div>
        <div className="mt-8">
          <div className="text-gray-400 text-sm mb-2">ONLINE USERS</div>
          <div className="space-y-2">
            {Array.from(onlineUsers).map(user => (
              <div key={user} className="flex items-center space-x-2">
                <div className="h-2 w-2 rounded-full bg-green-500"></div>
                <span className="text-gray-300">{user}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map(message => (
            <div key={message.id} 
                 className="flex items-start space-x-4 animate-fadeIn hover:bg-discord-channel/30 p-2 rounded-lg transition-colors">
              <div className="h-10 w-10 rounded-full bg-indigo-600 flex-shrink-0 flex items-center justify-center">
                {message.sender && message.sender[0] ? message.sender[0].toUpperCase() : '?'}
              </div>
              <div>
                <div className="flex items-baseline space-x-2">
                  <span className="font-medium text-indigo-400">{message.sender || 'Unknown'}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-gray-300">{message.text}</p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} /> {/* Scroll anchor */}
        </div>

        {/* Message Input */}
        <form onSubmit={sendMessage} className="p-4 bg-discord-sidebar">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Message #general"
            className="w-full px-4 py-3 rounded-lg bg-discord-channel text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </form>
      </div>
    </div>
  );
}

export default App;
