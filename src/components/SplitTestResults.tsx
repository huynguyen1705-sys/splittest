import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, CheckCircle, HelpCircle, Users, ArrowRight, Target, BarChart3, Shuffle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VariantData {
  id: string;
  name: string;
  isControl: boolean;
  assigns: number;
  redirectsOk: number;
  redirectsFail: number;
  uniqueVisitors: number;
  weight?: number;
}

interface SplitTestResultsProps {
  variants: VariantData[];
  totalAssigns: number;
  className?: string;
}

export function SplitTestResults({ variants, totalAssigns, className }: SplitTestResultsProps) {
  // Calculate metrics
  const totalRedirects = variants.reduce((sum, v) => sum + v.redirectsOk + v.redirectsFail, 0);
  const totalRedirectsOk = variants.reduce((sum, v) => sum + v.redirectsOk, 0);
  const totalRedirectsFail = variants.reduce((sum, v) => sum + v.redirectsFail, 0);
  
  // Check traffic distribution health
  const expectedShare = 100 / variants.length;
  const trafficDistribution = variants.map(v => ({
    ...v,
    share: totalAssigns > 0 ? (v.assigns / totalAssigns) * 100 : 0,
    deviation: totalAssigns > 0 ? Math.abs((v.assigns / totalAssigns) * 100 - expectedShare) : 0,
  }));
  
  const isTrafficBalanced = trafficDistribution.every(v => v.deviation < 5); // Within 5% of expected
  
  // Calculate redirect health for non-control variants
  const redirectVariants = variants.filter(v => !v.isControl);
  const redirectHealth = redirectVariants.map(v => {
    const totalAttempts = v.redirectsOk + v.redirectsFail;
    const successRate = totalAttempts > 0 ? (v.redirectsOk / totalAttempts) * 100 : 100;
    return { ...v, successRate, totalAttempts };
  });
  
  const overallRedirectHealth = totalRedirects > 0 
    ? (totalRedirectsOk / totalRedirects) * 100 
    : 100;

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shuffle className="w-4 h-4 text-primary" />
            <CardTitle className="text-base sm:text-lg">Split Test Health</CardTitle>
          </div>
          <TooltipProvider>
            <UITooltip>
              <TooltipTrigger>
                <HelpCircle className="w-4 h-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">
                  Split tests redirect visitors to different URLs. This panel shows traffic distribution 
                  and redirect success rates. To determine a "winner", you need to track conversions/goals 
                  on the destination pages separately.
                </p>
              </TooltipContent>
            </UITooltip>
          </TooltipProvider>
        </div>
        <CardDescription className="text-xs">
          Traffic distribution & redirect health metrics
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Health Status */}
        <div className={cn(
          "flex items-center gap-3 p-3 rounded-lg",
          isTrafficBalanced && overallRedirectHealth >= 95 
            ? "bg-success/10" 
            : overallRedirectHealth >= 80 
              ? "bg-warning/10" 
              : "bg-destructive/10"
        )}>
          {isTrafficBalanced && overallRedirectHealth >= 95 ? (
            <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className={cn(
              "font-medium text-sm",
              isTrafficBalanced && overallRedirectHealth >= 95 ? "text-success" : "text-warning"
            )}>
              {isTrafficBalanced && overallRedirectHealth >= 95 
                ? 'Test Running Smoothly' 
                : 'Review Recommended'}
            </p>
            <p className="text-xs text-muted-foreground">
              {!isTrafficBalanced 
                ? 'Traffic distribution is uneven between variants'
                : overallRedirectHealth < 95 
                  ? 'Some redirects are failing'
                  : 'Traffic is evenly distributed & redirects are working'}
            </p>
          </div>
        </div>

        {/* Traffic Distribution */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Traffic Distribution</span>
            <Badge variant={isTrafficBalanced ? "secondary" : "outline"} className="text-[10px] ml-auto">
              {isTrafficBalanced ? 'Balanced' : 'Uneven'}
            </Badge>
          </div>
          
          <div className="space-y-2">
            {trafficDistribution.map((variant, i) => (
              <div key={variant.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{variant.name}</span>
                    {variant.isControl && (
                      <Badge variant="outline" className="text-[10px] px-1">Control</Badge>
                    )}
                  </div>
                  <span className="text-muted-foreground">
                    {variant.assigns.toLocaleString()} ({variant.share.toFixed(1)}%)
                  </span>
                </div>
                <Progress 
                  value={variant.share} 
                  className="h-2"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Redirect Health (only for variants that redirect) */}
        {redirectVariants.length > 0 && (
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Redirect Health</span>
              <Badge 
                variant={overallRedirectHealth >= 95 ? "secondary" : "destructive"} 
                className="text-[10px] ml-auto"
              >
                {overallRedirectHealth.toFixed(1)}% Success
              </Badge>
            </div>
            
            <div className="space-y-2">
              {redirectHealth.map((variant) => (
                <div key={variant.id} className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded">
                  <span className="font-medium">{variant.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-success">{variant.redirectsOk} OK</span>
                    {variant.redirectsFail > 0 && (
                      <span className="text-destructive">{variant.redirectsFail} Failed</span>
                    )}
                    <Badge 
                      variant={variant.successRate >= 95 ? "secondary" : "destructive"}
                      className="text-[10px]"
                    >
                      {variant.successRate.toFixed(0)}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Note about conversion tracking */}
        <div className="p-3 bg-muted/50 rounded-lg border border-dashed">
          <div className="flex items-start gap-2">
            <Target className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-xs font-medium">Determining a Winner</p>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                In redirect split tests, the "winner" is determined by comparing conversion rates 
                (purchases, signups, etc.) on each destination page. Track these goals using your 
                analytics platform (Google Analytics, etc.) on the destination URLs.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface SplitTestSummaryBadgeProps {
  variants: VariantData[];
  totalAssigns: number;
}

export function SplitTestSummaryBadge({ variants, totalAssigns }: SplitTestSummaryBadgeProps) {
  const totalRedirects = variants.reduce((sum, v) => sum + v.redirectsOk + v.redirectsFail, 0);
  const totalRedirectsOk = variants.reduce((sum, v) => sum + v.redirectsOk, 0);
  
  const redirectHealth = totalRedirects > 0 
    ? (totalRedirectsOk / totalRedirects) * 100 
    : 100;
  
  const expectedShare = 100 / variants.length;
  const isBalanced = variants.every(v => {
    const share = totalAssigns > 0 ? (v.assigns / totalAssigns) * 100 : 0;
    return Math.abs(share - expectedShare) < 5;
  });

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge 
        variant="secondary"
        className="gap-1.5"
      >
        <BarChart3 className="w-3 h-3" />
        Split Test Active
      </Badge>
      <span className="text-xs text-muted-foreground">
        {variants.length} variants • {isBalanced ? 'Traffic balanced' : 'Traffic uneven'} 
        {redirectHealth < 100 && ` • ${redirectHealth.toFixed(0)}% redirect success`}
      </span>
    </div>
  );
}