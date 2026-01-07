import { useEffect, useState } from 'react';
import { usePWAUpdate, APP_VERSION } from '@/hooks/usePWAUpdate';
import { Button } from '@/components/ui/button';
import { RefreshCw, X, Wifi, Download, AlertTriangle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export function PWAUpdatePrompt() {
  const { 
    needRefresh, 
    offlineReady, 
    updateServiceWorker, 
    close, 
    isForceUpdate,
    versionInfo,
  } = usePWAUpdate();
  const [isUpdating, setIsUpdating] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Show toast for offline ready
  useEffect(() => {
    if (offlineReady) {
      toast.success('Ứng dụng đã sẵn sàng hoạt động offline!', {
        icon: <Wifi className="w-4 h-4" />,
        duration: 4000,
      });
      close();
    }
  }, [offlineReady, close]);

  // Auto-update countdown for force updates
  useEffect(() => {
    if (isForceUpdate && needRefresh && countdown === null) {
      setCountdown(10);
    }
  }, [isForceUpdate, needRefresh, countdown]);

  // Countdown timer for force update
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;

    const timer = setTimeout(() => {
      setCountdown(countdown - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown]);

  // Auto-reload when countdown reaches 0
  useEffect(() => {
    if (countdown === 0 && isForceUpdate) {
      handleUpdate();
    }
  }, [countdown, isForceUpdate]);

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      await updateServiceWorker();
    } catch (error) {
      console.error('Update failed:', error);
      toast.error('Cập nhật thất bại. Đang thử lại...');
      // Retry after 2 seconds for force updates
      if (isForceUpdate) {
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  if (!needRefresh) return null;

  // Force Update Modal - Cannot be dismissed
  if (isForceUpdate) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <div className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 animate-in zoom-in-95 duration-300">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            
            <h2 className="text-xl font-bold text-foreground mb-2">
              Cập nhật bắt buộc
            </h2>
            
            <p className="text-muted-foreground mb-4">
              Phiên bản mới quan trọng đã được phát hành. Ứng dụng sẽ tự động cập nhật để đảm bảo bảo mật và tính ổn định.
            </p>

            {versionInfo && (
              <div className="w-full bg-muted/50 rounded-lg p-3 mb-4 text-left">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">
                    Phiên bản {versionInfo.version}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {versionInfo.releaseNotes}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Phiên bản hiện tại: {APP_VERSION}
                </p>
              </div>
            )}

            {countdown !== null && countdown > 0 && (
              <div className="mb-4">
                <div className="text-4xl font-bold text-primary mb-1">
                  {countdown}
                </div>
                <p className="text-sm text-muted-foreground">
                  Tự động cập nhật sau {countdown} giây
                </p>
              </div>
            )}

            <Button 
              onClick={handleUpdate}
              disabled={isUpdating}
              className="w-full"
              size="lg"
            >
              {isUpdating ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                  Đang cập nhật...
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5 mr-2" />
                  Cập nhật ngay
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Normal Update Prompt - Can be dismissed
  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-card border border-border rounded-lg shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Download className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground">Có bản cập nhật mới!</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Phiên bản mới đã sẵn sàng. Cập nhật để có trải nghiệm tốt nhất.
            </p>
            {versionInfo && (
              <p className="text-xs text-muted-foreground mt-1">
                v{APP_VERSION} → v{versionInfo.version}
              </p>
            )}
            <div className="flex items-center gap-2 mt-3">
              <Button 
                size="sm" 
                onClick={handleUpdate}
                disabled={isUpdating}
                className="flex items-center gap-2"
              >
                {isUpdating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Đang cập nhật...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Cập nhật ngay
                  </>
                )}
              </Button>
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={close}
                disabled={isUpdating}
              >
                Để sau
              </Button>
            </div>
          </div>
          <button 
            onClick={close}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            disabled={isUpdating}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
