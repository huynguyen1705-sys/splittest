/**
 * Statistical Significance Calculator for A/B Testing
 * Uses Two-Proportion Z-Test
 */

export interface VariantStats {
  name: string;
  visitors: number;
  conversions: number; // redirect_ok events
  conversionRate: number;
}

export interface SignificanceResult {
  isSignificant: boolean;
  confidence: number; // percentage (e.g., 95)
  pValue: number;
  zScore: number;
  lift: number; // percentage improvement
  liftDirection: 'positive' | 'negative' | 'neutral';
  confidenceInterval: {
    lower: number;
    upper: number;
  };
  winner: string | null;
  sampleSizeRecommendation: number | null; // null if already significant
}

/**
 * Standard normal cumulative distribution function
 */
function normalCDF(z: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  z = Math.abs(z) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * z);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Calculate p-value from z-score (two-tailed test)
 */
function zToPValue(z: number): number {
  return 2 * (1 - normalCDF(Math.abs(z)));
}

/**
 * Calculate z-score for two proportions
 */
function calculateZScore(
  n1: number, // sample size 1
  p1: number, // proportion 1 (conversion rate)
  n2: number, // sample size 2
  p2: number  // proportion 2
): number {
  if (n1 === 0 || n2 === 0) return 0;

  // Pooled proportion
  const pPooled = (p1 * n1 + p2 * n2) / (n1 + n2);
  
  // Standard error
  const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / n1 + 1 / n2));
  
  if (se === 0) return 0;
  
  return (p1 - p2) / se;
}

/**
 * Calculate confidence interval for the difference in proportions
 */
function calculateConfidenceInterval(
  n1: number,
  p1: number,
  n2: number,
  p2: number,
  confidenceLevel: number = 0.95
): { lower: number; upper: number } {
  if (n1 === 0 || n2 === 0) return { lower: 0, upper: 0 };

  const diff = p1 - p2;
  
  // Z critical value for confidence level
  const zCritical = confidenceLevel === 0.99 ? 2.576 : 
                    confidenceLevel === 0.95 ? 1.96 : 
                    confidenceLevel === 0.90 ? 1.645 : 1.96;
  
  // Standard error for difference
  const se = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);
  
  return {
    lower: (diff - zCritical * se) * 100,
    upper: (diff + zCritical * se) * 100,
  };
}

/**
 * Calculate required sample size for desired power
 */
function calculateRequiredSampleSize(
  baselineRate: number,
  minimumDetectableEffect: number = 0.1, // 10% relative improvement
  power: number = 0.8,
  alpha: number = 0.05
): number {
  const p1 = baselineRate;
  const p2 = baselineRate * (1 + minimumDetectableEffect);
  
  // Z values
  const zAlpha = 1.96; // for alpha = 0.05
  const zBeta = 0.84;  // for power = 0.8
  
  const pAvg = (p1 + p2) / 2;
  
  const n = Math.pow(zAlpha * Math.sqrt(2 * pAvg * (1 - pAvg)) + 
                     zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2) / 
            Math.pow(p1 - p2, 2);
  
  return Math.ceil(n);
}

/**
 * Main function to calculate statistical significance between control and treatment
 */
export function calculateSignificance(
  control: VariantStats,
  treatment: VariantStats,
  confidenceLevel: number = 0.95
): SignificanceResult {
  const n1 = control.visitors;
  const n2 = treatment.visitors;
  const p1 = control.conversionRate / 100; // Convert from percentage
  const p2 = treatment.conversionRate / 100;

  // Calculate z-score and p-value
  const zScore = calculateZScore(n1, p1, n2, p2);
  const pValue = zToPValue(zScore);

  // Determine significance
  const alpha = 1 - confidenceLevel;
  const isSignificant = pValue < alpha;
  const confidence = (1 - pValue) * 100;

  // Calculate lift (relative improvement)
  const lift = p1 > 0 ? ((p2 - p1) / p1) * 100 : 0;
  const liftDirection = lift > 0 ? 'positive' : lift < 0 ? 'negative' : 'neutral';

  // Calculate confidence interval
  const ci = calculateConfidenceInterval(n1, p1, n2, p2, confidenceLevel);

  // Determine winner
  let winner: string | null = null;
  if (isSignificant) {
    winner = p2 > p1 ? treatment.name : control.name;
  }

  // Sample size recommendation (only if not significant)
  let sampleSizeRecommendation: number | null = null;
  if (!isSignificant && p1 > 0) {
    const requiredPerVariant = calculateRequiredSampleSize(p1, 0.1);
    const currentTotal = n1 + n2;
    if (requiredPerVariant * 2 > currentTotal) {
      sampleSizeRecommendation = requiredPerVariant * 2 - currentTotal;
    }
  }

  return {
    isSignificant,
    confidence: Math.min(99.99, Math.max(0, confidence)),
    pValue: Math.max(0.0001, pValue),
    zScore,
    lift,
    liftDirection,
    confidenceInterval: ci,
    winner,
    sampleSizeRecommendation,
  };
}

/**
 * Calculate significance for multiple variants against control
 */
export function calculateMultiVariantSignificance(
  variants: VariantStats[],
  controlIndex: number = 0
): Map<string, SignificanceResult> {
  const results = new Map<string, SignificanceResult>();
  const control = variants[controlIndex];

  if (!control) return results;

  for (let i = 0; i < variants.length; i++) {
    if (i === controlIndex) continue;
    
    const treatment = variants[i];
    const result = calculateSignificance(control, treatment);
    results.set(treatment.name, result);
  }

  return results;
}

/**
 * Helper to convert analytics data to variant stats
 */
export function analyticsToVariantStats(
  variantId: string,
  variantName: string,
  data: { assigns: number; redirectsOk: number; redirectsFail: number; uniqueVisitors: number }
): VariantStats {
  const visitors = data.uniqueVisitors || data.assigns;
  const conversions = data.redirectsOk;
  const conversionRate = visitors > 0 ? (conversions / visitors) * 100 : 0;

  return {
    name: variantName,
    visitors,
    conversions,
    conversionRate,
  };
}
