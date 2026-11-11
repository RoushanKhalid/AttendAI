"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, UserProfile } from "@/lib/api";

interface AuthContextValue {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (usernameOrEmail: string, password: string) => Promise<UserProfile>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    api.logout();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const token = api.getToken();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    try {
      const profile = await api.fetchMe();
      setUser(profile);
    } catch {
      api.logout();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      api.logout();
      setUser(null);
    });
    const cached = api.getUser();
    const token = api.getToken();
    if (cached && token) {
      setUser(cached);
    }
    refreshUser();
    return () => api.setUnauthorizedHandler(null);
  }, [refreshUser]);

  const login = useCallback(async (usernameOrEmail: string, password: string) => {
    const profile = await api.login(usernameOrEmail, password);
    setUser(profile);
    return profile;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: Boolean(user),
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

