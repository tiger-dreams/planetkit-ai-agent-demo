import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Settings, Server, AlertTriangle, Info } from 'lucide-react';
import { useVideoSDK } from '@/contexts/VideoSDKContext';

interface ConfigurationSectionProps {
  language: 'en' | 'ko';
}

export const ConfigurationSection = ({ language }: ConfigurationSectionProps) => {
  const { customCredentials, setCustomCredentials } = useVideoSDK();

  // 'default' or 'custom' mode
  const [mode, setMode] = useState<'default' | 'custom'>(
    customCredentials.enabled ? 'custom' : 'default'
  );

  // Sync mode with customCredentials.enabled
  useEffect(() => {
    setMode(customCredentials.enabled ? 'custom' : 'default');
  }, [customCredentials.enabled]);

  const handleModeChange = (newMode: 'default' | 'custom') => {
    setMode(newMode);
    if (newMode === 'default') {
      setCustomCredentials({ ...customCredentials, enabled: false });
    } else {
      setCustomCredentials({ ...customCredentials, enabled: true });
    }
  };

  const handleFieldChange = (field: keyof Omit<typeof customCredentials, 'enabled'>, value: string) => {
    setCustomCredentials({ ...customCredentials, [field]: value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings className="w-4 h-4" />
          {language === 'ko' ? 'PlanetKit 설정' : 'PlanetKit Configuration'}
        </CardTitle>
        <CardDescription className="text-xs">
          {language === 'ko'
            ? '기본 설정 또는 커스텀 인증 정보를 선택하세요'
            : 'Choose default settings or custom credentials'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Mode Toggle */}
        <RadioGroup value={mode} onValueChange={handleModeChange}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="default" id="mode-default" />
            <Label htmlFor="mode-default" className="cursor-pointer flex-1">
              <div className="flex flex-col">
                <span className="font-medium">
                  {language === 'ko' ? '기본 설정 (Evaluation)' : 'Default Settings (Evaluation)'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {language === 'ko' ? '테스트 환경 사용' : 'Use testing environment'}
                </span>
              </div>
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="custom" id="mode-custom" />
            <Label htmlFor="mode-custom" className="cursor-pointer flex-1">
              <div className="flex flex-col">
                <span className="font-medium">
                  {language === 'ko' ? '커스텀 인증 정보' : 'Custom Credentials'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {language === 'ko' ? '자체 Service ID 사용' : 'Use your own Service ID'}
                </span>
              </div>
            </Label>
          </div>
        </RadioGroup>

        <Separator />

        {/* Default Mode: Environment Info */}
        {mode === 'default' && (
          <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 mb-2">
              <Server className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="font-semibold text-blue-800 dark:text-blue-200">
                {language === 'ko' ? 'Evaluation 환경 사용 중' : 'Using Evaluation Environment'}
              </span>
            </div>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              📍 voipnx-saturn.line-apps-rc.com ({language === 'ko' ? '테스트 환경' : 'Testing Environment'})
            </p>
          </div>
        )}

        {/* Custom Mode: Credentials Form */}
        {mode === 'custom' && (
          <div className="space-y-4">
            {/* Warning Alert */}
            <Alert variant="destructive">
              <AlertTriangle className="w-4 h-4" />
              <AlertTitle>
                {language === 'ko' ? '기능 제한' : 'Feature Restrictions'}
              </AlertTitle>
              <AlertDescription className="text-xs">
                {language === 'ko'
                  ? '커스텀 인증 정보를 사용하면 통화 이력, 사용자 목록, 직접 초대 기능이 비활성화됩니다.'
                  : 'When using custom credentials, call history, user list, and direct invites will be disabled.'}
              </AlertDescription>
            </Alert>

            {/* Environment Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                {language === 'ko' ? '환경' : 'Environment'}
              </Label>
              <RadioGroup
                value={customCredentials.environment}
                onValueChange={(value) => handleFieldChange('environment', value)}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="eval" id="env-eval" />
                  <Label htmlFor="env-eval" className="cursor-pointer">Evaluation</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="real" id="env-real" />
                  <Label htmlFor="env-real" className="cursor-pointer">Real</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Service ID */}
            <div className="space-y-2">
              <Label htmlFor="custom-service-id" className="text-sm">
                Service ID
              </Label>
              <Input
                id="custom-service-id"
                value={customCredentials.serviceId}
                onChange={(e) => handleFieldChange('serviceId', e.target.value)}
                placeholder="e.g., 7bd3ca660f18"
                className="font-mono text-xs"
              />
            </div>

            {/* API Key */}
            <div className="space-y-2">
              <Label htmlFor="custom-api-key" className="text-sm">
                API Key
              </Label>
              <Input
                id="custom-api-key"
                value={customCredentials.apiKey}
                onChange={(e) => handleFieldChange('apiKey', e.target.value)}
                placeholder={language === 'ko' ? 'API Key 입력' : 'Enter API Key'}
                className="font-mono text-xs"
              />
            </div>

            {/* API Secret */}
            <div className="space-y-2">
              <Label htmlFor="custom-api-secret" className="text-sm">
                API Secret
              </Label>
              <Input
                id="custom-api-secret"
                type="password"
                value={customCredentials.apiSecret}
                onChange={(e) => handleFieldChange('apiSecret', e.target.value)}
                placeholder={language === 'ko' ? 'API Secret 입력' : 'Enter API Secret'}
                className="font-mono text-xs"
              />
            </div>

            {/* Info Alert */}
            <Alert>
              <Info className="w-4 h-4" />
              <AlertDescription className="text-xs">
                {language === 'ko'
                  ? '이 정보는 브라우저의 localStorage에 저장되며, 토큰 생성에만 사용됩니다.'
                  : 'This information is stored in browser localStorage and used only for token generation.'}
              </AlertDescription>
            </Alert>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
