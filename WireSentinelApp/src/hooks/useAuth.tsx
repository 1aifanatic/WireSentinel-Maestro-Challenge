import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { UiPath, UiPathError } from '@uipath/uipath-typescript/core';
import type { UiPathSDKConfig } from '@uipath/uipath-typescript/core';

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  sdk: UiPath;
  login: () => Promise<void>;
  logout: () => void;
  error: string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({
  children,
  config,
}: {
  children: ReactNode;
  config: UiPathSDKConfig;
}) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sdk] = useState(() => new UiPath(config));
  const didInitialize = useRef(false);

  useEffect(() => {
    if (didInitialize.current) return;
    didInitialize.current = true;

    async function initializeAuth() {
      setIsLoading(true);
      setError(null);
      try {
        if (sdk.isInOAuthCallback()) {
          await sdk.completeOAuth();
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        setIsAuthenticated(sdk.isAuthenticated());
      } catch (cause) {
        setError(cause instanceof UiPathError ? cause.message : 'Authentication failed.');
      } finally {
        setIsLoading(false);
      }
    }

    void initializeAuth();
  }, [sdk]);

  async function login() {
    setIsLoading(true);
    setError(null);
    try {
      await sdk.initialize();
    } catch (cause) {
      setError(cause instanceof UiPathError ? cause.message : 'Sign-in failed.');
      setIsLoading(false);
    }
  }

  function logout() {
    sdk.logout();
    setIsAuthenticated(false);
    setError(null);
  }

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, isLoading, sdk, login, logout, error }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
