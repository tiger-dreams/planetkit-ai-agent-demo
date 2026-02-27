import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { SDKType, PlanetKitConfig, CustomPlanetKitCredentials, FeatureAvailability } from '@/types/video-sdk';

interface VideoSDKContextType {
  selectedSDK: SDKType;
  setSelectedSDK: (sdk: SDKType) => void;
  planetKitConfig: PlanetKitConfig;
  setPlanetKitConfig: (config: PlanetKitConfig) => void;
  isConfigured: boolean;
  customCredentials: CustomPlanetKitCredentials;
  setCustomCredentials: (credentials: CustomPlanetKitCredentials) => void;
  featureAvailability: FeatureAvailability;
}

const VideoSDKContext = createContext<VideoSDKContextType | undefined>(undefined);

interface VideoSDKProviderProps {
  children: ReactNode;
}

export const VideoSDKProvider = ({ children }: VideoSDKProviderProps) => {
  const [selectedSDK, setSelectedSDK] = useState<SDKType>('planetkit'); // Default to PlanetKit

  // Calculate feature availability based on custom credentials
  const calculateFeatureAvailability = (creds: CustomPlanetKitCredentials): FeatureAvailability => {
    const hasBackendSupport = !creds.enabled;
    return {
      hasBackendSupport,
      canUseCallHistory: hasBackendSupport,
      canUseAllUsers: hasBackendSupport,
      canSendDirectInvites: hasBackendSupport,
      canUseLiffShare: true,  // Always available
      canCopyInviteUrl: true  // Always available
    };
  };

  // PlanetKit: 환경 변수 또는 custom credentials에서 설정 로드
  const getDefaultPlanetKitConfig = (customCreds?: CustomPlanetKitCredentials): PlanetKitConfig => {
    // Priority: Custom credentials (if enabled) > Environment variables > defaults
    if (customCreds?.enabled) {
      return {
        serviceId: customCreds.serviceId,
        apiKey: customCreds.apiKey,
        apiSecret: customCreds.apiSecret,
        userId: '', // LINE 프로필에서 자동으로 설정됨
        displayName: '', // LINE 프로필에서 자동으로 설정됨
        roomId: '', // 사용자가 선택하도록 빈 값으로 시작
        accessToken: '',
        environment: customCreds.environment
      };
    }

    // Fallback to environment variables
    return {
      serviceId: import.meta.env.VITE_PLANETKIT_EVAL_SERVICE_ID || '',
      apiKey: import.meta.env.VITE_PLANETKIT_EVAL_API_KEY || '',
      apiSecret: import.meta.env.VITE_PLANETKIT_EVAL_API_SECRET || '',
      userId: '', // LINE 프로필에서 자동으로 설정됨
      displayName: '', // LINE 프로필에서 자동으로 설정됨
      roomId: '', // 사용자가 선택하도록 빈 값으로 시작
      accessToken: '',
      environment: '' // 사용자가 선택하도록 빈 값으로 시작
    };
  };

  // Custom credentials state
  const [customCredentials, setCustomCredentials] = useState<CustomPlanetKitCredentials>({
    enabled: false,
    serviceId: '',
    apiKey: '',
    apiSecret: '',
    environment: 'eval'
  });

  // Feature availability state
  const [featureAvailability, setFeatureAvailability] = useState<FeatureAvailability>(
    calculateFeatureAvailability({ enabled: false, serviceId: '', apiKey: '', apiSecret: '', environment: 'eval' })
  );

  const [planetKitConfig, setPlanetKitConfig] = useState<PlanetKitConfig>(
    getDefaultPlanetKitConfig()
  );

  // localStorage에서 설정 복원
  useEffect(() => {
    const savedPlanetKitConfig = localStorage.getItem('planetKitConfig');
    const savedSDK = localStorage.getItem('selectedSDK');
    const savedCustomCreds = localStorage.getItem('customPlanetKitCredentials');

    // Restore custom credentials first
    if (savedCustomCreds) {
      try {
        const creds = JSON.parse(savedCustomCreds);
        setCustomCredentials(creds);
        setFeatureAvailability(calculateFeatureAvailability(creds));

        // If custom credentials are enabled, recalculate planetKitConfig
        if (creds.enabled) {
          setPlanetKitConfig(prev => ({
            ...prev,
            serviceId: creds.serviceId,
            apiKey: creds.apiKey,
            apiSecret: creds.apiSecret,
            environment: creds.environment
          }));
        }
      } catch (error) {
        console.error('[VideoSDKContext] Failed to parse custom credentials:', error);
      }
    }

    if (savedPlanetKitConfig) {
      try {
        const saved = JSON.parse(savedPlanetKitConfig);

        // Validate and clean up invalid userId
        // LINE user IDs start with 'U' and are 33 characters long
        // Invalid patterns: 'Tfhh', 'test-user-', 'userId', short strings, etc.
        let cleanedUserId = saved.userId || '';
        if (cleanedUserId && (
          !cleanedUserId.startsWith('U') ||
          cleanedUserId.length < 10 ||
          cleanedUserId.includes('test') ||
          cleanedUserId === 'userId'
        )) {
          console.log('[VideoSDKContext] Cleaning invalid userId:', cleanedUserId);
          cleanedUserId = ''; // Reset to empty, will be set from LINE profile
        }

        // 환경 변수에서 로드한 값과 병합 (환경 변수 우선, custom credentials가 없는 경우만)
        setPlanetKitConfig(prev => ({
          ...prev,
          // Service ID, API Key, API Secret은 환경 변수 우선 (custom credentials가 비활성화된 경우만)
          serviceId: prev.serviceId || saved.serviceId,
          apiKey: prev.apiKey || saved.apiKey,
          apiSecret: prev.apiSecret || saved.apiSecret,
          // userId: cleaned value only, LINE profile will override
          userId: cleanedUserId || prev.userId,
          displayName: saved.displayName || prev.displayName,
          // environment는 custom credentials가 활성화되지 않은 경우 빈 값으로 시작
          environment: prev.environment || '',
          roomId: prev.roomId || '',
          // accessToken은 복원하지 않음 (매번 새로 생성 필요)
          accessToken: ''
        }));
      } catch (error) {
        console.error('Failed to parse PlanetKit config:', error);
      }
    }

    if (savedSDK) {
      setSelectedSDK(savedSDK as SDKType);
    }
  }, []);

  // 설정 변경 시 localStorage에 저장
  useEffect(() => {
    localStorage.setItem('planetKitConfig', JSON.stringify(planetKitConfig));
  }, [planetKitConfig]);

  useEffect(() => {
    localStorage.setItem('selectedSDK', selectedSDK);
  }, [selectedSDK]);

  // Custom credentials 변경 시 localStorage 저장 및 planetKitConfig 업데이트
  useEffect(() => {
    localStorage.setItem('customPlanetKitCredentials', JSON.stringify(customCredentials));
    setFeatureAvailability(calculateFeatureAvailability(customCredentials));

    // Update planetKitConfig when custom credentials change
    if (customCredentials.enabled) {
      setPlanetKitConfig(prev => ({
        ...prev,
        serviceId: customCredentials.serviceId,
        apiKey: customCredentials.apiKey,
        apiSecret: customCredentials.apiSecret,
        environment: customCredentials.environment,
        accessToken: '' // Force token regeneration
      }));
    } else {
      // Revert to environment variables when disabled
      const envConfig = getDefaultPlanetKitConfig();
      setPlanetKitConfig(prev => ({
        ...prev,
        serviceId: envConfig.serviceId,
        apiKey: envConfig.apiKey,
        apiSecret: envConfig.apiSecret,
        environment: envConfig.environment,
        accessToken: '' // Force token regeneration
      }));
    }
  }, [customCredentials]);

  // 설정이 완료되었는지 확인
  const isConfigured = !!(
    planetKitConfig.serviceId &&
    planetKitConfig.apiKey &&
    planetKitConfig.userId &&
    planetKitConfig.accessToken
  );

  const value = {
    selectedSDK,
    setSelectedSDK,
    planetKitConfig,
    setPlanetKitConfig,
    isConfigured,
    customCredentials,
    setCustomCredentials,
    featureAvailability,
  };

  return (
    <VideoSDKContext.Provider value={value}>
      {children}
    </VideoSDKContext.Provider>
  );
};

export const useVideoSDK = () => {
  const context = useContext(VideoSDKContext);
  if (context === undefined) {
    throw new Error('useVideoSDK must be used within a VideoSDKProvider');
  }
  return context;
};
