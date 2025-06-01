
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HelpCircle, BookOpen, Settings, Phone, Shield, Bot, ArrowLeft, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Navigation from '@/components/Navigation';

const HelpSystem = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Navigation />
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Navigation Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button 
            variant="outline" 
            onClick={() => navigate('/')}
            className="flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            Back to Dashboard
          </Button>
          <Button 
            variant="default" 
            onClick={() => navigate('/')}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
          >
            <Home size={16} />
            Dashboard
          </Button>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Help & Integration Guide</h1>
          <p className="text-lg text-gray-600">Complete setup guide for your dialer system</p>
        </div>

        <Tabs defaultValue="setup" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="setup">Setup Guide</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="spam">Spam Protection</TabsTrigger>
            <TabsTrigger value="troubleshooting">Troubleshooting</TabsTrigger>
          </TabsList>

          <TabsContent value="setup" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Quick Setup Guide
                </CardTitle>
                <CardDescription>Get your dialer system up and running in minutes</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
                    <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">1</div>
                    <div>
                      <h4 className="font-semibold">Configure API Keys</h4>
                      <p className="text-sm text-gray-600">Go to API Keys page and add your service credentials:</p>
                      <ul className="text-sm text-gray-600 mt-2 ml-4 list-disc">
                        <li>Twilio: Account SID, Auth Token, Phone Number</li>
                        <li>Retell AI: API Key</li>
                        <li>OpenAI: API Key (optional for AI features)</li>
                        <li>Stripe: Secret Key (optional for payments)</li>
                      </ul>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => navigate('/api-keys')}
                        className="mt-2"
                      >
                        Go to API Keys
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg">
                    <div className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">2</div>
                    <div>
                      <h4 className="font-semibold">Purchase Phone Numbers</h4>
                      <p className="text-sm text-gray-600">Buy phone numbers from the dashboard by entering area codes</p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => navigate('/')}
                        className="mt-2"
                      >
                        Go to Dashboard
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 bg-purple-50 rounded-lg">
                    <div className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">3</div>
                    <div>
                      <h4 className="font-semibold">Set Up Spam Protection</h4>
                      <p className="text-sm text-gray-600">Configure automatic spam detection and quarantine settings</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 bg-orange-50 rounded-lg">
                    <div className="bg-orange-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">4</div>
                    <div>
                      <h4 className="font-semibold">Start Calling</h4>
                      <p className="text-sm text-gray-600">Use the test call feature or import numbers to Retell AI for automated calling</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Service Integrations
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4">
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold">Twilio</h4>
                      <Badge variant="outline">Required for Calling</Badge>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">
                      Twilio powers the actual phone calls and SMS functionality.
                    </p>
                    <div className="text-sm">
                      <strong>Required Credentials:</strong>
                      <ul className="ml-4 mt-1 list-disc">
                        <li>Account SID</li>
                        <li>Auth Token</li>
                        <li>Phone Number (for outbound calls)</li>
                      </ul>
                    </div>
                  </div>

                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold">Retell AI</h4>
                      <Badge variant="outline">AI Calling</Badge>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">
                      Retell AI provides AI-powered voice agents for automated calling.
                    </p>
                    <div className="text-sm">
                      <strong>Required Credentials:</strong>
                      <ul className="ml-4 mt-1 list-disc">
                        <li>API Key</li>
                      </ul>
                    </div>
                  </div>

                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold">OpenAI</h4>
                      <Badge variant="secondary">Optional</Badge>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">
                      OpenAI integration for advanced AI features and chat assistance.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="spam" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Spam Protection System
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-red-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-red-800 mb-2">Automatic Quarantine Rules</h4>
                  <ul className="text-sm text-red-700 space-y-1">
                    <li>• 50+ daily calls = immediate quarantine</li>
                    <li>• 45+ daily calls = high spam score monitoring</li>
                    <li>• Area codes with 60%+ spam numbers flagged</li>
                    <li>• Inactive numbers with high call volumes</li>
                  </ul>
                </div>

                <div className="bg-green-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-green-800 mb-2">Quarantine Management</h4>
                  <ul className="text-sm text-green-700 space-y-1">
                    <li>• Numbers quarantined for 30 days by default</li>
                    <li>• Automatic release after quarantine period</li>
                    <li>• Manual release option available</li>
                    <li>• Spam history tracking</li>
                  </ul>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-blue-800 mb-2">Monitoring Features</h4>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>• Real-time spam score calculation</li>
                    <li>• Daily call limit tracking</li>
                    <li>• Area code pattern analysis</li>
                    <li>• Manual spam check triggers</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="troubleshooting" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HelpCircle className="h-5 w-5" />
                  Common Issues & Solutions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="border-l-4 border-blue-500 pl-4">
                    <h4 className="font-semibold">Can't make calls</h4>
                    <p className="text-sm text-gray-600">
                      Ensure Twilio credentials are correctly configured in API Keys. 
                      Check that your Twilio account has sufficient balance and the phone number is verified.
                    </p>
                  </div>

                  <div className="border-l-4 border-green-500 pl-4">
                    <h4 className="font-semibold">Numbers not importing to Retell AI</h4>
                    <p className="text-sm text-gray-600">
                      Verify your Retell AI API key is valid and you have an active account. 
                      Ensure the termination URI is properly formatted.
                    </p>
                  </div>

                  <div className="border-l-4 border-orange-500 pl-4">
                    <h4 className="font-semibold">Spam detection not working</h4>
                    <p className="text-sm text-gray-600">
                      The spam detection system runs automatically. You can manually trigger checks 
                      from the Dashboard. Ensure numbers have call activity to generate spam scores.
                    </p>
                  </div>

                  <div className="border-l-4 border-red-500 pl-4">
                    <h4 className="font-semibold">Numbers stuck in quarantine</h4>
                    <p className="text-sm text-gray-600">
                      Numbers are quarantined for 30 days by default. You can manually release 
                      them early using the "Release" button, or wait for automatic release.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Footer Navigation */}
        <div className="flex justify-center gap-4 pt-6 border-t">
          <Button onClick={() => navigate('/')} className="bg-blue-600 hover:bg-blue-700">
            <Home size={16} className="mr-2" />
            Return to Dashboard
          </Button>
          <Button variant="outline" onClick={() => navigate('/settings')}>
            <Settings size={16} className="mr-2" />
            Settings
          </Button>
          <Button variant="outline" onClick={() => navigate('/api-keys')}>
            <Bot size={16} className="mr-2" />
            API Keys
          </Button>
        </div>
      </div>
    </div>
  );
};

export default HelpSystem;
