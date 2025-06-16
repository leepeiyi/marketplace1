// contexts/WebSocketContext.tsx
'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useUser } from './UserContext';

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
}

interface WebSocketContextType {
  isConnected: boolean;
  notifications: Notification[];
  addNotification: (notification: Notification) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  sendMessage: (message: any) => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws';

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const [isConnected, setIsConnected] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const addNotification = useCallback((notification: Notification) => {
    setNotifications(prev => [notification, ...prev].slice(0, 10)); // Keep only last 10
    
    // Auto-remove after 5 seconds for success/info notifications
    if (notification.type === 'success' || notification.type === 'info') {
      setTimeout(() => {
        removeNotification(notification.id);
      }, 5000);
    }
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, cannot send message:', message);
    }
  }, []);

  const connect = useCallback(() => {
    if (!user) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        reconnectAttempts.current = 0;

        // Authenticate the connection
        ws.send(JSON.stringify({
          type: 'authenticate',
          userId: user.id,
          userType: user.role.toLowerCase()
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        wsRef.current = null;

        // Attempt to reconnect if not a normal closure
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          console.log(`Attempting to reconnect in ${delay}ms...`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        addNotification({
          id: Date.now().toString(),
          type: 'error',
          title: 'Connection Error',
          message: 'Lost connection to server',
          timestamp: new Date()
        });
      };

    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
    }
  }, [user, addNotification]);

  const handleWebSocketMessage = useCallback((data: any) => {
    console.log('WebSocket message received:', data.type, data);

    switch (data.type) {
      case 'connected':
        console.log('WebSocket connection confirmed');
        break;

      case 'authenticated':
        console.log('WebSocket authentication successful');
        addNotification({
          id: Date.now().toString(),
          type: 'success',
          title: 'Connected',
          message: 'Real-time notifications enabled',
          timestamp: new Date()
        });
        break;

      case 'new_quick_book_job':
        // For providers: new job available
        addNotification({
          id: Date.now().toString(),
          type: 'info',
          title: 'New Job Available',
          message: `${data.job.title} - ${data.job.estimatedPrice} (${data.job.distance}km away)`,
          timestamp: new Date()
        });
        
        // Dispatch custom event for ProviderDashboard
        window.dispatchEvent(new CustomEvent('new_job_available', { detail: data.job }));
        break;

      case 'job_accepted':
        // For customers: provider accepted job
        addNotification({
          id: Date.now().toString(),
          type: 'success',
          title: 'Job Accepted!',
          message: `${data.job.providerName} is coming to help you`,
          timestamp: new Date()
        });
        
        // Dispatch custom event for job update
        window.dispatchEvent(new CustomEvent('job_update', { detail: data }));
        break;

      case 'job_taken':
        // For providers: job no longer available
        window.dispatchEvent(new CustomEvent('job_taken', { detail: { jobId: data.jobId } }));
        break;

      case 'bid_received':
        // For customers: new bid on post & quote job
        addNotification({
          id: Date.now().toString(),
          type: 'info',
          title: 'New Bid Received',
          message: `${data.bid.providerName} bid $${data.bid.price}`,
          timestamp: new Date()
        });
        
        window.dispatchEvent(new CustomEvent('new_bid', { detail: data.bid }));
        break;

      case 'escrow_released':
        // For providers: payment released
        addNotification({
          id: Date.now().toString(),
          type: 'success',
          title: 'Payment Released',
          message: `$${data.amount} has been released to your account`,
          timestamp: new Date()
        });
        break;

      case 'job_cancelled':
        addNotification({
          id: Date.now().toString(),
          type: 'warning',
          title: 'Job Cancelled',
          message: data.reason || 'Job has been cancelled',
          timestamp: new Date()
        });
        
        window.dispatchEvent(new CustomEvent('job_cancelled', { detail: data }));
        break;

      case 'error':
        addNotification({
          id: Date.now().toString(),
          type: 'error',
          title: 'Error',
          message: data.message,
          timestamp: new Date()
        });
        break;

      case 'pong':
        // Heartbeat response
        break;

      default:
        console.log('Unknown WebSocket message type:', data.type);
    }
  }, [addNotification]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnected');
      wsRef.current = null;
    }

    setIsConnected(false);
    reconnectAttempts.current = 0;
  }, []);

  // Connect when user is available
  useEffect(() => {
    if (user) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [user, connect, disconnect]);

  // Heartbeat to keep connection alive
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      sendMessage({ type: 'ping' });
    }, 30000); // Ping every 30 seconds

    return () => clearInterval(interval);
  }, [isConnected, sendMessage]);

  const value: WebSocketContextType = {
    isConnected,
    notifications,
    addNotification,
    removeNotification,
    clearNotifications,
    sendMessage
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