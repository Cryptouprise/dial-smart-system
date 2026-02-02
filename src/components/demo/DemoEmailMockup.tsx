import { useState } from 'react';
import { Monitor, Mail, X, CheckCircle, Calendar, Building } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface DemoEmailMockupProps {
  hasEmail: boolean;
  emailCount: number;
  prospectName?: string;
  prospectCompany?: string;
  prospectEmail?: string;
  businessName?: string;
  campaignType: string;
}

export const DemoEmailMockup = ({
  hasEmail,
  emailCount,
  prospectName,
  prospectCompany,
  prospectEmail,
  businessName,
  campaignType,
}: DemoEmailMockupProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const getEmailContent = () => {
    const name = prospectName || 'there';
    const company = prospectCompany || 'your company';
    const business = businessName || 'our team';
    
    if (campaignType === 'appointment_reminder') {
      return {
        subject: `Your appointment with ${business} is confirmed! 🗓️`,
        body: `Hi ${name},

Great news! Your appointment has been confirmed.

📅 We'll be reaching out at your scheduled time to discuss how we can help ${company} achieve your goals.

What to expect:
• A 15-minute focused conversation
• No pressure, just valuable insights
• Answers to any questions you have

If you need to reschedule, simply reply to this email.

Looking forward to connecting!

Best,
The ${business} Team

---
This is an automated confirmation from your AI assistant.`,
      };
    }

    return {
      subject: `Thanks for connecting, ${name}! Here's what's next 🚀`,
      body: `Hi ${name},

Thank you for taking the time to speak with us today! We're excited about the opportunity to help ${company}.

Based on our conversation, here's a quick summary:
• You expressed interest in learning more about our solutions
• We discussed your current challenges and goals
• Next step: Our team will follow up with tailored information

What happens next:
1. You'll receive a detailed proposal within 24 hours
2. We'll schedule a follow-up call at your convenience
3. No obligation - we're here to help you make the best decision

Have questions in the meantime? Just reply to this email!

Best regards,
The ${business} Team

---
Sent automatically by your AI sales assistant.`,
    };
  };

  const emailContent = getEmailContent();

  return (
    <>
      <Card 
        className={`relative p-4 transition-all cursor-pointer hover:shadow-lg glass-card ${
          hasEmail ? 'glow-border animate-pulse-subtle' : ''
        }`}
        onClick={() => hasEmail && setIsOpen(true)}
      >
        {/* Laptop Frame with 3D perspective */}
        <div className="flex flex-col items-center" style={{ perspective: '1000px' }}>
          {/* Screen with 3D tilt */}
          <div 
            className="relative w-full aspect-video bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg border-4 border-slate-700 overflow-hidden shadow-2xl"
            style={{ 
              transform: 'rotateX(5deg)',
              transformOrigin: 'bottom center'
            }}
          >
            {/* Screen Reflection */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none" />
            
            {/* Screen Content */}
            <div className={`absolute inset-2 bg-slate-950 rounded flex items-center justify-center ${hasEmail ? 'shadow-[inset_0_0_30px_rgba(var(--primary),0.2)]' : ''}`}>
              {hasEmail ? (
                <div className="text-center p-4">
                  <div className="relative inline-block">
                    <Mail className="h-12 w-12 text-primary animate-bounce" />
                    {/* Notification Badge with glow */}
                    <span className="absolute -top-1 -right-1 flex items-center justify-center h-6 w-6 rounded-full bg-red-500 text-white text-xs font-bold animate-pulse shadow-lg shadow-red-500/50">
                      {emailCount}
                    </span>
                  </div>
                  <p className="text-primary font-medium mt-2 text-sm glow-text">
                    {emailCount} New Email{emailCount > 1 ? 's' : ''}
                  </p>
                  <p className="text-slate-400 text-xs mt-1">Click to open</p>
                </div>
              ) : (
                <div className="text-center p-4">
                  <Monitor className="h-10 w-10 text-slate-600 mx-auto" />
                  <p className="text-slate-500 text-xs mt-2">
                    Awaiting appointments...
                  </p>
                </div>
              )}
            </div>
          </div>
          
          {/* Laptop Base with shadow */}
          <div className="w-[110%] h-3 bg-gradient-to-b from-slate-700 to-slate-800 rounded-b-xl -mt-0.5 flex items-center justify-center shadow-lg">
            <div className="w-12 h-1 bg-slate-600 rounded-full"></div>
          </div>
          
          {/* Reflection under laptop */}
          <div className="w-[90%] h-2 bg-gradient-to-b from-slate-900/30 to-transparent rounded-full mt-1 blur-sm" />
        </div>

        {/* Label */}
        <div className="mt-3 text-center">
          <h4 className="font-semibold text-sm">Automated Email Confirmations</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {hasEmail 
              ? 'Click to preview the email your leads receive'
              : 'Emails are sent when appointments are booked'
            }
          </p>
        </div>
      </Card>

      {/* Email Preview Modal */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Email Preview
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 overflow-y-auto max-h-[60vh]">
            {/* Email Header */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16">From:</span>
                <span className="text-sm font-medium">
                  Lady Jarvis &lt;no-reply@dialboss.ai&gt;
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16">To:</span>
                <span className="text-sm">
                  {prospectEmail || `${(prospectName || 'lead').toLowerCase().replace(' ', '.')}@example.com`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16">Subject:</span>
                <span className="text-sm font-semibold">{emailContent.subject}</span>
              </div>
            </div>

            {/* Email Body */}
            <div className="bg-background border rounded-lg p-6">
              <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">
                {emailContent.body}
              </pre>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  Delivered
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Just now
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
                Close Preview
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DemoEmailMockup;
