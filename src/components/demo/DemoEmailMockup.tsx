import { useState } from 'react';
import { Mail, X, CheckCircle, Calendar, Sparkles, ChevronUp, Monitor } from 'lucide-react';
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

  // Keyboard key component
  const Key = ({ children, wide = false, extraWide = false }: { children?: React.ReactNode; wide?: boolean; extraWide?: boolean }): JSX.Element => {
    return (
      <div className={cn(
        "h-[10px] rounded-[2px] bg-gradient-to-b from-[#4a4a4c] to-[#3a3a3c] border border-[#2a2a2c] flex items-center justify-center shadow-[0_1px_0_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)]",
        wide ? "w-[20px]" : extraWide ? "w-[55px]" : "w-[14px]"
      )}>
        {children && <span className="text-[4px] text-white/30 font-medium">{children}</span>}
      </div>
    );
  };

  return (
    <div className="relative w-full max-w-[600px]">
      {/* Collapsed State - MacBook View */}
      {!isExpanded && (
        <div 
          className="cursor-pointer"
          onClick={() => hasEmail && setIsExpanded(true)}
          style={{ perspective: '1000px' }}
        >
          {/* Outer glow */}
          {hasEmail && (
            <div className="absolute -inset-4 bg-gradient-to-b from-primary/20 via-violet-500/10 to-transparent rounded-3xl blur-xl opacity-60 animate-pulse" />
          )}
          
          {/* MacBook Pro Frame */}
          <div 
            className="relative"
            style={{ 
              transform: 'rotateX(8deg)',
              transformOrigin: 'bottom center',
              transformStyle: 'preserve-3d'
            }}
          >
            {/* Screen Lid */}
            <div className="relative">
              {/* Outer aluminum frame */}
              <div className="bg-gradient-to-b from-[#d4d4d6] via-[#b8b8ba] to-[#a0a0a2] rounded-t-[12px] p-[3px] shadow-[0_-8px_30px_rgba(0,0,0,0.25)]">
                {/* Inner black bezel */}
                <div className="bg-[#0a0a0a] rounded-t-[9px] p-[5px] pb-[6px]">
                  {/* Camera notch area */}
                  <div className="flex justify-center mb-1.5">
                    <div className="flex items-center gap-2 px-4 py-0.5">
                      <div className="w-2 h-2 rounded-full bg-[#1a1a1c] ring-[0.5px] ring-[#2a2a2c]">
                        <div className="w-0.5 h-0.5 rounded-full bg-[#3a3a3c] mt-[3px] ml-[3px]" />
                      </div>
                      <div className="w-1 h-1 rounded-full bg-emerald-500/40" />
                    </div>
                  </div>
                  
                  {/* Screen with content */}
                  <div className={cn(
                    "relative aspect-[16/10] rounded-[2px] overflow-hidden",
                    "bg-gradient-to-br from-[#1a1a1c] to-[#0d0d0d]",
                    hasEmail && "shadow-[inset_0_0_60px_rgba(139,92,246,0.15)]"
                  )}>
                    {/* Screen reflection */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] via-transparent to-transparent pointer-events-none" />
                    
                    {/* Content */}
                    <div className="absolute inset-0 flex items-center justify-center p-4">
                      {hasEmail ? (
                        <div className="text-center animate-in fade-in duration-500 w-full">
                          {/* Glowing mail notification */}
                          <div className="relative inline-block mb-3">
                            <div className="absolute inset-0 bg-primary/40 rounded-xl blur-xl animate-pulse" />
                            <div className="relative p-5 rounded-xl bg-gradient-to-br from-primary/30 to-violet-500/30 border border-primary/40 backdrop-blur-sm">
                              <Mail className="h-10 w-10 text-primary" />
                            </div>
                            {/* Notification Badge */}
                            <span className="absolute -top-2 -right-2 flex items-center justify-center h-6 w-6 rounded-full bg-gradient-to-br from-red-500 to-red-600 text-white text-xs font-bold animate-bounce shadow-lg shadow-red-500/50 ring-2 ring-[#0a0a0a]">
                              {emailCount}
                            </span>
                          </div>
                          <p className="text-primary font-semibold text-base">
                            {emailCount} New Email{emailCount > 1 ? 's' : ''}
                          </p>
                          <p className="text-white/40 text-xs mt-1.5 flex items-center justify-center gap-1">
                            <ChevronUp className="h-4 w-4 animate-bounce" />
                            Click to open
                          </p>
                        </div>
                      ) : (
                        <div className="text-center p-4">
                          <div className="p-4 rounded-xl bg-white/5 border border-white/10 inline-block mb-2">
                            <Monitor className="h-8 w-8 text-white/30" />
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
              
              {/* Hinge - realistic groove */}
              <div className="relative h-[4px] bg-gradient-to-b from-[#8e8e90] via-[#7e7e80] to-[#6e6e70]">
                <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 h-[1px] bg-black/30" />
              </div>
            </div>
            
            {/* Base/Keyboard area - angled and detailed */}
            <div 
              className="relative"
              style={{
                transform: 'rotateX(-25deg)',
                transformOrigin: 'top center',
              }}
            >
              {/* Aluminum base with keyboard cutout */}
              <div className="bg-gradient-to-b from-[#c8c8ca] via-[#d0d0d2] to-[#d8d8da] rounded-b-[10px] pt-[4px] pb-[10px] px-[8px] shadow-[0_12px_25px_-8px_rgba(0,0,0,0.5)]">
                {/* Keyboard area - recessed */}
                <div className="bg-gradient-to-b from-[#2a2a2c] to-[#1a1a1c] rounded-[5px] p-[6px] shadow-[inset_0_1px_3px_rgba(0,0,0,0.4)]">
                  {/* Keyboard rows */}
                  <div className="space-y-[3px]">
                    {/* Function row */}
                    <div className="flex gap-[3px] justify-center">
                      {[...Array(14)].map((_, i) => (
                        <div key={i} className="w-[14px] h-[8px] rounded-[2px] bg-gradient-to-b from-[#3a3a3c] to-[#2a2a2c] border border-[#222]" />
                      ))}
                    </div>
                    {/* Number row */}
                    <div className="flex gap-[3px] justify-center">
                      {['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='].map((k, i) => (
                        <Key key={i}>{k}</Key>
                      ))}
                      <Key wide>⌫</Key>
                    </div>
                    {/* QWERTY row */}
                    <div className="flex gap-[3px] justify-center">
                      <Key wide>⇥</Key>
                      {['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\'].map((k, i) => (
                        <Key key={i}>{k}</Key>
                      ))}
                    </div>
                    {/* ASDF row */}
                    <div className="flex gap-[3px] justify-center">
                      <Key wide>⇪</Key>
                      {['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'"].map((k, i) => (
                        <Key key={i}>{k}</Key>
                      ))}
                      <Key wide>⏎</Key>
                    </div>
                    {/* ZXCV row */}
                    <div className="flex gap-[3px] justify-center">
                      <Key wide>⇧</Key>
                      {['Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/'].map((k, i) => (
                        <Key key={i}>{k}</Key>
                      ))}
                      <Key wide>⇧</Key>
                    </div>
                    {/* Bottom row with spacebar */}
                    <div className="flex gap-[3px] justify-center items-center">
                      <Key>fn</Key>
                      <Key>⌃</Key>
                      <Key>⌥</Key>
                      <Key wide>⌘</Key>
                      <Key extraWide />
                      <Key wide>⌘</Key>
                      <Key>⌥</Key>
                      {/* Arrow keys */}
                      <div className="flex flex-col gap-[1px]">
                        <div className="w-[14px] h-[4px] rounded-[1px] bg-gradient-to-b from-[#3a3a3c] to-[#2a2a2c] border border-[#222]" />
                        <div className="flex gap-[1px]">
                          <div className="w-[14px] h-[5px] rounded-[1px] bg-gradient-to-b from-[#3a3a3c] to-[#2a2a2c] border border-[#222]" />
                          <div className="w-[14px] h-[5px] rounded-[1px] bg-gradient-to-b from-[#3a3a3c] to-[#2a2a2c] border border-[#222]" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Trackpad */}
                <div className="mt-[6px] mx-auto w-[70%] h-[45px] bg-gradient-to-b from-[#c0c0c2] to-[#b8b8ba] rounded-[5px] border border-[#a0a0a2] shadow-[inset_0_1px_2px_rgba(255,255,255,0.3),0_1px_2px_rgba(0,0,0,0.1)]">
                  <div className="w-full h-full rounded-[4px] border border-white/10" />
                </div>
              </div>
              
              {/* Front edge lip */}
              <div className="h-[3px] bg-gradient-to-b from-[#e0e0e2] to-[#d0d0d2] rounded-b-[10px]" />
            </div>
          </div>
          
          {/* Shadow under laptop */}
          <div className="w-[90%] mx-auto h-5 bg-gradient-to-b from-black/25 via-primary/5 to-transparent rounded-full mt-2 blur-md" />

          {/* Label */}
          <div className="mt-4 text-center">
            <h4 className="font-semibold text-sm flex items-center justify-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Automated Email Confirmations
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              {hasEmail 
                ? 'Click laptop to preview email'
                : 'Emails sent when appointments book'
              }
            </p>
          </div>
        </div>
      )}

      {/* Expanded State - Email View */}
      {isExpanded && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 p-4 rounded-2xl bg-background/80 backdrop-blur-sm border border-primary/30">
          {/* macOS Window Chrome */}
          <div className="rounded-lg overflow-hidden shadow-2xl border border-white/10">
            {/* Title bar */}
            <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-b from-[#3a3a3c] to-[#2a2a2c]">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsExpanded(false)}
                  className="w-3 h-3 rounded-full bg-[#ff5f57] hover:bg-[#ff5f57]/80 transition-colors flex items-center justify-center group"
                >
                  <X className="h-2 w-2 text-[#990000] opacity-0 group-hover:opacity-100" />
                </button>
                <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                <div className="w-3 h-3 rounded-full bg-[#28c840]" />
              </div>
              <span className="text-[11px] text-white/60 font-medium">Mail — {emailCount} unread</span>
              <div className="w-14" />
            </div>
            
            {/* Email Content */}
            <div className="bg-[#1a1a1c] max-h-[350px] overflow-y-auto">
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