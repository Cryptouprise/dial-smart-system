import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  MoreVertical, 
  CheckCircle, 
  AlertCircle, 
  Shield, 
  MessageSquare,
  Phone,
  ShoppingCart,
  Upload,
  Loader2,
  ExternalLink
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
  };
  onRefresh?: () => void;
}

const PhoneNumberRow = ({ number, onRefresh }: PhoneNumberRowProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [actionType, setActionType] = useState<string | null>(null);
  const { toast } = useToast();

  // Determine if number was purchased or imported based on retell_phone_id
  const isPurchased = !!number.retell_phone_id;
  const source = isPurchased ? 'Purchased' : 'Imported';
  
  // Determine carrier - default to checking if it looks like Twilio number
  const carrier = number.carrier_name || (number.number.startsWith('+1') ? 'Unknown' : 'Unknown');
  
  // Check registration statuses
  const hasStirShaken = number.stir_shaken_attestation && number.stir_shaken_attestation !== '';
  const stirShakenLevel = number.stir_shaken_attestation;

  const handlePushToStirShaken = async () => {
    setIsLoading(true);
    setActionType('stirshaken');
    
    try {
      // First list available profiles
      const { data: profileData, error: profileError } = await supabase.functions.invoke('enhanced-spam-lookup', {
        body: { listApprovedProfiles: true }
      });

      if (profileError) throw profileError;

      if (!profileData?.approvedProfiles?.length) {
        toast({
          title: "No Eligible Profiles",
          description: "You need an approved SHAKEN Business Profile in Twilio Trust Hub. Go to Twilio Console → Trust Hub to create one.",
          variant: "destructive"
        });
        return;
      }

      // Try to transfer to first available profile
      const profile = profileData.approvedProfiles[0];
      const { data, error } = await supabase.functions.invoke('enhanced-spam-lookup', {
        body: { 
          transferToProfile: true, 
          phoneNumber: number.number,
          customerProfileSid: profile.sid
        }
      });

      if (error) {
        // Parse error for helpful message
        let errorData: any = null;
        try {
          if (error.context?.body) {
            errorData = JSON.parse(error.context.body);
          }
        } catch {}

        if (errorData?.incompleteSetup) {
          toast({
            title: "Trust Hub Setup Incomplete",
            description: "Complete all required entities in Twilio Trust Hub before assigning numbers.",
            variant: "destructive"
          });
        } else if (errorData?.needsVoiceIntegrity) {
          toast({
            title: "SHAKEN Profile Required",
            description: "This requires a SHAKEN Business Profile for voice. Complete Trust Hub setup first.",
            variant: "destructive"
          });
        } else {
          toast({
            title: "Assignment Failed",
            description: errorData?.error || error.message,
            variant: "destructive"
          });
        }
        return;
      }

      toast({
        title: "Success",
        description: `${number.number} assigned to STIR/SHAKEN profile`,
      });

      onRefresh?.();
    } catch (error: any) {
      console.error('STIR/SHAKEN push failed:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to push to STIR/SHAKEN",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
      setActionType(null);
    }
  };

  const handlePushToA2P = async () => {
    setIsLoading(true);
    setActionType('a2p');
    
    try {
      // A2P 10DLC registration typically goes through Twilio
      toast({
        title: "A2P Registration",
        description: "A2P 10DLC registration must be completed in Twilio Console. Opening Trust Hub...",
      });
      
      // Open Twilio Trust Hub in new tab
      window.open('https://console.twilio.com/us1/develop/trust-hub/customer-profiles', '_blank');
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
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
        toast({
          title: "Number Profile Found",
          description: `Assigned to: ${data.profile.friendlyName || data.profile.trustProductSid}`,
        });
      } else {
        toast({
          title: "Not Assigned",
          description: "This number is not currently assigned to any Trust Product",
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

  return (
    <div className="p-3 flex items-center justify-between hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Phone Number */}
        <span className="font-mono text-sm font-medium">{number.number}</span>
        
        {/* Source Badge */}
        <Badge variant="outline" className="text-xs gap-1">
          {isPurchased ? <ShoppingCart className="h-3 w-3" /> : <Upload className="h-3 w-3" />}
          {source}
        </Badge>
        
        {/* Carrier Badge */}
        {carrier && carrier !== 'Unknown' && (
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MoreVertical className="h-4 w-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={handleCheckStatus} disabled={isLoading}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Check Registration Status
            </DropdownMenuItem>
            
            <DropdownMenuSeparator />
            
            <DropdownMenuItem onClick={handlePushToStirShaken} disabled={isLoading || hasStirShaken}>
              <Shield className="h-4 w-4 mr-2" />
              {hasStirShaken ? 'Already STIR/SHAKEN' : 'Push to STIR/SHAKEN'}
            </DropdownMenuItem>
            
            <DropdownMenuItem onClick={handlePushToA2P} disabled={isLoading}>
              <MessageSquare className="h-4 w-4 mr-2" />
              Register for A2P 10DLC
            </DropdownMenuItem>
            
            <DropdownMenuSeparator />
            
            <DropdownMenuItem asChild>
              <a 
                href="https://console.twilio.com/us1/develop/trust-hub" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Twilio Trust Hub
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default PhoneNumberRow;
