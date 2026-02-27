import { useState, useEffect } from 'react';
import { useLiff } from '@/contexts/LiffContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle, XCircle, Calendar } from 'lucide-react';

export const ScheduleRetryPage = () => {
  const { profile, isLoggedIn, liff } = useLiff();
  const { language } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduledTime, setScheduledTime] = useState<string | null>(null);

  useEffect(() => {
    if (isLoggedIn && profile) {
      scheduleRetry();
    }
  }, [isLoggedIn, profile]);

  const scheduleRetry = async () => {
    try {
      // Get sid from URL query params
      const urlParams = new URLSearchParams(window.location.search);
      const sid = urlParams.get('sid');

      if (!sid) {
        throw new Error(language === 'ko' ? '세션 ID가 없습니다.' : 'Session ID not found.');
      }

      if (!profile?.userId) {
        throw new Error(language === 'ko' ? '로그인이 필요합니다.' : 'Login required.');
      }

      console.log('[Schedule Retry] Scheduling retry for SID:', sid);

      const response = await fetch('/api/retry?action=schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sid,
          userId: profile.userId
        })
      });

      const result = await response.json();

      console.log('[Schedule Retry] API response:', result);

      if (result.success) {
        setScheduledTime(result.scheduledAt || null);
        setSuccess(true);

        // Auto-close LIFF window after 2 seconds
        setTimeout(() => {
          if (liff?.isInClient()) {
            liff.closeWindow();
          }
        }, 2000);
      } else {
        throw new Error(result.error || result.message || 'Failed to schedule retry');
      }
    } catch (err: any) {
      console.error('[Schedule Retry] Error:', err);
      setError(err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString(language === 'ko' ? 'ko-KR' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 to-blue-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            {language === 'ko' ? '재시도 예약' : 'Schedule Retry'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
              <p className="text-center text-muted-foreground">
                {language === 'ko' ? '재시도를 예약하는 중...' : 'Scheduling retry...'}
              </p>
            </div>
          )}

          {success && (
            <div className="flex flex-col items-center gap-4 py-8">
              <CheckCircle className="w-12 h-12 text-green-500" />
              <div className="text-center space-y-2">
                <p className="font-semibold">
                  {language === 'ko' ? '✅ 재시도가 예약되었습니다!' : '✅ Retry scheduled!'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {language === 'ko'
                    ? `${formatTime(scheduledTime)}에 통화 요청이 도착합니다.`
                    : `You will receive a call at ${formatTime(scheduledTime)}.`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {language === 'ko'
                    ? '잠시만 기다려주세요.'
                    : 'Please wait.'}
                </p>
                <p className="text-xs text-muted-foreground mt-4">
                  {language === 'ko'
                    ? '이 창은 자동으로 닫힙니다.'
                    : 'This window will close automatically.'}
                </p>
              </div>
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ScheduleRetryPage;
