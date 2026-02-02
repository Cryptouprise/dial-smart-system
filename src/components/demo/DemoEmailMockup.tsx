import { useState } from 'react';
import { Mail, X, CheckCircle, Calendar, Sparkles, ChevronUp, Power, Monitor } from 'lucide-react';
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
        isExpanded ? 'p-0' : 'p-4'
      )}
    >
      {/* Collapsed State - MacBook View */}
      {!isExpanded && (
        <div 
          className="cursor-pointer"
          onClick={() => hasEmail && setIsExpanded(true)}
          style={{ perspective: '800px' }}
        >
          {/* MacBook Pro Frame */}
          <div 
            className="relative"
            style={{ 
              transform: 'rotateX(12deg)',
              transformOrigin: 'bottom center',
              transformStyle: 'preserve-3d'
            }}
          >
            {/* Screen Lid */}
            <div className="relative">
              {/* Outer aluminum frame */}
              <div className="bg-gradient-to-b from-[#c4c4c6] via-[#a8a8aa] to-[#8e8e90] rounded-t-xl p-[2px] shadow-[0_-10px_30px_rgba(0,0,0,0.3)]">
                {/* Inner black bezel */}
                <div className="bg-[#0a0a0a] rounded-t-[10px] p-[6px] pb-[8px]">
                  {/* Camera notch area */}
                  <div className="flex justify-center mb-1">
                    <div className="flex items-center gap-2 px-3 py-0.5 bg-black rounded-full">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#1a1a1c]">
                        <div className="w-0.5 h-0.5 rounded-full bg-[#2a2a2c] mt-[2px] ml-[2px]" />
                      </div>
                      <div className="w-1 h-1 rounded-full bg-emerald-500/50" />
                    </div>
                  </div>
                  
                  {/* Screen with content */}
                  <div className={cn(
                    "relative aspect-[16/10] rounded-sm overflow-hidden",
                    "bg-gradient-to-br from-[#1a1a1c] to-[#0a0a0a]",
                    hasEmail && "shadow-[inset_0_0_60px_rgba(139,92,246,0.1)]"
                  )}>
                    {/* Screen reflection */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-transparent pointer-events-none" />
                    
                    {/* Content */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      {hasEmail ? (
                        <div className="text-center animate-in fade-in duration-500">
                          {/* Glowing mail notification */}
                          <div className="relative inline-block mb-3">
                            <div className="absolute inset-0 bg-primary/40 rounded-2xl blur-2xl animate-pulse" />
                            <div className="relative p-5 rounded-2xl bg-gradient-to-br from-primary/30 to-violet-500/30 border border-primary/40 backdrop-blur-sm">
                              <Mail className="h-12 w-12 text-primary" />
                            </div>
                            {/* Notification Badge */}
                            <span className="absolute -top-2 -right-2 flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-br from-red-500 to-red-600 text-white text-xs font-bold animate-bounce shadow-lg shadow-red-500/50 ring-2 ring-[#0a0a0a]">
                              {emailCount}
                            </span>
                          </div>
                          <p className="text-primary font-semibold">
                            {emailCount} New Email{emailCount > 1 ? 's' : ''}
                          </p>
                          <p className="text-white/40 text-xs mt-1.5 flex items-center justify-center gap-1.5">
                            <ChevronUp className="h-3.5 w-3.5 animate-bounce" />
                            Click to open laptop
                          </p>
                        </div>
                      ) : (
                        <div className="text-center p-4">
                          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 inline-block mb-2">
                            <Monitor className="h-10 w-10 text-white/30" />
                          </div>
                          <p className="text-white/40 text-sm">
                            Awaiting appointments...
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Hinge */}
              <div className="relative h-[6px] bg-gradient-to-b from-[#8e8e90] via-[#6e6e70] to-[#5a5a5c] rounded-b-[2px] shadow-md">
                <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              </div>
            </div>
            
            {/* Base/Keyboard area */}
            <div className="relative">
              <div className="h-[14px] bg-gradient-to-b from-[#a8a8aa] via-[#c4c4c6] to-[#d0d0d2] rounded-b-xl shadow-[0_8px_20px_-4px_rgba(0,0,0,0.4)]">
                {/* Trackpad indent */}
                <div className="absolute left-1/2 -translate-x-1/2 bottom-1 w-16 h-[3px] bg-gradient-to-b from-[#9a9a9c] to-[#b0b0b2] rounded-full" />
                {/* Front edge highlight */}
                <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-b from-transparent to-[#e0e0e2] rounded-b-xl" />
              </div>
            </div>
          </div>
          
          {/* Shadow under laptop */}
          <div className="w-[85%] mx-auto h-6 bg-gradient-to-b from-black/30 via-primary/5 to-transparent rounded-full mt-3 blur-lg" />

          {/* Label */}
          <div className="mt-4 text-center">
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

      {/* Expanded State - MacBook Open with Email */}
      {isExpanded && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 p-4">
          <div style={{ perspective: '800px' }}>
            {/* MacBook Frame - Open Position */}
            <div 
              className="relative"
              style={{ 
                transform: 'rotateX(3deg)',
                transformOrigin: 'bottom center'
              }}
            >
              {/* Screen */}
              <div className="bg-gradient-to-b from-[#c4c4c6] via-[#a8a8aa] to-[#8e8e90] rounded-t-xl p-[2px]">
                <div className="bg-[#0a0a0a] rounded-t-[10px] p-1">
                  {/* Menu bar */}
                  <div className="flex items-center justify-between px-3 py-1.5 bg-[#1a1a1c]/90 rounded-t-lg">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1.5">
                        <button 
                          onClick={() => setIsExpanded(false)}
                          className="w-3 h-3 rounded-full bg-[#ff5f57] hover:bg-[#ff5f57]/80 transition-colors flex items-center justify-center group"
                        >
                          <X className="h-2 w-2 text-[#990000] opacity-0 group-hover:opacity-100" />
                        </button>
                        <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                        <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                      </div>
                      <span className="text-[10px] text-white/50 ml-2">Mail</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-white/50">
                      <span>Today 9:41 AM</span>
                    </div>
                  </div>
                  
                  {/* Email Content */}
                  <div className="bg-[#1a1a1c] max-h-[320px] overflow-y-auto">
                    {/* Email Header */}
                    <div className="bg-[#252528] p-3 space-y-1.5 border-b border-white/5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-white/40 w-10">From:</span>
                        <span className="text-xs font-medium text-white/90">
                          Lady Jarvis &lt;no-reply@dialboss.ai&gt;
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-white/40 w-10">To:</span>
                        <span className="text-xs text-white/70">
                          {prospectEmail || `${(prospectName || 'lead').toLowerCase().replace(' ', '.')}@example.com`}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-[10px] text-white/40 w-10 pt-0.5">Subject:</span>
                        <span className="text-xs font-semibold text-primary">{emailContent.subject}</span>
                      </div>
                    </div>

                    {/* Email Body */}
                    <div className="p-4">
                      <pre className="whitespace-pre-wrap text-xs font-sans leading-relaxed text-white/80">
                        {emailContent.body}
                      </pre>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between text-[10px] text-white/40 p-3 border-t border-white/5">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 text-emerald-400">
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
              
              {/* Hinge */}
              <div className="h-[6px] bg-gradient-to-b from-[#8e8e90] to-[#6e6e70] rounded-b-[2px]" />
              
              {/* Base */}
              <div className="h-[14px] bg-gradient-to-b from-[#a8a8aa] via-[#c4c4c6] to-[#d0d0d2] rounded-b-xl">
                <div className="absolute left-1/2 -translate-x-1/2 bottom-1 w-16 h-[3px] bg-gradient-to-b from-[#9a9a9c] to-[#b0b0b2] rounded-full" />
              </div>
            </div>
          </div>
          
          {/* Close hint */}
          <p className="text-center text-xs text-muted-foreground mt-3">
            Click the red button to close
          </p>
        </div>
      )}
    </div>
  );
};

export default DemoEmailMockup;
