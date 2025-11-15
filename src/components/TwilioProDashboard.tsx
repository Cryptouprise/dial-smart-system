import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Phone, Search, ShoppingCart, Trash2, Settings, Server, Award } from 'lucide-react';
import { useTwilioAdvancedManagement } from '@/hooks/useTwilioAdvancedManagement';
import { useTwilioSIPTrunking } from '@/hooks/useTwilioSIPTrunking';
import { useTwilioA2PRegistration } from '@/hooks/useTwilioA2PRegistration';

const TwilioProDashboard = () => {
  const [searchAreaCode, setSearchAreaCode] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedNumbers, setSelectedNumbers] = useState<string[]>([]);
  const [bulkQuantity, setBulkQuantity] = useState(5);
  
  const advancedMgmt = useTwilioAdvancedManagement();
  const sipTrunking = useTwilioSIPTrunking();
  const a2pRegistration = useTwilioA2PRegistration();

  const handleSearchNumbers = async () => {
    if (!searchAreaCode) return;
    const results = await advancedMgmt.searchNumbers(searchAreaCode);
    setSearchResults(results);
  };

  const handleBuyNumber = async (phoneNumber: string) => {
    await advancedMgmt.buyNumber(phoneNumber);
    setSearchResults(prev => prev.filter(n => n.phone_number !== phoneNumber));
  };

  const handleBulkBuy = async () => {
    if (!searchAreaCode) return;
    await advancedMgmt.bulkBuyNumbers(searchAreaCode, bulkQuantity);
    setSearchResults([]);
  };

  const toggleNumberSelection = (phoneNumber: string) => {
    setSelectedNumbers(prev => 
      prev.includes(phoneNumber) 
        ? prev.filter(n => n !== phoneNumber)
        : [...prev, phoneNumber]
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Twilio Pro Dashboard</h1>
          <p className="text-muted-foreground">Complete Twilio API management and automation</p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          <Award className="mr-2 h-5 w-5" />
          Pro Features Enabled
        </Badge>
      </div>

      <Tabs defaultValue="numbers" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="numbers">
            <Phone className="mr-2 h-4 w-4" />
            Number Management
          </TabsTrigger>
          <TabsTrigger value="sip">
            <Server className="mr-2 h-4 w-4" />
            SIP Trunking
          </TabsTrigger>
          <TabsTrigger value="a2p">
            <Award className="mr-2 h-4 w-4" />
            A2P Registration
          </TabsTrigger>
          <TabsTrigger value="automation">
            <Settings className="mr-2 h-4 w-4" />
            Automation
          </TabsTrigger>
        </TabsList>

        {/* Number Management Tab */}
        <TabsContent value="numbers" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Search & Purchase Numbers</CardTitle>
              <CardDescription>
                Search for available Twilio numbers and purchase directly
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <Label htmlFor="areaCode">Area Code</Label>
                  <Input
                    id="areaCode"
                    placeholder="e.g., 415"
                    value={searchAreaCode}
                    onChange={(e) => setSearchAreaCode(e.target.value)}
                    maxLength={3}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button 
                    onClick={handleSearchNumbers}
                    disabled={advancedMgmt.isLoading || !searchAreaCode}
                  >
                    <Search className="mr-2 h-4 w-4" />
                    Search
                  </Button>
                </div>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-muted-foreground">
                      Found {searchResults.length} available numbers
                    </p>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={bulkQuantity}
                        onChange={(e) => setBulkQuantity(parseInt(e.target.value) || 1)}
                        className="w-20"
                        min={1}
                        max={50}
                      />
                      <Button
                        onClick={handleBulkBuy}
                        disabled={advancedMgmt.isLoading}
                        variant="outline"
                      >
                        <ShoppingCart className="mr-2 h-4 w-4" />
                        Buy {bulkQuantity}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-2 max-h-96 overflow-y-auto">
                    {searchResults.map((number) => (
                      <div
                        key={number.phone_number}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent"
                      >
                        <div className="flex items-center gap-3">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{number.phone_number}</p>
                            <p className="text-xs text-muted-foreground">
                              {number.locality}, {number.region}
                            </p>
                          </div>
                          {number.capabilities && (
                            <div className="flex gap-1">
                              {number.capabilities.voice && (
                                <Badge variant="secondary" className="text-xs">Voice</Badge>
                              )}
                              {number.capabilities.SMS && (
                                <Badge variant="secondary" className="text-xs">SMS</Badge>
                              )}
                              {number.capabilities.MMS && (
                                <Badge variant="secondary" className="text-xs">MMS</Badge>
                              )}
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleBuyNumber(number.phone_number)}
                          disabled={advancedMgmt.isLoading}
                        >
                          <ShoppingCart className="mr-2 h-3 w-3" />
                          Buy
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bulk Number Operations</CardTitle>
              <CardDescription>
                Manage multiple numbers at once - purchase or release in bulk
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <Label>Bulk Purchase</Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      placeholder="Area Code"
                      value={searchAreaCode}
                      onChange={(e) => setSearchAreaCode(e.target.value)}
                      maxLength={3}
                    />
                    <Input
                      type="number"
                      placeholder="Quantity"
                      value={bulkQuantity}
                      onChange={(e) => setBulkQuantity(parseInt(e.target.value) || 1)}
                      className="w-32"
                      min={1}
                      max={50}
                    />
                    <Button
                      onClick={handleBulkBuy}
                      disabled={advancedMgmt.isLoading || !searchAreaCode}
                    >
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      Buy {bulkQuantity}
                    </Button>
                  </div>
                </div>
              </div>

              {selectedNumbers.length > 0 && (
                <div className="p-4 border rounded-lg bg-accent/50">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">
                      {selectedNumbers.length} numbers selected
                    </p>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => advancedMgmt.bulkReleaseNumbers(selectedNumbers)}
                      disabled={advancedMgmt.isLoading}
                    >
                      <Trash2 className="mr-2 h-3 w-3" />
                      Release Selected
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedNumbers.map(num => (
                      <Badge key={num} variant="secondary">
                        {num}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SIP Trunking Tab */}
        <TabsContent value="sip" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>SIP Trunk Management</CardTitle>
              <CardDescription>
                Create and manage SIP trunks for voice connectivity
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Server className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">SIP Trunking</h3>
                <p className="text-muted-foreground mb-4">
                  Connect your infrastructure with Twilio SIP trunking
                </p>
                <Button onClick={() => sipTrunking.listTrunks()}>
                  View Trunks
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* A2P Registration Tab */}
        <TabsContent value="a2p" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>A2P 10DLC Registration</CardTitle>
              <CardDescription>
                Register for Application-to-Person messaging compliance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg bg-blue-50 dark:bg-blue-950">
                  <h4 className="font-semibold mb-2">📋 Registration Requirements</h4>
                  <ul className="text-sm space-y-1 list-disc list-inside">
                    <li>Business Profile (Trust Hub) - Verified business information</li>
                    <li>Brand Registration - $4 one-time fee</li>
                    <li>Campaign Registration - Monthly carrier fees apply</li>
                    <li>Typically takes 24-48 hours for approval</li>
                  </ul>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Step 1</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-4">
                        Create Business Profile
                      </p>
                      <Button className="w-full" variant="outline">
                        Create Profile
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Step 2</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-4">
                        Register Brand
                      </p>
                      <Button className="w-full" variant="outline">
                        Register Brand
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Step 3</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-4">
                        Create Campaign
                      </p>
                      <Button className="w-full" variant="outline">
                        Create Campaign
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Automation Tab */}
        <TabsContent value="automation" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Automated Workflows</CardTitle>
              <CardDescription>
                Configure automated number management and compliance checks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Settings className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Automation Coming Soon</h3>
                <p className="text-muted-foreground">
                  Automated number rotation, spam detection, and compliance monitoring
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TwilioProDashboard;
