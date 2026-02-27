import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SDKType } from "@/types/video-sdk";

interface SDKSelectorProps {
  selectedSDK: SDKType;
  onSDKChange: (sdk: SDKType) => void;
}

export const SDKSelector = ({ selectedSDK, onSDKChange }: SDKSelectorProps) => {
  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
          Video SDK
        </CardTitle>
        <CardDescription>
          LINE Planet PlanetKit을 사용한 화상회의
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">LINE Planet PlanetKit</h3>
            <Badge variant="secondary" className="bg-blue-600/20 text-blue-600 border-blue-600/30">
              LINE
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            LINE Planet의 WebPlanetKit을 사용한 그룹 통화를 테스트합니다.
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="text-muted-foreground">• 그룹 통화</div>
            <div className="text-muted-foreground">• 안정적 연결</div>
            <div className="text-muted-foreground">• 모바일 최적화</div>
            <div className="text-muted-foreground">• LINE 생태계</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};