import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Phone,
  Zap,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  TrendingUp,
  Info,
  Activity
} from 'lucide-react';

export const EnhancedSpamDashboard = () => {
  const [isScanning, setIsScanning] = useState(false);
  const [numbers, setNumbers] = useState<any[]>([]);
  const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
  const [scanResults, setScanResults] = useState<any>(null);
  const [registrationStatus, setRegistrationStatus] = useState<any>(null);
  const [numberProfiles, setNumberProfiles] = useState<Map<string, any>>(new Map());
  const [approvedProfiles, setApprovedProfiles] = useState<any[]>([]);
  const [transferringNumber, setTransferringNumber] = useState<string | null>(null);
  const [isCheckingRegistration, setIsCheckingRegistration] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadNumbers();
    checkRegistrationStatus();
    loadApprovedProfiles();
  }, []);

  useEffect(() => {
    // Check profiles for all loaded numbers
    numbers.forEach(num => {
      if (!numberProfiles.has(num.number)) {
        checkNumberProfile(num.number);
      }
    });
  }, [numbers]);

  const loadApprovedProfiles = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('enhanced-spam-lookup', {
        body: { listApprovedProfiles: true }
      });
      
      if (error) throw error;
      setApprovedProfiles(data.approvedProfiles || []);
    } catch (error) {
      console.error('Failed to load approved profiles:', error);
    }
  };

  const checkNumberProfile = async (phoneNumber: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('enhanced-spam-lookup', {
        body: { checkNumberProfile: true, phoneNumber }
      });
      
      if (error) throw error;
      setNumberProfiles(prev => new Map(prev).set(phoneNumber, data));
      return data;
    } catch (error) {
      console.error('Failed to check number profile:', error);
      return null;
    }
  };

  const transferNumberToProfile = async (phoneNumber: string, profileSid: string) => {
    setTransferringNumber(phoneNumber);
    try {
      const { data, error } = await supabase.functions.invoke('enhanced-spam-lookup', {
        body: { 
          transferToProfile: true,
          phoneNumber,
          customerProfileSid: profileSid
        }
      });
      
      if (error) throw error;
      
      toast({
        title: "Number Transferred",
        description: `${phoneNumber} has been assigned to the approved STIR/SHAKEN profile`,
      });
      
      // Refresh the number profile
      await checkNumberProfile(phoneNumber);
      await runEnhancedScan(phoneNumber);
    } catch (error) {
      console.error('Transfer failed:', error);
      toast({
        title: "Transfer Failed",
        description: error.message || "Failed to transfer number",
        variant: "destructive"
      });
    } finally {
      setTransferringNumber(null);
    }
  };

  const checkRegistrationStatus = async () => {
    setIsCheckingRegistration(true);
    try {
      const { data, error } = await supabase.functions.invoke('enhanced-spam-lookup', {
        body: { checkRegistrationStatus: true }
      });

      if (error) throw error;
      setRegistrationStatus(data);
    } catch (error: any) {
      console.error('Registration check failed:', error);
    } finally {
      setIsCheckingRegistration(false);
    }
  };

  const loadNumbers = async () => {
    const { data, error } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setNumbers(data);
    }
  };

  const runEnhancedScan = async (phoneNumberId?: string) => {
    setIsScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('enhanced-spam-lookup', {
        body: {
          phoneNumberId: phoneNumberId || undefined,
          checkAll: !phoneNumberId,
          includeSTIRSHAKEN: true
        }
      });

      if (error) throw error;

      setScanResults(data);
      await loadNumbers(); // Refresh to show updated data

      toast({
        title: "Enhanced Spam Scan Complete",
        description: phoneNumberId 
          ? `Analyzed number with STIR/SHAKEN verification`
          : `Scanned ${data.results?.length || 0} numbers`,
      });
    } catch (error: any) {
      toast({
        title: "Scan Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsScanning(false);
    }
  };

  const getSTIRSHAKENBadge = (level: string | null) => {
    switch (level) {
      case 'A':
        return <Badge className="bg-green-500"><ShieldCheck className="h-3 w-3 mr-1" />Full Attestation (A)</Badge>;
      case 'B':
        return <Badge className="bg-yellow-500"><Shield className="h-3 w-3 mr-1" />Partial (B)</Badge>;
      case 'C':
        return <Badge className="bg-orange-500"><ShieldAlert className="h-3 w-3 mr-1" />Gateway (C)</Badge>;
      case 'not_verified':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Not Verified</Badge>;
      default:
        return <Badge variant="outline"><Info className="h-3 w-3 mr-1" />Not Checked</Badge>;
    }
  };

  const getSpamScoreBadge = (score: number) => {
    if (score >= 75) return { color: 'bg-red-500', label: 'CRITICAL', icon: AlertTriangle };
    if (score >= 50) return { color: 'bg-orange-500', label: 'HIGH RISK', icon: ShieldAlert };
    if (score >= 25) return { color: 'bg-yellow-500', label: 'MEDIUM', icon: AlertTriangle };
    return { color: 'bg-green-500', label: 'LOW RISK', icon: CheckCircle };
  };

  const getLineTypeIcon = (lineType: string | null) => {
    if (!lineType) return <Phone className="h-4 w-4 text-slate-400" />;
    if (lineType.toLowerCase().includes('voip')) {
      return <Zap className="h-4 w-4 text-orange-500" />;
    }
    if (lineType.toLowerCase().includes('mobile')) {
      return <Phone className="h-4 w-4 text-blue-500" />;
    }
    return <Phone className="h-4 w-4 text-slate-500" />;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Enhanced Spam Detection & STIR/SHAKEN
              </CardTitle>
              <CardDescription>
                Real-time carrier lookups, STIR/SHAKEN attestation, and comprehensive spam analysis
              </CardDescription>
            </div>
            <Button
              onClick={() => runEnhancedScan()}
              disabled={isScanning}
              size="lg"
            >
              {isScanning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Scan All Numbers
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="numbers" className="space-y-4">
            <TabsList>
              <TabsTrigger value="registration">Registration Status</TabsTrigger>
              <TabsTrigger value="numbers">Phone Numbers ({numbers.length})</TabsTrigger>
              <TabsTrigger value="results">Latest Scan Results</TabsTrigger>
              <TabsTrigger value="info">About STIR/SHAKEN</TabsTrigger>
            </TabsList>

            <TabsContent value="registration" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Twilio A2P Registration Status</CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={checkRegistrationStatus}
                      disabled={isCheckingRegistration}
                    >
                      {isCheckingRegistration ? (
                        <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Checking...</>
                      ) : (
                        <><RefreshCw className="h-3 w-3 mr-1" />Refresh</>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isCheckingRegistration ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : registrationStatus ? (
                    <>
                      <Alert className={registrationStatus.registered ? 'border-green-500 bg-green-500/10' : 'border-yellow-500 bg-yellow-500/10'}>
                        {registrationStatus.registered ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-yellow-500" />
                        )}
                        <AlertDescription>
                          <strong>{registrationStatus.registered ? '✅ Registered' : '⚠️ Not Fully Registered'}</strong>
                          <p className="mt-1 text-sm">{registrationStatus.recommendation}</p>
                        </AlertDescription>
                      </Alert>

                      {registrationStatus.details && (
                        <div className="space-y-3">
                          <div className="p-4 bg-muted rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <div className="font-semibold">Trust Hub (Business Profile)</div>
                              <Badge variant={registrationStatus.details.trustProducts.verified > 0 ? 'default' : 'secondary'}>
                                {registrationStatus.details.trustProducts.verified} / {registrationStatus.details.trustProducts.count} Verified
                              </Badge>
                            </div>
                            {registrationStatus.details.trustProducts.products.length > 0 ? (
                              <div className="space-y-2 mt-3">
                                {registrationStatus.details.trustProducts.products.map((tp: any) => (
                                  <div key={tp.sid} className="text-sm p-2 bg-background rounded border">
                                    <div className="flex items-center justify-between">
                                      <span className="font-medium">{tp.friendlyName}</span>
                                      <Badge variant={tp.status === 'twilio-approved' ? 'default' : 'secondary'}>
                                        {tp.status}
                                      </Badge>
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">SID: {tp.sid}</div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">No business profiles found</p>
                            )}
                          </div>

                          <div className="p-4 bg-muted rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <div className="font-semibold">A2P Brand Registration</div>
                              <Badge variant={registrationStatus.details.brands.approved > 0 ? 'default' : 'secondary'}>
                                {registrationStatus.details.brands.approved} / {registrationStatus.details.brands.count} Approved
                              </Badge>
                            </div>
                            {registrationStatus.details.brands.brands.length > 0 ? (
                              <div className="space-y-2 mt-3">
                                {registrationStatus.details.brands.brands.map((brand: any) => (
                                  <div key={brand.sid} className="text-sm p-2 bg-background rounded border">
                                    <div className="flex items-center justify-between">
                                      <span className="font-medium">Brand {brand.sid.slice(-8)}</span>
                                      <Badge variant={brand.status === 'APPROVED' || brand.status === 'VERIFIED' ? 'default' : 'secondary'}>
                                        {brand.status}
                                      </Badge>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">No A2P brands registered</p>
                            )}
                          </div>

                          <div className="p-4 bg-muted rounded-lg">
                            <div className="flex items-center justify-between">
                              <div className="font-semibold">Messaging Services</div>
                              <Badge>{registrationStatus.details.messagingServices.count} Services</Badge>
                            </div>
                          </div>
                        </div>
                      )}

                      {!registrationStatus.registered && (
                        <div className="pt-4 border-t">
                          <h4 className="font-semibold mb-2">Next Steps:</h4>
                          <ol className="list-decimal list-inside space-y-2 text-sm">
                            <li>
                              <a 
                                href="https://console.twilio.com/us1/develop/trust-hub"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                              >
                                Create Trust Hub Business Profile
                              </a>
                            </li>
                            <li>
                              <a 
                                href="https://console.twilio.com/us1/develop/sms/settings/a2p-registration"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                              >
                                Register A2P 10DLC Brand
                              </a>
                            </li>
                            <li>Submit for verification and wait for approval (1-2 business days)</li>
                          </ol>
                        </div>
                      )}
                    </>
                  ) : (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        Click "Refresh" to check your Twilio registration status
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="numbers" className="space-y-3">
              {numbers.map((number) => {
                const scoreData = getSpamScoreBadge(number.external_spam_score || 0);
                const ScoreIcon = scoreData.icon;
                const profile = numberProfiles.get(number.number);
                const needsTransfer = profile && !profile.currentProfile?.isApproved && approvedProfiles.length > 0;

                return (
                  <Card key={number.id} className="border-l-4" style={{ borderLeftColor: number.is_spam ? '#ef4444' : '#22c55e' }}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="space-y-3 flex-1">
                          <div className="flex items-center gap-3">
                            {getLineTypeIcon(number.line_type)}
                            <div>
                              <div className="font-mono text-lg font-semibold">{number.number}</div>
                              <div className="text-sm text-muted-foreground flex items-center gap-2">
                                {number.carrier_name || 'Unknown Carrier'}
                                {number.line_type && (
                                  <Badge variant="outline" className="text-xs">
                                    {number.line_type}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-xs text-muted-foreground">STIR/SHAKEN Status</div>
                              <div className="mt-1">
                                {getSTIRSHAKENBadge(number.stir_shaken_attestation)}
                              </div>
                            </div>

                            <div>
                              <div className="text-xs text-muted-foreground">Spam Risk Score</div>
                              <div className="mt-1 flex items-center gap-2">
                                <Progress value={number.external_spam_score || 0} className="h-2 flex-1" />
                                <span className="text-sm font-semibold">{number.external_spam_score || 0}</span>
                              </div>
                            </div>

                            <div>
                              <div className="text-xs text-muted-foreground">Daily Calls</div>
                              <div className="mt-1 font-semibold">{number.daily_calls} calls</div>
                            </div>

                            <div>
                              <div className="text-xs text-muted-foreground">Caller Name (CNAM)</div>
                              <div className="mt-1 text-sm">{number.caller_name || 'Not registered'}</div>
                            </div>
                          </div>

                          {profile && (
                            <div className="pt-2 border-t">
                              <div className="text-xs text-muted-foreground mb-1">Trust Hub Profile</div>
                              {profile.currentProfile ? (
                                <div className="flex items-center gap-2">
                                  <Badge variant={profile.currentProfile.isApproved ? "default" : "secondary"}>
                                    {profile.currentProfile.friendlyName}
                                  </Badge>
                                  {profile.currentProfile.isApproved ? (
                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                  )}
                                </div>
                              ) : (
                                <span className="text-sm text-yellow-600">Not assigned</span>
                              )}
                            </div>
                          )}

                          {needsTransfer && (
                            <Alert className="border-yellow-500 bg-yellow-500/10">
                              <AlertTriangle className="h-4 w-4 text-yellow-600" />
                              <AlertDescription>
                                <div className="space-y-2">
                                  <p className="text-sm font-medium">Number not on approved STIR/SHAKEN profile</p>
                                  <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground">Transfer to:</p>
                                    {approvedProfiles.map(prof => (
                                      <Button
                                        key={prof.sid}
                                        size="sm"
                                        variant="outline"
                                        className="w-full justify-start text-xs"
                                        onClick={() => transferNumberToProfile(number.number, prof.sid)}
                                        disabled={transferringNumber === number.number}
                                      >
                                        {transferringNumber === number.number ? (
                                          <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                        ) : (
                                          <Shield className="h-3 w-3 mr-2" />
                                        )}
                                        {prof.friendlyName}
                                      </Button>
                                    ))}
                                  </div>
                                </div>
                              </AlertDescription>
                            </Alert>
                          )}

                          {number.is_voip && (
                            <Alert className="mt-2">
                              <Zap className="h-4 w-4" />
                              <AlertDescription>
                                VoIP number - Higher spam risk. Consider STIR/SHAKEN verification.
                              </AlertDescription>
                            </Alert>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-2 ml-4">
                          <Badge className={scoreData.color}>
                            <ScoreIcon className="h-3 w-3 mr-1" />
                            {scoreData.label}
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => runEnhancedScan(number.id)}
                            disabled={isScanning}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Scan
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {numbers.length === 0 && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    No active phone numbers found. Purchase or import numbers to get started.
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>

            <TabsContent value="results" className="space-y-4">
              {scanResults ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Total Scanned</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold">
                          {scanResults.results?.length || 1}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">High Risk</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-orange-500">
                          {scanResults.highRisk || 0}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Verified (A)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-green-500">
                          {scanResults.results?.filter((r: any) => 
                            r.lookupData?.stirShaken?.level === 'A'
                          ).length || 0}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle>Scan Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-96">
                        {JSON.stringify(scanResults, null, 2)}
                      </pre>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Run a scan to see detailed results here.
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>

            <TabsContent value="info" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>What is STIR/SHAKEN?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    STIR/SHAKEN is a framework of protocols and procedures to combat caller ID spoofing and verify the authenticity of caller ID information.
                  </p>

                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <ShieldCheck className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold">Level A - Full Attestation</div>
                        <div className="text-sm text-muted-foreground">
                          The carrier has authenticated that the caller is authorized to use the calling number. Highest trust level.
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <Shield className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold">Level B - Partial Attestation</div>
                        <div className="text-sm text-muted-foreground">
                          The carrier has authenticated the caller but cannot verify they are authorized to use the calling number.
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <ShieldAlert className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold">Level C - Gateway Attestation</div>
                        <div className="text-sm text-muted-foreground">
                          The carrier has authenticated the call origin but has no information about the caller or calling number.
                        </div>
                      </div>
                    </div>
                  </div>

                  <Alert>
                    <TrendingUp className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Pro Tip:</strong> Numbers with Level A attestation have significantly better answer rates and lower spam reporting.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>

              <Card className="border-yellow-500/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    Registration Required
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm">
                    To get proper STIR/SHAKEN attestation for your outbound calls, you must complete the following registrations with Twilio:
                  </p>

                  <div className="space-y-3">
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="font-semibold mb-1">1. A2P 10DLC Campaign Registration</div>
                      <p className="text-sm text-muted-foreground mb-2">
                        Register your business and campaign use case. Required for all application-to-person (A2P) messaging and calling.
                      </p>
                      <a 
                        href="https://console.twilio.com/us1/develop/sms/settings/a2p-registration"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary text-sm hover:underline inline-flex items-center gap-1"
                      >
                        Register A2P 10DLC →
                      </a>
                    </div>

                    <div className="p-3 bg-muted rounded-lg">
                      <div className="font-semibold mb-1">2. CNAM Registration</div>
                      <p className="text-sm text-muted-foreground mb-2">
                        Register your Caller ID Name (CNAM) so your business name appears on recipient devices.
                      </p>
                      <a 
                        href="https://www.twilio.com/docs/voice/trusted-calling-with-shakenstir"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary text-sm hover:underline inline-flex items-center gap-1"
                      >
                        Learn about CNAM →
                      </a>
                    </div>

                    <div className="p-3 bg-muted rounded-lg">
                      <div className="font-semibold mb-1">3. Verify Registration Status</div>
                      <p className="text-sm text-muted-foreground mb-2">
                        After registration, attestation levels are determined by actual call performance and will appear in call logs.
                      </p>
                      <a 
                        href="https://www.twilio.com/docs/voice/trusted-calling-with-shakenstir"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary text-sm hover:underline inline-flex items-center gap-1"
                      >
                        STIR/SHAKEN Documentation →
                      </a>
                    </div>
                  </div>

                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      <strong>Note:</strong> STIR/SHAKEN attestation is determined during actual calls and recorded in call detail records (CDRs). 
                      The attestation level cannot be checked via lookup APIs - it requires making actual calls to verify.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default EnhancedSpamDashboard;
