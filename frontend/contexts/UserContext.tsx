'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'CUSTOMER' | 'PROVIDER';
}

interface UserContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  login: (email: string, role: 'CUSTOMER' | 'PROVIDER') => void;
  logout: () => void;
  isLoading: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for stored user data on mount
    const storedUser = localStorage.getItem('quickly_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error('Error parsing stored user:', error);
        localStorage.removeItem('quickly_user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = (email: string, role: 'CUSTOMER' | 'PROVIDER') => {
    // For demo purposes, create a mock user
    const mockUser: User = {
      id: `${role.toLowerCase()}_${Date.now()}`,
      name: email.split('@')[0],
      email,
      role
    };
    
    setUser(mockUser);
    localStorage.setItem('quickly_user', JSON.stringify(mockUser));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('quickly_user');
  };

  const value = {
    user,
    setUser,
    login,
    logout,
    isLoading
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}