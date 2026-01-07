import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SignificanceResult, VariantStats } from '@/lib/statistics';
import { AlertTriangle, CheckCircle, HelpCircle, TrendingDown, TrendingUp, Minus, Trophy, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatisticalSignificanceProps {
  control: VariantStats;
  treatment: VariantStats;
  result: SignificanceResult;
  className?: string;
}

export function StatisticalSignificance({ 
  control, 
  treatment, 
  result,
  className 
}: StatisticalSignificanceProps) {
  const { isSignificant, confidence, pValue, lift, liftDirection, confidenceInterval, winner, sampleSizeRecommendation } = result;

  const getConfidenceColor = () => {
    if (confidence >= 95) return 'text-success';
    if (confidence >= 90) return 'text-warning';
    return 'text-muted-foreground';
  };

  const getConfidenceBg = () => {
    if (confidence >= 95) return 'bg-success/10';
    if (confidence >= 90) return 'bg-warning/10';
    return 'bg-muted';
  };

  return (
    <Card className={cn("border-dashed", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-medium">Statistical Significance</CardTitle>
          </div>
          <TooltipProvider>
            <UITooltip>
              <TooltipTrigger>
                <HelpCircle className="w-4 h-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">
                  Statistical significance indicates whether the difference between variants is likely due to real effects rather than random chance. 
                  A confidence level of 95% or higher is typically required to declare a winner.
                </p>
              </TooltipContent>
            </UITooltip>
          </TooltipProvider>
        </div>
        <CardDescription className="text-xs">
          Comparing {treatment.name} vs {control.name} (control)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Status */}
        <div className={cn("flex items-center gap-3 p-3 rounded-lg", getConfidenceBg())}>
          {isSignificant ? (
            <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className={cn("font-medium text-sm", isSignificant ? "text-success" : "text-warning")}>
              {isSignificant ? 'Statistically Significant' : 'Not Yet Significant'}
            </p>
            <p className="text-xs text-muted-foreground">
              {isSignificant 
                ? `${winner} is the winner with ${confidence.toFixed(1)}% confidence`
                : sampleSizeRecommendation 
                  ? `Need ~${sampleSizeRecommendation.toLocaleString()} more visitors`
                  : 'Continue collecting data for reliable results'
              }
            </p>
          </div>
          {winner && (
            <Trophy className="w-5 h-5 text-warning flex-shrink-0" />
          )}
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Confidence */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Confidence</span>
              <span className={cn("text-sm font-semibold", getConfidenceColor())}>
                {confidence.toFixed(1)}%
              </span>
            </div>
            <Progress 
              value={confidence} 
              className="h-1.5"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0%</span>
              <span className="text-primary">95% threshold</span>
              <span>100%</span>
            </div>
          </div>

          {/* p-value */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">p-value</span>
              <span className={cn(
                "text-sm font-mono font-semibold",
                pValue < 0.05 ? "text-success" : "text-muted-foreground"
              )}>
                {pValue < 0.0001 ? '<0.0001' : pValue.toFixed(4)}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {pValue < 0.05 ? 'Below 0.05 threshold ✓' : 'Above 0.05 threshold'}
            </p>
          </div>
        </div>

        {/* Lift */}
        <div className="flex items-center justify-between p-2.5 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            {liftDirection === 'positive' ? (
              <TrendingUp className="w-4 h-4 text-success" />
            ) : liftDirection === 'negative' ? (
              <TrendingDown className="w-4 h-4 text-destructive" />
            ) : (
              <Minus className="w-4 h-4 text-muted-foreground" />
            )}
            <span className="text-xs text-muted-foreground">Relative Lift</span>
          </div>
          <span className={cn(
            "font-semibold text-sm",
            liftDirection === 'positive' ? 'text-success' : 
            liftDirection === 'negative' ? 'text-destructive' : 
            'text-muted-foreground'
          )}>
            {lift > 0 ? '+' : ''}{lift.toFixed(1)}%
          </span>
        </div>

        {/* Confidence Interval */}
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">95% Confidence Interval</span>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              {confidenceInterval.lower > 0 ? '+' : ''}{confidenceInterval.lower.toFixed(2)}%
            </Badge>
            <span className="text-muted-foreground">to</span>
            <Badge variant="outline" className="font-mono text-xs">
              {confidenceInterval.upper > 0 ? '+' : ''}{confidenceInterval.upper.toFixed(2)}%
            </Badge>
          </div>
          <p className="text-[10px] text-muted-foreground">
            The true difference in conversion rates is likely within this range
          </p>
        </div>

        {/* Conversion Rate Comparison */}
        <div className="border-t pt-3 space-y-2">
          <span className="text-xs text-muted-foreground">Conversion Rates</span>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-2 bg-muted/30 rounded text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5">{control.name}</p>
              <p className="font-semibold text-sm">{control.conversionRate.toFixed(2)}%</p>
              <p className="text-[10px] text-muted-foreground">
                {control.conversions}/{control.visitors}
              </p>
            </div>
            <div className={cn(
              "p-2 rounded text-center",
              isSignificant && winner === treatment.name ? "bg-success/10" : "bg-muted/30"
            )}>
              <p className="text-[10px] text-muted-foreground mb-0.5">{treatment.name}</p>
              <p className="font-semibold text-sm">{treatment.conversionRate.toFixed(2)}%</p>
              <p className="text-[10px] text-muted-foreground">
                {treatment.conversions}/{treatment.visitors}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface MultiVariantSignificanceProps {
  variants: VariantStats[];
  results: Map<string, SignificanceResult>;
  controlName: string;
}

export function MultiVariantSignificanceSummary({ 
  variants, 
  results,
  controlName 
}: MultiVariantSignificanceProps) {
  const significantResults = Array.from(results.entries()).filter(([_, r]) => r.isSignificant);
  const hasWinner = significantResults.length > 0;

  return (
    <div className="space-y-3">
      {/* Summary Badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge 
          variant={hasWinner ? "default" : "secondary"}
          className={cn(
            "gap-1.5",
            hasWinner && "bg-success text-success-foreground hover:bg-success/90"
          )}
        >
          {hasWinner ? (
            <>
              <Trophy className="w-3 h-3" />
              Winner Found
            </>
          ) : (
            <>
              <Target className="w-3 h-3" />
              Testing in Progress
            </>
          )}
        </Badge>
        <span className="text-xs text-muted-foreground">
          Control: {controlName}
        </span>
      </div>

      {/* Variant Results */}
      <div className="space-y-2">
        {Array.from(results.entries()).map(([variantName, result]) => (
          <div 
            key={variantName}
            className={cn(
              "flex items-center justify-between p-2.5 rounded-lg text-sm",
              result.isSignificant ? "bg-success/5 border border-success/20" : "bg-muted/30"
            )}
          >
            <div className="flex items-center gap-2">
              {result.isSignificant && result.winner === variantName && (
                <Trophy className="w-4 h-4 text-warning" />
              )}
              <span className={cn(
                "font-medium",
                result.isSignificant && result.winner === variantName && "text-success"
              )}>
                {variantName}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className={cn(
                result.liftDirection === 'positive' ? 'text-success' : 
                result.liftDirection === 'negative' ? 'text-destructive' : 
                'text-muted-foreground'
              )}>
                {result.lift > 0 ? '+' : ''}{result.lift.toFixed(1)}% lift
              </span>
              <Badge 
                variant="outline" 
                className={cn(
                  "text-[10px] px-1.5",
                  result.confidence >= 95 ? "border-success text-success" : ""
                )}
              >
                {result.confidence.toFixed(0)}% conf.
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
