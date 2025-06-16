"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  role: "CUSTOMER" | "PROVIDER";
}

interface UserContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  login: (email: string, role: "CUSTOMER" | "PROVIDER") => void;
  logout: () => void;
  isLoading: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for stored user data on mount
    const storedUser = localStorage.getItem("quickly_user");
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error("Error parsing stored user:", error);
        localStorage.removeItem("quickly_user");
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, role: "CUSTOMER" | "PROVIDER") => {
    try {
      // First, try to find existing user by email
      const response = await fetch(
        `http://localhost:3002/api/users/by-email/${encodeURIComponent(email)}`
      );

      let mockUser: User;

      if (response.ok) {
        // User exists in database, use their real data
        const existingUser = await response.json();
        mockUser = {
          id: existingUser.id,
          name: existingUser.name,
          email: existingUser.email,
          role: existingUser.role,
        };
      } else {
        // User doesn't exist, create them in database
        const createResponse = await fetch(`http://localhost:3002/api/users`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            name: email.split("@")[0],
            role,
          }),
        });

        if (createResponse.ok) {
          const newUser = await createResponse.json();
          mockUser = {
            id: newUser.id,
            name: newUser.name,
            email: newUser.email,
            role: newUser.role,
          };
        } else {
          throw new Error("Failed to create user");
        }
      }

      setUser(mockUser);
      localStorage.setItem("quickly_user", JSON.stringify(mockUser));
    } catch (error) {
      console.error("Login error:", error);
      // Fallback to mock user if API fails
      const mockUser: User = {
        id: `${role.toLowerCase()}_${Date.now()}`,
        name: email.split("@")[0],
        email,
        role,
      };
      setUser(mockUser);
      localStorage.setItem("quickly_user", JSON.stringify(mockUser));
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("quickly_user");
  };

  const value = {
    user,
    setUser,
    login,
    logout,
    isLoading,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
