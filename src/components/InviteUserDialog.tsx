import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, UserPlus, Share2, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLiff } from '@/contexts/LiffContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string;
  currentUserName: string;
  roomId: string;
  liffId: string;
}

export const InviteUserDialog = ({
  open,
  onOpenChange,
  currentUserName,
  roomId,
  liffId,
}: InviteUserDialogProps) => {
  const { toast } = useToast();
  const { liff } = useLiff();
  const { language } = useLanguage();
  const [sharingToFriends, setSharingToFriends] = useState(false);

  const shareToLineFriends = async () => {
    setSharingToFriends(true);
    try {
      // Check if LIFF is initialized and user is logged in
      if (!liff.isLoggedIn()) {
        console.error('[shareTargetPicker] User is not logged in');
        toast({
          title: 'Login Required',
          description: 'Please log in to LINE.',
          variant: 'destructive',
        });
        setSharingToFriends(false);
        return;
      }

      // Check if shareTargetPicker API is available
      if (!liff.isApiAvailable('shareTargetPicker')) {
        console.error('[shareTargetPicker] API is not available in this environment');
        toast({
          title: 'Feature Not Available',
          description: 'Share Target Picker is not available. Please enable it in LINE Developers Console or use a supported LINE version.',
          variant: 'destructive',
        });
        setSharingToFriends(false);
        return;
      }

      // Build LIFF URL
      const liffUrl = `https://liff.line.me/${liffId}?room=${encodeURIComponent(roomId)}`;

      console.log('[shareTargetPicker] Starting share with:', {
        liffUrl,
        roomId,
        userName: currentUserName,
        isApiAvailable: true,
      });

      // Invite message
      const shareMessage = language === 'ko'
        ? `🎥 ${currentUserName}님이 화상 통화에 초대했습니다!\n\n룸: ${roomId}\n\n링크를 눌러 참여하세요:\n${liffUrl}`
        : `🎥 ${currentUserName} invited you to a video call!\n\nRoom: ${roomId}\n\nTap the link to join:\n${liffUrl}`;

      const result = await liff.shareTargetPicker(
        [
          {
            type: 'text',
            text: shareMessage,
          },
        ],
        {
          isMultiple: true,
        }
      );

      if (result) {
        // Successfully sent
        console.log(`[shareTargetPicker] Success - [${result.status}] Message sent!`);
        toast({
          title: 'Invitation Sent',
          description: 'Invitation message sent to LINE friends.',
        });
        onOpenChange(false);
      } else {
        // User canceled
        console.log('[shareTargetPicker] User canceled - TargetPicker was closed');
        toast({
          title: 'Invitation Canceled',
          description: 'Friend selection was canceled.',
          variant: 'default',
        });
      }
    } catch (error: any) {
      console.error('[shareTargetPicker] Error:', error);

      // Extract detailed error information
      let errorMessage = 'An error occurred while inviting LINE friends.';
      let errorDetails = '';

      if (error && typeof error === 'object') {
        if (error.code) {
          errorDetails += `Code: ${error.code}`;
        }
        if (error.message) {
          errorDetails += errorDetails ? `, Message: ${error.message}` : `Message: ${error.message}`;
        }

        // Check for specific LIFF errors
        if (error.code === 'INVALID_ARGUMENT') {
          errorMessage = 'Invalid message format.';
        } else if (error.code === 'FORBIDDEN') {
          errorMessage = 'Share Target Picker is not enabled. Please check the settings in LINE Developers Console.';
        } else if (error.code === 'UNAUTHORIZED') {
          errorMessage = 'Unauthorized. Please check your login status.';
        }
      }

      console.error('[shareTargetPicker] Error details:', errorDetails);

      toast({
        title: 'Invitation Failed',
        description: errorDetails ? `${errorMessage}\n\n${errorDetails}` : errorMessage,
        variant: 'destructive',
      });
    } finally {
      setSharingToFriends(false);
    }
  };

  const copyInviteUrl = async () => {
    try {
      const liffUrl = `https://liff.line.me/${liffId}?room=${encodeURIComponent(roomId)}`;

      // Invite message
      const inviteMessage = language === 'ko'
        ? `🎥 ${currentUserName}님이 화상 통화에 초대했습니다!\n\n룸: ${roomId}\n\n링크를 눌러 참여하세요:\n${liffUrl}`
        : `🎥 ${currentUserName} invited you to a video call!\n\nRoom: ${roomId}\n\nTap the link to join:\n${liffUrl}`;

      await navigator.clipboard.writeText(inviteMessage);

      console.log('[copyInviteUrl] Invite message copied to clipboard:', inviteMessage);

      toast({
        title: 'Invite Message Copied',
        description: 'Invitation message with URL has been copied to clipboard.',
      });
    } catch (error) {
      console.error('[copyInviteUrl] Failed to copy invite message:', error);
      toast({
        title: 'Copy Failed',
        description: 'Failed to copy invitation message to clipboard.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Invite to Call
          </DialogTitle>
          <DialogDescription>
            Share the meeting link with friends to invite them.
          </DialogDescription>
        </DialogHeader>

        {/* LINE Friend Share Section */}
        <div className="p-4 border rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950">
          <div className="flex items-center gap-3 mb-2">
            <Share2 className="w-5 h-5 text-green-600 dark:text-green-400" />
            <h3 className="font-semibold text-green-900 dark:text-green-100">
              Invite LINE Friends
            </h3>
          </div>
          <p className="text-sm text-green-700 dark:text-green-300 mb-3">
            Select and invite friends directly from the LINE friend picker.
          </p>
          <div className="space-y-2">
            <Button
              onClick={shareToLineFriends}
              disabled={sharingToFriends}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              {sharingToFriends ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Inviting...
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 mr-2" />
                  Invite LINE Friends
                </>
              )}
            </Button>
            <Button
              onClick={copyInviteUrl}
              variant="outline"
              className="w-full border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy Invite Link
            </Button>
          </div>
        </div>

        {/* Room Info */}
        <div className="text-center text-sm text-muted-foreground pt-2">
          <p>Room ID: <span className="font-mono font-medium">{roomId}</span></p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
