import { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Download, 
  Share, 
  MoreVertical, 
  Plus, 
  CheckCircle2, 
  ArrowLeft,
  Smartphone,
  Monitor,
  Apple,
  Chrome
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePWAInstall, Platform } from '@/hooks/usePWAInstall';

interface InstallStep {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const installInstructions: Record<Platform, { browser: string; steps: InstallStep[] }[]> = {
  ios: [
    {
      browser: 'Safari',
      steps: [
        {
          icon: <Share className="w-5 h-5" />,
          title: 'Tap the Share button',
          description: 'Located at the bottom of the screen (square with arrow pointing up)',
        },
        {
          icon: <Plus className="w-5 h-5" />,
          title: 'Scroll and tap "Add to Home Screen"',
          description: 'You may need to scroll down in the share menu',
        },
        {
          icon: <CheckCircle2 className="w-5 h-5" />,
          title: 'Tap "Add"',
          description: 'The app will appear on your home screen',
        },
      ],
    },
  ],
  android: [
    {
      browser: 'Chrome',
      steps: [
        {
          icon: <MoreVertical className="w-5 h-5" />,
          title: 'Tap the menu button',
          description: 'Three dots in the top-right corner',
        },
        {
          icon: <Download className="w-5 h-5" />,
          title: 'Tap "Install app" or "Add to Home Screen"',
          description: 'May also show as "Install Split URL Testing"',
        },
        {
          icon: <CheckCircle2 className="w-5 h-5" />,
          title: 'Tap "Install"',
          description: 'The app will be added to your home screen and app drawer',
        },
      ],
    },
  ],
  windows: [
    {
      browser: 'Edge / Chrome',
      steps: [
        {
          icon: <Download className="w-5 h-5" />,
          title: 'Click the install icon',
          description: 'Located in the address bar (computer with down arrow)',
        },
        {
          icon: <CheckCircle2 className="w-5 h-5" />,
          title: 'Click "Install"',
          description: 'The app will open in its own window',
        },
      ],
    },
  ],
  macos: [
    {
      browser: 'Safari',
      steps: [
        {
          icon: <Share className="w-5 h-5" />,
          title: 'Click File menu',
          description: 'In the menu bar at the top',
        },
        {
          icon: <Plus className="w-5 h-5" />,
          title: 'Select "Add to Dock"',
          description: 'The app will be added to your Dock',
        },
      ],
    },
    {
      browser: 'Chrome',
      steps: [
        {
          icon: <MoreVertical className="w-5 h-5" />,
          title: 'Click the three dots menu',
          description: 'Top-right corner of the browser',
        },
        {
          icon: <Download className="w-5 h-5" />,
          title: 'Click "Install Split URL Testing..."',
          description: 'Under "Save and Share" or directly visible',
        },
        {
          icon: <CheckCircle2 className="w-5 h-5" />,
          title: 'Click "Install"',
          description: 'The app will open in its own window',
        },
      ],
    },
  ],
  unknown: [],
};

const platformIcons: Record<Platform, React.ReactNode> = {
  ios: <Apple className="w-5 h-5" />,
  android: <Smartphone className="w-5 h-5" />,
  windows: <Monitor className="w-5 h-5" />,
  macos: <Apple className="w-5 h-5" />,
  unknown: <Smartphone className="w-5 h-5" />,
};

const platformNames: Record<Platform, string> = {
  ios: 'iOS (iPhone/iPad)',
  android: 'Android',
  windows: 'Windows',
  macos: 'macOS',
  unknown: 'Your Device',
};

export default function Install() {
  const { isInstallable, isInstalled, platform, promptInstall } = usePWAInstall();
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>(platform);

  const allPlatforms: Platform[] = ['ios', 'android', 'windows', 'macos'];

  const handleInstall = async () => {
    await promptInstall();
  };

  if (isInstalled) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-6">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-success" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              App Installed!
            </h1>
            <p className="text-muted-foreground mb-6">
              SplitTest is already installed on your device. You can find it on your home screen or in your apps.
            </p>
            <Button asChild>
              <Link to="/dashboard">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Go to Dashboard
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Install App</h1>
            <p className="text-sm text-muted-foreground">Add SplitTest to your device</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Hero */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 shadow-glow">
            <img 
              src="/pwa-192x192.png" 
              alt="SplitTest" 
              className="w-16 h-16 rounded-xl"
            />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Install SplitTest
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Get quick access to your A/B tests from your home screen. Works offline and loads instantly.
          </p>

          {/* Native install button */}
          {isInstallable && (
            <Button 
              size="lg" 
              onClick={handleInstall}
              className="mt-6 gap-2"
            >
              <Download className="w-5 h-5" />
              Install Now
            </Button>
          )}
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <Smartphone className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-medium text-foreground text-sm">Home Screen</h3>
              <p className="text-xs text-muted-foreground mt-1">Launch like a native app</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="w-5 h-5 text-success" />
              </div>
              <h3 className="font-medium text-foreground text-sm">Works Offline</h3>
              <p className="text-xs text-muted-foreground mt-1">View cached data anytime</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center mx-auto mb-2">
                <Download className="w-5 h-5 text-info" />
              </div>
              <h3 className="font-medium text-foreground text-sm">Auto Updates</h3>
              <p className="text-xs text-muted-foreground mt-1">Always get the latest version</p>
            </CardContent>
          </Card>
        </div>

        {/* Platform selector */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-foreground mb-3">
            Installation Instructions
          </h3>
          <div className="flex flex-wrap gap-2">
            {allPlatforms.map((p) => (
              <Button
                key={p}
                variant={selectedPlatform === p ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedPlatform(p)}
                className="gap-2"
              >
                {platformIcons[p]}
                {platformNames[p]}
                {p === platform && (
                  <Badge variant="secondary" className="ml-1 text-[10px]">
                    Your device
                  </Badge>
                )}
              </Button>
            ))}
          </div>
        </div>

        {/* Instructions */}
        <div className="space-y-6">
          {installInstructions[selectedPlatform]?.map((browserInstructions, idx) => (
            <Card key={idx}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-4">
                  <Chrome className="w-5 h-5 text-muted-foreground" />
                  <h4 className="font-medium text-foreground">
                    {browserInstructions.browser}
                  </h4>
                </div>
                <ol className="space-y-4">
                  {browserInstructions.steps.map((step, stepIdx) => (
                    <li key={stepIdx} className="flex gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        {step.icon}
                      </div>
                      <div className="flex-1 pt-0.5">
                        <p className="font-medium text-foreground text-sm">
                          {stepIdx + 1}. {step.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {step.description}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Note */}
        <p className="text-sm text-muted-foreground text-center mt-8">
          Can't see the install option? Make sure you're using a supported browser and that you haven't already installed the app.
        </p>
      </main>
    </div>
  );
}
