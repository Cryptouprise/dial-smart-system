import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HelpCircle, BookOpen, Settings, Phone, Shield, Bot, ArrowLeft, Home, Zap, RotateCw, Brain, Database } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Navigation from '@/components/Navigation';

const HelpSystem = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Navigation />
      <div className="max-w-6xl mx-auto p-6 space-y-6">
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
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Complete System Documentation</h1>
          <p className="text-lg text-gray-600">Comprehensive guide to all features and functions</p>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="features">All Features</TabsTrigger>
            <TabsTrigger value="setup">Setup Guide</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="automation">Automation</TabsTrigger>
            <TabsTrigger value="troubleshooting">Troubleshooting</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>System Overview</CardTitle>
                <CardDescription>Your complete phone number management platform</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-semibold text-blue-800 mb-2">6 Main Dashboard Sections</h4>
                    <ul className="text-sm text-blue-700 space-y-1">
                      <li>• Overview - Quick stats and number management</li>
                      <li>• Analytics - Performance data and insights</li>
                      <li>• AI Engine - Intelligent recommendations</li>
                      <li>• Yellowstone - Rollback and backup system</li>
                      <li>• Advanced Rotation - Smart number rotation</li>
                      <li>• Spam Protection - Automated spam detection</li>
                    </ul>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg">
                    <h4 className="font-semibold text-green-800 mb-2">Core Capabilities</h4>
                    <ul className="text-sm text-green-700 space-y-1">
                      <li>• Automated number purchasing</li>
                      <li>• Real-time spam detection</li>
                      <li>• AI-powered decision making</li>
                      <li>• System state management</li>
                      <li>• Integration with Retell AI & Twilio</li>
                      <li>• Advanced analytics and reporting</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="features" className="space-y-6">
            <div className="grid gap-6">
              {/* Overview Tab Features */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Overview Tab Functions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="border-l-4 border-blue-500 pl-4">
                      <h4 className="font-semibold">Quick Stats Dashboard</h4>
                      <p className="text-sm text-gray-600 mb-2">Real-time metrics display</p>
                      <ul className="text-sm space-y-1">
                        <li><strong>Total Numbers:</strong> Shows count of all numbers with active subset</li>
                        <li><strong>Daily Calls:</strong> Sum of all calls with per-number average</li>
                        <li><strong>Quarantined:</strong> Count and percentage of flagged numbers</li>
                        <li><strong>Area Codes:</strong> Geographic diversity indicator</li>
                      </ul>
                    </div>
                    
                    <div className="border-l-4 border-green-500 pl-4">
                      <h4 className="font-semibold">Number Purchase System</h4>
                      <p className="text-sm text-gray-600 mb-2">Automated Twilio number acquisition</p>
                      <ul className="text-sm space-y-1">
                        <li><strong>Area Code Input:</strong> Specify target geographic regions</li>
                        <li><strong>Quantity Selection:</strong> Bulk purchase 1-50 numbers at once</li>
                        <li><strong>Auto-Import Toggle:</strong> Automatic Retell AI integration</li>
                        <li><strong>Purchase Button:</strong> Executes Twilio API calls</li>
                      </ul>
                    </div>

                    <div className="border-l-4 border-purple-500 pl-4">
                      <h4 className="font-semibold">Number Management Table</h4>
                      <p className="text-sm text-gray-600 mb-2">Complete number lifecycle management</p>
                      <ul className="text-sm space-y-1">
                        <li><strong>Status Badges:</strong> Active, Quarantined, Inactive states</li>
                        <li><strong>Call Tracking:</strong> Daily usage metrics</li>
                        <li><strong>Spam Scoring:</strong> Risk assessment (0-100)</li>
                        <li><strong>Action Buttons:</strong> Test call, release from quarantine</li>
                        <li><strong>Bulk Operations:</strong> Select multiple for mass actions</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Analytics Tab Features */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <RotateCw className="h-5 w-5" />
                    Analytics Tab Functions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="border-l-4 border-blue-500 pl-4">
                      <h4 className="font-semibold">Performance Charts</h4>
                      <ul className="text-sm space-y-1">
                        <li><strong>Call Volume Trends:</strong> Daily usage patterns over time</li>
                        <li><strong>Area Code Analysis:</strong> Geographic performance comparison</li>
                        <li><strong>Status Distribution:</strong> Health overview pie chart</li>
                        <li><strong>Risk Assessment:</strong> Spam probability visualization</li>
                      </ul>
                    </div>
                    
                    <div className="border-l-4 border-green-500 pl-4">
                      <h4 className="font-semibold">Real-time Metrics</h4>
                      <ul className="text-sm space-y-1">
                        <li><strong>Success Rates:</strong> Call completion percentages</li>
                        <li><strong>Utilization Rates:</strong> Active vs. total number efficiency</li>
                        <li><strong>Quarantine Rates:</strong> Spam detection effectiveness</li>
                        <li><strong>Cost Analysis:</strong> Per-call and monthly expenses</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* AI Engine Features */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5" />
                    AI Engine Functions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="border-l-4 border-purple-500 pl-4">
                      <h4 className="font-semibold">Intelligent Analysis</h4>
                      <ul className="text-sm space-y-1">
                        <li><strong>Pattern Recognition:</strong> Identifies usage patterns and anomalies</li>
                        <li><strong>Risk Assessment:</strong> Predicts spam probability before it happens</li>
                        <li><strong>Performance Optimization:</strong> Suggests improvements</li>
                        <li><strong>Cost Optimization:</strong> Recommends cost-saving strategies</li>
                      </ul>
                    </div>
                    
                    <div className="border-l-4 border-orange-500 pl-4">
                      <h4 className="font-semibold">Automated Recommendations</h4>
                      <ul className="text-sm space-y-1">
                        <li><strong>Rotation Alerts:</strong> When to rotate high-volume numbers</li>
                        <li><strong>Purchase Suggestions:</strong> Optimal area codes and timing</li>
                        <li><strong>Pool Optimization:</strong> Right-size your number inventory</li>
                        <li><strong>Quarantine Prevention:</strong> Proactive risk mitigation</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Yellowstone Features */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    Yellowstone Rollback System
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="border-l-4 border-yellow-500 pl-4">
                      <h4 className="font-semibold">System State Management</h4>
                      <ul className="text-sm space-y-1">
                        <li><strong>Automatic Snapshots:</strong> Periodic system state backups</li>
                        <li><strong>Manual Snapshots:</strong> Create backups before major changes</li>
                        <li><strong>AI-Triggered Snapshots:</strong> Smart backup decisions</li>
                        <li><strong>One-Click Rollback:</strong> Restore to any previous state</li>
                      </ul>
                    </div>
                    
                    <div className="border-l-4 border-red-500 pl-4">
                      <h4 className="font-semibold">Disaster Recovery</h4>
                      <ul className="text-sm space-y-1">
                        <li><strong>Configuration Backup:</strong> All settings preserved</li>
                        <li><strong>Number State Backup:</strong> Status, calls, spam scores</li>
                        <li><strong>Timeline Management:</strong> Multiple restore points</li>
                        <li><strong>Impact Analysis:</strong> Preview changes before rollback</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Advanced Rotation Features */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <RotateCw className="h-5 w-5" />
                    Advanced Rotation Functions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="border-l-4 border-blue-500 pl-4">
                      <h4 className="font-semibold">Automation Engine</h4>
                      <ul className="text-sm space-y-1">
                        <li><strong>Auto-Import on Purchase:</strong> Seamless Retell AI integration</li>
                        <li><strong>Auto-Remove Quarantined:</strong> Clean up flagged numbers</li>
                        <li><strong>Auto-Assign Agents:</strong> Default agent assignment</li>
                        <li><strong>Smart Scheduling:</strong> Optimal rotation timing</li>
                      </ul>
                    </div>
                    
                    <div className="border-l-4 border-green-500 pl-4">
                      <h4 className="font-semibold">Rotation Strategies</h4>
                      <ul className="text-sm space-y-1">
                        <li><strong>Round Robin:</strong> Equal distribution of usage</li>
                        <li><strong>Random Selection:</strong> Unpredictable patterns</li>
                        <li><strong>Call Volume Based:</strong> Performance-driven rotation</li>
                        <li><strong>Age-Based:</strong> Time-since-use prioritization</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Spam Protection Features */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Spam Protection Functions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="border-l-4 border-red-500 pl-4">
                      <h4 className="font-semibold">Detection Systems</h4>
                      <ul className="text-sm space-y-1">
                        <li><strong>Real-time Monitoring:</strong> Continuous call volume tracking</li>
                        <li><strong>Pattern Analysis:</strong> Unusual usage detection</li>
                        <li><strong>Threshold Management:</strong> Configurable risk limits</li>
                        <li><strong>Machine Learning:</strong> Adaptive detection algorithms</li>
                      </ul>
                    </div>
                    
                    <div className="border-l-4 border-orange-500 pl-4">
                      <h4 className="font-semibold">Protection Actions</h4>
                      <ul className="text-sm space-y-1">
                        <li><strong>Auto-Quarantine:</strong> Immediate isolation of risky numbers</li>
                        <li><strong>Graduated Warnings:</strong> Progressive alert system</li>
                        <li><strong>Manual Override:</strong> Force quarantine or release</li>
                        <li><strong>Whitelist Management:</strong> Trusted number exceptions</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

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

          <TabsContent value="automation" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Automation Workflows
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-semibold text-blue-800 mb-2">Standard Automation Flow</h4>
                    <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                      <li>Purchase numbers in target area codes</li>
                      <li>Auto-import to Retell AI (if enabled)</li>
                      <li>Monitor call volumes and spam scores</li>
                      <li>Rotate numbers based on usage patterns</li>
                      <li>Quarantine high-risk numbers automatically</li>
                      <li>Generate performance reports</li>
                    </ol>
                  </div>

                  <div className="p-4 bg-green-50 rounded-lg">
                    <h4 className="font-semibold text-green-800 mb-2">AI-Enhanced Workflow</h4>
                    <ol className="text-sm text-green-700 space-y-1 list-decimal list-inside">
                      <li>AI analyzes historical patterns</li>
                      <li>Predictive recommendations generated</li>
                      <li>Proactive number rotation before issues</li>
                      <li>Yellowstone snapshots created intelligently</li>
                      <li>Optimization suggestions implemented</li>
                      <li>Continuous learning and improvement</li>
                    </ol>
                  </div>

                  <div className="p-4 bg-purple-50 rounded-lg">
                    <h4 className="font-semibold text-purple-800 mb-2">Emergency Procedures</h4>
                    <ol className="text-sm text-purple-700 space-y-1 list-decimal list-inside">
                      <li>Automatic Yellowstone snapshot creation</li>
                      <li>Mass quarantine of affected numbers</li>
                      <li>Immediate rotation to backup pool</li>
                      <li>Alert system activation</li>
                      <li>Manual intervention options available</li>
                      <li>Post-incident analysis and learning</li>
                    </ol>
                  </div>
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
