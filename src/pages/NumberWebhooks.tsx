import React from 'react';
import Navigation from '@/components/Navigation';
import TwilioNumbersOverview from '@/components/TwilioNumbersOverview';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const NumberWebhooks = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <Navigation />
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/sms-conversations')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Twilio Number Webhooks</h1>
            <p className="text-muted-foreground">See exactly where your numbers send SMS replies</p>
          </div>
        </div>
        <TwilioNumbersOverview />
      </div>
    </div>
  );
};

export default NumberWebhooks;
