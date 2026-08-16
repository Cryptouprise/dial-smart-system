import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckCircle, Clock3, ClipboardList, Scale, ShieldCheck, Sparkles, Siren, RotateCcw } from 'lucide-react';

interface DemoLegalSummaryProps {
  scrapedData: any;
  onStartOver: () => void;
}

const capabilities = [
  {
    icon: Clock3,
    title: '24/7 Call Coverage',
    description: 'Answer nights, weekends, overflow, and missed calls without sending a new potential client to voicemail.',
  },
  {
    icon: ClipboardList,
    title: 'Structured New-Client Intake',
    description: 'Collect matter details conversationally, one question at a time, and turn the call into usable intake information.',
  },
  {
    icon: Siren,
    title: 'Urgency Detection & Routing',
    description: 'Identify deadlines, court dates, emergencies, and high-priority matters so the right calls can be surfaced quickly.',
  },
  {
    icon: ShieldCheck,
    title: 'Legal-Safe Guardrails',
    description: 'Stay in the receptionist/intake role: no legal advice, no promises of representation, and no outcome guarantees.',
  },
];

export const DemoLegalSummary = ({ scrapedData, onStartOver }: DemoLegalSummaryProps) => {
  const businessName = scrapedData?.business_name || 'Your law firm';

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-background via-background to-indigo-500/5">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-4 pt-6">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Scale className="h-8 w-8 text-white" />
          </div>
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-xs font-bold tracking-wider text-indigo-300 mb-3">
              <Sparkles className="h-3.5 w-3.5" />
              AFTER-HOURS LEGAL INTAKE — BETA
            </div>
            <h1 className="text-3xl md:text-4xl font-bold">Never let an after-hours lead die in voicemail.</h1>
            <p className="text-muted-foreground mt-3 max-w-2xl mx-auto leading-relaxed">
              Lady Jarvis can answer as <span className="font-semibold text-foreground">{businessName}</span>, use the firm-specific context gathered from the website, collect intake details, and prepare the call for human follow-up.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {capabilities.map((capability) => {
            const Icon = capability.icon;
            return (
              <Card key={capability.title} className="p-6 border-indigo-500/20 bg-background/70 backdrop-blur-sm">
                <div className="flex gap-4">
                  <div className="p-3 h-fit rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                    <Icon className="h-5 w-5 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">{capability.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{capability.description}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="p-6 md:p-8 border-primary/25 bg-gradient-to-br from-primary/5 via-background to-cyan-500/5">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              'Firm-specific website knowledge',
              'New vs. existing client triage',
              'Caller details + matter summary',
              'Practice-area aware conversation',
              'Deadline / urgency capture',
              'Human follow-up handoff',
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </Card>

        <div className="text-center space-y-3 pb-10">
          <p className="text-sm text-muted-foreground">
            This beta demo intentionally avoids fake outbound-dialer metrics. The value is simple: answer more calls, capture better intake, and make sure urgent opportunities reach the team.
          </p>
          <Button size="lg" onClick={onStartOver} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Run Another Demo
          </Button>
        </div>
      </div>
    </div>
  );
};
