import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { 
  Copy, 
  Check, 
  Variable, 
  Phone, 
  MessageSquare,
  Bot,
  Clipboard
} from 'lucide-react';

const CONTEXT_VARIABLES_TEMPLATE = `## CONTEXT VARIABLES (Always Available)
- {{first_name}} - Lead's first name
- {{last_name}} - Lead's last name
- {{full_name}} - Lead's full name
- {{company}} - Lead's company
- {{email}} - Lead's email address
- {{phone}} - Lead's phone number
- {{notes}} - Previous call notes and history
- {{current_time}} - Current date/time in lead's timezone
- {{current_day_of_week}} - Current day (Monday, Tuesday, etc.)
- {{timezone}} - Lead's timezone
- {{lead_source}} - How the lead was acquired
- {{address}} - Lead's street address
- {{city}} - Lead's city
- {{state}} - Lead's state
- {{zip_code}} - Lead's ZIP code

## CALLBACK DETECTION VARIABLES
- {{is_callback}} - "true" or "false" - indicates if this is a callback
- {{callback_context}} - Context message if this is a callback
- {{previous_conversation}} - Summary of the last call
- {{last_call_date}} - When the last call occurred
- {{previous_outcome}} - What happened on the last call`;

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

export const PromptTemplateGuide: React.FC = () => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const { toast } = useToast();

  const handleCopy = async (text: string, section: string) => {
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

  const handleCopyAll = async () => {
    const allTemplates = [
      CONTEXT_VARIABLES_TEMPLATE,
      '',
      CALLBACK_CAPABILITY_TEMPLATE,
      '',
      CALLBACK_HANDLING_TEMPLATE,
      '',
      DISPOSITION_TEMPLATE
    ].join('\n\n');

    try {
      await navigator.clipboard.writeText(allTemplates);
      setCopiedSection('all');
      toast({
        title: "All templates copied",
        description: "Complete prompt guide copied to clipboard",
      });
      setTimeout(() => setCopiedSection(null), 2000);
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Please copy sections individually",
        variant: "destructive"
      });
    }
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
            onClick={() => handleCopy(content, sectionKey)}
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
        <ScrollArea className="h-48">
          <pre className="text-xs bg-muted p-3 rounded-md whitespace-pre-wrap font-mono">
            {content}
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Prompt Template Guide</h2>
          <p className="text-muted-foreground">
            Copy these sections into your Retell AI agent prompt to enable callback scheduling and context awareness
          </p>
        </div>
        <Button onClick={handleCopyAll} variant="default">
          <Clipboard className="h-4 w-4 mr-2" />
          {copiedSection === 'all' ? 'Copied All!' : 'Copy All Sections'}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TemplateSection
          title="Context Variables"
          description="All dynamic variables available to your agent"
          content={CONTEXT_VARIABLES_TEMPLATE}
          sectionKey="context"
          icon={<Variable className="h-5 w-5 text-blue-500" />}
        />
        
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
      </div>

      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-sm">How to Use</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>1. Go to your <strong>Retell AI Dashboard</strong> → Agent Settings → LLM Prompt</p>
          <p>2. Copy the sections above that you need</p>
          <p>3. Paste them into your agent's system prompt</p>
          <p>4. The variables like <code className="bg-background px-1 rounded">{'{{first_name}}'}</code> will be automatically replaced with real data</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default PromptTemplateGuide;