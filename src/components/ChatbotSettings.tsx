import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot } from 'lucide-react';

export const ChatbotSettings: React.FC = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Chatbot Settings
        </CardTitle>
        <CardDescription>
          Configure AI chatbot behavior and responses
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-muted-foreground">
          <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Chatbot settings coming soon</p>
          <p className="text-xs mt-2">AI-powered chat responses for leads</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default ChatbotSettings;
