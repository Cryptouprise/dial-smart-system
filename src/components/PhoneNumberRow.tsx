import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { 
  MoreVertical, 
  CheckCircle, 
  AlertCircle, 
  Shield, 
  MessageSquare,
  ShoppingCart,
  Upload,
  Loader2,
  ExternalLink,
  Plus,
  Info,
  RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface PhoneNumberRowProps {
  number: {
    id: string;
    number: string;
    carrier_name?: string;
    stir_shaken_attestation?: string;
    line_type?: string;
    retell_phone_id?: string;
    is_voip?: boolean;
    created_at?: string;
    provider?: 'twilio' | 'retell' | 'telnyx' | 'unknown';
  };
  onRefresh?: () => void;
}

interface TrustProfile {
  sid: string;
  friendlyName: string;
  status: string;
  type: string;
}

const PhoneNumberRow = ({ number, onRefresh }: PhoneNumberRowProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [actionType, setActionType] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<TrustProfile[]>([]);
  const [currentAssignment, setCurrentAssignment] = useState<any>(null);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const { toast } = useToast();

  // Determine provider - prioritize explicit provider, then infer from retell_phone_id
  const provider = number.provider || (number.retell_phone_id ? 'retell' : 'twilio');
  
  // Determine if number was purchased or imported based on retell_phone_id
  const isPurchased = !!number.retell_phone_id;
  const source = isPurchased ? 'Purchased' : 'Imported';
  
  // Determine carrier
  const carrier = number.carrier_name || null;
  
  // Check registration statuses
  const hasStirShaken = number.stir_shaken_attestation && number.stir_shaken_attestation !== '';
  const stirShakenLevel = number.stir_shaken_attestation;
  
  // Provider badge config
  const getProviderBadge = () => {
    switch (provider) {
      case 'retell':
        return { label: 'Retell AI', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' };
      case 'telnyx':
        return { label: 'Telnyx', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' };
      case 'twilio':
      default:
        return { label: 'Twilio', className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' };
    }
  };
  
  const providerBadge = getProviderBadge();

  // Load available profiles when dropdown opens
  const loadProfiles = async () => {
    if (profiles.length > 0) return; // Already loaded
    
    setIsLoadingProfiles(true);
    try {
      const { data, error } = await supabase.functions.invoke('enhanced-spam-lookup', {
        body: { listApprovedProfiles: true }
      });

      if (error) throw error;
      
      setProfiles(data?.approvedProfiles || []);
    } catch (error: any) {
      console.error('Failed to load profiles:', error);
    } finally {
      setIsLoadingProfiles(false);
    }
  };

  const handleAssignToProfile = async (profile: TrustProfile) => {
    setIsLoading(true);
    setActionType('assign');
    
    try {
      const { data, error } = await supabase.functions.invoke('enhanced-spam-lookup', {
        body: { 
          transferToProfile: true, 
          phoneNumber: number.number,
          customerProfileSid: profile.sid
        }
      });

      if (error) {
        // Parse error body from various possible locations
        let errorData: any = null;
        try {
          if (typeof error === 'object' && error.context?.body) {
            errorData = typeof error.context.body === 'string' 
              ? JSON.parse(error.context.body) 
              : error.context.body;
          } else if (error.message) {
            // Try parsing error message as JSON
            try {
              errorData = JSON.parse(error.message);
            } catch {
              errorData = { error: error.message };
            }
          }
        } catch (parseErr) {
          console.error('Error parsing response:', parseErr);
        }

        if (errorData?.incompleteSetup) {
          toast({
            title: "Trust Hub Setup Incomplete",
            description: errorData.error || "Complete all required entities in Twilio Trust Hub before assigning numbers.",
            variant: "destructive",
            duration: 10000
          });
          // Open help link
          if (errorData.helpUrl) {
            window.open(errorData.helpUrl, '_blank');
          }
        } else if (errorData?.needsVoiceIntegrity) {
          toast({
            title: "SHAKEN Profile Required",
            description: "This profile type doesn't support phone assignments. Use a SHAKEN Business Profile.",
            variant: "destructive"
          });
        } else {
          toast({
            title: "Assignment Failed",
            description: errorData?.error || errorData?.details || error.message || "Unknown error occurred",
            variant: "destructive"
          });
        }
        return;
      }

      // Check if data contains an error (for 200 responses with error info)
      if (data?.error) {
        toast({
          title: data.incompleteSetup ? "Trust Hub Setup Incomplete" : "Assignment Issue",
          description: data.error,
          variant: "destructive",
          duration: 10000
        });
        if (data.helpUrl) {
          window.open(data.helpUrl, '_blank');
        }
        return;
      }

      toast({
        title: "Number Assigned",
        description: `${number.number} added to "${profile.friendlyName}"`,
      });

      onRefresh?.();
    } catch (error: any) {
      console.error('Assignment failed:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to assign number",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
      setActionType(null);
    }
  };

  const handleCheckStatus = async () => {
    setIsLoading(true);
    setActionType('check');
    
    try {
      const { data, error } = await supabase.functions.invoke('enhanced-spam-lookup', {
        body: { 
          checkNumberProfile: true,
          phoneNumber: number.number
        }
      });

      if (error) throw error;

      if (data?.profile) {
        setCurrentAssignment(data.profile);
        toast({
          title: "Currently Assigned",
          description: `Profile: ${data.profile.friendlyName || data.profile.trustProductSid}`,
        });
      } else if (data?.assignments?.length > 0) {
        toast({
          title: "Assignment Found",
          description: `Assigned to ${data.assignments.length} profile(s)`,
        });
      } else {
        toast({
          title: "Not Assigned",
          description: "This number is not assigned to any Trust Product or Campaign",
        });
      }

      onRefresh?.();
    } catch (error: any) {
      toast({
        title: "Check Failed",
        description: error.message || "Could not check number status",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
      setActionType(null);
    }
  };

  const handleOpenA2PRegistration = () => {
    toast({
      title: "Opening A2P Registration",
      description: "You'll be redirected to Twilio to complete A2P 10DLC registration",
    });
    window.open('https://console.twilio.com/us1/develop/sms/regulatory-compliance/messaging-campaigns', '_blank');
  };

  const handleOpenMessagingServices = () => {
    window.open('https://console.twilio.com/us1/develop/sms/services', '_blank');
  };

  return (
    <div className="p-3 flex items-center justify-between hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Phone Number */}
        <span className="font-mono text-sm font-medium">{number.number}</span>
        
        {/* Provider Badge - Most Important */}
        <Badge className={`text-xs font-medium ${providerBadge.className}`}>
          {providerBadge.label}
        </Badge>
        
        {/* Source Badge */}
        <Badge variant="outline" className="text-xs gap-1">
          {isPurchased ? <ShoppingCart className="h-3 w-3" /> : <Upload className="h-3 w-3" />}
          {source}
        </Badge>
        
        {/* Carrier Badge */}
        {carrier && (
          <Badge variant="secondary" className="text-xs">
            {carrier}
          </Badge>
        )}
        
        {/* Line Type */}
        {number.line_type && (
          <Badge variant="outline" className="text-xs capitalize">
            {number.line_type}
          </Badge>
        )}
      </div>
      
      <div className="flex items-center gap-2">
        {/* STIR/SHAKEN Status */}
        {stirShakenLevel === 'A' ? (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 gap-1">
            <Shield className="h-3 w-3" />
            SHAKEN A
          </Badge>
        ) : stirShakenLevel === 'B' ? (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 gap-1">
            <Shield className="h-3 w-3" />
            SHAKEN B
          </Badge>
        ) : stirShakenLevel === 'C' ? (
          <Badge variant="secondary" className="gap-1">
            <Shield className="h-3 w-3" />
            SHAKEN C
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <AlertCircle className="h-3 w-3" />
            No SHAKEN
          </Badge>
        )}

        {/* 3-dot Menu */}
        <DropdownMenu onOpenChange={(open) => open && loadProfiles()}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MoreVertical className="h-4 w-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {/* Status Section */}
            <DropdownMenuLabel className="text-xs text-muted-foreground">Status</DropdownMenuLabel>
            <DropdownMenuItem onClick={handleCheckStatus} disabled={isLoading}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Check Current Assignment
            </DropdownMenuItem>
            
            <DropdownMenuSeparator />
            
            {/* STIR/SHAKEN Section */}
            <DropdownMenuLabel className="text-xs text-muted-foreground">STIR/SHAKEN (Voice)</DropdownMenuLabel>
            
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={isLoading}>
                <Shield className="h-4 w-4 mr-2" />
                Add to SHAKEN Campaign
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                {isLoadingProfiles ? (
                  <DropdownMenuItem disabled>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading profiles...
                  </DropdownMenuItem>
                ) : profiles.length === 0 ? (
                  <DropdownMenuItem disabled>
                    <AlertCircle className="h-4 w-4 mr-2" />
                    No approved profiles found
                  </DropdownMenuItem>
                ) : (
                  profiles.map((profile) => (
                    <DropdownMenuItem 
                      key={profile.sid}
                      onClick={() => handleAssignToProfile(profile)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      <div className="flex flex-col">
                        <span className="text-sm truncate max-w-[180px]">
                          {profile.friendlyName || profile.sid.slice(0, 15) + '...'}
                        </span>
                        <span className="text-xs text-muted-foreground capitalize">
                          {profile.type?.replace('_', ' ')}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  ))
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a 
                    href="https://console.twilio.com/us1/develop/trust-hub/business-profiles" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Create New Profile
                  </a>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />
            
            {/* A2P Section */}
            <DropdownMenuLabel className="text-xs text-muted-foreground">A2P 10DLC (SMS)</DropdownMenuLabel>
            
            <DropdownMenuItem onClick={handleOpenMessagingServices}>
              <Plus className="h-4 w-4 mr-2" />
              Add to Messaging Service
            </DropdownMenuItem>
            
            <DropdownMenuItem onClick={handleOpenA2PRegistration}>
              <MessageSquare className="h-4 w-4 mr-2" />
              Register A2P Campaign
            </DropdownMenuItem>
            
            <DropdownMenuSeparator />
            
            {/* Help Links */}
            <DropdownMenuLabel className="text-xs text-muted-foreground">Resources</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <a 
                href="https://console.twilio.com/us1/develop/trust-hub" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Twilio Trust Hub
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a 
                href="https://www.twilio.com/docs/voice/trusted-calling-with-shakenstir" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center"
              >
                <Info className="h-4 w-4 mr-2" />
                STIR/SHAKEN Guide
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default PhoneNumberRow;
