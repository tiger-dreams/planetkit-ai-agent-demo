import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { SDKType, AIProvider, PlanetKitConfig, CustomPlanetKitCredentials, FeatureAvailability } from '@/types/video-sdk';

interface VideoSDKContextType {
  selectedSDK: SDKType;
  setSelectedSDK: (sdk: SDKType) => void;
  planetKitConfig: PlanetKitConfig;
  setPlanetKitConfig: (config: PlanetKitConfig) => void;
  isConfigured: boolean;
  customCredentials: CustomPlanetKitCredentials;
  setCustomCredentials: (credentials: CustomPlanetKitCredentials) => void;
  featureAvailability: FeatureAvailability;
  aiProvider: AIProvider;
  setAIProvider: (provider: AIProvider) => void;
}

const VideoSDKContext = createContext<VideoSDKContextType | undefined>(undefined);

interface VideoSDKProviderProps {
  children: ReactNode;
}

export const VideoSDKProvider = ({ children }: VideoSDKProviderProps) => {
  const [selectedSDK, setSelectedSDK] = useState<SDKType>('planetkit'); // Default to PlanetKit
  const [aiProvider, setAIProvider] = useState<AIProvider>('gemini'); // Default to Gemini

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

  // PlanetKit: load configuration from environment variables or custom credentials
  const getDefaultPlanetKitConfig = (customCreds?: CustomPlanetKitCredentials): PlanetKitConfig => {
    // Priority: Custom credentials (if enabled) > Environment variables > defaults
    if (customCreds?.enabled) {
      return {
        serviceId: customCreds.serviceId,
        apiKey: customCreds.apiKey,
        apiSecret: customCreds.apiSecret,
        userId: '', // Auto-filled from LINE profile
        displayName: '', // Auto-filled from LINE profile
        roomId: '', // Start empty so user selects
        accessToken: '',
        environment: customCreds.environment
      };
    }

    // Fallback to environment variables
    return {
      serviceId: import.meta.env.VITE_PLANETKIT_EVAL_SERVICE_ID || '',
      apiKey: import.meta.env.VITE_PLANETKIT_EVAL_API_KEY || '',
      apiSecret: import.meta.env.VITE_PLANETKIT_EVAL_API_SECRET || '',
      userId: '', // Auto-filled from LINE profile
      displayName: '', // Auto-filled from LINE profile
      roomId: '', // Start empty so user selects
      accessToken: '',
      environment: '' // Start empty so user selects
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

  // Restore configuration from localStorage
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

        // Environment variables always take priority (serviceId, apiKey, apiSecret)
        // From localStorage we only restore userId and displayName
        const envServiceId = import.meta.env.VITE_PLANETKIT_EVAL_SERVICE_ID || '';
        const envApiKey = import.meta.env.VITE_PLANETKIT_EVAL_API_KEY || '';
        const envApiSecret = import.meta.env.VITE_PLANETKIT_EVAL_API_SECRET || '';

        setPlanetKitConfig(prev => ({
          ...prev,
          // Use environment variables if present, otherwise fall back to localStorage values
          serviceId: envServiceId || saved.serviceId || prev.serviceId,
          apiKey: envApiKey || saved.apiKey || prev.apiKey,
          apiSecret: envApiSecret || saved.apiSecret || prev.apiSecret,
          // userId: cleaned value only, LINE profile will override
          userId: cleanedUserId || prev.userId,
          displayName: saved.displayName || prev.displayName,
          // environment is fixed to eval
          environment: 'eval',
          roomId: prev.roomId || '',
          // Do not restore accessToken (must be regenerated every time)
          accessToken: ''
        }));
      } catch (error) {
        console.error('Failed to parse PlanetKit config:', error);
      }
    }

    if (savedSDK) {
      setSelectedSDK(savedSDK as SDKType);
    }

    // Restore AI provider
    const savedAIProvider = localStorage.getItem('aiProvider');
    if (savedAIProvider && (savedAIProvider === 'gemini' || savedAIProvider === 'openai')) {
      setAIProvider(savedAIProvider as AIProvider);
    }
  }, []);

  // Save to localStorage when configuration changes
  useEffect(() => {
    localStorage.setItem('planetKitConfig', JSON.stringify(planetKitConfig));
  }, [planetKitConfig]);

  useEffect(() => {
    localStorage.setItem('selectedSDK', selectedSDK);
  }, [selectedSDK]);

  useEffect(() => {
    localStorage.setItem('aiProvider', aiProvider);
  }, [aiProvider]);

  // When custom credentials change, save to localStorage and update planetKitConfig
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

  // Check whether configuration is complete
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
    aiProvider,
    setAIProvider,
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
