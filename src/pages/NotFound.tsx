import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "lucide-react";

const NotFound = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    console.warn(
      "404 Warning: Redirecting from non-existent route:",
      location.pathname
    );

    // 5초 후 자동 리디렉션
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          navigate("/", { replace: true });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [location.pathname, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-6xl font-bold text-primary mb-4">404</CardTitle>
          <p className="text-xl text-muted-foreground">
            페이지를 찾을 수 없습니다
          </p>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            요청하신 페이지가 존재하지 않거나 이동되었습니다.
          </p>
          <p className="text-sm text-muted-foreground">
            {countdown}초 후 메인 페이지로 자동 이동합니다...
          </p>
          <div className="flex gap-2 justify-center">
            <Button
              onClick={() => navigate(-1)}
              variant="outline"
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              이전 페이지
            </Button>
            <Button
              onClick={() => navigate("/", { replace: true })}
              className="flex items-center gap-2"
            >
              <Home className="w-4 h-4" />
              메인으로
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default NotFound;
