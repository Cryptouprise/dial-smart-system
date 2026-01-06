import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Copy, 
  Check, 
  Variable, 
  Phone, 
  MessageSquare,
  Bot,
  Clipboard,
  ChevronDown,
  ChevronRight,
  User,
  Building,
  MapPin,
  Clock,
  FileText,
  History,
  PhoneOff,
  Voicemail
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Clickable variable categories
const VARIABLE_CATEGORIES = [
  {
    id: 'lead',
    label: 'Lead Information',
    icon: User,
    variables: [
      { key: 'first_name', label: 'First Name', description: "Lead's first name" },
      { key: 'last_name', label: 'Last Name', description: "Lead's last name" },
      { key: 'full_name', label: 'Full Name', description: 'First + last name combined' },
      { key: 'email', label: 'Email', description: "Lead's email address" },
      { key: 'phone', label: 'Phone', description: "Lead's phone number" },
      { key: 'company', label: 'Company', description: "Lead's company name" },
      { key: 'lead_source', label: 'Lead Source', description: 'How the lead was acquired' },
      { key: 'tags', label: 'Tags', description: 'Lead tags (comma separated)' },
      { key: 'notes', label: 'Notes', description: 'Previous call notes and history' },
    ]
  },
  {
    id: 'address',
    label: 'Address Fields',
    icon: MapPin,
    variables: [
      { key: 'address', label: 'Street Address', description: "Lead's street address" },
      { key: 'address1', label: 'Address Line 1', description: 'Street address' },
      { key: 'address2', label: 'Address Line 2', description: 'Apt/Suite/Unit' },
      { key: 'city', label: 'City', description: 'City name' },
      { key: 'state', label: 'State', description: 'State/Province' },
      { key: 'zip_code', label: 'ZIP Code', description: 'Postal/ZIP code' },
      { key: 'postal_code', label: 'Postal Code', description: 'Postal/ZIP code (alias)' },
      { key: 'country', label: 'Country', description: 'Country' },
      { key: 'full_address', label: 'Full Address', description: 'Complete formatted address' },
    ]
  },
  {
    id: 'time',
    label: 'Time & Date',
    icon: Clock,
    variables: [
      { key: 'current_time', label: 'Current Time', description: "Current date/time in lead's timezone" },
      { key: 'current_day_of_week', label: 'Current Day', description: 'Current day (Monday, Tuesday, etc.)' },
      { key: 'timezone', label: 'Timezone', description: "Lead's timezone" },
      { key: 'preferred_contact_time', label: 'Preferred Contact Time', description: 'Best time to call' },
    ]
  },
  {
    id: 'callback',
    label: 'Callback Detection',
    icon: History,
    variables: [
      { key: 'is_callback', label: 'Is Callback', description: '"true" or "false" - indicates if this is a callback' },
      { key: 'callback_context', label: 'Callback Context', description: 'Context message if this is a callback' },
      { key: 'previous_conversation', label: 'Previous Conversation', description: 'Summary of the last call' },
      { key: 'last_call_date', label: 'Last Call Date', description: 'When the last call occurred' },
      { key: 'previous_outcome', label: 'Previous Outcome', description: 'What happened on the last call' },
    ]
  },
  {
    id: 'custom',
    label: 'Custom Fields',
    icon: FileText,
    variables: [
      { key: 'renter', label: 'Renter', description: 'If the lead is a renter' },
      { key: 'utility_provider', label: 'Utility Provider', description: 'Current utility provider' },
      { key: 'monthly_bill', label: 'Monthly Bill', description: 'Average monthly utility bill' },
      { key: 'homeowner', label: 'Homeowner', description: 'If the lead is a homeowner' },
      { key: 'credit_score_range', label: 'Credit Score Range', description: 'Approximate credit score range' },
      { key: 'property_type', label: 'Property Type', description: 'Type of property' },
      { key: 'roof_age', label: 'Roof Age', description: 'Age of the roof' },
      { key: 'interest_level', label: 'Interest Level', description: 'Lead interest level' },
    ]
  },
  {
    id: 'ghl',
    label: 'GHL Contact Fields',
    icon: Building,
    variables: [
      { key: 'contact.first_name', label: 'Contact First Name', description: "Contact's first name (GHL)" },
      { key: 'contact.last_name', label: 'Contact Last Name', description: "Contact's last name (GHL)" },
      { key: 'contact.email', label: 'Contact Email', description: "Contact's email (GHL)" },
      { key: 'contact.company', label: 'Contact Company', description: "Contact's company (GHL)" },
      { key: 'contact.address1', label: 'Contact Address 1', description: "Contact's street address (GHL)" },
      { key: 'contact.city', label: 'Contact City', description: "Contact's city (GHL)" },
      { key: 'contact.state', label: 'Contact State', description: "Contact's state (GHL)" },
      { key: 'contact.zip', label: 'Contact ZIP', description: "Contact's ZIP code (GHL)" },
    ]
  },
];

const CALLBACK_CAPABILITY_TEMPLATE = `## CALLBACK CAPABILITY
You CAN schedule callbacks. This is one of your core capabilities.

When someone asks to be called back later:
1. Confirm the exact time: "I'll call you back in [X] minutes"
2. Be specific and confident about scheduling
3. Thank them warmly and end the call positively

Example responses:
- "Absolutely! I'll give you a call back in 10 minutes. Talk soon!"
- "No problem at all! I'll reach out again in about an hour. Have a great day!"
- "Perfect, I've got you down for a callback in 15 minutes. We'll chat then!"

IMPORTANT: Never say "I can't schedule callbacks" or "I don't have that capability."
You DO have callback scheduling capability - just confirm the time naturally.`;

const CALLBACK_HANDLING_TEMPLATE = `## CALLBACK HANDLING
If {{is_callback}} is "true", this is a follow-up call:

1. OPENING: Acknowledge this is a follow-up
   - "Hi {{first_name}}, this is [Your Name] calling you back as we discussed!"
   - "Hey {{first_name}}, giving you that callback as promised!"

2. CONTEXT: Reference the previous conversation
   - Use {{previous_conversation}} to pick up where you left off
   - "Last time we talked about [topic from previous call]..."
   - "You mentioned you were interested in [previous interest]..."

3. CONTINUE: Don't restart from scratch
   - The lead already knows who you are
   - Skip long introductions
   - Get to the point they were interested in`;

const DISPOSITION_TEMPLATE = `## CALL OUTCOMES
At the end of each call, clearly indicate the outcome:

POSITIVE OUTCOMES:
- Appointment booked: Confirm date, time, and meeting details
- Callback requested: Confirm when you'll call back
- Interested: They want more info, note their specific interests

NEUTRAL OUTCOMES:
- Left voicemail: Mention you left a message and will try again
- Call back later: Specific time to try again

NEGATIVE OUTCOMES:
- Not interested: Thank them for their time and move on
- Do not call: Acknowledge and confirm removal from list
- Wrong number: Apologize and end call promptly

Always be clear about the outcome so the system can properly categorize the call.`;

const VOICEMAIL_DETECTION_TEMPLATE = `## VOICEMAIL DETECTION

If you detect any of these patterns, IMMEDIATELY use the end_call function:

BEEP/TONE PATTERNS:
- Any beeping sound
- "Please leave a message after the tone"
- "After the beep, please record your message"
- Long silence followed by a beep

IVR/MENU PATTERNS:
- "Press 1 for..."
- "Press 2 to..."
- "For sales, press..."
- "If you know your party's extension..."
- "Please hold while we transfer your call"
- "Your call is being forwarded"

VOICEMAIL GREETINGS:
- "You've reached the voicemail of..."
- "I'm not available right now"
- "Sorry I missed your call"
- "Leave your name and number"
- "No one is available to take your call"
- "The person you're trying to reach..."
- "This mailbox is full"
- "Hi, you've reached [name], I can't come to the phone..."
- Generic voicemail music or jingles

CARRIER/SYSTEM MESSAGES:
- "The number you have dialed..."
- "This call cannot be completed as dialed"
- "The subscriber you have called..."
- "This number is no longer in service"
- "The wireless customer you are calling is not available"

When you detect ANY of these patterns:
1. Stop talking immediately - do NOT continue your pitch
2. Call the end_call function with reason "voicemail_detected"
3. Do NOT leave a message unless specifically configured to do so

IMPORTANT: It's better to hang up quickly on a voicemail than to waste 45+ seconds talking to a machine.`;

const VOICEMAIL_MESSAGE_TEMPLATE = `## LEAVING VOICEMAIL MESSAGES

When voicemail is detected AND you should leave a message:

1. WAIT FOR THE BEEP before speaking
2. Keep the message under 20 seconds
3. Speak clearly and at a steady pace

MESSAGE STRUCTURE:
- Greeting: "Hi {{first_name}},"
- Identity: "this is [Agent Name] from [Company]"
- Purpose: "I'm calling about [brief reason]"
- Action: "Please call us back at [phone number]"
- Close: "Thanks, have a great day!"

EXAMPLE MESSAGE:
"Hi {{first_name}}, this is Sarah from ABC Solar. I'm following up on your interest in reducing your electricity bill. Please give us a call back at 555-123-4567 when you have a moment. Thanks, and have a great day!"

AFTER LEAVING THE MESSAGE:
- Wait 1-2 seconds of silence
- Call the end_call function
- Do NOT wait for the system to hang up on you

TIPS:
- Never leave multiple voicemails in one call
- Don't ramble or repeat yourself
- Sound natural and conversational, not robotic`;

// Clickable Variable Chip component
const VariableChip: React.FC<{
  variableKey: string;
  label: string;
  description: string;
  onCopy: (key: string) => void;
  copied: boolean;
}> = ({ variableKey, label, description, onCopy, copied }) => (
  <button
    onClick={() => onCopy(variableKey)}
    className={cn(
      "group relative flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-left w-full",
      copied 
        ? "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400" 
        : "bg-background border-border hover:bg-accent hover:border-primary/30"
    )}
  >
    <code className="text-xs px-1.5 py-0.5 bg-primary/10 rounded font-mono shrink-0">
      {`{{${variableKey}}}`}
    </code>
    <div className="flex-1 min-w-0">
      <span className="text-sm font-medium block truncate">{label}</span>
      <span className="text-xs text-muted-foreground block truncate">{description}</span>
    </div>
    <div className={cn(
      "shrink-0 transition-opacity",
      copied ? "opacity-100" : "opacity-0 group-hover:opacity-100"
    )}>
      {copied ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <Copy className="h-4 w-4 text-muted-foreground" />
      )}
    </div>
  </button>
);

export const PromptTemplateGuide: React.FC = () => {
  const [copiedVariable, setCopiedVariable] = useState<string | null>(null);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['lead', 'callback']);
  const { toast } = useToast();

  const handleCopyVariable = async (variableKey: string) => {
    try {
      await navigator.clipboard.writeText(`{{${variableKey}}}`);
      setCopiedVariable(variableKey);
      toast({
        title: "Copied!",
        description: `{{${variableKey}}} copied to clipboard`,
      });
      setTimeout(() => setCopiedVariable(null), 2000);
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Please copy manually",
        variant: "destructive"
      });
    }
  };

  const handleCopySection = async (text: string, section: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(section);
      toast({
        title: "Copied to clipboard",
        description: `${section} template copied successfully`,
      });
      setTimeout(() => setCopiedSection(null), 2000);
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Please select and copy manually",
        variant: "destructive"
      });
    }
  };

  const handleCopyAllVariables = async () => {
    const allVars = VARIABLE_CATEGORIES.flatMap(cat => cat.variables)
      .map(v => `- {{${v.key}}} - ${v.description}`)
      .join('\n');
    
    try {
      await navigator.clipboard.writeText(`## CONTEXT VARIABLES\n${allVars}`);
      setCopiedSection('all-vars');
      toast({
        title: "All variables copied",
        description: "Complete variable list copied to clipboard",
      });
      setTimeout(() => setCopiedSection(null), 2000);
    } catch (error) {
      toast({
        title: "Copy failed",
        variant: "destructive"
      });
    }
  };

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => 
      prev.includes(categoryId) 
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const TemplateSection: React.FC<{
    title: string;
    description: string;
    content: string;
    sectionKey: string;
    icon: React.ReactNode;
  }> = ({ title, description, content, sectionKey, icon }) => (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCopySection(content, sectionKey)}
          >
            {copiedSection === sectionKey ? (
              <>
                <Check className="h-4 w-4 mr-1 text-green-500" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-1" />
                Copy
              </>
            )}
          </Button>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-40">
          <pre className="text-xs bg-muted p-3 rounded-md whitespace-pre-wrap font-mono">
            {content}
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Prompt Variables & Templates</h2>
          <p className="text-sm text-muted-foreground">
            Click any variable to copy it. Use these in your Retell AI prompts.
          </p>
        </div>
        <Button onClick={handleCopyAllVariables} variant="outline" size="sm">
          <Clipboard className="h-4 w-4 mr-2" />
          {copiedSection === 'all-vars' ? 'Copied!' : 'Copy All Variables'}
        </Button>
      </div>

      {/* Clickable Variables Section */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Variable className="h-5 w-5 text-primary" />
            Dynamic Variables
          </CardTitle>
          <CardDescription>
            Click any variable to copy it to your clipboard, then paste into your prompt
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {VARIABLE_CATEGORIES.map((category) => {
            const IconComponent = category.icon;
            const isExpanded = expandedCategories.includes(category.id);
            
            return (
              <Collapsible key={category.id} open={isExpanded} onOpenChange={() => toggleCategory(category.id)}>
                <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-lg hover:bg-accent transition-colors">
                  <div className="flex items-center gap-2">
                    <IconComponent className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{category.label}</span>
                    <Badge variant="secondary" className="text-xs">
                      {category.variables.length}
                    </Badge>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 pt-1">
                    {category.variables.map((variable) => (
                      <VariableChip
                        key={variable.key}
                        variableKey={variable.key}
                        label={variable.label}
                        description={variable.description}
                        onCopy={handleCopyVariable}
                        copied={copiedVariable === variable.key}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </CardContent>
      </Card>

      {/* Template Sections */}
      <div className="grid gap-4 md:grid-cols-2">
        <TemplateSection
          title="Callback Capability"
          description="Enable your agent to confidently schedule callbacks"
          content={CALLBACK_CAPABILITY_TEMPLATE}
          sectionKey="capability"
          icon={<Phone className="h-5 w-5 text-green-500" />}
        />
        
        <TemplateSection
          title="Callback Handling"
          description="How to handle calls when is_callback is true"
          content={CALLBACK_HANDLING_TEMPLATE}
          sectionKey="handling"
          icon={<MessageSquare className="h-5 w-5 text-amber-500" />}
        />
        
        <TemplateSection
          title="Disposition Rules"
          description="Clear outcome statements for proper categorization"
          content={DISPOSITION_TEMPLATE}
          sectionKey="disposition"
          icon={<Bot className="h-5 w-5 text-purple-500" />}
        />

        <TemplateSection
          title="Voicemail Detection"
          description="Recognize voicemail patterns and hang up immediately"
          content={VOICEMAIL_DETECTION_TEMPLATE}
          sectionKey="voicemail_detection"
          icon={<PhoneOff className="h-5 w-5 text-red-500" />}
        />

        <TemplateSection
          title="Voicemail Message"
          description="What to say when leaving a voicemail"
          content={VOICEMAIL_MESSAGE_TEMPLATE}
          sectionKey="voicemail_message"
          icon={<Voicemail className="h-5 w-5 text-blue-500" />}
        />
      </div>

      {/* Quick Tips */}
      <Card className="bg-muted/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">How to Use</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <p>1. <strong>Click</strong> any variable above to copy it</p>
          <p>2. <strong>Paste</strong> into your Retell AI agent prompt</p>
          <p>3. Variables like <code className="bg-background px-1 rounded">{'{{first_name}}'}</code> auto-fill with real lead data</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default PromptTemplateGuide;
