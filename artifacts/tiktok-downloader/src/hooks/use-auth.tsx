import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { setAuthTokenGetter, useGetMe, getGetMeQueryKey, logout as apiLogout } from "@workspace/api-client-react";
import type { UserResponse } from "@workspace/api-client-react";

interface AuthState {
  token: string | null;
  user: UserResponse | null;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => {
    return localStorage.getItem("auth_token");
  });

  const { data: user, isLoading: isUserLoading } = useGetMe({
    query: {
      enabled: !!token,
      retry: false,
      queryKey: getGetMeQueryKey(),
    },
  });

  useEffect(() => {
    setAuthTokenGetter(() => localStorage.getItem("auth_token"));
  }, []);

  const login = useCallback((newToken: string) => {
    localStorage.setItem("auth_token", newToken);
    setTokenState(newToken);
  }, []);

  const logout = useCallback(() => {
    // Revoke the token server-side so it cannot be reused even if intercepted.
    // Fire-and-forget — we clear the local state regardless of network outcome.
    apiLogout().catch(() => {});
    localStorage.removeItem("auth_token");
    setTokenState(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        token,
        user: user || null,
        isLoading: isUserLoading && !!token,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
