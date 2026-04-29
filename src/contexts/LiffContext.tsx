import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import liff from '@line/liff';

interface LiffContextType {
  isLoggedIn: boolean;
  isInClient: boolean;
  isInitialized: boolean;
  liffId: string | null;
  needsLiffId: boolean;
  profile: {
    userId: string;
    displayName: string;
    pictureUrl?: string;
    statusMessage?: string;
  } | null;
  error: string | null;
  login: () => Promise<void>;
  logout: () => void;
  setLiffId: (id: string) => void;
  initializeLiff: (id: string) => Promise<void>;
  liff: typeof liff;
}

const LiffContext = createContext<LiffContextType | undefined>(undefined);

interface LiffProviderProps {
  children: ReactNode;
}

export const LiffProvider = ({ children }: LiffProviderProps) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isInClient, setIsInClient] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [liffId, setLiffIdState] = useState<string | null>(null);
  const [needsLiffId, setNeedsLiffId] = useState(false);
  const [profile, setProfile] = useState<LiffContextType['profile']>(null);
  const [error, setError] = useState<string | null>(null);

  // LIFF initialization function (can be called externally)
  const initializeLiff = async (id: string) => {
    if (!id) {
      setError('LIFF ID is required.');
      return;
    }

    try {
      setError(null);

      await liff.init({ liffId: id });

      setIsInClient(liff.isInClient());
      setIsInitialized(true);
      setLiffIdState(id);
      setNeedsLiffId(false);

      // Save to localStorage
      localStorage.setItem('liffId', id);

      // Check if already logged in
      if (liff.isLoggedIn()) {
        setIsLoggedIn(true);

        // Fetch profile
        const userProfile = await liff.getProfile();
        setProfile({
          userId: userProfile.userId,
          displayName: userProfile.displayName,
          pictureUrl: userProfile.pictureUrl,
          statusMessage: userProfile.statusMessage
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'LIFF initialization failed');
      setIsInitialized(true);
    }
  };

  // Set LIFF ID
  const setLiffId = (id: string) => {
    setLiffIdState(id);
    localStorage.setItem('liffId', id);
  };

  // Attempt LIFF initialization on first load
  useEffect(() => {
    const autoInitLiff = async () => {
      // 1. Check LIFF ID from environment variable
      let id = import.meta.env.VITE_LIFF_ID;

      // 2. If not present, check localStorage
      if (!id) {
        id = localStorage.getItem('liffId');
      }

      // 3. If neither, user input is required
      if (!id) {
        setNeedsLiffId(true);
        setIsInitialized(true); // Mark initialization as complete (waiting for LIFF ID input)
        return;
      }

      // 4. If LIFF ID exists, auto-initialize
      await initializeLiff(id);
    };

    autoInitLiff();
  }, []);

  const login = async () => {
    if (!liff.isLoggedIn()) {
      // Allow bypass for PC debugging if env variable is set
      const isDevelopment = import.meta.env.MODE === 'development';
      const shouldMock = isDevelopment && !liff.isInClient();
      
      if (shouldMock) {
        console.warn('[LiffContext] PC environment detected. Mocking login for development.');
        setIsLoggedIn(true);
        setProfile({
          userId: 'U_MOCK_USER_ID',
          displayName: 'PC Debugger',
          pictureUrl: 'https://via.placeholder.com/150'
        });
        return;
      }
      
      liff.login();
    }
  };

  const logout = () => {
    if (liff.isLoggedIn()) {
      liff.logout();
      setIsLoggedIn(false);
      setProfile(null);
      // Reload the page
      window.location.reload();
    }
  };

  const value = {
    isLoggedIn,
    isInClient,
    isInitialized,
    liffId,
    needsLiffId,
    profile,
    error,
    login,
    logout,
    setLiffId,
    initializeLiff,
    liff
  };

  return (
    <LiffContext.Provider value={value}>
      {children}
    </LiffContext.Provider>
  );
};

export const useLiff = () => {
  const context = useContext(LiffContext);
  if (context === undefined) {
    throw new Error('useLiff must be used within a LiffProvider');
  }
  return context;
};
