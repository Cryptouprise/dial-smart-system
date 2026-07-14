import { LockKeyhole, ShieldAlert } from 'lucide-react';
import Navigation from '@/components/Navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const ApiKeys = () => (
  <div className="min-h-screen bg-background">
    <Navigation />
    <main className="container mx-auto max-w-4xl px-4 py-8">
      <Card className="border-amber-500/40">
        <CardHeader>
          <div className="mb-2 flex items-center gap-3">
            <div className="rounded-full bg-amber-500/10 p-2 text-amber-600">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <CardTitle>Provider credentials are launch-locked</CardTitle>
          </div>
          <CardDescription>
            Direct browser storage and retrieval of Twilio, Retell, OpenAI,
            Stripe, or other provider secrets is disabled.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
            <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              Launch credentials must be configured through server-side secret
              management. The application will expose masked connection status
              only after organization-scoped, non-exportable credential storage
              and operator authorization are certified.
            </p>
          </div>
          <p>
            No provider secret can be added, viewed, validated, or deleted from
            this page in the launch profile.
          </p>
        </CardContent>
      </Card>
    </main>
  </div>
);

export default ApiKeys;
