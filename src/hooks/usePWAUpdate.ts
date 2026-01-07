import { useState, useEffect, useCallback } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// Current app version - update this when releasing new versions
export const APP_VERSION = '1.0.0';

export interface VersionInfo {
  version: string;
  forceUpdate: boolean;
  minVersion: string;
  releaseNotes: string;
  releaseDate: string;
}

export interface PWAUpdateInfo {
  needRefresh: boolean;
  offlineReady: boolean;
  updateServiceWorker: () => Promise<void>;
  close: () => void;
  isForceUpdate: boolean;
  versionInfo: VersionInfo | null;
  isCheckingVersion: boolean;
}

// Compare semantic versions: returns -1 if a < b, 0 if equal, 1 if a > b
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }
  return 0;
}

export function usePWAUpdate(): PWAUpdateInfo {
  const [isForceUpdate, setIsForceUpdate] = useState(false);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [isCheckingVersion, setIsCheckingVersion] = useState(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      console.log('Service Worker registered:', swUrl);
      
      // Check for updates every 60 seconds
      if (registration) {
        setInterval(() => {
          registration.update();
        }, 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error('Service Worker registration error:', error);
    },
  });

  // Check for force update from version.json
  const checkForForceUpdate = useCallback(async () => {
    setIsCheckingVersion(true);
    try {
      const response = await fetch('/version.json?t=' + Date.now(), {
        cache: 'no-store',
      });
      
      if (response.ok) {
        const data: VersionInfo = await response.json();
        setVersionInfo(data);
        
        // Check if force update is required
        const isCurrentVersionOutdated = compareVersions(APP_VERSION, data.minVersion) < 0;
        const shouldForceUpdate = data.forceUpdate || isCurrentVersionOutdated;
        
        if (shouldForceUpdate) {
          console.log('Force update required:', {
            currentVersion: APP_VERSION,
            minVersion: data.minVersion,
            forceUpdate: data.forceUpdate,
          });
          setIsForceUpdate(true);
          setNeedRefresh(true);
        }
      }
    } catch (error) {
      console.warn('Failed to check version:', error);
    } finally {
      setIsCheckingVersion(false);
    }
  }, [setNeedRefresh]);

  // Check for force update on mount and periodically
  useEffect(() => {
    checkForForceUpdate();
    
    // Check every 5 minutes for force updates
    const interval = setInterval(checkForForceUpdate, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [checkForForceUpdate]);

  const close = useCallback(() => {
    // Cannot close if force update is required
    if (isForceUpdate) return;
    
    setOfflineReady(false);
    setNeedRefresh(false);
  }, [setOfflineReady, setNeedRefresh, isForceUpdate]);

  const handleUpdate = useCallback(async () => {
    await updateServiceWorker(true);
  }, [updateServiceWorker]);

  return {
    needRefresh,
    offlineReady,
    updateServiceWorker: handleUpdate,
    close,
    isForceUpdate,
    versionInfo,
    isCheckingVersion,
  };
}
