import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, CheckCircle, Clock, XCircle, Building2, Phone, AlertCircle } from 'lucide-react';
import { useRetellBusinessVerification } from '@/hooks/useRetellBusinessVerification';

export const RetellBusinessVerification: React.FC = () => {
  const {
    createBusinessProfile,
    listBusinessProfiles,
    submitVerification,
    submitBrandedCall,
    listVerifications,
    listBrandedCalls,
    isLoading
  } = useRetellBusinessVerification();

  const [profiles, setProfiles] = useState<any[]>([]);
  const [verifications, setVerifications] = useState<any[]>([]);
  const [brandedCalls, setBrandedCalls] = useState<any[]>([]);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [isVerificationDialogOpen, setIsVerificationDialogOpen] = useState(false);
  const [isBrandedDialogOpen, setIsBrandedDialogOpen] = useState(false);

  // Business Profile Form State
  const [businessName, setBusinessName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');

  // Verification Form State
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [verificationPhone, setVerificationPhone] = useState('');

  // Branded Call Form State
  const [brandedProfileId, setBrandedProfileId] = useState('');
  const [brandedPhone, setBrandedPhone] = useState('');
  const [displayNameShort, setDisplayNameShort] = useState('');
  const [displayNameLong, setDisplayNameLong] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [profilesData, verificationsData, brandedData] = await Promise.all([
      listBusinessProfiles(),
      listVerifications(),
      listBrandedCalls()
    ]);
    setProfiles(profilesData);
    setVerifications(verificationsData);
    setBrandedCalls(brandedData);
  };

  const handleCreateProfile = async () => {
    const result = await createBusinessProfile({
      business_name: businessName,
      business_registration_number: registrationNumber,
      business_address: address,
      city,
      state,
      zip_code: zipCode,
      country: 'US',
      contact_phone: contactPhone,
      website_url: websiteUrl
    });

    if (result) {
      setIsProfileDialogOpen(false);
      loadData();
      // Reset form
      setBusinessName('');
      setRegistrationNumber('');
      setAddress('');
      setCity('');
      setState('');
      setZipCode('');
      setContactPhone('');
      setWebsiteUrl('');
    }
  };

  const handleSubmitVerification = async () => {
    if (!selectedProfileId || !verificationPhone) return;
    const result = await submitVerification(selectedProfileId, verificationPhone);
    if (result) {
      setIsVerificationDialogOpen(false);
      loadData();
      setSelectedProfileId('');
      setVerificationPhone('');
    }
  };

  const handleSubmitBranded = async () => {
    if (!brandedProfileId || !brandedPhone || !displayNameShort || !displayNameLong) return;
    const result = await submitBrandedCall(brandedProfileId, brandedPhone, displayNameShort, displayNameLong);
    if (result) {
      setIsBrandedDialogOpen(false);
      loadData();
      setBrandedProfileId('');
      setBrandedPhone('');
      setDisplayNameShort('');
      setDisplayNameLong('');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800 gap-1"><CheckCircle className="h-3 w-3" />Approved</Badge>;
      case 'pending':
      case 'submitted':
        return <Badge className="bg-yellow-100 text-yellow-800 gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
      case 'draft':
        return <Badge variant="outline">Draft</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Business Verification Management
        </CardTitle>
        <CardDescription>
          Manage your business profile and apply for verified numbers and branded calling
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="profiles">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="profiles">Business Profiles</TabsTrigger>
            <TabsTrigger value="verified">Verified Numbers</TabsTrigger>
            <TabsTrigger value="branded">Branded Calls</TabsTrigger>
          </TabsList>

          <TabsContent value="profiles" className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Create a business profile to apply for verification services
              </p>
              <Dialog open={isProfileDialogOpen} onOpenChange={setIsProfileDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Building2 className="h-4 w-4" />
                    Create Profile
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create Business Profile</DialogTitle>
                    <DialogDescription>
                      Enter your business information exactly as it appears on official documents
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="businessName">Business Name *</Label>
                      <Input
                        id="businessName"
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder="Your Company Inc."
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="registrationNumber">Business Registration Number *</Label>
                      <Input
                        id="registrationNumber"
                        value={registrationNumber}
                        onChange={(e) => setRegistrationNumber(e.target.value)}
                        placeholder="123456789"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="address">Business Address *</Label>
                      <Input
                        id="address"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="123 Main Street"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="grid gap-2">
                        <Label htmlFor="city">City *</Label>
                        <Input
                          id="city"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder="New York"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="state">State *</Label>
                        <Input
                          id="state"
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                          placeholder="NY"
                          maxLength={2}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="zipCode">ZIP Code *</Label>
                        <Input
                          id="zipCode"
                          value={zipCode}
                          onChange={(e) => setZipCode(e.target.value)}
                          placeholder="10001"
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="contactPhone">Contact Phone (Physical Line) *</Label>
                      <Input
                        id="contactPhone"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        placeholder="+1234567890"
                      />
                      <p className="text-xs text-muted-foreground">VoIP numbers are not accepted</p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="websiteUrl">Website URL *</Label>
                      <Input
                        id="websiteUrl"
                        value={websiteUrl}
                        onChange={(e) => setWebsiteUrl(e.target.value)}
                        placeholder="https://yourcompany.com"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsProfileDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateProfile} disabled={isLoading}>
                      Create Profile
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-2">
              {profiles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No business profiles yet. Create one to get started.
                </div>
              ) : (
                profiles.map((profile) => (
                  <Card key={profile.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <h4 className="font-semibold flex items-center gap-2">
                            {profile.business_name}
                            {getStatusBadge(profile.status)}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            {profile.business_address}, {profile.city}, {profile.state} {profile.zip_code}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Registration: {profile.business_registration_number}
                          </p>
                        </div>
                      </div>
                      {profile.rejection_reason && (
                        <div className="mt-3 bg-red-50 border border-red-200 rounded p-2">
                          <p className="text-sm text-red-800">
                            <strong>Rejection Reason:</strong> {profile.rejection_reason}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="verified" className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Apply for phone number verification to remove "Spam Likely" labels
              </p>
              <Dialog open={isVerificationDialogOpen} onOpenChange={setIsVerificationDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2" disabled={profiles.length === 0}>
                    <Phone className="h-4 w-4" />
                    Apply for Verification
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Apply for Verified Number</DialogTitle>
                    <DialogDescription>
                      Select a business profile and phone number to verify. Takes 1-2 weeks for approval.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="profile">Business Profile *</Label>
                      <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a profile" />
                        </SelectTrigger>
                        <SelectContent>
                          {profiles.map((profile) => (
                            <SelectItem key={profile.id} value={profile.id}>
                              {profile.business_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="verificationPhone">Phone Number *</Label>
                      <Input
                        id="verificationPhone"
                        value={verificationPhone}
                        onChange={(e) => setVerificationPhone(e.target.value)}
                        placeholder="+1234567890"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsVerificationDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSubmitVerification} disabled={isLoading}>
                      Submit Application
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-2">
              {verifications.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No verification applications yet.
                </div>
              ) : (
                verifications.map((verification) => (
                  <Card key={verification.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <h4 className="font-semibold flex items-center gap-2">
                            {verification.phone_number}
                            {getStatusBadge(verification.status)}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            Submitted: {new Date(verification.submitted_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      {verification.rejection_reason && (
                        <div className="mt-3 bg-red-50 border border-red-200 rounded p-2">
                          <p className="text-sm text-red-800">
                            <strong>Rejection Reason:</strong> {verification.rejection_reason}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="branded" className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Display your business name when calling instead of just a phone number
              </p>
              <Dialog open={isBrandedDialogOpen} onOpenChange={setIsBrandedDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2" disabled={profiles.length === 0}>
                    <Building2 className="h-4 w-4" />
                    Apply for Branded Call
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Apply for Branded Call</DialogTitle>
                    <DialogDescription>
                      Display your business name on caller ID. Takes 1-2 weeks for approval.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="brandedProfile">Business Profile *</Label>
                      <Select value={brandedProfileId} onValueChange={setBrandedProfileId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a profile" />
                        </SelectTrigger>
                        <SelectContent>
                          {profiles.map((profile) => (
                            <SelectItem key={profile.id} value={profile.id}>
                              {profile.business_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="brandedPhone">Phone Number *</Label>
                      <Input
                        id="brandedPhone"
                        value={brandedPhone}
                        onChange={(e) => setBrandedPhone(e.target.value)}
                        placeholder="+1234567890"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="displayNameShort">Short Name (max 15 chars) *</Label>
                      <Input
                        id="displayNameShort"
                        value={displayNameShort}
                        onChange={(e) => setDisplayNameShort(e.target.value)}
                        maxLength={15}
                        placeholder="YourCompany"
                      />
                      <p className="text-xs text-muted-foreground">For Verizon</p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="displayNameLong">Long Name (max 32 chars) *</Label>
                      <Input
                        id="displayNameLong"
                        value={displayNameLong}
                        onChange={(e) => setDisplayNameLong(e.target.value)}
                        maxLength={32}
                        placeholder="Your Company Inc."
                      />
                      <p className="text-xs text-muted-foreground">For T-Mobile/AT&T</p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsBrandedDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSubmitBranded} disabled={isLoading}>
                      Submit Application
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-2">
              {brandedCalls.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No branded call applications yet.
                </div>
              ) : (
                brandedCalls.map((branded) => (
                  <Card key={branded.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <h4 className="font-semibold flex items-center gap-2">
                            {branded.phone_number}
                            {getStatusBadge(branded.status)}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            Display: {branded.display_name_long} / {branded.display_name_short}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Submitted: {new Date(branded.submitted_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      {branded.rejection_reason && (
                        <div className="mt-3 bg-red-50 border border-red-200 rounded p-2">
                          <p className="text-sm text-red-800">
                            <strong>Rejection Reason:</strong> {branded.rejection_reason}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-900">Next Steps</p>
              <p className="text-sm text-blue-800">
                After creating your profile and submitting applications here, Retell AI will review your information 
                and approve or reject your requests within 1-2 weeks. Check back regularly for status updates.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};