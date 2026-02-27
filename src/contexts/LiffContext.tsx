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

  // LIFF 초기화 함수 (외부에서도 호출 가능)
  const initializeLiff = async (id: string) => {
    if (!id) {
      setError('LIFF ID가 필요합니다.');
      return;
    }

    try {
      setError(null);

      await liff.init({ liffId: id });

      setIsInClient(liff.isInClient());
      setIsInitialized(true);
      setLiffIdState(id);
      setNeedsLiffId(false);

      // localStorage에 저장
      localStorage.setItem('liffId', id);

      // 이미 로그인되어 있는지 확인
      if (liff.isLoggedIn()) {
        setIsLoggedIn(true);

        // 프로필 가져오기
        const userProfile = await liff.getProfile();
        setProfile({
          userId: userProfile.userId,
          displayName: userProfile.displayName,
          pictureUrl: userProfile.pictureUrl,
          statusMessage: userProfile.statusMessage
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'LIFF 초기화 실패');
      setIsInitialized(true);
    }
  };

  // LIFF ID 설정
  const setLiffId = (id: string) => {
    setLiffIdState(id);
    localStorage.setItem('liffId', id);
  };

  // 최초 로드 시 LIFF 초기화 시도
  useEffect(() => {
    const autoInitLiff = async () => {
      // 1. 환경 변수에서 LIFF ID 확인
      let id = import.meta.env.VITE_LIFF_ID;

      // 2. 없으면 localStorage에서 확인
      if (!id) {
        id = localStorage.getItem('liffId');
      }

      // 3. 둘 다 없으면 사용자 입력 필요
      if (!id) {
        setNeedsLiffId(true);
        setIsInitialized(true); // 초기화는 완료된 것으로 표시 (LIFF ID 입력 대기)
        return;
      }

      // 4. LIFF ID가 있으면 자동 초기화
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
      // 페이지 새로고침
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
