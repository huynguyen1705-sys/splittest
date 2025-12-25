import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, BarChart3, Globe, Zap, Shield, Users, CheckCircle } from 'lucide-react';

export default function Index() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 gradient-primary rounded-lg flex items-center justify-center">
              <span className="text-lg font-bold text-primary-foreground">S</span>
            </div>
            <span className="text-xl font-semibold">SplitFlow</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/auth">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link to="/auth">
              <Button variant="hero">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-24 px-4">
        <div className="container mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent text-accent-foreground text-sm font-medium mb-8 animate-fade-in">
            <Zap className="w-4 h-4" />
            Redirect Split Testing Made Simple
          </div>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 animate-slide-up">
            Optimize Your Traffic
            <span className="text-gradient block mt-2">With Smart Redirects</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            Create redirect split tests in minutes. Route visitors to different URLs based on location, device, browser, and more. Real-time analytics included.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <Link to="/auth">
              <Button variant="hero" size="xl">
                Start Free Trial
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Button variant="outline" size="xl">
              View Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-4 bg-muted/30">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything You Need</h2>
            <p className="text-lg text-muted-foreground">Powerful split testing without the complexity</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { icon: Globe, title: 'Geo Targeting', desc: 'Route visitors based on country, region, or city location.' },
              { icon: BarChart3, title: 'Real-Time Analytics', desc: 'Live event feed and instant metrics as visitors arrive.' },
              { icon: Zap, title: 'Instant Redirects', desc: 'Lightweight snippet with sub-100ms redirect times.' },
              { icon: Shield, title: 'Privacy First', desc: 'Respects DNT, no cookies required, GDPR compliant.' },
              { icon: Users, title: 'Sticky Bucketing', desc: 'Consistent experience for returning visitors.' },
              { icon: CheckCircle, title: 'Multi-Variant', desc: 'Test up to 10 different destination URLs per campaign.' },
            ].map((feature, i) => (
              <div key={i} className="p-6 rounded-2xl bg-card border border-border/50 shadow-soft hover:shadow-medium transition-all duration-300 hover:-translate-y-1">
                <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-accent-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <div className="p-12 rounded-3xl gradient-hero border border-primary/10">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Optimize?</h2>
            <p className="text-lg text-muted-foreground mb-8">Start testing in minutes. No credit card required.</p>
            <Link to="/auth">
              <Button variant="hero" size="xl">
                Get Started Free
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-4">
        <div className="container mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 gradient-primary rounded flex items-center justify-center">
              <span className="text-xs font-bold text-primary-foreground">S</span>
            </div>
            <span className="font-medium">SplitFlow</span>
          </div>
          <p className="text-sm text-muted-foreground">© 2024 SplitFlow. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
