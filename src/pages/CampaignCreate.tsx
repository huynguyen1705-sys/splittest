import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProject } from '@/hooks/useProjects';
import { useCreateCampaign } from '@/hooks/useCampaigns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, ArrowRight, Plus, Trash2, Globe, Monitor, Chrome, Smartphone, Languages } from 'lucide-react';
import { COUNTRIES, DEVICES, BROWSERS, OPERATING_SYSTEMS, LANGUAGES } from '@/lib/constants';
import { toast } from 'sonner';

type Step = 'basics' | 'variants' | 'targeting' | 'review';

interface VariantInput {
  name: string;
  destination_url: string;
  weight: number;
  is_control: boolean;
}

export default function CampaignCreate() {
  const { id: projectId } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { data: project } = useProject(projectId);
  const createCampaign = useCreateCampaign();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('basics');
  const [name, setName] = useState('');
  const [stickyEnabled, setStickyEnabled] = useState(true);
  const [respectDnt, setRespectDnt] = useState(true);

  const [variants, setVariants] = useState<VariantInput[]>([
    { name: 'Control', destination_url: '', weight: 50, is_control: true },
    { name: 'Variant A', destination_url: '', weight: 50, is_control: false },
  ]);

  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [selectedBrowsers, setSelectedBrowsers] = useState<string[]>([]);
  const [selectedOS, setSelectedOS] = useState<string[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  const addVariant = () => {
    if (variants.length >= 10) {
      toast.error('Maximum 10 variants allowed');
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
      toast.error('Minimum 2 variants required');
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

  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);

  const handleSubmit = async () => {
    if (!projectId) return;

    if (!name.trim()) {
      toast.error('Campaign name is required');
      return;
    }

    if (variants.some(v => !v.destination_url.trim())) {
      toast.error('All variants must have a destination URL');
      return;
    }

    if (totalWeight !== 100) {
      toast.error('Weights must sum to 100%');
      return;
    }

    try {
      await createCampaign.mutateAsync({
        project_id: projectId,
        name,
        sticky_enabled: stickyEnabled,
        respect_dnt: respectDnt,
        variants: variants.map(v => ({
          name: v.name,
          destination_url: v.destination_url,
          weight: v.weight,
          is_control: v.is_control,
        })),
        rules: {
          country_in: selectedCountries,
          device_in: selectedDevices,
          browser_in: selectedBrowsers,
          os_in: selectedOS,
          lang_in: selectedLanguages,
        },
      });
      navigate(`/project/${projectId}`);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const steps: { key: Step; label: string }[] = [
    { key: 'basics', label: 'Basics' },
    { key: 'variants', label: 'Variants' },
    { key: 'targeting', label: 'Targeting' },
    { key: 'review', label: 'Review' },
  ];

  const currentStepIndex = steps.findIndex(s => s.key === step);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to={`/project/${projectId}`} className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="font-semibold">Create Campaign</h1>
              <p className="text-xs text-muted-foreground">{project?.name}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Progress */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-center gap-2">
            {steps.map((s, i) => (
              <div key={s.key} className="flex items-center">
                <button
                  onClick={() => setStep(s.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    step === s.key 
                      ? 'bg-primary text-primary-foreground' 
                      : i < currentStepIndex 
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="w-6 h-6 rounded-full bg-current/20 flex items-center justify-center text-xs font-medium">
                    {i + 1}
                  </span>
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
                {i < steps.length - 1 && <div className="w-8 h-px bg-border mx-2" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {step === 'basics' && (
          <Card>
            <CardHeader>
              <CardTitle>Campaign Basics</CardTitle>
              <CardDescription>Set up your campaign name and behavior settings</CardDescription>
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
            </CardContent>
          </Card>
        )}

        {step === 'variants' && (
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
                    <Label>Traffic Weight ({variant.weight}%)</Label>
                    <input
                      type="range"
                      min="1"
                      max="99"
                      value={variant.weight}
                      onChange={(e) => updateVariant(index, 'weight', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              ))}

              {totalWeight !== 100 && (
                <p className="text-sm text-destructive">
                  Weights must sum to 100% (currently {totalWeight}%)
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {step === 'targeting' && (
          <div className="space-y-6">
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
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
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
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Review Campaign</CardTitle>
                <CardDescription>Confirm your campaign settings before creating</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="font-medium mb-2">Campaign Name</h3>
                  <p className="text-muted-foreground">{name || 'Not set'}</p>
                </div>

                <div>
                  <h3 className="font-medium mb-2">Settings</h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>Sticky Bucketing: {stickyEnabled ? 'Enabled' : 'Disabled'}</li>
                    <li>Respect DNT: {respectDnt ? 'Yes' : 'No'}</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-medium mb-2">Variants ({variants.length})</h3>
                  <div className="space-y-2">
                    {variants.map((v, i) => (
                      <div key={i} className="text-sm p-2 rounded bg-muted">
                        <span className="font-medium">{v.name}</span> ({v.weight}%)
                        <p className="text-muted-foreground truncate">{v.destination_url || 'No URL set'}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-medium mb-2">Targeting</h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>Countries: {selectedCountries.length ? selectedCountries.join(', ') : 'All'}</li>
                    <li>Devices: {selectedDevices.length ? selectedDevices.join(', ') : 'All'}</li>
                    <li>Browsers: {selectedBrowsers.length ? selectedBrowsers.join(', ') : 'All'}</li>
                    <li>OS: {selectedOS.length ? selectedOS.join(', ') : 'All'}</li>
                    <li>Languages: {selectedLanguages.length ? selectedLanguages.join(', ') : 'All'}</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <Button
            variant="outline"
            onClick={() => setStep(steps[currentStepIndex - 1]?.key || 'basics')}
            disabled={currentStepIndex === 0}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>

          {step === 'review' ? (
            <Button onClick={handleSubmit} disabled={createCampaign.isPending}>
              {createCampaign.isPending ? 'Creating...' : 'Create Campaign'}
            </Button>
          ) : (
            <Button onClick={() => setStep(steps[currentStepIndex + 1]?.key || 'review')}>
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
