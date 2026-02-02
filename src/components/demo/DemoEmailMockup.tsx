import { useState } from 'react';
import { Monitor, Mail, X, CheckCircle, Calendar, Sparkles, MousePointer } from 'lucide-react';
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
      <div 
        className={`relative p-6 rounded-2xl transition-all cursor-pointer bg-background/50 backdrop-blur-sm border-2 ${
          hasEmail 
            ? 'border-primary/40 hover:border-primary/60 shadow-lg shadow-primary/10' 
            : 'border-border/30 hover:border-border/50'
        }`}
        onClick={() => hasEmail && setIsOpen(true)}
      >
        {/* Laptop Frame with realistic 3D perspective */}
        <div className="flex flex-col items-center" style={{ perspective: '1200px' }}>
          {/* Screen with 3D tilt and premium styling */}
          <div 
            className="relative w-full aspect-[16/10] rounded-t-lg overflow-hidden"
            style={{ 
              transform: 'rotateX(8deg)',
              transformOrigin: 'bottom center'
            }}
          >
            {/* Screen bezel - dark aluminum */}
            <div className="absolute inset-0 bg-gradient-to-b from-zinc-800 via-zinc-900 to-zinc-800 rounded-t-lg p-[6px]">
              {/* Inner screen border */}
              <div className="absolute inset-[3px] rounded-t-md bg-black">
                {/* Webcam dot */}
                <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-zinc-800 ring-1 ring-zinc-700" />
                
                {/* Screen Reflection - glossy glass effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-transparent pointer-events-none rounded-t-md" />
                
                {/* Screen Content */}
                <div className={`absolute inset-2 top-4 rounded-sm bg-gradient-to-br from-zinc-950 to-black flex items-center justify-center ${
                  hasEmail ? 'shadow-[inset_0_0_40px_rgba(139,92,246,0.15)]' : ''
                }`}>
                  {hasEmail ? (
                    <div className="text-center p-4 animate-in fade-in duration-500">
                      {/* Glowing mail icon */}
                      <div className="relative inline-block mb-3">
                        <div className="absolute inset-0 bg-primary/30 rounded-full blur-xl animate-pulse" />
                        <div className="relative p-4 rounded-2xl bg-gradient-to-br from-primary/20 to-violet-500/20 border border-primary/30">
                          <Mail className="h-10 w-10 text-primary" />
                        </div>
                        {/* Notification Badge with premium glow */}
                        <span className="absolute -top-2 -right-2 flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-br from-red-500 to-red-600 text-white text-xs font-bold animate-pulse shadow-lg shadow-red-500/50 ring-2 ring-black">
                          {emailCount}
                        </span>
                      </div>
                      <p className="text-primary font-semibold text-sm">
                        {emailCount} New Email{emailCount > 1 ? 's' : ''}
                      </p>
                      <p className="text-zinc-500 text-xs mt-1 flex items-center justify-center gap-1">
                        <MousePointer className="h-3 w-3" />
                        Click to preview
                      </p>
                    </div>
                  ) : (
                    <div className="text-center p-4">
                      <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/50 inline-block mb-2">
                        <Monitor className="h-8 w-8 text-zinc-600" />
                      </div>
                      <p className="text-zinc-500 text-xs">
                        Awaiting appointments...
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* Laptop Base - premium aluminum hinge */}
          <div className="relative w-[115%]">
            {/* Hinge detail */}
            <div className="h-2 bg-gradient-to-b from-zinc-700 via-zinc-800 to-zinc-700 rounded-t-sm flex items-center justify-center shadow-inner">
              <div className="w-16 h-0.5 bg-zinc-600 rounded-full" />
            </div>
            {/* Base/trackpad area */}
            <div className="h-4 bg-gradient-to-b from-zinc-800 to-zinc-900 rounded-b-xl flex items-center justify-center shadow-xl">
              <div className="w-20 h-1 bg-zinc-700/50 rounded-full" />
            </div>
          </div>
          
          {/* Shadow/reflection under laptop */}
          <div className="w-[90%] h-4 bg-gradient-to-b from-black/30 via-primary/5 to-transparent rounded-full mt-2 blur-md" />
        </div>

        {/* Label */}
        <div className="mt-5 text-center">
          <h4 className="font-semibold text-sm flex items-center justify-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Automated Email Confirmations
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            {hasEmail 
              ? 'Click to preview the email your leads receive'
              : 'Emails are sent when appointments are booked'
            }
          </p>
        </div>
      </div>

      {/* Email Preview Modal */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden border-primary/20 bg-background/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-violet-500/20 border border-primary/30">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              Email Preview
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 overflow-y-auto max-h-[60vh]">
            {/* Email Header */}
            <div className="bg-muted/30 rounded-xl p-4 space-y-2.5 border border-border/30">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-14">From:</span>
                <span className="text-sm font-medium">
                  Lady Jarvis &lt;no-reply@dialboss.ai&gt;
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-14">To:</span>
                <span className="text-sm">
                  {prospectEmail || `${(prospectName || 'lead').toLowerCase().replace(' ', '.')}@example.com`}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-14">Subject:</span>
                <span className="text-sm font-semibold text-primary">{emailContent.subject}</span>
              </div>
            </div>

            {/* Email Body */}
            <div className="bg-background border border-border/30 rounded-xl p-6">
              <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed text-foreground/90">
                {emailContent.body}
              </pre>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border/30">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 text-emerald-500">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Delivered
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Just now
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="hover:bg-primary/10">
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
