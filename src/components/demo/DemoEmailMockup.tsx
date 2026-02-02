import { useState } from 'react';
import { Monitor, Mail, X, CheckCircle, Calendar, Sparkles, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  const [isExpanded, setIsExpanded] = useState(false);

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
    <div 
      className={cn(
        "relative rounded-2xl transition-all bg-background/50 backdrop-blur-sm border-2 overflow-hidden",
        hasEmail 
          ? 'border-primary/40 hover:border-primary/60 shadow-lg shadow-primary/10' 
          : 'border-border/30 hover:border-border/50',
        isExpanded ? 'p-0' : 'p-6'
      )}
    >
      {/* Collapsed State - Laptop View */}
      {!isExpanded && (
        <div 
          className="cursor-pointer"
          onClick={() => hasEmail && setIsExpanded(true)}
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
                          <ChevronUp className="h-3 w-3 animate-bounce" />
                          Click to open
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
      )}

      {/* Expanded State - Email Open on Laptop Screen */}
      {isExpanded && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* Laptop Frame - Expanded */}
          <div className="flex flex-col items-center p-4" style={{ perspective: '1200px' }}>
            {/* Screen - Now showing email content */}
            <div 
              className="relative w-full rounded-t-lg overflow-hidden"
              style={{ 
                transform: 'rotateX(3deg)',
                transformOrigin: 'bottom center'
              }}
            >
              {/* Screen bezel - dark aluminum */}
              <div className="bg-gradient-to-b from-zinc-800 via-zinc-900 to-zinc-800 rounded-t-lg p-[6px]">
                {/* Inner screen border */}
                <div className="rounded-t-md bg-black p-1">
                  {/* Webcam dot & close button */}
                  <div className="flex items-center justify-between px-2 py-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-800 ring-1 ring-zinc-700" />
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setIsExpanded(false)}
                      className="h-6 px-2 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Close
                    </Button>
                  </div>
                  
                  {/* Email Content on Screen */}
                  <div className="bg-gradient-to-br from-zinc-950 to-black rounded-sm p-3 max-h-[350px] overflow-y-auto">
                    {/* Email Header */}
                    <div className="bg-zinc-900/80 rounded-lg p-3 space-y-2 border border-zinc-800 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-500 w-10">From:</span>
                        <span className="text-xs font-medium text-zinc-300">
                          Lady Jarvis &lt;no-reply@dialboss.ai&gt;
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-500 w-10">To:</span>
                        <span className="text-xs text-zinc-400">
                          {prospectEmail || `${(prospectName || 'lead').toLowerCase().replace(' ', '.')}@example.com`}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-[10px] text-zinc-500 w-10 pt-0.5">Subject:</span>
                        <span className="text-xs font-semibold text-primary">{emailContent.subject}</span>
                      </div>
                    </div>

                    {/* Email Body */}
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
                      <pre className="whitespace-pre-wrap text-xs font-sans leading-relaxed text-zinc-300">
                        {emailContent.body}
                      </pre>
                    </div>

                    {/* Status Footer */}
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-3 mt-3 border-t border-zinc-800">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 text-emerald-500">
                          <CheckCircle className="h-3 w-3" />
                          Delivered
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Just now
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Laptop Base */}
            <div className="relative w-[105%]">
              <div className="h-2 bg-gradient-to-b from-zinc-700 via-zinc-800 to-zinc-700 rounded-t-sm flex items-center justify-center shadow-inner">
                <div className="w-16 h-0.5 bg-zinc-600 rounded-full" />
              </div>
              <div className="h-4 bg-gradient-to-b from-zinc-800 to-zinc-900 rounded-b-xl flex items-center justify-center shadow-xl">
                <div className="w-20 h-1 bg-zinc-700/50 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DemoEmailMockup;
