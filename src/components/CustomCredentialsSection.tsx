import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Settings, AlertTriangle, Info } from 'lucide-react';
import { CustomPlanetKitCredentials } from '@/types/video-sdk';
import { useVideoSDK } from '@/contexts/VideoSDKContext';

interface CustomCredentialsSectionProps {
  language: 'en' | 'ko';
}

export const CustomCredentialsSection = ({ language }: CustomCredentialsSectionProps) => {
  const { customCredentials, setCustomCredentials } = useVideoSDK();
  const [isExpanded, setIsExpanded] = useState(customCredentials.enabled);

  const handleToggle = (enabled: boolean) => {
    setCustomCredentials({ ...customCredentials, enabled });
    setIsExpanded(enabled);
  };

  const handleFieldChange = (field: keyof Omit<CustomPlanetKitCredentials, 'enabled'>, value: string) => {
    setCustomCredentials({ ...customCredentials, [field]: value });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            <CardTitle className="text-base">
              {language === 'ko' ? '고급 설정' : 'Advanced Settings'}
            </CardTitle>
          </div>
          <Switch
            checked={customCredentials.enabled}
            onCheckedChange={handleToggle}
          />
        </div>
        <CardDescription className="text-xs">
          {language === 'ko'
            ? '자체 PlanetKit 인증 정보를 사용하여 연결'
            : 'Use your own PlanetKit credentials'}
        </CardDescription>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4">
          {/* Warning Alert */}
          <Alert variant="destructive">
            <AlertTriangle className="w-4 h-4" />
            <AlertTitle>
              {language === 'ko' ? '기능 제한' : 'Feature Restrictions'}
            </AlertTitle>
            <AlertDescription className="text-xs">
              {language === 'ko'
                ? '커스텀 인증 정보를 사용하면 통화 이력, 사용자 목록, 직접 초대 기능이 비활성화됩니다. LIFF 공유와 URL 복사는 계속 사용 가능합니다.'
                : 'When using custom credentials, call history, user list, and direct invites will be disabled. LIFF sharing and URL copy remain available.'}
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
        </CardContent>
      )}
    </Card>
  );
};
