import React, { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { IGunInstance, GunData } from '../types';

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
  onImageClick: (url: string) => void;
}

const Message = React.memo(({ message, gun, onImageClick }: MessageProps) => {
  const [profilePic, setProfilePic] = useState(
    `https://api.dicebear.com/9.x/thumbs/svg?seed=${message.sender}`
  );

  useEffect(() => {
    const userProfilePic = gun.get('users').get(message.sender).get('profilePicture');
    const unsubscribe = userProfilePic.on((data) => {
      if (typeof data === 'string') {
        setProfilePic(data);
      }
    });
    return () => unsubscribe.off();
  }, [message.sender, gun]);

  const handleImageClick = useCallback(() => {
    if (message.content) {
      onImageClick(message.content);
    }
  }, [message.content, onImageClick]);

  return (
    <div className="flex items-start space-x-4 animate-fadeIn hover:bg-discord-channel/30 p-2 rounded-lg transition-colors">
      <img
        src={profilePic}
        alt={message.sender}
        className="h-10 w-10 rounded-full bg-indigo-600 flex-shrink-0"
      />
      <div>
        <div className="flex items-baseline space-x-2">
          <span className="font-medium text-indigo-400">{message.sender || 'Unknown'}</span>
          <span className="text-xs text-gray-400">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        </div>
        {message.type === 'media' ? (
          <>
            {message.text && (
              <div className="text-gray-300 mb-2 prose prose-invert max-w-none">
                <ReactMarkdown>{message.text}</ReactMarkdown>
              </div>
            )}
            <div className="relative group inline-block">
              <img 
                src={message.content} 
                alt="Media" 
                className="max-w-[300px] max-h-[300px] object-contain rounded-lg cursor-zoom-in transition-transform duration-200 group-hover:scale-[1.02]" 
                onClick={handleImageClick}
              />
            </div>
          </>
        ) : (
          <div className="text-gray-300 prose prose-invert max-w-none">
            <ReactMarkdown>{message.text || ''}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
});

Message.displayName = 'Message';

export default Message;
