'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';

interface WebSocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  notifications: Notification[];
  addNotification: (notification: Notification) => void;
  removeNotification: (id: string) => void;
}

interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  timestamp: Date;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { user } = useUser();

  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    // Create WebSocket connection
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';
    const newSocket = io(wsUrl, {
      transports: ['websocket'],
      extraHeaders: {
        'x-user-id': user.id,
        'x-user-type': user.role.toLowerCase()
      }
    });

    newSocket.on('connect', () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    });

    // Handle incoming notifications
    newSocket.on('new_job', (data) => {
      addNotification({
        id: Date.now().toString(),
        type: 'info',
        title: 'New Job Available',
        message: `${data.job.title} - $${data.job.estimatedPrice}`,
        timestamp: new Date()
      });
    });

    newSocket.on('job_taken', () => {
      addNotification({
        id: Date.now().toString(),
        type: 'warning',
        title: 'Job Taken',
        message: 'This job has been taken by another provider',
        timestamp: new Date()
      });
    });

    newSocket.on('job_booked', (data) => {
      addNotification({
        id: Date.now().toString(),
        type: 'success',
        title: 'Job Booked',
        message: `Your job has been accepted!`,
        timestamp: new Date()
      });
    });

    newSocket.on('bid_received', (data) => {
      addNotification({
        id: Date.now().toString(),
        type: 'info',
        title: 'New Bid Received',
        message: `Bid of $${data.bid.price} received`,
        timestamp: new Date()
      });
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [user]);

  const addNotification = (notification: Notification) => {
    setNotifications(prev => [notification, ...prev].slice(0, 10)); // Keep only last 10
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      removeNotification(notification.id);
    }, 5000);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const value = {
    socket,
    isConnected,
    notifications,
    addNotification,
    removeNotification
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}