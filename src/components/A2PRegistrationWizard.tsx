import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle, AlertCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import { useTwilioA2PRegistration } from '@/hooks/useTwilioA2PRegistration';
import { useToast } from '@/hooks/use-toast';

type Step = 'intro' | 'business-profile' | 'submit-profile' | 'brand' | 'campaign' | 'complete';

interface BusinessProfileForm {
  friendlyName: string;
  email: string;
  businessName: string;
  businessType: string;
  businessWebsite: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  businessTaxId: string;
  businessIndustry: string;
}

interface BrandForm {
  displayName: string;
  companyName: string;
  ein: string;
  phone: string;
  vertical: string;
  website: string;
}

interface CampaignForm {
  usecase: string;
  usecaseDescription: string;
  messageFlow: string;
  optInMessage: string;
  optOutMessage: string;
  helpMessage: string;
}

const A2PRegistrationWizard = () => {
  const [currentStep, setCurrentStep] = useState<Step>('intro');
  const [profileSid, setProfileSid] = useState('');
  const [brandSid, setBrandSid] = useState('');
  const [campaignSid, setCampaignSid] = useState('');
  
  const [businessProfile, setBusinessProfile] = useState<BusinessProfileForm>({
    friendlyName: '',
    email: '',
    businessName: '',
    businessType: 'llc',
    businessWebsite: '',
    street: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
    businessTaxId: '',
    businessIndustry: 'TECHNOLOGY'
  });

  const [brand, setBrand] = useState<BrandForm>({
    displayName: '',
    companyName: '',
    ein: '',
    phone: '',
    vertical: 'TECHNOLOGY',
    website: ''
  });

  const [campaign, setCampaign] = useState<CampaignForm>({
    usecase: 'MIXED',
    usecaseDescription: '',
    messageFlow: '',
    optInMessage: 'Reply YES to subscribe',
    optOutMessage: 'Reply STOP to unsubscribe',
    helpMessage: 'Reply HELP for assistance'
  });

  const { toast } = useToast();
  const a2p = useTwilioA2PRegistration();

  const steps: { id: Step; title: string; description: string }[] = [
    { id: 'intro', title: 'Introduction', description: 'Learn about A2P 10DLC' },
    { id: 'business-profile', title: 'Business Profile', description: 'Submit business information' },
    { id: 'submit-profile', title: 'Verification', description: 'Submit for Twilio approval' },
    { id: 'brand', title: 'Brand Registration', description: 'Register your brand ($4 fee)' },
    { id: 'campaign', title: 'Campaign Setup', description: 'Create messaging campaign' },
    { id: 'complete', title: 'Complete', description: 'Registration complete' }
  ];

  const getCurrentStepIndex = () => steps.findIndex(s => s.id === currentStep);
  const progress = ((getCurrentStepIndex() + 1) / steps.length) * 100;

  const handleCreateBusinessProfile = async () => {
    try {
      const result = await a2p.createBusinessProfile({
        friendlyName: businessProfile.friendlyName,
        email: businessProfile.email,
        businessName: businessProfile.businessName,
        businessType: businessProfile.businessType,
        businessWebsite: businessProfile.businessWebsite,
        businessAddress: {
          street: businessProfile.street,
          city: businessProfile.city,
          state: businessProfile.state,
          postalCode: businessProfile.postalCode,
          country: businessProfile.country
        },
        businessIdentity: {
          businessTaxId: businessProfile.businessTaxId,
          businessIndustry: businessProfile.businessIndustry
        }
      });

      setProfileSid(result.profile.sid);
      setCurrentStep('submit-profile');
    } catch (error) {
      console.error('Profile creation failed:', error);
    }
  };

  const handleSubmitProfile = async () => {
    try {
      await a2p.submitBusinessProfile(profileSid);
      setCurrentStep('brand');
    } catch (error) {
      console.error('Profile submission failed:', error);
    }
  };

  const handleRegisterBrand = async () => {
    try {
      const result = await a2p.registerBrand({
        customerProfileSid: profileSid,
        displayName: brand.displayName,
        companyName: brand.companyName,
        ein: brand.ein,
        phone: brand.phone,
        vertical: brand.vertical,
        website: brand.website
      });

      setBrandSid(result.brand.sid);
      setCurrentStep('campaign');
    } catch (error) {
      console.error('Brand registration failed:', error);
    }
  };

  const handleCreateCampaign = async () => {
    try {
      const result = await a2p.createCampaign({
        brandSid: brandSid,
        usecase: campaign.usecase,
        usecaseDescription: campaign.usecaseDescription,
        messageFlow: campaign.messageFlow,
        optInMessage: campaign.optInMessage,
        optOutMessage: campaign.optOutMessage,
        helpMessage: campaign.helpMessage
      });

      setCampaignSid(result.campaign.sid);
      setCurrentStep('complete');
    } catch (error) {
      console.error('Campaign creation failed:', error);
    }
  };

  const renderStepIndicator = () => (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        {steps.map((step, index) => {
          const isComplete = index < getCurrentStepIndex();
          const isCurrent = step.id === currentStep;
          
          return (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                  isComplete ? 'bg-primary border-primary text-primary-foreground' :
                  isCurrent ? 'border-primary text-primary' :
                  'border-muted text-muted-foreground'
                }`}>
                  {isComplete ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </div>
                <div className="mt-2 text-center">
                  <p className={`text-xs font-medium ${isCurrent ? 'text-primary' : 'text-muted-foreground'}`}>
                    {step.title}
                  </p>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className={`h-0.5 flex-1 ${
                  isComplete ? 'bg-primary' : 'bg-muted'
                }`} />
              )}
            </div>
          );
        })}
      </div>
      <Progress value={progress} className="h-2" />
    </div>
  );

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>A2P 10DLC Registration Wizard</CardTitle>
          <CardDescription>
            Complete registration for Application-to-Person messaging compliance
          </CardDescription>
        </CardHeader>
        <CardContent>
          {renderStepIndicator()}

          {/* Introduction Step */}
          {currentStep === 'intro' && (
            <div className="space-y-6">
              <div className="p-6 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <h3 className="text-lg font-semibold mb-4">What is A2P 10DLC?</h3>
                <p className="text-sm mb-4">
                  A2P 10DLC (Application-to-Person 10-Digit Long Code) is a system in the United States 
                  that allows businesses to send Application-to-Person (A2P) messaging via standard 10-digit 
                  long code (10DLC) phone numbers.
                </p>
                <ul className="text-sm space-y-2 list-disc list-inside">
                  <li>Required for all business SMS messaging in the US</li>
                  <li>Improves message deliverability and reduces spam filtering</li>
                  <li>Provides higher throughput than unregistered numbers</li>
                  <li>One-time $4 brand registration fee + monthly carrier fees</li>
                </ul>
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold">Registration Process (3-5 business days)</h4>
                <div className="grid gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <Badge className="mt-1">1</Badge>
                        <div>
                          <h5 className="font-medium mb-1">Business Profile</h5>
                          <p className="text-sm text-muted-foreground">
                            Create a Trust Hub profile with your business information
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <Badge className="mt-1">2</Badge>
                        <div>
                          <h5 className="font-medium mb-1">Brand Registration ($4)</h5>
                          <p className="text-sm text-muted-foreground">
                            Register your brand with The Campaign Registry (TCR)
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <Badge className="mt-1">3</Badge>
                        <div>
                          <h5 className="font-medium mb-1">Campaign Setup</h5>
                          <p className="text-sm text-muted-foreground">
                            Create a messaging campaign describing your use case
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button onClick={() => setCurrentStep('business-profile')}>
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Business Profile Step */}
          {currentStep === 'business-profile' && (
            <div className="space-y-6">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="friendlyName">Profile Name *</Label>
                  <Input
                    id="friendlyName"
                    value={businessProfile.friendlyName}
                    onChange={(e) => setBusinessProfile({ ...businessProfile, friendlyName: e.target.value })}
                    placeholder="My Business Profile"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="email">Contact Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={businessProfile.email}
                    onChange={(e) => setBusinessProfile({ ...businessProfile, email: e.target.value })}
                    placeholder="contact@business.com"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="businessName">Business Legal Name *</Label>
                  <Input
                    id="businessName"
                    value={businessProfile.businessName}
                    onChange={(e) => setBusinessProfile({ ...businessProfile, businessName: e.target.value })}
                    placeholder="Acme Corporation"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="businessType">Business Type *</Label>
                  <Select
                    value={businessProfile.businessType}
                    onValueChange={(value) => setBusinessProfile({ ...businessProfile, businessType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="llc">LLC</SelectItem>
                      <SelectItem value="corporation">Corporation</SelectItem>
                      <SelectItem value="partnership">Partnership</SelectItem>
                      <SelectItem value="sole_proprietor">Sole Proprietor</SelectItem>
                      <SelectItem value="non_profit">Non-Profit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="businessWebsite">Business Website</Label>
                  <Input
                    id="businessWebsite"
                    value={businessProfile.businessWebsite}
                    onChange={(e) => setBusinessProfile({ ...businessProfile, businessWebsite: e.target.value })}
                    placeholder="https://www.business.com"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="businessTaxId">EIN (Tax ID) *</Label>
                  <Input
                    id="businessTaxId"
                    value={businessProfile.businessTaxId}
                    onChange={(e) => setBusinessProfile({ ...businessProfile, businessTaxId: e.target.value })}
                    placeholder="XX-XXXXXXX"
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Business Address *</Label>
                  <Input
                    value={businessProfile.street}
                    onChange={(e) => setBusinessProfile({ ...businessProfile, street: e.target.value })}
                    placeholder="Street Address"
                    className="mb-2"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={businessProfile.city}
                      onChange={(e) => setBusinessProfile({ ...businessProfile, city: e.target.value })}
                      placeholder="City"
                    />
                    <Input
                      value={businessProfile.state}
                      onChange={(e) => setBusinessProfile({ ...businessProfile, state: e.target.value })}
                      placeholder="State"
                      maxLength={2}
                    />
                  </div>
                  <Input
                    value={businessProfile.postalCode}
                    onChange={(e) => setBusinessProfile({ ...businessProfile, postalCode: e.target.value })}
                    placeholder="Postal Code"
                    className="mt-2"
                  />
                </div>
              </div>

              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={() => setCurrentStep('intro')}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button 
                  onClick={handleCreateBusinessProfile}
                  disabled={a2p.isLoading || !businessProfile.friendlyName || !businessProfile.email || !businessProfile.businessName}
                >
                  Create Profile
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Submit Profile Step */}
          {currentStep === 'submit-profile' && (
            <div className="space-y-6">
              <div className="p-6 bg-green-50 dark:bg-green-950 rounded-lg">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <h4 className="font-semibold mb-2">Business Profile Created</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Profile SID: <code className="text-xs bg-background px-1 py-0.5 rounded">{profileSid}</code>
                    </p>
                    <p className="text-sm">
                      Your business profile has been created. Now submit it to Twilio for verification.
                      This typically takes 24-48 hours.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold mb-2">⏱️ What happens next?</h4>
                <ul className="text-sm space-y-2 list-disc list-inside">
                  <li>Twilio will review your business information</li>
                  <li>You'll receive an email when verification is complete</li>
                  <li>Typical turnaround time is 1-2 business days</li>
                  <li>Once approved, you can proceed to brand registration</li>
                </ul>
              </div>

              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={() => setCurrentStep('business-profile')}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button onClick={handleSubmitProfile} disabled={a2p.isLoading}>
                  Submit for Verification
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Brand Registration Step */}
          {currentStep === 'brand' && (
            <div className="space-y-6">
              <div className="p-4 bg-amber-50 dark:bg-amber-950 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold mb-1">Registration Fee: $4</p>
                    <p className="text-sm">
                      One-time fee charged by The Campaign Registry (TCR) for brand registration
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="displayName">Brand Display Name *</Label>
                  <Input
                    id="displayName"
                    value={brand.displayName}
                    onChange={(e) => setBrand({ ...brand, displayName: e.target.value })}
                    placeholder="Acme Corp"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="companyName">Company Legal Name *</Label>
                  <Input
                    id="companyName"
                    value={brand.companyName}
                    onChange={(e) => setBrand({ ...brand, companyName: e.target.value })}
                    placeholder="Acme Corporation"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="ein">EIN *</Label>
                  <Input
                    id="ein"
                    value={brand.ein}
                    onChange={(e) => setBrand({ ...brand, ein: e.target.value })}
                    placeholder="XX-XXXXXXX"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="phone">Business Phone *</Label>
                  <Input
                    id="phone"
                    value={brand.phone}
                    onChange={(e) => setBrand({ ...brand, phone: e.target.value })}
                    placeholder="+1234567890"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="vertical">Industry Vertical *</Label>
                  <Select
                    value={brand.vertical}
                    onValueChange={(value) => setBrand({ ...brand, vertical: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TECHNOLOGY">Technology</SelectItem>
                      <SelectItem value="HEALTHCARE">Healthcare</SelectItem>
                      <SelectItem value="FINANCE">Finance</SelectItem>
                      <SelectItem value="RETAIL">Retail</SelectItem>
                      <SelectItem value="EDUCATION">Education</SelectItem>
                      <SelectItem value="HOSPITALITY">Hospitality</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="website">Website *</Label>
                  <Input
                    id="website"
                    value={brand.website}
                    onChange={(e) => setBrand({ ...brand, website: e.target.value })}
                    placeholder="https://www.business.com"
                  />
                </div>
              </div>

              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={() => setCurrentStep('submit-profile')}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button 
                  onClick={handleRegisterBrand}
                  disabled={a2p.isLoading || !brand.displayName || !brand.companyName}
                >
                  Register Brand ($4)
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Campaign Step */}
          {currentStep === 'campaign' && (
            <div className="space-y-6">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="usecase">Campaign Use Case *</Label>
                  <Select
                    value={campaign.usecase}
                    onValueChange={(value) => setCampaign({ ...campaign, usecase: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MIXED">Mixed (Multiple purposes)</SelectItem>
                      <SelectItem value="MARKETING">Marketing</SelectItem>
                      <SelectItem value="ACCOUNT_NOTIFICATION">Account Notifications</SelectItem>
                      <SelectItem value="2FA">Two-Factor Authentication</SelectItem>
                      <SelectItem value="CUSTOMER_CARE">Customer Care</SelectItem>
                      <SelectItem value="DELIVERY_NOTIFICATION">Delivery Notifications</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="usecaseDescription">Use Case Description *</Label>
                  <Textarea
                    id="usecaseDescription"
                    value={campaign.usecaseDescription}
                    onChange={(e) => setCampaign({ ...campaign, usecaseDescription: e.target.value })}
                    placeholder="Describe how you'll use SMS messaging..."
                    rows={4}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="messageFlow">Message Flow</Label>
                  <Textarea
                    id="messageFlow"
                    value={campaign.messageFlow}
                    onChange={(e) => setCampaign({ ...campaign, messageFlow: e.target.value })}
                    placeholder="Describe the typical message flow..."
                    rows={3}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="optInMessage">Opt-In Message *</Label>
                  <Input
                    id="optInMessage"
                    value={campaign.optInMessage}
                    onChange={(e) => setCampaign({ ...campaign, optInMessage: e.target.value })}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="optOutMessage">Opt-Out Message *</Label>
                  <Input
                    id="optOutMessage"
                    value={campaign.optOutMessage}
                    onChange={(e) => setCampaign({ ...campaign, optOutMessage: e.target.value })}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="helpMessage">Help Message *</Label>
                  <Input
                    id="helpMessage"
                    value={campaign.helpMessage}
                    onChange={(e) => setCampaign({ ...campaign, helpMessage: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={() => setCurrentStep('brand')}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button 
                  onClick={handleCreateCampaign}
                  disabled={a2p.isLoading || !campaign.usecaseDescription}
                >
                  Create Campaign
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Complete Step */}
          {currentStep === 'complete' && (
            <div className="space-y-6">
              <div className="text-center py-12">
                <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="text-2xl font-bold mb-2">Registration Complete!</h3>
                <p className="text-muted-foreground mb-6">
                  Your A2P 10DLC registration has been submitted successfully
                </p>

                <div className="grid gap-4 max-w-md mx-auto text-left">
                  <Card>
                    <CardContent className="pt-6">
                      <p className="text-sm font-medium mb-1">Profile SID</p>
                      <code className="text-xs bg-accent px-2 py-1 rounded">{profileSid}</code>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <p className="text-sm font-medium mb-1">Brand SID</p>
                      <code className="text-xs bg-accent px-2 py-1 rounded">{brandSid}</code>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <p className="text-sm font-medium mb-1">Campaign SID</p>
                      <code className="text-xs bg-accent px-2 py-1 rounded">{campaignSid}</code>
                    </CardContent>
                  </Card>
                </div>

                <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg text-left max-w-md mx-auto">
                  <h4 className="font-semibold mb-2">📧 Next Steps</h4>
                  <ul className="text-sm space-y-1 list-disc list-inside">
                    <li>You'll receive email updates on registration status</li>
                    <li>Brand verification typically takes 1-2 business days</li>
                    <li>Once approved, assign phone numbers to your campaign</li>
                    <li>Monitor your campaign performance in the dashboard</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default A2PRegistrationWizard;
