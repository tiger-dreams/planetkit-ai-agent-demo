import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User } from 'lucide-react';
import { useLiff } from '@/contexts/LiffContext';
import { useVideoSDK } from '@/contexts/VideoSDKContext';
import { useToast } from '@/hooks/use-toast';

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language: 'en' | 'ko';
}

export const ProfileDialog = ({ open, onOpenChange, language }: ProfileDialogProps) => {
  const { profile } = useLiff();
  const { planetKitConfig, setPlanetKitConfig } = useVideoSDK();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState(planetKitConfig.displayName || '');

  // Update local state when dialog opens or planetKitConfig changes
  useEffect(() => {
    if (open) {
      setDisplayName(planetKitConfig.displayName || profile?.displayName || '');
    }
  }, [open, planetKitConfig.displayName, profile?.displayName]);

  const handleSave = () => {
    setPlanetKitConfig(prev => ({ ...prev, displayName }));
    toast({
      title: language === 'ko' ? '저장되었습니다' : 'Saved',
      description: language === 'ko'
        ? 'Display Name이 업데이트되었습니다.'
        : 'Display Name has been updated.',
    });
    onOpenChange(false);
  };

  const handleCancel = () => {
    setDisplayName(planetKitConfig.displayName || profile?.displayName || '');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {language === 'ko' ? '프로필 설정' : 'Profile Settings'}
          </DialogTitle>
          <DialogDescription>
            {language === 'ko'
              ? 'Display Name을 수정할 수 있습니다'
              : 'You can modify your display name'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Profile Picture */}
          <div className="flex justify-center">
            {profile?.pictureUrl ? (
              <img
                src={profile.pictureUrl}
                alt={profile.displayName}
                className="w-24 h-24 rounded-full border-2 border-primary"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center border-2 border-primary">
                <User className="w-12 h-12 text-primary" />
              </div>
            )}
          </div>

          {/* User Info */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="user-id" className="text-sm">
                User ID
              </Label>
              <Input
                id="user-id"
                value={profile?.userId || ''}
                disabled
                className="font-mono text-xs bg-muted"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="display-name" className="text-sm">
                Display Name
              </Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={language === 'ko' ? '표시 이름을 입력하세요' : 'Enter display name'}
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {language === 'ko'
                  ? '화상회의에 표시될 이름입니다'
                  : 'This name will be displayed in video calls'}
              </p>
            </div>

            {profile?.statusMessage && (
              <div className="space-y-2">
                <Label htmlFor="status-message" className="text-sm">
                  Status Message
                </Label>
                <Input
                  id="status-message"
                  value={profile.statusMessage}
                  disabled
                  className="text-xs bg-muted"
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            {language === 'ko' ? '취소' : 'Cancel'}
          </Button>
          <Button onClick={handleSave}>
            {language === 'ko' ? '저장' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
