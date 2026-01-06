import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCampaign, useUpdateCampaign, useUpdateVariants, useUpdateRules } from '@/hooks/useCampaigns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Plus, Trash2, Globe, Monitor, Chrome, Smartphone, Languages, Save, Loader2 } from 'lucide-react';
import { COUNTRIES, DEVICES, BROWSERS, OPERATING_SYSTEMS, LANGUAGES } from '@/lib/constants';
import { toast } from '@/hooks/use-toast';

interface VariantInput {
  id?: string;
  name: string;
  destination_url: string;
  weight: number;
  is_control: boolean;
}

const parseWeight = (value: string): number => {
  const parsed = parseFloat(value);
  if (isNaN(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
};

export default function CampaignEdit() {
  const { id: projectId, campaignId } = useParams<{ id: string; campaignId: string }>();
  const { user, loading: authLoading } = useAuth();
  const { data: campaign, isLoading } = useCampaign(campaignId);
  const updateCampaign = useUpdateCampaign();
  const updateVariants = useUpdateVariants();
  const updateRules = useUpdateRules();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [stickyEnabled, setStickyEnabled] = useState(true);
  const [respectDnt, setRespectDnt] = useState(true);
  const [variants, setVariants] = useState<VariantInput[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [selectedBrowsers, setSelectedBrowsers] = useState<string[]>([]);
  const [selectedOS, setSelectedOS] = useState<string[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [includePaths, setIncludePaths] = useState<string>('');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  // Initialize form with campaign data
  useEffect(() => {
    if (campaign && !initialized) {
      setName(campaign.name);
      setStickyEnabled(campaign.sticky_enabled ?? true);
      setRespectDnt(campaign.respect_dnt ?? true);
      
      if (campaign.variants && campaign.variants.length > 0) {
        setVariants(campaign.variants.map(v => ({
          id: v.id,
          name: v.name,
          destination_url: v.destination_url,
          weight: v.weight ?? 50,
          is_control: v.is_control ?? false,
        })));
      }

      // campaign_rules can be an array or single object depending on query
      const rulesData = campaign.campaign_rules;
      const rules = Array.isArray(rulesData) ? rulesData[0] : rulesData;
      if (rules) {
        setSelectedCountries(rules.country_in || []);
        setSelectedDevices(rules.device_in || []);
        setSelectedBrowsers(rules.browser_in || []);
        setSelectedOS(rules.os_in || []);
        setSelectedLanguages(rules.lang_in || []);
        setIncludePaths((rules.include_paths || []).join('\n'));
      }
      
      setInitialized(true);
    }
  }, [campaign, initialized]);

  const addVariant = () => {
    if (variants.length >= 10) {
      toast({ title: 'Error', description: 'Maximum 10 variants allowed', variant: 'destructive' });
      return;
    }
    const newWeight = Math.floor(100 / (variants.length + 1));
    setVariants([
      ...variants.map(v => ({ ...v, weight: newWeight })),
      { name: `Variant ${String.fromCharCode(65 + variants.length - 1)}`, destination_url: '', weight: newWeight, is_control: false }
    ]);
  };

  const removeVariant = (index: number) => {
    if (variants.length <= 2) {
      toast({ title: 'Error', description: 'Minimum 2 variants required', variant: 'destructive' });
      return;
    }
    const newVariants = variants.filter((_, i) => i !== index);
    const newWeight = Math.floor(100 / newVariants.length);
    setVariants(newVariants.map(v => ({ ...v, weight: newWeight })));
  };

  const updateVariant = (index: number, field: keyof VariantInput, value: string | number | boolean) => {
    setVariants(variants.map((v, i) => i === index ? { ...v, [field]: value } : v));
  };

  const balanceWeights = () => {
    const equalWeight = Math.floor(100 / variants.length);
    const remainder = 100 - (equalWeight * variants.length);
    setVariants(variants.map((v, i) => ({ ...v, weight: equalWeight + (i === 0 ? remainder : 0) })));
  };

  const totalWeight = Math.round(variants.reduce((sum, v) => sum + v.weight, 0) * 100) / 100;

  const handleSaveBasics = async () => {
    if (!campaignId || !name.trim()) {
      toast({ title: 'Error', description: 'Campaign name is required', variant: 'destructive' });
      return;
    }
    await updateCampaign.mutateAsync({
      id: campaignId,
      name,
      sticky_enabled: stickyEnabled,
      respect_dnt: respectDnt,
    });
  };

  const handleSaveVariants = async () => {
    if (!campaignId) return;
    
    if (variants.some(v => !v.destination_url.trim())) {
      toast({ title: 'Error', description: 'All variants must have a destination URL', variant: 'destructive' });
      return;
    }
    
    if (totalWeight !== 100) {
      toast({ title: 'Error', description: 'Weights must sum to 100%', variant: 'destructive' });
      return;
    }

    await updateVariants.mutateAsync({ campaignId, variants });
  };

  const handleSaveRules = async () => {
    if (!campaignId) return;
    await updateRules.mutateAsync({
      campaignId,
      rules: {
        country_in: selectedCountries,
        device_in: selectedDevices,
        browser_in: selectedBrowsers,
        os_in: selectedOS,
        lang_in: selectedLanguages,
        include_paths: includePaths.split('\n').map(p => p.trim()).filter(p => p),
      },
    });
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Campaign not found</h1>
          <Link to={`/project/${projectId}`}>
            <Button>Back to Project</Button>
          </Link>
        </div>
      </div>
    );
  }

  const isSaving = updateCampaign.isPending || updateVariants.isPending || updateRules.isPending;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to={`/project/${projectId}/campaign/${campaignId}`} className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="font-semibold">Edit Campaign</h1>
              <p className="text-xs text-muted-foreground">{campaign.name}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Tabs defaultValue="basics" className="space-y-6">
          <TabsList>
            <TabsTrigger value="basics">Basics</TabsTrigger>
            <TabsTrigger value="variants">Variants</TabsTrigger>
            <TabsTrigger value="targeting">Targeting</TabsTrigger>
          </TabsList>

          <TabsContent value="basics" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Campaign Basics</CardTitle>
                <CardDescription>Update your campaign name and behavior settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Campaign Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Homepage Redirect Test"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Sticky Bucketing</Label>
                      <p className="text-sm text-muted-foreground">
                        Return visitors see the same variant
                      </p>
                    </div>
                    <Switch checked={stickyEnabled} onCheckedChange={setStickyEnabled} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Respect Do Not Track</Label>
                      <p className="text-sm text-muted-foreground">
                        Skip tracking for users with DNT enabled
                      </p>
                    </div>
                    <Switch checked={respectDnt} onCheckedChange={setRespectDnt} />
                  </div>
                </div>

                <Button onClick={handleSaveBasics} disabled={isSaving}>
                  {updateCampaign.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Save Changes
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="variants" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Variants</CardTitle>
                    <CardDescription>Define the URLs to redirect visitors to</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={balanceWeights}>
                      Balance Weights
                    </Button>
                    <Button variant="outline" size="sm" onClick={addVariant}>
                      <Plus className="w-4 h-4 mr-1" />
                      Add Variant
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {variants.map((variant, index) => (
                  <div key={index} className="p-4 rounded-lg border border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Input
                          value={variant.name}
                          onChange={(e) => updateVariant(index, 'name', e.target.value)}
                          className="w-40"
                          placeholder="Variant name"
                        />
                        {variant.is_control && (
                          <span className="text-xs px-2 py-0.5 rounded bg-accent text-accent-foreground">
                            Control
                          </span>
                        )}
                      </div>
                      {variants.length > 2 && (
                        <Button variant="ghost" size="icon" onClick={() => removeVariant(index)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Destination URL</Label>
                      <Input
                        value={variant.destination_url}
                        onChange={(e) => updateVariant(index, 'destination_url', e.target.value)}
                        placeholder="https://example.com/page-a"
                        type="url"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Traffic Weight</Label>
                      <div className="flex items-center gap-3">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={variant.weight}
                          onChange={(e) => updateVariant(index, 'weight', parseWeight(e.target.value))}
                          className="w-24"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="0.01"
                          value={variant.weight}
                          onChange={(e) => updateVariant(index, 'weight', parseWeight(e.target.value))}
                          className="flex-1"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {totalWeight !== 100 && (
                  <p className="text-sm text-destructive">
                    Weights must sum to 100% (currently {totalWeight}%)
                  </p>
                )}

                <Button onClick={handleSaveVariants} disabled={isSaving || totalWeight !== 100}>
                  {updateVariants.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Save Variants
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="targeting" className="space-y-6">
            {/* Path Targeting - NEW */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Path Targeting
                </CardTitle>
                <CardDescription>
                  Specify which URL paths this campaign should match. Leave empty to match all paths.
                  Use <code className="text-xs bg-muted px-1 rounded">*</code> for wildcards.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <textarea
                  value={includePaths}
                  onChange={(e) => setIncludePaths(e.target.value)}
                  placeholder={"/landing-page-1\n/promo/*\n/campaign/special"}
                  className="w-full h-24 p-3 text-sm rounded-lg border border-border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  One path per line. Examples: <code>/exact-path</code>, <code>/prefix/*</code>
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Country Targeting
                </CardTitle>
                <CardDescription>Leave empty to target all countries</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                  {COUNTRIES.map((country) => (
                    <label key={country.code} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={selectedCountries.includes(country.code)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedCountries([...selectedCountries, country.code]);
                          } else {
                            setSelectedCountries(selectedCountries.filter(c => c !== country.code));
                          }
                        }}
                      />
                      {country.name}
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Monitor className="w-5 h-5" />
                  Device Targeting
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  {DEVICES.map((device) => (
                    <label key={device.value} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={selectedDevices.includes(device.value)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedDevices([...selectedDevices, device.value]);
                          } else {
                            setSelectedDevices(selectedDevices.filter(d => d !== device.value));
                          }
                        }}
                      />
                      {device.label}
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Chrome className="w-5 h-5" />
                  Browser Targeting
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  {BROWSERS.map((browser) => (
                    <label key={browser.value} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={selectedBrowsers.includes(browser.value)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedBrowsers([...selectedBrowsers, browser.value]);
                          } else {
                            setSelectedBrowsers(selectedBrowsers.filter(b => b !== browser.value));
                          }
                        }}
                      />
                      {browser.label}
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5" />
                  Operating System
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  {OPERATING_SYSTEMS.map((os) => (
                    <label key={os.value} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={selectedOS.includes(os.value)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedOS([...selectedOS, os.value]);
                          } else {
                            setSelectedOS(selectedOS.filter(o => o !== os.value));
                          }
                        }}
                      />
                      {os.label}
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Languages className="w-5 h-5" />
                  Language Targeting
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                  {LANGUAGES.map((lang) => (
                    <label key={lang.code} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={selectedLanguages.includes(lang.code)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedLanguages([...selectedLanguages, lang.code]);
                          } else {
                            setSelectedLanguages(selectedLanguages.filter(l => l !== lang.code));
                          }
                        }}
                      />
                      {lang.name}
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Button onClick={handleSaveRules} disabled={isSaving}>
              {updateRules.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Targeting Rules
            </Button>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
