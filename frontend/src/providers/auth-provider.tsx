"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { ACCESS_TOKEN_KEY } from "@/lib/config";
import {
  getCurrentUser,
  login as loginApi,
  logout as logoutApi,
  refreshAccessToken,
  register as registerApi,
} from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import type { User } from "@/types/api";

type AuthContextValue = {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, fullName: string, password: string, role: "student" | "teacher") => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getStoredToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

function storeToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

function removeToken(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = useCallback(() => {
    setUser(null);
    setToken(null);
    removeToken();
  }, []);

  const refreshSession = useCallback(async () => {
    const refreshed = await refreshAccessToken();
    storeToken(refreshed.access_token);
    setToken(refreshed.access_token);

    const profile = await getCurrentUser(refreshed.access_token);
    setUser(profile);
  }, []);

  const hydrateFromToken = useCallback(
    async (candidateToken: string) => {
      try {
        const profile = await getCurrentUser(candidateToken);
        setToken(candidateToken);
        setUser(profile);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          try {
            await refreshSession();
            return;
          } catch {
            clearSession();
            return;
          }
        }

        clearSession();
      }
    },
    [clearSession, refreshSession],
  );

  const bootstrap = useCallback(async () => {
    const stored = getStoredToken();

    if (stored) {
      await hydrateFromToken(stored);
      setIsLoading(false);
      return;
    }

    try {
      await refreshSession();
    } catch {
      clearSession();
    } finally {
      setIsLoading(false);
    }
  }, [clearSession, hydrateFromToken, refreshSession]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const auth = await loginApi(email, password);
      storeToken(auth.access_token);
      setToken(auth.access_token);

      const profile = await getCurrentUser(auth.access_token);
      setUser(profile);
    } catch (error) {
      clearSession();
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [clearSession]);

  const register = useCallback(async (email: string, fullName: string, password: string, role: "student" | "teacher") => {
    setIsLoading(true);
    try {
      await registerApi({ email, full_name: fullName, password, role });
      await login(email, password);
    } finally {
      setIsLoading(false);
    }
  }, [login]);

  const logout = useCallback(async () => {
    try {
      if (token) {
        await logoutApi(token);
      }
    } finally {
      clearSession();
    }
  }, [clearSession, token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated: Boolean(token && user),
      login,
      register,
      logout,
      refreshSession,
    }),
    [user, token, isLoading, login, register, logout, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within AuthProvider");
  }
  return context;
}
