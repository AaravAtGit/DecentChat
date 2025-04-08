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
  once?: (cb: (data: T | null, key?: string) => void) => void;
  map: () => IGunInstance<T>;
  user: () => GunUser;
}

interface GunUser {
  create: (username: string, password: string, cb: (ack: GunAck) => void) => void;
  auth: (usernameOrPair: string | object, password?: string, cb?: (ack: GunAuthAck) => void) => void;
  leave: () => void;
}

interface MessageData {
  type: 'text' | 'media';
  text?: string;
  content?: string;
  sender: string;
  timestamp: number;
  channel: string;
}

interface OnlineUser {
  username: string;
  profilePicture?: string;
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
  const [onlineUsers, setOnlineUsers] = useState<Map<string, OnlineUser>>(new Map());
  const [showSettings, setShowSettings] = useState(false);
  const [profilePicture, setProfilePicture] = useState('');
  const [settingsForm, setSettingsForm] = useState({
    profilePicture: ''
  });
  const [channels, setChannels] = useState(['general']);
  const [showNewChannelModal, setShowNewChannelModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [currentChannel, setCurrentChannel] = useState('general');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);

  const [showMobileChannels, setShowMobileChannels] = useState(false);
  const [showMobileUsers, setShowMobileUsers] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const newChannelInputRef = useRef<HTMLInputElement>(null);

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
    if (showSettings && fileInputRef.current) {
      setTimeout(() => {
        fileInputRef.current?.focus();
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
        // Get user profile picture with type safety
        gun.get('users').get(userId).once?.((userData: GunData | null) => {
          setOnlineUsers(prev => {
            const next = new Map(prev);
            next.set(userId, {
              username: userId,
              profilePicture: userData?.profilePicture || `https://api.dicebear.com/9.x/thumbs/svg?seed=${userId}`
            });
            return next;
          });
        });
      } else {
        setOnlineUsers(prev => {
          const next = new Map(prev);
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
          const newProfilePic = data.profilePicture || `https://api.dicebear.com/9.x/thumbs/svg?seed=${username}`;
          setProfilePicture(newProfilePic);
          if (showSettings) {
            setSettingsForm({
              profilePicture: newProfilePic
            });
          }
        } else {
          const defaultPicture = `https://api.dicebear.com/9.x/thumbs/svg?seed=${username}`;
          setProfilePicture(defaultPicture);
          if (showSettings) {
            setSettingsForm({ profilePicture: defaultPicture });
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
        profilePicture: profilePicture || `https://api.dicebear.com/9.x/thumbs/svg?seed=${username}`
      });
    }
  }, [showSettings, profilePicture, username]);

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
    setOnlineUsers(new Map());
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

  const handleMessageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
  }, []);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const userProfile = gun.get('users').get(username);
      
      const updateData = {
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

      setProfilePicture(updateData.profilePicture);
      setShowSettings(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile. Please try again.');
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('File too large. Please upload files under 5MB.');
        return;
      }

      try {
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
          reader.readAsDataURL(file);
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
        setSettingsForm(prev => ({ ...prev, profilePicture: ipfsUrl }));
      } catch (error) {
        console.error('Error processing avatar:', error);
        alert('Failed to process avatar. Please try again.');
      }
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
          <h2 className="text-2xl font-bold text-white">Change Avatar</h2>
          <button
            onClick={() => setShowSettings(false)}
            className="text-gray-400 hover:text-white transition-colors text-xl"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleProfileUpdate} className="space-y-6">
          <div className="flex flex-col items-center space-y-4">
            <div 
              className="relative group cursor-pointer transform transition-all duration-300 hover:scale-105" 
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="absolute inset-0 bg-indigo-500 rounded-full opacity-0 group-hover:opacity-20 transition-opacity" />
              <img
                src={settingsForm.profilePicture}
                alt="Profile"
                className="w-40 h-40 rounded-full transition-all duration-300 ring-4 ring-indigo-500 ring-offset-4 ring-offset-discord-dark group-hover:ring-indigo-400"
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-black bg-opacity-75 rounded-full px-4 py-2 transform -translate-y-2 group-hover:translate-y-0 transition-transform">
                  <span className="text-white text-sm font-medium">Change Avatar</span>
                </div>
              </div>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleAvatarUpload}
              accept="image/*"
              className="hidden"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-indigo-600 text-white px-4 py-3 rounded-lg hover:bg-indigo-700 transition-colors transform hover:scale-[1.02] duration-200 font-medium shadow-lg"
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
      <div className="min-h-screen bg-discord-dark flex items-center justify-center p-4">
        <div className="container mx-auto px-4 flex flex-col lg:flex-row items-center justify-between gap-12">
          {/* Left side - Hero content */}
          <div className="flex-1 text-center lg:text-left space-y-8">
            <div className="relative inline-block">
              <h1 className="text-6xl lg:text-8xl font-black tracking-tighter text-white">
                Decent<span className="text-indigo-500">Chat</span>
              </h1>
              <div className="absolute -top-4 -right-4 w-8 h-8 bg-indigo-500 rounded-full opacity-50 animate-pulse"></div>
              <div className="absolute -bottom-2 -left-2 w-4 h-4 bg-blue-500 rounded-full opacity-50 animate-ping"></div>
            </div>
            
            <p className="text-discord-text-muted text-lg max-w-lg leading-relaxed">
              Experience next-generation messaging with military-grade encryption and decentralized infrastructure. /s
            </p>

            <div className="flex flex-wrap gap-6 justify-center lg:justify-start">
              <div className="bg-discord-channel/30 backdrop-blur px-6 py-3 rounded-xl border border-indigo-500/20">
                <div className="text-2xl font-bold text-white mb-1">100%</div>
                <div className="text-sm text-discord-text-muted">Decentralized</div>
              </div>
              <div className="bg-discord-channel/30 backdrop-blur px-6 py-3 rounded-xl border border-indigo-500/20">
                <div className="text-2xl font-bold text-white mb-1">E2EE</div>
                <div className="text-sm text-discord-text-muted">Encrypted</div>
              </div>
              <div className="bg-discord-channel/30 backdrop-blur px-6 py-3 rounded-xl border border-indigo-500/20">
                <div className="text-2xl font-bold text-white mb-1">P2P</div>
                <div className="text-sm text-discord-text-muted">Architecture</div>
              </div>
            </div>
          </div>

          {/* Right side - Auth form */}
          <div className="w-full max-w-md">
            <div className="bg-discord-channel p-8 rounded-xl border border-indigo-500/20 backdrop-blur-xl">
              <div className="flex items-center justify-center mb-8">
                <div className="relative">
                  <div className="text-3xl font-bold text-white">Welcome!</div>
                  <div className="absolute -top-6 -right-6 w-12 h-12 bg-indigo-500/10 rounded-full"></div>
                  <div className="absolute -bottom-4 -left-4 w-8 h-8 bg-blue-500/10 rounded-full"></div>
                </div>
              </div>
              
              <form onSubmit={(e) => handleAuth(e, true)} className="space-y-6">
                <div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-5 py-4 rounded-lg bg-discord-dark text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all border border-gray-800"
                    placeholder="Username"
                  />
                </div>
                
                <div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-5 py-4 rounded-lg bg-discord-dark text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all border border-gray-800"
                    placeholder="Password"
                  />
                </div>

                {loginError && (
                  <div className="text-red-400 text-sm bg-red-500/5 p-4 rounded-lg border border-red-500/10">
                    {loginError}
                  </div>
                )}

                <div className="space-y-4 pt-2">
                  <button
                    type="submit"
                    className="w-full bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-4 rounded-lg font-medium transition-all duration-200"
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleAuth(e, false)}
                    className="w-full bg-discord-dark hover:bg-discord-channel text-white px-5 py-4 rounded-lg font-medium transition-all duration-200 border border-gray-800"
                  >
                    Create New Account
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-discord-dark text-white">
      {showSettings && <SettingsModal />}
      {showNewChannelModal && <NewChannelModal />}
      {enlargedImage && <ImageModal />}
      
      {/* Mobile menu buttons - add at the top of the chat interface */}
      <div className="sm:hidden fixed top-0 left-0 right-0 h-12 bg-[#202225] flex items-center justify-between px-4 z-20">
        <button
          onClick={() => setShowMobileChannels(prev => !prev)}
          className="p-2 text-gray-400 hover:text-white"
        >
          ☰
        </button>
        <span className="font-medium">#{currentChannel}</span>
        <button
          onClick={() => setShowMobileUsers(prev => !prev)}
          className="p-2 text-gray-400 hover:text-white"
        >
          👥
        </button>
      </div>

      {/* Update the server sidebar */}
      <div className="w-16 bg-[#202225] p-3 space-y-2 hidden sm:block">
        <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 cursor-pointer transition-all duration-200 hover:rounded-xl flex items-center justify-center font-black text-2xl text-white">
          D
        </div>
      </div>

      {/* Update the channels sidebar - make it toggleable on mobile */}
      <div className={`w-60 bg-discord-sidebar p-3 fixed sm:static inset-y-0 left-0 z-10 transform transition-transform duration-200 ease-in-out ${
        showMobileChannels ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'
      }`}>
        <div className="mb-6">
          <div className="relative inline-block">
            <h1 className="text-xl font-black tracking-tighter">
              Decent<span className="text-indigo-500">Chat</span>
            </h1>
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-500 rounded-full opacity-50 animate-pulse"></div>
          </div>
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center space-x-2">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-sm text-discord-text-muted">Online</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 rounded hover:bg-discord-channel/50 text-gray-400 hover:text-white transition-colors"
              >
                ⚙️
              </button>
              <button
                onClick={handleLogout}
                className="p-2 rounded hover:bg-discord-channel/50 text-sm text-gray-400 hover:text-red-400 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-discord-text-muted uppercase tracking-wider">Text Channels</span>
            <button
              onClick={() => setShowNewChannelModal(true)}
              className="p-1 hover:bg-discord-channel/50 rounded transition-colors text-gray-400 hover:text-white"
              title="Create Channel"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
          <div className="space-y-0.5">
            {channels.map(channel => (
              <div
                key={channel}
                className={`group flex items-center space-x-1 cursor-pointer transition-all px-2 py-1.5 rounded-md hover:bg-discord-channel/50 ${
                  channel === currentChannel 
                    ? 'bg-discord-channel text-white' 
                    : 'text-gray-400 hover:text-white'
                }`}
                onClick={() => setCurrentChannel(channel)}
              >
                <span className="text-lg opacity-60 group-hover:opacity-100">#</span>
                <span className="text-sm truncate">{channel}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Update the main chat area - add padding for mobile header */}
      <div className="flex-1 flex flex-col pt-12 sm:pt-0">
        <div className="px-4 py-3 shadow-lg bg-discord-dark border-b border-gray-800">
          <div className="flex items-center space-x-2">
            <span className="text-xl text-gray-400 opacity-60">#</span>
            <span className="font-medium">{currentChannel}</span>
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

        <form onSubmit={sendMessage} className="p-4 bg-discord-dark border-t border-gray-800">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => mediaInputRef.current?.click()}
              className="p-3 rounded-lg bg-discord-channel text-gray-400 hover:text-white hover:bg-discord-channel/70 transition-colors"
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
              className="flex-1 px-4 py-3 rounded-lg bg-discord-channel text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all border border-gray-800"
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
              className="px-4 py-3 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white transition-colors font-medium"
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

      {/* Update the users sidebar - make it toggleable on mobile */}
      <div className={`w-60 bg-discord-sidebar border-l border-gray-800 p-3 fixed sm:static inset-y-0 right-0 z-10 transform transition-transform duration-200 ease-in-out ${
        showMobileUsers ? 'translate-x-0' : 'translate-x-full sm:translate-x-0'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold text-discord-text-muted uppercase tracking-wider">
            Online — {onlineUsers.size}
          </span>
        </div>
        <div className="space-y-0.5">
          {Array.from(onlineUsers.values()).map(user => (
            <div key={user.username} className="flex items-center space-x-2 px-2 py-1.5 rounded-md hover:bg-discord-channel/50 transition-colors">
              <div className="relative">
                <img 
                  src={user.profilePicture} 
                  alt={user.username}
                  className="h-8 w-8 rounded-full bg-indigo-600/10 border border-indigo-500/20"
                />
                <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-discord-sidebar"></div>
              </div>
              <span className="text-sm text-gray-300">{user.username}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Add backdrop for mobile menus */}
      {(showMobileChannels || showMobileUsers) && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-0 sm:hidden"
          onClick={() => {
            setShowMobileChannels(false);
            setShowMobileUsers(false);
          }}
        />
      )}
    </div>
  );
}

export default App;
