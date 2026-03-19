import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity, LogIn, User, Video, Settings, Globe, Copy, Check, RefreshCw } from "lucide-react";
import { useVideoSDK } from "@/contexts/VideoSDKContext";
import { useLiff } from "@/contexts/LiffContext";
import { useToast } from "@/hooks/use-toast";
import { generatePlanetKitToken } from "@/utils/token-generator";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslations } from "@/utils/translations";
import { LanguageSelector } from "@/components/LanguageSelector";
import { ProfileDialog } from "@/components/ProfileDialog";
import { ConfigurationSection } from "@/components/ConfigurationSection";

// Generate random room ID in Google Meet style (xxx-yyyy-zzz)
const generateRoomId = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const getRandomChars = (length: number) => {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };
  return `${getRandomChars(3)}-${getRandomChars(4)}-${getRandomChars(3)}`;
};

const SetupPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { language } = useLanguage();
  const t = getTranslations(language);
  const { isLoggedIn, isInitialized, needsLiffId, liffId, profile, error: liffError, login, initializeLiff } = useLiff();
  const { planetKitConfig, setPlanetKitConfig, isConfigured } = useVideoSDK();
  const [liffIdInput, setLiffIdInput] = useState('');
  const [customRoomId, setCustomRoomId] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const autoTokenGeneratedRef = useRef(false);
  const roomInitializedRef = useRef(false);
  const [debugInfo, setDebugInfo] = useState<{
    roomParam: string | null;
    isLoggedIn: boolean;
    hasProfile: boolean;
    roomId: string;
    hasToken: boolean;
    alreadyGenerated: boolean;
    serviceId: boolean;
    apiKey: boolean;
    userId: string;
    status: string;
  } | null>(null);

  // Initialize with random room ID on mount
  useEffect(() => {
    if (!roomInitializedRef.current && !searchParams.get('room')) {
      const newRoomId = generateRoomId();
      setPlanetKitConfig(prev => ({ ...prev, roomId: newRoomId, accessToken: '' }));
      roomInitializedRef.current = true;
    }
  }, []);

  // 환경을 Evaluation으로 자동 설정 (컴포넌트 마운트 시 1회만)
  useEffect(() => {
    // 환경이 설정되지 않았거나 real인 경우에만 eval로 강제 설정
    if (!planetKitConfig.environment || planetKitConfig.environment === 'real') {
      setPlanetKitConfig(prev => ({
        ...prev,
        environment: 'eval',
        serviceId: import.meta.env.VITE_PLANETKIT_EVAL_SERVICE_ID || prev.serviceId,
        apiKey: import.meta.env.VITE_PLANETKIT_EVAL_API_KEY || prev.apiKey,
        apiSecret: import.meta.env.VITE_PLANETKIT_EVAL_API_SECRET || prev.apiSecret,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 빈 배열로 마운트 시 1회만 실행

  // 페이지 타이틀 업데이트
  useEffect(() => {
    document.title = language === 'ko' ? 'WebPlanet SDK 테스트' : 'WebPlanet SDK Test';
  }, [language]);

  // LIFF 로그인 후 자동으로 User ID와 Display Name 설정
  useEffect(() => {
    if (isLoggedIn && profile) {
      setPlanetKitConfig(prev => ({
        ...prev,
        userId: profile.userId, // Always use LINE user ID (not cached value)
        displayName: prev.displayName || profile.displayName
      }));
    }
  }, [isLoggedIn, profile]);

  // URL 파라미터에서 room 읽어서 자동 선택
  useEffect(() => {
    const roomParam = searchParams.get('room');
    if (roomParam) {
      const roomValue = roomParam.toLowerCase();
      console.log('[SetupPage] Deep link room parameter detected:', roomValue);

      if (presetRooms.includes(roomValue)) {
        // Preset room (japan, korea, taiwan, thailand)
        setSelectedRoomType(roomValue);
        setPlanetKitConfig(prev => ({ ...prev, roomId: roomValue, accessToken: '' }));
        console.log('[SetupPage] Auto-selected preset room:', roomValue);
      } else {
        // Custom room
        setSelectedRoomType('custom');
        setCustomRoomId(roomParam); // 원본 대소문자 유지
        setPlanetKitConfig(prev => ({ ...prev, roomId: roomParam, accessToken: '' }));
        console.log('[SetupPage] Auto-selected custom room:', roomParam);
      }
    }
  }, [searchParams]); // searchParams 변경 시 실행

  // 자동 토큰 생성 및 미팅 참여
  useEffect(() => {
    const roomParam = searchParams.get('room');
    const modeParam = searchParams.get('mode');
    const sidParam = searchParams.get('sid');
    const ccParamValue = searchParams.get('cc_param');
    const isAgentCall = modeParam === 'agent-call';

    // 디버그 정보 업데이트 (room 파라미터가 있을 때만)
    if (roomParam) {
      let status = 'Waiting for conditions...';
      if (!isLoggedIn) {
        status = 'Waiting for login...';
      } else if (!profile) {
        status = 'Waiting for profile...';
      } else if (!planetKitConfig.roomId) {
        status = 'Room ID not set';
      } else if (!planetKitConfig.serviceId || !planetKitConfig.apiKey) {
        status = 'Configuration incomplete';
      } else if (planetKitConfig.accessToken) {
        status = 'Token already generated';
      } else if (autoTokenGeneratedRef.current) {
        status = 'Token generation in progress...';
      } else {
        status = 'Ready to generate token';
      }

      console.log('[SetupPage] Auto-token useEffect triggered', {
        status,
        mode: modeParam,
        sid: sidParam,
        hasToken: !!planetKitConfig.accessToken,
        alreadyGenerated: autoTokenGeneratedRef.current
      });

      setDebugInfo({
        roomParam,
        isLoggedIn,
        hasProfile: !!profile,
        roomId: planetKitConfig.roomId,
        hasToken: !!planetKitConfig.accessToken,
        alreadyGenerated: autoTokenGeneratedRef.current,
        serviceId: !!planetKitConfig.serviceId,
        apiKey: !!planetKitConfig.apiKey,
        userId: planetKitConfig.userId || '',
        status,
      });
    }

    // 조건: URL에 room 파라미터가 있고, 로그인 완료, 토큰이 없고, 아직 자동 생성하지 않음
    if (roomParam && isLoggedIn && profile && planetKitConfig.roomId && !planetKitConfig.accessToken && !autoTokenGeneratedRef.current) {
      // 필수 설정이 모두 있는지 확인
      if (planetKitConfig.serviceId && planetKitConfig.apiKey && planetKitConfig.userId) {
        autoTokenGeneratedRef.current = true; // 중복 실행 방지
        console.log('[SetupPage] Auto-generating token for deep link entry...', { isAgentCall });
        setDebugInfo(prev => prev ? { ...prev, status: '🚀 Generating token...' } : null);

        // 토큰 생성
        generatePlanetKitToken(
          planetKitConfig.serviceId,
          planetKitConfig.apiKey,
          planetKitConfig.userId,
          planetKitConfig.roomId,
          3600,
          planetKitConfig.apiSecret
        ).then(token => {
          setPlanetKitConfig(prev => ({
            ...prev,
            accessToken: token
          }));
          console.log('[SetupPage] Token auto-generated successfully');
          setDebugInfo(prev => prev ? { ...prev, status: '✅ Token generated!' } : null);

          // 토큰 생성 성공 toast
          toast({
            title: language === 'ko' ? '자동 입장 준비 완료' : 'Auto-entry Ready',
            description: isAgentCall
              ? (language === 'ko' ? '음성 통화에 입장합니다.' : 'Joining voice call.')
              : (language === 'ko' ? `${planetKitConfig.roomId} 룸에 입장할 수 있습니다.` : `Ready to join ${planetKitConfig.roomId} room.`),
          });

          // 0.5초 후 자동으로 미팅 페이지로 이동
          setTimeout(() => {
            if (isAgentCall && sidParam) {
              console.log('[SetupPage] Auto-navigating to agent call meeting...', { sid: sidParam, cc_param: ccParamValue ? 'present' : 'missing' });
              setDebugInfo(prev => prev ? { ...prev, status: '🚀 Navigating to agent call...' } : null);
              // cc_param을 URL에 포함해서 전달
              const urlParams = new URLSearchParams({ sid: sidParam });
              if (ccParamValue) {
                urlParams.set('cc_param', ccParamValue);
              }
              navigate(`/agent-call-meeting?${urlParams.toString()}`);
            } else {
              console.log('[SetupPage] Auto-navigating to meeting page...');
              setDebugInfo(prev => prev ? { ...prev, status: '🚀 Navigating to meeting...' } : null);
              navigate('/planetkit_meeting');
            }
          }, 500);
        }).catch(error => {
          console.error('[SetupPage] Auto token generation failed:', error);
          autoTokenGeneratedRef.current = false; // 실패 시 다시 시도 가능하도록
          setDebugInfo(prev => prev ? { ...prev, status: `❌ Token generation failed: ${error instanceof Error ? error.message : 'Unknown error'}` } : null);
          toast({
            title: language === 'ko' ? '자동 토큰 생성 실패' : 'Auto Token Generation Failed',
            description: error instanceof Error ? error.message : (language === 'ko' ? '토큰 생성 중 오류가 발생했습니다.' : 'An error occurred while generating the token.'),
            variant: "destructive",
          });
        });
      }
    }
  }, [isLoggedIn, profile, planetKitConfig.roomId, planetKitConfig.accessToken, planetKitConfig.serviceId, planetKitConfig.apiKey, planetKitConfig.userId, searchParams, navigate, toast, language]);

  // Handle Join Meeting with auto token generation
  const handleJoinMeeting = async () => {
    if (!planetKitConfig.roomId) {
      toast({
        title: "Room Required",
        description: "Please enter a room ID to join.",
        variant: "destructive",
      });
      return;
    }

    if (!planetKitConfig.serviceId || !planetKitConfig.apiKey || !planetKitConfig.userId) {
      toast({
        title: "Configuration Missing",
        description: "Please ensure all settings are configured.",
        variant: "destructive",
      });
      return;
    }

    setIsJoining(true);

    try {
      // Auto-generate token if not already generated
      if (!planetKitConfig.accessToken) {
        const token = await generatePlanetKitToken(
          planetKitConfig.serviceId,
          planetKitConfig.apiKey,
          planetKitConfig.userId,
          planetKitConfig.roomId,
          3600,
          planetKitConfig.apiSecret
        );

        setPlanetKitConfig(prev => ({
          ...prev,
          accessToken: token
        }));
      }

      // Navigate to meeting
      navigate('/planetkit_meeting');
    } catch (error) {
      toast({
        title: "Failed to Join",
        description: error instanceof Error ? error.message : "An error occurred while joining the meeting.",
        variant: "destructive",
      });
      setIsJoining(false);
    }
  };

  // Generate new random room ID
  const handleGenerateNewRoom = () => {
    const newRoomId = generateRoomId();
    setPlanetKitConfig(prev => ({ ...prev, roomId: newRoomId, accessToken: '' }));
    setIsCustomMode(false);
    toast({
      title: "New Room Created",
      description: `Room ID: ${newRoomId}`,
    });
  };

  // Copy room ID to clipboard
  const handleCopyRoomId = async () => {
    if (planetKitConfig.roomId) {
      await navigator.clipboard.writeText(planetKitConfig.roomId);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      toast({
        title: "Copied",
        description: "Room ID copied to clipboard",
      });
    }
  };

  const copyDebugInfo = () => {
    if (!debugInfo) return;

    const debugText = `Deep Link Auto-Entry Debug Info
=================================
Room Parameter: ${debugInfo.roomParam || 'None'}
Logged In: ${debugInfo.isLoggedIn ? 'Yes' : 'No'}
Has Profile: ${debugInfo.hasProfile ? 'Yes' : 'No'}
Room ID: ${debugInfo.roomId || 'Not set'}
Has Token: ${debugInfo.hasToken ? 'Yes' : 'No'}
Service ID: ${debugInfo.serviceId ? 'Set' : 'Not set'}
API Key: ${debugInfo.apiKey ? 'Set' : 'Not set'}
User ID: ${debugInfo.userId || 'Not set'}
Status: ${debugInfo.status}`;

    navigator.clipboard.writeText(debugText).then(() => {
      toast({
        title: language === 'ko' ? '복사 완료' : 'Copied',
        description: language === 'ko' ? '디버그 정보가 클립보드에 복사되었습니다.' : 'Debug info copied to clipboard.',
      });
    }).catch(() => {
      toast({
        title: language === 'ko' ? '복사 실패' : 'Copy Failed',
        description: language === 'ko' ? '클립보드 복사에 실패했습니다.' : 'Failed to copy to clipboard.',
        variant: 'destructive',
      });
    });
  };

  // LIFF ID 입력 필요
  if (needsLiffId) {
    const handleLiffIdSubmit = async () => {
      if (!liffIdInput.trim()) {
        toast({
          title: language === 'ko' ? "LIFF ID 입력 필요" : "LIFF ID Required",
          description: language === 'ko' ? "LIFF ID를 입력해주세요." : "Please enter a LIFF ID.",
          variant: "destructive",
        });
        return;
      }

      try {
        await initializeLiff(liffIdInput.trim());
        toast({
          title: language === 'ko' ? "LIFF 초기화 성공" : "LIFF Initialized",
          description: language === 'ko' ? "LIFF가 성공적으로 초기화되었습니다." : "LIFF has been successfully initialized.",
        });
      } catch (error) {
        toast({
          title: language === 'ko' ? "LIFF 초기화 실패" : "LIFF Initialization Failed",
          description: error instanceof Error ? error.message : (language === 'ko' ? "LIFF 초기화에 실패했습니다." : "Failed to initialize LIFF."),
          variant: "destructive",
        });
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Settings className="w-8 h-8 text-primary" />
            </div>
            <CardTitle>{language === 'ko' ? 'LIFF 설정' : 'LIFF Setup'}</CardTitle>
            <CardDescription>
              {language === 'ko' ? 'LINE LIFF ID를 입력하여 앱을 시작하세요' : 'Enter LINE LIFF ID to start the app'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="liffId">LIFF ID</Label>
              <Input
                id="liffId"
                value={liffIdInput}
                onChange={(e) => setLiffIdInput(e.target.value)}
                placeholder={language === 'ko' ? '예: 2008742005-3DHkWzkg' : 'e.g., 2008742005-3DHkWzkg'}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                {language === 'ko' ? 'LINE Developers Console에서 발급받은 LIFF ID를 입력하세요.' : 'Enter the LIFF ID issued from LINE Developers Console.'}
              </p>
            </div>
            <Button onClick={handleLiffIdSubmit} className="w-full h-12 text-lg" size="lg">
              {language === 'ko' ? '초기화' : 'Initialize'}
            </Button>
            <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950 p-3 rounded border border-blue-200 dark:border-blue-800">
              <p className="text-blue-800 dark:text-blue-200 font-medium mb-2">
                💡 {language === 'ko' ? '환경 변수로 설정하기 (권장)' : 'Set via Environment Variable (Recommended)'}
              </p>
              <p className="text-blue-700 dark:text-blue-300">
                {language === 'ko' ? 'Vercel 환경 변수에' : 'Add'} <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">VITE_LIFF_ID</code>{language === 'ko' ? '를 추가하면 자동으로 로드됩니다.' : ' to Vercel environment variables to auto-load.'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // LIFF 초기화 중
  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6">
            <div className="text-center">
              <Activity className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" />
              <p className="text-muted-foreground">{language === 'ko' ? 'LIFF 초기화 중...' : 'Initializing LIFF...'}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // LIFF 에러
  if (liffError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Initialization Failed</CardTitle>
            <CardDescription>{liffError}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Failed to initialize LIFF. Please check if VITE_LIFF_ID is correctly set in the .env file.
            </p>
            <Button onClick={() => window.location.reload()} className="w-full">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // LINE 로그인 필요
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <LogIn className="w-8 h-8 text-primary" />
            </div>
            <CardTitle>{t.liffLogin}</CardTitle>
            <CardDescription>
              {t.liffLoginDescription}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={login} className="w-full h-12 text-lg" size="lg">
              <LogIn className="w-5 h-5 mr-2" />
              {t.loginWithLine}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 메인 설정 화면
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* 헤더 */}
      <div className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1">
              <h1 className="text-xl sm:text-2xl font-bold text-primary">
                Planet VoIP Room
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t.setupDescription}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <LanguageSelector />
              {/* Profile Button */}
              <button
                onClick={() => setProfileDialogOpen(true)}
                className="w-10 h-10 rounded-full overflow-hidden border-2 border-primary hover:border-primary/70 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                aria-label={language === 'ko' ? '프로필 보기' : 'View profile'}
              >
                {profile?.pictureUrl ? (
                  <img
                    src={profile.pictureUrl}
                    alt={profile.displayName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-primary/20 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Profile Dialog */}
      <ProfileDialog
        open={profileDialogOpen}
        onOpenChange={setProfileDialogOpen}
        language={language}
      />

      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <div className="space-y-4">
          {/* 디버그 정보 (딥링크 진입 시에만 표시) */}
          {searchParams.get('room') && debugInfo && (
            <Card className="bg-gradient-to-br from-yellow-100 to-orange-100 border-2 border-yellow-500">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2 text-gray-900">
                    🔍 <span className="font-bold">{language === 'ko' ? '딥링크 디버그' : 'Deep Link Debug'}</span>
                  </CardTitle>
                  <Button
                    onClick={copyDebugInfo}
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs bg-white/80 hover:bg-white text-gray-900 border-gray-400"
                  >
                    <Copy className="w-3 h-3 mr-1" />
                    {language === 'ko' ? '복사' : 'Copy'}
                  </Button>
                </div>
                <CardDescription className="text-xs pt-1 text-gray-700">
                  {language === 'ko' ? '자동 입장 조건 확인' : 'Auto-entry conditions check'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Status Banner */}
                <div className={`p-3 rounded-lg font-semibold text-sm ${
                  debugInfo.status.includes('✅') ? 'bg-green-200 text-green-900' :
                  debugInfo.status.includes('🚀') ? 'bg-blue-200 text-blue-900' :
                  debugInfo.status.includes('❌') ? 'bg-red-200 text-red-900' :
                  'bg-gray-200 text-gray-900'
                }`}>
                  {debugInfo.status}
                </div>

                {/* Conditions Grid */}
                <div className="grid grid-cols-1 gap-2">
                  {/* Room Parameter */}
                  <div className="flex items-center justify-between p-2.5 bg-white/80 rounded">
                    <span className="text-sm font-semibold text-gray-900">{language === 'ko' ? 'URL 파라미터' : 'URL Param'}</span>
                    <div className="flex items-center gap-2">
                      {debugInfo.roomParam ? (
                        <>
                          <CheckCircle className="w-4 h-4 text-green-700" />
                          <span className="text-xs font-mono font-semibold bg-green-200 text-green-900 px-2 py-0.5 rounded">
                            {debugInfo.roomParam}
                          </span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-red-700" />
                          <span className="text-xs font-semibold text-gray-600">{language === 'ko' ? '없음' : 'None'}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Login Status */}
                  <div className="flex items-center justify-between p-2.5 bg-white/80 rounded">
                    <span className="text-sm font-semibold text-gray-900">{language === 'ko' ? '로그인 상태' : 'Login Status'}</span>
                    <div className="flex items-center gap-2">
                      {debugInfo.isLoggedIn && debugInfo.hasProfile ? (
                        <>
                          <CheckCircle className="w-4 h-4 text-green-700" />
                          <span className="text-xs font-bold text-green-900">
                            {language === 'ko' ? '로그인됨' : 'Logged In'}
                          </span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-red-700" />
                          <span className="text-xs font-bold text-red-900">
                            {language === 'ko' ? '미로그인' : 'Not Logged In'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Room ID */}
                  <div className="flex items-center justify-between p-2.5 bg-white/80 rounded">
                    <span className="text-sm font-semibold text-gray-900">Room ID</span>
                    <div className="flex items-center gap-2">
                      {debugInfo.roomId ? (
                        <>
                          <CheckCircle className="w-4 h-4 text-green-700" />
                          <span className="text-xs font-mono font-semibold bg-green-200 text-green-900 px-2 py-0.5 rounded">
                            {debugInfo.roomId}
                          </span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-red-700" />
                          <span className="text-xs font-semibold text-gray-600">{language === 'ko' ? '미설정' : 'Not Set'}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Configuration */}
                  <div className="flex items-center justify-between p-2.5 bg-white/80 rounded">
                    <span className="text-sm font-semibold text-gray-900">{language === 'ko' ? '설정 완료' : 'Configuration'}</span>
                    <div className="flex items-center gap-2">
                      {debugInfo.serviceId && debugInfo.apiKey && debugInfo.userId ? (
                        <>
                          <CheckCircle className="w-4 h-4 text-green-700" />
                          <span className="text-xs font-bold text-green-900">
                            {language === 'ko' ? '완료' : 'Complete'}
                          </span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-red-700" />
                          <span className="text-xs font-bold text-red-900">
                            {language === 'ko' ? '불완전' : 'Incomplete'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Token Status */}
                  <div className="flex items-center justify-between p-2.5 bg-white/80 rounded">
                    <span className="text-sm font-semibold text-gray-900">{language === 'ko' ? '토큰 상태' : 'Token Status'}</span>
                    <div className="flex items-center gap-2">
                      {debugInfo.hasToken ? (
                        <>
                          <CheckCircle className="w-4 h-4 text-green-700" />
                          <span className="text-xs font-bold text-green-900">
                            {language === 'ko' ? '생성됨' : 'Generated'}
                          </span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-orange-700" />
                          <span className="text-xs font-bold text-orange-900">
                            {language === 'ko' ? '미생성' : 'Not Generated'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* User ID Display (if set) */}
                {debugInfo.userId && (
                  <div className="text-xs text-center text-gray-700 pt-2 border-t border-yellow-400">
                    User: <span className="font-mono font-bold text-gray-900">{debugInfo.userId}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Configuration Section (Environment + Custom Credentials 통합) */}
          <ConfigurationSection language={language} />

          {/* Room ID */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="w-4 h-4" />
                Room
              </CardTitle>
              <CardDescription className="text-xs">
                Share this Room ID with others to join the same call
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Current Room ID Display */}
              {!isCustomMode ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-4 bg-primary/5 rounded-lg border-2 border-primary/20">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Your Room ID</Label>
                      <p className="text-2xl font-mono font-bold tracking-wider text-primary">
                        {planetKitConfig.roomId || '---'}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyRoomId}
                        className="h-9 px-3"
                      >
                        {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateNewRoom}
                        className="h-9 px-3"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsCustomMode(true)}
                    className="w-full text-muted-foreground"
                  >
                    Or enter a custom Room ID
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="custom-room-id" className="text-sm">
                      Custom Room ID
                    </Label>
                    <Input
                      id="custom-room-id"
                      value={customRoomId}
                      onChange={(e) => {
                        const value = e.target.value;
                        setCustomRoomId(value);
                        setPlanetKitConfig(prev => ({ ...prev, roomId: value, accessToken: '' }));
                      }}
                      placeholder="e.g., my-meeting-room"
                      className="font-mono text-lg"
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter a room ID to join an existing call or create a new one
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsCustomMode(false);
                      handleGenerateNewRoom();
                    }}
                    className="w-full text-muted-foreground"
                  >
                    Generate random Room ID instead
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Join Meeting Button */}
          <Button
            onClick={handleJoinMeeting}
            disabled={!planetKitConfig.roomId || isJoining}
            className="w-full h-14 text-lg bg-primary hover:bg-primary/90"
            size="lg"
          >
            {isJoining ? (
              <>
                <Activity className="w-5 h-5 mr-2 animate-spin" />
                Joining...
              </>
            ) : (
              <>
                <Video className="w-5 h-5 mr-2" />
                Join Meeting
              </>
            )}
          </Button>

          {/* Info */}
          <div className="text-center text-xs text-muted-foreground">
            <p>
              PlanetKit AI Agent Demo - LINE Video Conferencing with AI
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SetupPage;
