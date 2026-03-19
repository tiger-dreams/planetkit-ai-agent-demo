import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings, Server, CheckCircle, XCircle } from 'lucide-react';
import { useVideoSDK } from '@/contexts/VideoSDKContext';

interface ConfigurationSectionProps {
  language: 'en' | 'ko';
}

export const ConfigurationSection = ({ language }: ConfigurationSectionProps) => {
  const { planetKitConfig } = useVideoSDK();

  const configItems = [
    { label: 'Environment', value: 'Evaluation', isSet: true },
    { label: 'Service ID', value: planetKitConfig.serviceId ? 'Configured' : 'Not set', isSet: !!planetKitConfig.serviceId },
    { label: 'API Key', value: planetKitConfig.apiKey ? 'Configured' : 'Not set', isSet: !!planetKitConfig.apiKey },
    { label: 'User ID', value: planetKitConfig.userId ? 'Configured' : 'Not set', isSet: !!planetKitConfig.userId },
    { label: 'Display Name', value: planetKitConfig.displayName || 'Not set', isSet: !!planetKitConfig.displayName },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings className="w-4 h-4" />
          PlanetKit Configuration
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Environment Badge */}
        <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
          <Server className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <div className="flex-1">
            <span className="font-semibold text-blue-800 dark:text-blue-200 text-sm">
              Evaluation Environment
            </span>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              voipnx-saturn.line-apps-rc.com
            </p>
          </div>
        </div>

        {/* Config Summary */}
        <div className="grid grid-cols-2 gap-2">
          {configItems.slice(1).map((item) => (
            <div key={item.label} className="flex items-center justify-between p-2 bg-muted/30 rounded text-xs">
              <span className="text-muted-foreground">{item.label}</span>
              <div className="flex items-center gap-1">
                {item.isSet ? (
                  <CheckCircle className="w-3 h-3 text-green-500" />
                ) : (
                  <XCircle className="w-3 h-3 text-red-400" />
                )}
                <span className={item.isSet ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                  {item.isSet ? (item.label === 'Display Name' ? item.value : '✓') : '—'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
