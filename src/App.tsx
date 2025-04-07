import { useEffect, useState, useRef, useCallback } from 'react';
import Gun from 'gun';
import 'gun/sea';
import axios from 'axios';
import { PINATA_API_KEY, PINATA_SECRET_KEY } from './config';
import Message from './components/Message';

interface GunAck {
  err?: string;
  ok?: number;
  sea?: unknown;
}

interface GunAuthAck extends GunAck {
  sea: {
    pub: string;
    epub: string;
    priv: string;
    epriv: string;
  };
}

interface GunData {
  initialized?: boolean;
  name?: string;
  text?: string;
  type?: 'text' | 'media';
  content?: string;
  sender?: string;
  timestamp?: number;
  displayName?: string;
  profilePicture?: string;
  online?: boolean;
  lastSeen?: number;
  username?: string;
  createdBy?: string;
  lastUpdated?: number;
  channel?: string;
}

interface IGunInstance<T = GunData> {
  get: (key: string) => IGunInstance<T>;
  put: (data: Partial<T>, cb?: (ack: GunAck) => void) => IGunInstance<T>;
  on: (cb: (data: T | null, key: string) => void) => { off: () => void };
  map: () => IGunInstance<T>;
  user: () => GunUser;
}

interface GunUser {
  create: (username: string, password: string, cb: (ack: GunAck) => void) => void;
  auth: (usernameOrPair: string | object, password?: string, cb?: (ack: GunAuthAck) => void) => void;
  leave: () => void;
}

interface MessageProps {
  message: {
    id: string;
    type?: 'text' | 'media';
    text?: string;
    content?: string;
    sender: string;
    timestamp: number;
  };
  gun: IGunInstance<GunData>;
}

interface MessageData {
  type: 'text' | 'media';
  text?: string;
  content?: string;
  sender: string;
  timestamp: number;
  channel: string;
}

// const ipfs = create({
//   host: 'ipfs.io',
//   port: 443,
//   protocol: 'https'
// });

const gun = (Gun({
  peers: ['http://localhost:8765/gun'],
  localStorage: true,
  retry: Infinity,
  axe: false,
  multicast: false
}) as unknown) as IGunInstance<GunData>;

const user = gun.user();

const uploadToPinata = async (blob: Blob): Promise<string> => {
  const formData = new FormData();
  formData.append('file', blob);

  const response = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_SECRET_KEY,
    },
  });

  return `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`;
};

function App() {
  const [messages, setMessages] = useState<Array<{
    id: string;
    type?: 'text' | 'media';
    text?: string;
    content?: string;
    sender: string;
    timestamp: number;
  }>>([]);
  const [newMessage, setNewMessage] = useState('');
  const [username, setUsername] = useState(() => localStorage.getItem('username') || '');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [onlineUsers, setOnlineUsers] = useState(new Set<string>());
  const [showSettings, setShowSettings] = useState(false);
  const [profilePicture, setProfilePicture] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [settingsForm, setSettingsForm] = useState({
    displayName: '',
    profilePicture: ''
  });
  const [channels, setChannels] = useState(['general']);
  const [showNewChannelModal, setShowNewChannelModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [currentChannel, setCurrentChannel] = useState('general');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const newChannelInputRef = useRef<HTMLInputElement>(null);
  const displayNameInputRef = useRef<HTMLInputElement>(null);

  const messagesRef = gun.get('messages');
  const channelsRef = gun.get('channels');

  useEffect(() => {
    const savedUser = localStorage.getItem('username');
    const savedPair = localStorage.getItem('pair');
    
    if (savedUser && savedPair) {
      try {
        const pair = JSON.parse(savedPair);
        user.auth(pair as object, undefined, (ack: GunAuthAck) => {
          if (!('err' in ack)) {
            setUsername(savedUser);
            setIsLoggedIn(true);
            console.log('Session restored for:', savedUser);
          } else {
            localStorage.removeItem('username');
            localStorage.removeItem('pair');
            console.error('Failed to restore session:', ack.err);
          }
        });
      } catch (err) {
        console.error('Failed to restore session:', err);
        localStorage.removeItem('username');
        localStorage.removeItem('pair');
      }
    }
  }, []);

  useEffect(() => {
    if (showNewChannelModal && newChannelInputRef.current) {
      setTimeout(() => {
        newChannelInputRef.current?.focus();
      }, 100);
    }
  }, [showNewChannelModal]);

  useEffect(() => {
    if (showSettings && displayNameInputRef.current) {
      setTimeout(() => {
        displayNameInputRef.current?.focus();
      }, 100);
    }
  }, [showSettings]);

  useEffect(() => {
    if (!isLoggedIn || !username) return;

    const presence = gun.get('presence');
    
    const updatePresence = () => {
      presence.get(username).put({
        online: true,
        lastSeen: Date.now(),
        username
      });
    };

    updatePresence();
    
    const interval = setInterval(updatePresence, 15000);

    const presenceListener = presence.map().on((data, userId) => {
      if (!data || !userId) return;
      
      const lastSeen = data.lastSeen || 0;
      const isRecent = Date.now() - lastSeen < 30000;

      if (data.online && isRecent) {
        setOnlineUsers(prev => new Set([...prev, userId]));
      } else {
        setOnlineUsers(prev => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      }
    });

    return () => {
      clearInterval(interval);
      if (username) {
        presence.get(username).put({
          online: false,
          lastSeen: Date.now()
        });
      }
      presenceListener.off();
    };
  }, [isLoggedIn, username]);

  useEffect(() => {
    if (isLoggedIn) {
      channelsRef.map().on((data) => {
        if (data?.name && !data.initialized) {
          setChannels(prev => {
            if (!prev.includes(data.name!)) {
              return [...prev, data.name!];
            }
            return prev;
          });
        }
      });
    }
  }, [isLoggedIn, channelsRef]);

  useEffect(() => {
    if (isLoggedIn && username) {
      const userProfile = gun.get('users').get(username);
      
      const profileListener = userProfile.on((data) => {
        if (data) {
          const newDisplayName = data.displayName || username;
          const newProfilePic = data.profilePicture || `https://api.dicebear.com/9.x/thumbs/svg?seed=${username}`;
          
          setDisplayName(newDisplayName);
          setProfilePicture(newProfilePic);
          if (showSettings) {
            setSettingsForm({
              displayName: newDisplayName,
              profilePicture: newProfilePic
            });
          }
        } else {
          const defaultValues = {
            displayName: username,
            profilePicture: `https://api.dicebear.com/9.x/thumbs/svg?seed=${username}`
          };
          setDisplayName(username);
          setProfilePicture(defaultValues.profilePicture);
          if (showSettings) {
            setSettingsForm(defaultValues);
          }
        }
      });

      return () => {
        profileListener.off();
      };
    }
  }, [isLoggedIn, username, showSettings]);

  useEffect(() => {
    if (showSettings) {
      setSettingsForm({
        displayName: displayName || username,
        profilePicture: profilePicture || `https://api.dicebear.com/9.x/thumbs/svg?seed=${username}`
      });
    }
  }, [showSettings, displayName, profilePicture, username]);

  useEffect(() => {
    if (isLoggedIn) {
      setMessages([]);

      const channelMessages = messagesRef.get(currentChannel);
      const messageListener = channelMessages.map().on((data, key) => {
        if (data && !data.initialized && data.sender && data.timestamp && 
            ((data.text && data.type === 'text') || (data.content && data.type === 'media'))) {
          setMessages(prev => {
            const exists = prev.some(msg => msg.id === key);
            
            if (!exists) {
              return [...prev, {
                id: key,
                type: data.type,
                text: data.text,
                content: data.content,
                sender: data.sender!,
                timestamp: data.timestamp!
              }];
            }
            return prev;
          });
        }
      });

      return () => {
        messageListener.off();
      };
    }
  }, [isLoggedIn, currentChannel, messagesRef]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleAuth = async (e: React.FormEvent, isLogin: boolean) => {
    e.preventDefault();
    setLoginError('');

    try {
      if (isLogin) {
        await new Promise<void>((resolve, reject) => {
          user.auth(username, password, (ack: GunAuthAck) => {
            if ('err' in ack) reject(ack.err);
            else {
              localStorage.setItem('username', username);
              localStorage.setItem('pair', JSON.stringify(ack.sea));
              resolve();
            }
          });
        });
      } else {
        await new Promise<void>((resolve, reject) => {
          user.create(username, password, (ack: GunAck) => {
            if ('err' in ack) reject(ack.err);
            else {
              user.auth(username, password, (loginAck: GunAuthAck) => {
                if ('err' in loginAck) reject(loginAck.err);
                else {
                  localStorage.setItem('username', username);
                  localStorage.setItem('pair', JSON.stringify(loginAck.sea));
                  resolve();
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
    const presence = gun.get('presence');
    presence.get(username).put({
      online: false,
      lastSeen: Date.now()
    });

    localStorage.removeItem('username');
    localStorage.removeItem('pair');
    setIsLoggedIn(false);
    setUsername('');
    setPassword('');
    setOnlineUsers(new Set());
    user.leave();
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !mediaFile) || !isLoggedIn) return;

    try {
      const messageId = Date.now().toString();
      let messageData: MessageData;

      if (mediaFile) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const img = new Image();
            img.src = reader.result as string;
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d')!;
              
              let width = img.width;
              let height = img.height;
              const maxDimension = 1024;
              
              if (width > maxDimension || height > maxDimension) {
                if (width > height) {
                  height = (height / width) * maxDimension;
                  width = maxDimension;
                } else {
                  width = (width / height) * maxDimension;
                  height = maxDimension;
                }
              }
              
              canvas.width = width;
              canvas.height = height;
              ctx.drawImage(img, 0, 0, width, height);
              
              const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
              resolve(compressedBase64);
            };
            img.onerror = reject;
          };
          reader.onerror = reject;
          reader.readAsDataURL(mediaFile);
        });

        const base64Data = base64.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/jpeg' });

        const ipfsUrl = await uploadToPinata(blob);

        messageData = {
          type: 'media',
          content: ipfsUrl,
          text: newMessage.trim(),
          sender: username,
          timestamp: Date.now(),
          channel: currentChannel
        };
        setMediaFile(null);
        if (mediaInputRef.current) {
          mediaInputRef.current.value = '';
        }
      } else {
        messageData = {
          type: 'text',
          text: newMessage,
          sender: username,
          timestamp: Date.now(),
          channel: currentChannel
        };
      }

      messagesRef.get(currentChannel).get(messageId).put(messageData as GunData, (ack) => {
        if (ack.err) {
          console.error('Failed to send message:', ack.err);
          alert('Failed to send message. Please try again.');
        } else {
          console.log('Message sent successfully');
          inputRef.current?.focus();
        }
      });
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleNewChannelNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewChannelName(value);
  };

  const handleDisplayNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSettingsForm(prev => ({ ...prev, displayName: value }));
  };

  const handleMessageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
  }, []);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const userProfile = gun.get('users').get(username);
      
      const updateData = {
        displayName: settingsForm.displayName || username,
        profilePicture: settingsForm.profilePicture,
        lastUpdated: Date.now()
      };

      await new Promise((resolve, reject) => {
        userProfile.put(updateData, (ack) => {
          if (ack.err) {
            console.error('Failed to update profile:', ack.err);
            reject(ack.err);
          } else {
            console.log('Profile updated successfully');
            resolve(ack);
          }
        });
      });

      setDisplayName(updateData.displayName);
      setProfilePicture(updateData.profilePicture);
      setShowSettings(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile. Please try again.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('File too large. Please upload files under 5MB.');
        return;
      }
      setMediaFile(file);
    }
  };

  const handleCreateChannel = (e: React.FormEvent) => {
    e.preventDefault();
    if (newChannelName.trim()) {
      const channelName = newChannelName.trim().toLowerCase();
      channelsRef.get(channelName).put({
        name: channelName,
        createdBy: username,
        timestamp: Date.now()
      });
      setShowNewChannelModal(false);
      setNewChannelName('');
      setCurrentChannel(channelName);
    }
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('File too large. Please upload files under 5MB.');
        return;
      }
      setMediaFile(file);
    }
  };

  const handleImageClick = useCallback((url: string) => {
    setEnlargedImage(url);
  }, []);

  const SettingsModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-discord-dark p-6 rounded-lg shadow-xl w-full max-w-md transform transition-all duration-200 scale-100 hover:scale-[1.02]">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">User Settings</h2>
          <button
            onClick={() => setShowSettings(false)}
            className="text-gray-400 hover:text-white transition-colors text-xl"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleProfileUpdate} className="space-y-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              <img
                src={settingsForm.profilePicture}
                alt="Profile"
                className="w-32 h-32 rounded-full group-hover:opacity-75 transition-all duration-200 ring-2 ring-indigo-500 ring-offset-2 ring-offset-discord-dark"
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-black bg-opacity-50 rounded-full p-2">
                  <span className="text-white text-sm">Change Avatar</span>
                </div>
              </div>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              className="hidden"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-gray-400 block">Display Name</label>
            <input
              type="text"
              ref={displayNameInputRef}
              value={settingsForm.displayName}
              onChange={handleDisplayNameChange}
              autoFocus
              className="w-full px-4 py-2 rounded bg-discord-channel text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="Enter display name"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-indigo-600 text-white px-4 py-3 rounded hover:bg-indigo-700 transition-colors transform hover:scale-[1.02] duration-200 font-medium"
          >
            Save Changes
          </button>
        </form>
      </div>
    </div>
  );

  const NewChannelModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-discord-dark p-6 rounded-lg shadow-xl w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Create Channel</h2>
          <button
            onClick={() => setShowNewChannelModal(false)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>
        <form onSubmit={handleCreateChannel} className="space-y-4">
          <div>
            <label className="text-sm text-gray-400 block mb-2">Channel Name</label>
            <input
              type="text"
              ref={newChannelInputRef}
              value={newChannelName}
              onChange={handleNewChannelNameChange}
              autoFocus
              className="w-full px-4 py-2 rounded bg-discord-channel text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="new-channel"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 transition-colors"
          >
            Create Channel
          </button>
        </form>
      </div>
    </div>
  );

  const ImageModal = () => {
    if (!enlargedImage) return null;
    
    return (
      <div 
        className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 cursor-zoom-out animate-fadeIn"
        onClick={() => setEnlargedImage(null)}
      >
        <img 
          src={enlargedImage} 
          alt="Enlarged view" 
          className="max-w-[90vw] max-h-[90vh] object-contain"
        />
      </div>
    );
  };

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
      {showSettings && <SettingsModal />}
      {showNewChannelModal && <NewChannelModal />}
      {enlargedImage && <ImageModal />}
      
      <div className="w-16 bg-[#202225] p-3 space-y-2">
        <div className="h-12 w-12 rounded-2xl bg-indigo-600 hover:bg-indigo-500 cursor-pointer transition-all duration-200 hover:rounded-xl flex items-center justify-center text-2xl font-bold">
          D
        </div>
      </div>

      <div className="w-60 bg-discord-sidebar p-3">
        <div className="text-lg font-bold mb-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-indigo-400">DecentChat</span>
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowSettings(true)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ⚙️
            </button>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-400 hover:text-red-400 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between text-gray-400 text-sm">
            <span className="uppercase font-semibold">Text Channels</span>
            <button
              onClick={() => setShowNewChannelModal(true)}
              className="hover:text-white transition-colors text-xl"
              title="Create Channel"
            >
              +
            </button>
          </div>
          <div className="space-y-1">
            {channels.map(channel => (
              <div
                key={channel}
                className={`flex items-center space-x-1 cursor-pointer transition-colors px-2 py-1 rounded hover:bg-discord-channel/50 ${
                  channel === currentChannel 
                    ? 'bg-discord-channel text-white' 
                    : 'text-gray-400 hover:text-white'
                }`}
                onClick={() => setCurrentChannel(channel)}
              >
                <span className="text-lg">#</span>
                <span>{channel}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="px-4 py-2 shadow-md bg-discord-dark border-b border-gray-800">
          <div className="flex items-center space-x-2">
            <span className="text-lg text-gray-400">#</span>
            <span className="font-semibold">{currentChannel}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map(message => (
            <Message 
              key={message.id} 
              message={message} 
              gun={gun}
              onImageClick={handleImageClick}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={sendMessage} className="p-4 bg-discord-sidebar">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => mediaInputRef.current?.click()}
              className="p-3 rounded-lg bg-discord-channel text-gray-400 hover:text-white hover:bg-discord-channel/50 transition-colors"
              title="Upload Media"
            >
              📎
            </button>
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={handleMessageChange}
              placeholder={`Message #${currentChannel}`}
              className="flex-1 px-4 py-3 rounded-lg bg-discord-channel text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
            <input
              type="file"
              ref={mediaInputRef}
              onChange={handleMediaUpload}
              accept="image/*"
              className="hidden"
            />
            <button
              type="submit"
              className="p-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              Send
            </button>
          </div>
          {mediaFile && (
            <div className="mt-2 flex items-center space-x-2 text-sm text-gray-400">
              <span>Selected: {mediaFile.name}</span>
              <button
                type="button"
                onClick={() => {
                  setMediaFile(null);
                  if (mediaInputRef.current) {
                    mediaInputRef.current.value = '';
                  }
                }}
                className="text-red-400 hover:text-red-300"
              >
                ✕
              </button>
            </div>
          )}
        </form>
      </div>

      <div className="w-60 bg-discord-sidebar border-l border-gray-800 p-3">
        <div className="text-gray-400 text-sm uppercase font-semibold mb-4">Online Users — {onlineUsers.size}</div>
        <div className="space-y-2">
          {Array.from(onlineUsers).map(user => (
            <div key={user} className="flex items-center space-x-2 px-2 py-1 rounded hover:bg-discord-channel/50 transition-colors">
              <div className="h-2 w-2 rounded-full bg-green-500"></div>
              <span className="text-gray-300">{user}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
