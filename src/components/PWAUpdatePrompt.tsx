import { useEffect, useState } from 'react';
import { usePWAUpdate } from '@/hooks/usePWAUpdate';
import { Button } from '@/components/ui/button';
import { RefreshCw, X, Wifi, Download } from 'lucide-react';
import { toast } from 'sonner';

export function PWAUpdatePrompt() {
  const { needRefresh, offlineReady, updateServiceWorker, close } = usePWAUpdate();
  const [isUpdating, setIsUpdating] = useState(false);

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

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      await updateServiceWorker();
    } catch (error) {
      console.error('Update failed:', error);
      toast.error('Cập nhật thất bại. Vui lòng thử lại.');
    } finally {
      setIsUpdating(false);
    }
  };

  if (!needRefresh) return null;

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
              Phiên bản mới đã sẵn sàng. Cập nhật ngay để có trải nghiệm tốt nhất.
            </p>
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
