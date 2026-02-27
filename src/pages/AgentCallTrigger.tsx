import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiff } from '@/contexts/LiffContext';
import { useVideoSDK } from '@/contexts/VideoSDKContext';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Phone, CheckCircle, XCircle } from 'lucide-react';
import type { AgentCallInitiateResponse } from '@/types/api';

export const AgentCallTrigger = () => {
  const navigate = useNavigate();
  const { profile, isLoggedIn, liff } = useLiff();
  const { planetKitConfig } = useVideoSDK();
  const { toast } = useToast();
  const { language } = useLanguage();

  const [calling, setCalling] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (isLoggedIn && profile && !calling && !success && !error) {
      initiateAgentCall();
    }
  }, [isLoggedIn, profile]);

  const initiateAgentCall = async () => {
    if (!profile?.userId) {
      setError(language === 'ko' ? '로그인이 필요합니다.' : 'Login required.');
      return;
    }

    if (!planetKitConfig.serviceId) {
      setError(language === 'ko' ? 'PlanetKit 설정이 필요합니다.' : 'PlanetKit configuration required.');
      return;
    }

    setCalling(true);

    try {
      console.log('[AgentCallTrigger] Initiating agent call for user:', profile.userId);

      const response = await fetch('/api/agent-call?action=initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toUserId: profile.userId,
          toServiceId: planetKitConfig.serviceId,
          callerUserId: 'AGENT',
          callerServiceId: planetKitConfig.serviceId,
          audioFileIds: [import.meta.env.VITE_PLANETKIT_AUDIO_FILE_GREETING || ''],
          language
        })
      });

      const result: AgentCallInitiateResponse = await response.json();

      console.log('[AgentCallTrigger] API response:', result);

      if (result.success) {
        setSessionId(result.sid || null);
        setSuccess(true);
        toast({
          title: language === 'ko' ? '전화 연결 중' : 'Call initiated',
          description: language === 'ko'
            ? '곧 LINE 메시지로 전화가 옵니다!'
            : 'You will receive a call via LINE message shortly!'
        });

        // Auto-close LIFF window after 2 seconds
        setTimeout(() => {
          if (liff?.isInClient()) {
            console.log('[AgentCallTrigger] Auto-closing LIFF window');
            liff.closeWindow();
          }
        }, 2000);
      } else {
        throw new Error(result.error || 'Failed to initiate call');
      }
    } catch (err: any) {
      console.error('[AgentCallTrigger] Error:', err);
      setError(err.message || 'Unknown error');
      toast({
        title: language === 'ko' ? '오류 발생' : 'Error',
        description: language === 'ko'
          ? '전화 연결에 실패했습니다.'
          : 'Failed to initiate call.',
        variant: 'destructive'
      });
    } finally {
      setCalling(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 to-blue-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            {language === 'ko' ? 'Agent Call' : 'Agent Call'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {calling && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
              <p className="text-center text-muted-foreground">
                {language === 'ko' ? '전화를 거는 중...' : 'Initiating call...'}
              </p>
            </div>
          )}

          {success && (
            <div className="flex flex-col items-center gap-4 py-8">
              <CheckCircle className="w-12 h-12 text-green-500" />
              <div className="text-center space-y-2">
                <p className="font-semibold">
                  {language === 'ko' ? '전화가 연결되었습니다!' : 'Call initiated!'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {language === 'ko'
                    ? 'LINE 메시지를 확인하고 링크를 눌러 통화를 수락하세요.'
                    : 'Check your LINE messages and tap the link to accept the call.'}
                </p>
                {sessionId && (
                  <p className="text-xs font-mono text-muted-foreground">
                    Session: {sessionId.substring(0, 8)}...
                  </p>
                )}
              </div>
              <Button onClick={() => navigate('/setup')}>
                {language === 'ko' ? '돌아가기' : 'Go back'}
              </Button>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center gap-4 py-8">
              <XCircle className="w-12 h-12 text-red-500" />
              <div className="text-center space-y-2">
                <p className="font-semibold text-red-600">
                  {language === 'ko' ? '오류 발생' : 'Error occurred'}
                </p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => navigate('/setup')}>
                  {language === 'ko' ? '취소' : 'Cancel'}
                </Button>
                <Button onClick={() => {
                  setError(null);
                  initiateAgentCall();
                }}>
                  {language === 'ko' ? '다시 시도' : 'Retry'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentCallTrigger;
