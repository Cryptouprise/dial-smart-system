import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Phone, 
  ShoppingCart, 
  Import, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle,
  Info,
  Zap,
  Shield,
  Download
} from 'lucide-react';
import { usePhoneNumberPurchasing } from '@/hooks/usePhoneNumberPurchasing';
import { useTwilioIntegration } from '@/hooks/useTwilioIntegration';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

const PhoneNumberPurchasing = () => {
  const { toast } = useToast();
  const { purchaseNumbers, isLoading: isPurchasing } = usePhoneNumberPurchasing();
  const { listTwilioNumbers, importNumber, syncAllNumbers, isLoading: isTwilioLoading } = useTwilioIntegration();

  // Purchase state
  const [areaCode, setAreaCode] = useState('');
  const [quantity, setQuantity] = useState('5');
  const [provider, setProvider] = useState('retell');
  
  // Twilio state
  const [twilioNumbers, setTwilioNumbers] = useState<any[]>([]);
  const [selectedTwilioNumbers, setSelectedTwilioNumbers] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  
  // UI state
  const [showPurchaseHelp, setShowPurchaseHelp] = useState(false);
  const [showTwilioHelp, setShowTwilioHelp] = useState(false);

  // Load Twilio numbers
  const loadTwilioNumbers = async () => {
    const numbers = await listTwilioNumbers();
    setTwilioNumbers(numbers);
  };

  useEffect(() => {
    loadTwilioNumbers();
  }, []);

  // Handle purchase
  const handlePurchase = async () => {
    if (!areaCode || areaCode.length !== 3) {
      toast({
        title: "Invalid Area Code",
        description: "Please enter a valid 3-digit area code",
        variant: "destructive"
      });
      return;
    }

    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 1 || qty > 50) {
      toast({
        title: "Invalid Quantity",
        description: "Please enter a quantity between 1 and 50",
        variant: "destructive"
      });
      return;
    }

    try {
      await purchaseNumbers(areaCode, qty, provider);
      setAreaCode('');
      setQuantity('5');
    } catch (error) {
      console.error('Purchase error:', error);
    }
  };

  // Handle import selected numbers
  const handleImportSelected = async () => {
    if (selectedTwilioNumbers.size === 0) {
      toast({
        title: "No Numbers Selected",
        description: "Please select at least one number to import",
        variant: "destructive"
      });
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const phoneNumber of selectedTwilioNumbers) {
      try {
        await importNumber(phoneNumber);
        successCount++;
      } catch (error) {
        failCount++;
      }
    }

    toast({
      title: "Import Complete",
      description: `Successfully imported ${successCount} numbers. ${failCount} failed.`,
    });

    setSelectedTwilioNumbers(new Set());
    loadTwilioNumbers();
  };

  // Handle sync all
  const handleSyncAll = async () => {
    try {
      await syncAllNumbers();
      loadTwilioNumbers();
    } catch (error) {
      console.error('Sync error:', error);
    }
  };

  // Toggle number selection
  const toggleNumberSelection = (phoneNumber: string) => {
    const newSelected = new Set(selectedTwilioNumbers);
    if (newSelected.has(phoneNumber)) {
      newSelected.delete(phoneNumber);
    } else {
      newSelected.add(phoneNumber);
    }
    setSelectedTwilioNumbers(newSelected);
  };

  // Filter numbers by search
  const filteredNumbers = twilioNumbers.filter(num => 
    num.phone_number.includes(searchTerm) || 
    num.friendly_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Info Alert */}
      <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900">
        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <AlertDescription className="text-blue-800 dark:text-blue-300">
          <strong>Number Management Hub:</strong> Purchase new numbers or import existing ones from Twilio. 
          All numbers are automatically checked for spam reputation and synced with Retell AI.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="purchase" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="purchase" className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Purchase Numbers
          </TabsTrigger>
          <TabsTrigger value="import" className="flex items-center gap-2">
            <Import className="h-4 w-4" />
            Import from Twilio
          </TabsTrigger>
        </TabsList>

        {/* PURCHASE TAB */}
        <TabsContent value="purchase" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Phone className="h-5 w-5" />
                    Purchase Phone Numbers
                  </CardTitle>
                  <CardDescription>
                    Buy new phone numbers directly through Retell AI
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPurchaseHelp(true)}
                >
                  <Info className="h-4 w-4 mr-2" />
                  Help
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* How it works */}
              <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  How It Works
                </h4>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Badge variant="outline" className="mt-0.5">1</Badge>
                    <span>Enter area code and quantity of numbers to purchase</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Badge variant="outline" className="mt-0.5">2</Badge>
                    <span>Numbers are automatically purchased through Retell AI</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Badge variant="outline" className="mt-0.5">3</Badge>
                    <span>Each number is checked for spam reputation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Badge variant="outline" className="mt-0.5">4</Badge>
                    <span>Numbers are added to your pool and ready to use</span>
                  </li>
                </ol>
              </div>

              {/* Purchase Form */}
              <div className="grid gap-6">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="area-code">Area Code *</Label>
                    <Input
                      id="area-code"
                      placeholder="e.g., 212"
                      value={areaCode}
                      onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                      maxLength={3}
                      className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">
                      3-digit US area code
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantity *</Label>
                    <Input
                      id="quantity"
                      type="number"
                      placeholder="5"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      min={1}
                      max={50}
                    />
                    <p className="text-xs text-muted-foreground">
                      1-50 numbers per order
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="provider">Provider</Label>
                    <Select value={provider} onValueChange={setProvider}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="retell">Retell AI</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      More providers coming soon
                    </p>
                  </div>
                </div>

                {/* Pricing Info */}
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Pricing:</strong> $1.00/number/month. Numbers include spam checking, 
                    automatic rotation, and full integration with AI agents.
                  </AlertDescription>
                </Alert>

                <Button
                  onClick={handlePurchase}
                  disabled={isPurchasing || !areaCode || !quantity}
                  className="w-full"
                  size="lg"
                >
                  {isPurchasing ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Purchasing...
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      Purchase {quantity} Number{parseInt(quantity) !== 1 ? 's' : ''} 
                      {quantity && ` ($${parseInt(quantity)}/mo)`}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* IMPORT TAB */}
        <TabsContent value="import" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Import className="h-5 w-5" />
                    Import from Twilio
                  </CardTitle>
                  <CardDescription>
                    Import existing Twilio numbers into your system
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowTwilioHelp(true)}
                  >
                    <Info className="h-4 w-4 mr-2" />
                    Help
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadTwilioNumbers}
                    disabled={isTwilioLoading}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isTwilioLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Import Instructions */}
              <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <Download className="h-4 w-4 text-primary" />
                  Import Process
                </h4>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Badge variant="outline" className="mt-0.5">1</Badge>
                    <span>Your Twilio numbers are loaded automatically (requires Twilio API credentials)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Badge variant="outline" className="mt-0.5">2</Badge>
                    <span>Select numbers to import or use "Sync All" to import everything</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Badge variant="outline" className="mt-0.5">3</Badge>
                    <span>Numbers are imported to Retell AI and checked for spam</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Badge variant="outline" className="mt-0.5">4</Badge>
                    <span>Imported numbers appear in your pool ready to use</span>
                  </li>
                </ol>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  onClick={handleSyncAll}
                  disabled={isTwilioLoading || twilioNumbers.length === 0}
                  variant="default"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isTwilioLoading ? 'animate-spin' : ''}`} />
                  Sync All Numbers
                </Button>
                <Button
                  onClick={handleImportSelected}
                  disabled={isTwilioLoading || selectedTwilioNumbers.size === 0}
                  variant="outline"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Import Selected ({selectedTwilioNumbers.size})
                </Button>
              </div>

              {/* Search */}
              {twilioNumbers.length > 0 && (
                <div className="space-y-2">
                  <Label>Search Numbers</Label>
                  <Input
                    placeholder="Search by number or name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              )}

              {/* Numbers List */}
              {isTwilioLoading ? (
                <div className="text-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Loading Twilio numbers...</p>
                </div>
              ) : twilioNumbers.length === 0 ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    No Twilio numbers found. Make sure your Twilio credentials are configured in Settings.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="border rounded-lg divide-y">
                  {filteredNumbers.map((number) => (
                    <div
                      key={number.sid}
                      className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer"
                      onClick={() => toggleNumberSelection(number.phone_number)}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedTwilioNumbers.has(number.phone_number)}
                          onChange={() => toggleNumberSelection(number.phone_number)}
                          className="h-4 w-4 rounded border-gray-300"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div>
                          <p className="font-mono font-medium">{number.phone_number}</p>
                          {number.friendly_name && (
                            <p className="text-sm text-muted-foreground">{number.friendly_name}</p>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline">Twilio</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Purchase Help Dialog */}
      <Dialog open={showPurchaseHelp} onOpenChange={setShowPurchaseHelp}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Number Purchasing Guide</DialogTitle>
            <DialogDescription>
              Everything you need to know about buying phone numbers
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div>
              <h4 className="font-semibold mb-2">What happens when I purchase?</h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Numbers are purchased through Retell AI's telephony network</li>
                <li>Each number is immediately checked for spam reputation</li>
                <li>Numbers are added to your pool and database</li>
                <li>You can start using them for campaigns right away</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Area Code Selection</h4>
              <p className="text-muted-foreground">
                Choose area codes that match your target market. Local numbers typically have 
                better answer rates. You can purchase numbers from multiple area codes to test 
                performance.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Spam Checking</h4>
              <p className="text-muted-foreground">
                All numbers are automatically checked against spam databases. Numbers with high 
                spam scores are flagged, and you'll receive a notification. You can choose to 
                release these numbers or keep them with caution.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Best Practices</h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Start with 5-10 numbers to test performance</li>
                <li>Purchase from multiple area codes for geographic diversity</li>
                <li>Monitor spam scores and rotate numbers regularly</li>
                <li>Keep some numbers in reserve for rotation</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Twilio Import Help Dialog */}
      <Dialog open={showTwilioHelp} onOpenChange={setShowTwilioHelp}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Twilio Import Guide</DialogTitle>
            <DialogDescription>
              How to import your existing Twilio numbers
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div>
              <h4 className="font-semibold mb-2">Prerequisites</h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Active Twilio account with purchased phone numbers</li>
                <li>Twilio Account SID and Auth Token configured in Settings</li>
                <li>Numbers must be SMS/Voice capable</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Import Methods</h4>
              <p className="text-muted-foreground mb-2">
                <strong>Sync All:</strong> Imports all Twilio numbers at once. Best for initial setup.
              </p>
              <p className="text-muted-foreground">
                <strong>Selective Import:</strong> Choose specific numbers to import. 
                Good for testing or when you only need certain numbers.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">What happens during import?</h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Number is registered with Retell AI for voice calls</li>
                <li>Spam reputation is checked and recorded</li>
                <li>Number is added to your local database</li>
                <li>Number becomes available for campaign use</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Troubleshooting</h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>If no numbers appear, verify Twilio credentials in Settings</li>
                <li>Import failures may indicate numbers are already imported</li>
                <li>Some numbers may not be compatible with Retell AI</li>
                <li>Check the console logs for detailed error messages</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PhoneNumberPurchasing;
