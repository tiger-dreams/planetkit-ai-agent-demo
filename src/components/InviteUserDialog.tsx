import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Loader2, Send, UserPlus, Clock, CheckSquare, Share2, Copy, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useLiff } from '@/contexts/LiffContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useVideoSDK } from '@/contexts/VideoSDKContext';

interface CallHistoryUser {
  user_id: string;
  display_name: string;
  last_call_time: string;
  call_count: number;
}

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
  currentUserId,
  currentUserName,
  roomId,
  liffId,
}: InviteUserDialogProps) => {
  const { toast } = useToast();
  const { liff } = useLiff();
  const { language } = useLanguage();
  const { featureAvailability } = useVideoSDK();
  const [users, setUsers] = useState<CallHistoryUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [sharingToFriends, setSharingToFriends] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  // Fetch call history when dialog opens
  useEffect(() => {
    if (open && currentUserId) {
      fetchCallHistory();
    }
  }, [open, currentUserId]);

  const fetchCallHistory = async () => {
    // Skip if call history is not available (custom credentials mode)
    if (!featureAvailability.canUseCallHistory) {
      setUsers([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/line?action=get-followers&requesterId=${encodeURIComponent(currentUserId)}&days=30`);
      const result = await response.json();

      if (result.success) {
        const filteredUsers = result.data.filter((user: CallHistoryUser) => user.user_id !== currentUserId);
        setUsers(filteredUsers);
      } else {
        toast({
          title: 'Failed to Load Users',
          description: result.error || 'An unknown error occurred.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
      toast({
        title: 'Failed to Load Users',
        description: 'A network error occurred.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

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

      // 언어에 따른 초대 메시지
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

      // 언어에 따른 초대 메시지
      const inviteMessage = language === 'ko'
        ? `🎥 ${currentUserName}님이 화상 통화에 초대했습니다!\n\n룸: ${roomId}\n\n링크를 눌러 참여하세요:\n${liffUrl}`
        : `🎥 ${currentUserName} invited you to a video call!\n\nRoom: ${roomId}\n\nTap the link to join:\n${liffUrl}`;

      await navigator.clipboard.writeText(inviteMessage);

      console.log('[copyInviteUrl] Invite message copied to clipboard:', inviteMessage);

      toast({
        title: language === 'ko' ? '초대 메시지 복사됨' : 'Invite Message Copied',
        description: language === 'ko'
          ? 'URL이 포함된 초대 메시지가 클립보드에 복사되었습니다.'
          : 'Invitation message with URL has been copied to clipboard.',
      });
    } catch (error) {
      console.error('[copyInviteUrl] Failed to copy invite message:', error);
      toast({
        title: language === 'ko' ? '복사 실패' : 'Copy Failed',
        description: language === 'ko'
          ? '초대 메시지를 클립보드에 복사하는데 실패했습니다.'
          : 'Failed to copy invitation message to clipboard.',
        variant: 'destructive',
      });
    }
  };

  const sendInvite = async (toUserId: string, toUserName: string) => {
    setSending(toUserId);
    try {
      const response = await fetch('/api/line?action=send-invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          toUserId,
          fromUserName: currentUserName,
          roomId,
          liffId,
          language, // 언어 정보 전달
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Invitation Sent',
          description: `Invitation message sent to ${toUserName}.`,
        });
      } else {
        toast({
          title: 'Invitation Failed',
          description: result.error || 'An unknown error occurred.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to send invite:', error);
      toast({
        title: 'Invitation Failed',
        description: 'A network error occurred.',
        variant: 'destructive',
      });
    } finally {
      setSending(null);
    }
  };

  const sendBulkInvites = async () => {
    if (selectedUserIds.size === 0) {
      toast({
        title: 'Please Select Users',
        description: 'Please select users to invite.',
        variant: 'destructive',
      });
      return;
    }

    setSending('bulk');
    const selectedUsers = users.filter(u => selectedUserIds.has(u.user_id));

    let successCount = 0;
    let failCount = 0;

    for (const user of selectedUsers) {
      try {
        await sendInvite(user.user_id, user.display_name);
        successCount++;
      } catch (error) {
        console.error('Failed to send invite to', user.display_name, error);
        failCount++;
      }
    }

    setSending(null);
    setSelectedUserIds(new Set());

    toast({
      title: 'Bulk Invitation Sent',
      description: `Invitations sent to ${successCount} ${successCount === 1 ? 'user' : 'users'}.${failCount > 0 ? ` (Failed: ${failCount})` : ''}`,
    });

    if (successCount > 0) {
      onOpenChange(false);
    }
  };

  const toggleUserSelection = (userId: string) => {
    const newSelection = new Set(selectedUserIds);
    if (newSelection.has(userId)) {
      newSelection.delete(userId);
    } else {
      newSelection.add(userId);
    }
    setSelectedUserIds(newSelection);
  };

  const toggleSelectAll = (users: Array<CallHistoryUser | AppUser>) => {
    const userIds = users.map(u => u.user_id);
    const allSelected = userIds.every(id => selectedUserIds.has(id));

    if (allSelected) {
      // Deselect all
      const newSelection = new Set(selectedUserIds);
      userIds.forEach(id => newSelection.delete(id));
      setSelectedUserIds(newSelection);
    } else {
      // Select all
      const newSelection = new Set(selectedUserIds);
      userIds.forEach(id => newSelection.add(id));
      setSelectedUserIds(newSelection);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const past = new Date(dateString);
    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `${diffMins} min ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hr ago`;
    } else {
      return `${diffDays} d ago`;
    }
  };

  const renderUserList = (
    users: Array<CallHistoryUser>,
    title: string,
    emptyMessage: string,
    showTimeInfo: boolean = false
  ) => {
    if (users.length === 0) {
      return (
        <div className="text-center py-4 text-muted-foreground text-sm">
          {emptyMessage}
        </div>
      );
    }

    const allSelected = users.every(u => selectedUserIds.has(u.user_id));

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium flex items-center gap-2">
            {title}
            <span className="text-xs text-muted-foreground">({users.length} {users.length === 1 ? 'user' : 'users'})</span>
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleSelectAll(users)}
            className="h-7 text-xs"
          >
            <CheckSquare className="w-3 h-3 mr-1" />
            {allSelected ? 'Deselect All' : 'Select All'}
          </Button>
        </div>
        {users.map((user) => {
          const isCallHistoryUser = 'last_call_time' in user;
          return (
            <div
              key={user.user_id}
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-accent transition-colors"
            >
              <Checkbox
                checked={selectedUserIds.has(user.user_id)}
                onCheckedChange={() => toggleUserSelection(user.user_id)}
              />
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Avatar className="w-10 h-10">
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {user.display_name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{user.display_name}</p>
                  {showTimeInfo && isCallHistoryUser && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>{formatTimeAgo(user.last_call_time)}</span>
                      <span>·</span>
                      <span>{user.call_count} {user.call_count === 1 ? 'call' : 'calls'}</span>
                    </div>
                  )}
                </div>
              </div>
              {featureAvailability.canSendDirectInvites && (
                <Button
                  size="sm"
                  onClick={() => sendInvite(user.user_id, user.display_name)}
                  disabled={sending === user.user_id || sending === 'bulk'}
                >
                  {sending === user.user_id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-1" />
                      Invite
                    </>
                  )}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const hasAnyUsers = users.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Invite to Call
          </DialogTitle>
          <DialogDescription>
            Select users to send invitation messages.
          </DialogDescription>
        </DialogHeader>

        {/* LINE Friend Share Button - Always visible */}
        <div className="p-4 border rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950">
          <div className="flex items-center gap-3 mb-2">
            <Share2 className="w-5 h-5 text-green-600 dark:text-green-400" />
            <h3 className="font-semibold text-green-900 dark:text-green-100">
              Invite LINE Friends
            </h3>
          </div>
          <p className="text-sm text-green-700 dark:text-green-300 mb-3">
            You can select and invite friends directly from the LINE friend picker screen.
            <span className="block mt-1 text-xs opacity-80">
              ⚠️ This feature requires Share Target Picker to be enabled in LINE Developers Console.
            </span>
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
              Copy Invite Message
            </Button>
          </div>
        </div>

        {/* Feature Restriction Alert */}
        {!featureAvailability.hasBackendSupport && (
          <Alert>
            <Info className="w-4 h-4" />
            <AlertTitle>
              {language === 'ko' ? '제한된 기능' : 'Limited Features'}
            </AlertTitle>
            <AlertDescription className="text-xs">
              {language === 'ko'
                ? '커스텀 인증 정보를 사용 중이므로 통화 이력 및 직접 초대 기능을 사용할 수 없습니다.'
                : 'Call history and direct invites are unavailable when using custom credentials.'}
            </AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !hasAnyUsers ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No recommendations based on call history.</p>
          </div>
        ) : (
          <>
            <Separator className="my-2" />
            <div className="mb-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                Or invite specific users directly
              </h3>
            </div>
            <ScrollArea className="max-h-[350px] pr-4">
              <div className="space-y-4">
                {/* Call History Section */}
                {featureAvailability.canUseCallHistory && renderUserList(
                  users,
                  'Recent Call History',
                  'No users with call history.',
                  true
                )}

              </div>
            </ScrollArea>

            {/* Bulk Invite Button */}
            {selectedUserIds.size > 0 && (
              <div className="pt-4 border-t">
                <Button
                  onClick={sendBulkInvites}
                  disabled={sending === 'bulk'}
                  className="w-full"
                >
                  {sending === 'bulk' ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Send Bulk Invitation to {selectedUserIds.size} {selectedUserIds.size === 1 ? 'User' : 'Users'}
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
