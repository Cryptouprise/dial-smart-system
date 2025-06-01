
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HelpCircle, BookOpen, Settings, Phone, Shield, Bot, ArrowLeft, Home, Zap, RotateCw, Brain, Database, AlertTriangle, CheckCircle, Clock, Users } from 'lucide-react';
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
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Complete Phone Dialer System Guide</h1>
          <p className="text-lg text-gray-600">Everything you need to know to master your phone number management platform</p>
          <div className="mt-4 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
            <p className="text-blue-800 font-medium">📞 New to phone dialers? Start with the "Quick Start" tab below!</p>
          </div>
        </div>

        <Tabs defaultValue="quickstart" className="w-full">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="quickstart">Quick Start</TabsTrigger>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="features">All Features</TabsTrigger>
            <TabsTrigger value="setup">Setup Guide</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="automation">Automation</TabsTrigger>
            <TabsTrigger value="troubleshooting">Troubleshooting</TabsTrigger>
          </TabsList>

          <TabsContent value="quickstart" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-green-600" />
                  🚀 Get Started in 5 Minutes
                </CardTitle>
                <CardDescription>Follow these simple steps to make your first call</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4">
                  <div className="flex items-start gap-4 p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="bg-green-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg font-bold">1</div>
                    <div className="flex-1">
                      <h3 className="font-bold text-green-800 text-lg">Add Your API Keys</h3>
                      <p className="text-green-700 mb-3">You need Twilio credentials to make calls. Don't have them? No problem!</p>
                      <div className="bg-white p-3 rounded border">
                        <p className="text-sm font-medium mb-2">What you need from Twilio:</p>
                        <ul className="text-sm space-y-1 text-gray-600">
                          <li>• <strong>Account SID</strong> (starts with "AC...")</li>
                          <li>• <strong>Auth Token</strong> (long random string)</li>
                          <li>• <strong>Phone Number</strong> (your Twilio number for outbound calls)</li>
                        </ul>
                        <p className="text-xs text-gray-500 mt-2">💡 Find these in your Twilio Console → Account → API Keys</p>
                      </div>
                      <Button 
                        onClick={() => navigate('/api-keys')}
                        className="mt-3 bg-green-600 hover:bg-green-700"
                      >
                        Add API Keys Now →
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg font-bold">2</div>
                    <div className="flex-1">
                      <h3 className="font-bold text-blue-800 text-lg">Buy Phone Numbers</h3>
                      <p className="text-blue-700 mb-3">Purchase phone numbers to start calling from</p>
                      <div className="bg-white p-3 rounded border">
                        <p className="text-sm font-medium mb-2">How to buy numbers:</p>
                        <ol className="text-sm space-y-1 text-gray-600 list-decimal list-inside">
                          <li>Go to Dashboard → Overview tab</li>
                          <li>Enter area code (like 555 for New York)</li>
                          <li>Choose quantity (start with 5-10 numbers)</li>
                          <li>Click "Purchase Numbers"</li>
                        </ol>
                        <p className="text-xs text-gray-500 mt-2">💰 Cost: ~$1/month per number</p>
                      </div>
                      <Button 
                        onClick={() => navigate('/')}
                        className="mt-3 bg-blue-600 hover:bg-blue-700"
                      >
                        Buy Numbers Now →
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="bg-purple-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg font-bold">3</div>
                    <div className="flex-1">
                      <h3 className="font-bold text-purple-800 text-lg">Make Your First Test Call</h3>
                      <p className="text-purple-700 mb-3">Test that everything works with a simple call</p>
                      <div className="bg-white p-3 rounded border">
                        <p className="text-sm font-medium mb-2">Testing your setup:</p>
                        <ol className="text-sm space-y-1 text-gray-600 list-decimal list-inside">
                          <li>Find any number in your numbers list</li>
                          <li>Click the "Test Call" button</li>
                          <li>Enter your personal phone number</li>
                          <li>You should receive a call!</li>
                        </ol>
                        <p className="text-xs text-gray-500 mt-2">🔧 Not working? Check the Troubleshooting tab</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 bg-orange-50 rounded-lg border border-orange-200">
                    <div className="bg-orange-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg font-bold">4</div>
                    <div className="flex-1">
                      <h3 className="font-bold text-orange-800 text-lg">🎉 You're Ready!</h3>
                      <p className="text-orange-700 mb-3">Now you can start using advanced features</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="text-sm bg-white p-2 rounded border">
                          <strong>Next Steps:</strong>
                          <ul className="mt-1 space-y-1 text-gray-600">
                            <li>• Set up AI calling (Retell AI)</li>
                            <li>• Configure spam protection</li>
                            <li>• Set up number rotation</li>
                          </ul>
                        </div>
                        <div className="text-sm bg-white p-2 rounded border">
                          <strong>Pro Tips:</strong>
                          <ul className="mt-1 space-y-1 text-gray-600">
                            <li>• Monitor call analytics daily</li>
                            <li>• Use different area codes</li>
                            <li>• Keep spam scores low</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-yellow-800">⚠️ Important Notes for Beginners</h4>
                      <ul className="text-sm text-yellow-700 mt-2 space-y-1">
                        <li>• <strong>Start small:</strong> Buy 5-10 numbers first, not 50</li>
                        <li>• <strong>Different area codes:</strong> Don't buy all numbers from the same area</li>
                        <li>• <strong>Monitor spam scores:</strong> Numbers with high scores get blocked</li>
                        <li>• <strong>Rotate regularly:</strong> Don't overuse the same number</li>
                        <li>• <strong>Test everything:</strong> Always test before going live</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="overview" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>System Overview</CardTitle>
                <CardDescription>Your complete phone number management platform explained simply</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-semibold text-blue-800 mb-2">🎯 What This System Does</h4>
                    <ul className="text-sm text-blue-700 space-y-1">
                      <li>• Manages hundreds of phone numbers automatically</li>
                      <li>• Prevents numbers from being marked as spam</li>
                      <li>• Rotates numbers to avoid overuse</li>
                      <li>• Integrates with AI calling services</li>
                      <li>• Provides detailed analytics and reporting</li>
                      <li>• Backs up and restores system states</li>
                    </ul>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg">
                    <h4 className="font-semibold text-green-800 mb-2">📊 6 Main Dashboard Sections</h4>
                    <ul className="text-sm text-green-700 space-y-1">
                      <li>• <strong>Overview:</strong> Buy numbers, see stats, manage pool</li>
                      <li>• <strong>Analytics:</strong> Charts, graphs, performance data</li>
                      <li>• <strong>AI Engine:</strong> Smart recommendations and insights</li>
                      <li>• <strong>Yellowstone:</strong> Backup and restore system</li>
                      <li>• <strong>Advanced Rotation:</strong> Automated number switching</li>
                      <li>• <strong>Spam Protection:</strong> Keep numbers healthy</li>
                    </ul>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold text-gray-800 mb-3">🔄 Typical Daily Workflow</h4>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="text-center p-3 bg-white rounded border">
                      <Clock className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                      <h5 className="font-medium text-sm">Morning</h5>
                      <p className="text-xs text-gray-600 mt-1">Check overnight analytics and spam scores</p>
                    </div>
                    <div className="text-center p-3 bg-white rounded border">
                      <Users className="h-8 w-8 mx-auto mb-2 text-green-600" />
                      <h5 className="font-medium text-sm">Midday</h5>
                      <p className="text-xs text-gray-600 mt-1">Start calling campaigns with rotated numbers</p>
                    </div>
                    <div className="text-center p-3 bg-white rounded border">
                      <Brain className="h-8 w-8 mx-auto mb-2 text-purple-600" />
                      <h5 className="font-medium text-sm">Afternoon</h5>
                      <p className="text-xs text-gray-600 mt-1">Review AI recommendations and optimize</p>
                    </div>
                    <div className="text-center p-3 bg-white rounded border">
                      <Shield className="h-8 w-8 mx-auto mb-2 text-orange-600" />
                      <h5 className="font-medium text-sm">Evening</h5>
                      <p className="text-xs text-gray-600 mt-1">Check for quarantined numbers and plan tomorrow</p>
                    </div>
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
                  Complete Setup Guide
                </CardTitle>
                <CardDescription>Detailed instructions for each step of the setup process</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-6">
                  <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
                    <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">1</div>
                    <div>
                      <h4 className="font-semibold text-lg">Configure API Keys (Required)</h4>
                      <p className="text-sm text-gray-600 mb-3">Add your service credentials to connect to external services</p>
                      
                      <div className="space-y-3">
                        <div className="bg-white p-3 rounded border">
                          <h5 className="font-medium text-blue-800">Twilio (Required for calling)</h5>
                          <div className="text-sm text-gray-600 mt-1">
                            <p><strong>Where to find:</strong> Twilio Console → Account → API Keys & tokens</p>
                            <ul className="mt-1 ml-4 list-disc">
                              <li><strong>Account SID:</strong> Starts with "AC..." (visible on dashboard)</li>
                              <li><strong>Auth Token:</strong> Click "View" next to Auth Token</li>
                              <li><strong>Phone Number:</strong> Format: +1234567890 (from your Twilio numbers)</li>
                            </ul>
                          </div>
                        </div>

                        <div className="bg-white p-3 rounded border">
                          <h5 className="font-medium text-green-800">Retell AI (Optional, for AI calling)</h5>
                          <div className="text-sm text-gray-600 mt-1">
                            <p><strong>Where to find:</strong> Retell AI Dashboard → API Keys</p>
                            <p><strong>What it does:</strong> Enables AI-powered voice agents for automated calling</p>
                          </div>
                        </div>

                        <div className="bg-white p-3 rounded border">
                          <h5 className="font-medium text-purple-800">OpenAI (Optional, for AI features)</h5>
                          <div className="text-sm text-gray-600 mt-1">
                            <p><strong>Where to find:</strong> OpenAI Platform → API Keys</p>
                            <p><strong>What it does:</strong> Powers intelligent recommendations and analysis</p>
                          </div>
                        </div>
                      </div>

                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => navigate('/api-keys')}
                        className="mt-3"
                      >
                        Configure API Keys →
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg">
                    <div className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">2</div>
                    <div>
                      <h4 className="font-semibold text-lg">Purchase Your First Phone Numbers</h4>
                      <p className="text-sm text-gray-600 mb-3">Buy phone numbers to start making calls</p>
                      
                      <div className="bg-white p-3 rounded border">
                        <h5 className="font-medium mb-2">Step-by-step process:</h5>
                        <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1">
                          <li>Go to Dashboard → Overview tab</li>
                          <li>In "Buy Numbers" section, enter area code (3 digits, like 555)</li>
                          <li>Choose quantity (recommend starting with 5-10 numbers)</li>
                          <li>Toggle "Auto-import to Retell AI" if you have Retell AI configured</li>
                          <li>Click "Purchase Numbers" and wait for confirmation</li>
                        </ol>
                        <div className="mt-3 p-2 bg-yellow-50 rounded">
                          <p className="text-xs text-yellow-800"><strong>💡 Pro tip:</strong> Use different area codes for better distribution (555, 213, 415, etc.)</p>
                        </div>
                      </div>

                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => navigate('/')}
                        className="mt-3"
                      >
                        Go to Dashboard →
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 bg-purple-50 rounded-lg">
                    <div className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">3</div>
                    <div>
                      <h4 className="font-semibold text-lg">Configure Spam Protection</h4>
                      <p className="text-sm text-gray-600 mb-3">Set up automatic monitoring to keep numbers healthy</p>
                      
                      <div className="bg-white p-3 rounded border">
                        <h5 className="font-medium mb-2">Automatic protection features:</h5>
                        <ul className="text-sm text-gray-600 space-y-1">
                          <li>• <strong>Real-time monitoring:</strong> Tracks call volumes and patterns</li>
                          <li>• <strong>Auto-quarantine:</strong> Isolates risky numbers automatically</li>
                          <li>• <strong>Spam scoring:</strong> Rates each number's risk level (0-100)</li>
                          <li>• <strong>30-day quarantine:</strong> Automatic release after cooling period</li>
                        </ul>
                        <div className="mt-3 p-2 bg-green-50 rounded">
                          <p className="text-xs text-green-800"><strong>✅ Good news:</strong> This works automatically once you have numbers!</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 bg-orange-50 rounded-lg">
                    <div className="bg-orange-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">4</div>
                    <div>
                      <h4 className="font-semibold text-lg">Test Your Setup</h4>
                      <p className="text-sm text-gray-600 mb-3">Verify everything works before going live</p>
                      
                      <div className="bg-white p-3 rounded border">
                        <h5 className="font-medium mb-2">Testing checklist:</h5>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span>Test call feature with your personal number</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span>Verify numbers appear in your dashboard</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span>Check analytics are tracking call data</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span>Confirm Retell AI integration (if enabled)</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-red-800">🚨 Common Setup Mistakes to Avoid</h4>
                      <ul className="text-sm text-red-700 mt-2 space-y-1">
                        <li>• <strong>Wrong phone number format:</strong> Must include country code (+1234567890)</li>
                        <li>• <strong>Invalid area codes:</strong> Use real US area codes only (check online lists)</li>
                        <li>• <strong>Insufficient Twilio balance:</strong> Ensure you have funds for number purchases</li>
                        <li>• <strong>Mixed up SID and Token:</strong> Account SID starts with "AC", Auth Token is longer</li>
                        <li>• <strong>Not testing first:</strong> Always test with small batches before scaling</li>
                      </ul>
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
                  Common Issues & Step-by-Step Solutions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-6">
                  <div className="border-l-4 border-red-500 pl-4 bg-red-50 p-4 rounded">
                    <h4 className="font-semibold text-red-800 text-lg">🚫 Can't Make Calls - Nothing Happens</h4>
                    <div className="mt-3 space-y-2">
                      <p className="text-sm font-medium text-red-700">Step-by-step solution:</p>
                      <ol className="text-sm text-red-600 list-decimal list-inside space-y-1 ml-2">
                        <li>Go to API Keys page and verify all fields are filled</li>
                        <li>Check Twilio console - is your Auth Token correct?</li>
                        <li>Verify phone number format: +1234567890 (with +1)</li>
                        <li>Confirm Twilio account has sufficient balance ($5+ recommended)</li>
                        <li>Try test call with a different number from your pool</li>
                      </ol>
                      <div className="mt-2 p-2 bg-white rounded border">
                        <p className="text-xs"><strong>Still not working?</strong> Log into Twilio console → Monitor → Logs to see error details</p>
                      </div>
                    </div>
                  </div>

                  <div className="border-l-4 border-orange-500 pl-4 bg-orange-50 p-4 rounded">
                    <h4 className="font-semibold text-orange-800 text-lg">🤖 Numbers Not Importing to Retell AI</h4>
                    <div className="mt-3 space-y-2">
                      <p className="text-sm font-medium text-orange-700">Step-by-step solution:</p>
                      <ol className="text-sm text-orange-600 list-decimal list-inside space-y-1 ml-2">
                        <li>Verify Retell AI API key is correct in API Keys page</li>
                        <li>Check you have an active Retell AI account with available credits</li>
                        <li>Ensure "Auto-import to Retell AI" toggle was ON when buying numbers</li>
                        <li>Try manually importing: go to Dashboard → select numbers → Import to Retell</li>
                        <li>Check Retell AI dashboard to confirm numbers appeared there</li>
                      </ol>
                      <div className="mt-2 p-2 bg-white rounded border">
                        <p className="text-xs"><strong>Pro tip:</strong> Retell AI may take 2-3 minutes to show new numbers</p>
                      </div>
                    </div>
                  </div>

                  <div className="border-l-4 border-yellow-500 pl-4 bg-yellow-50 p-4 rounded">
                    <h4 className="font-semibold text-yellow-800 text-lg">📊 Spam Detection Shows All Zeros</h4>
                    <div className="mt-3 space-y-2">
                      <p className="text-sm font-medium text-yellow-700">This is normal for new numbers! Here's why:</p>
                      <ul className="text-sm text-yellow-600 space-y-1 ml-2">
                        <li>• Spam scores require call history to calculate</li>
                        <li>• New numbers show 0 until they make/receive calls</li>
                        <li>• System updates scores every 24 hours automatically</li>
                        <li>• You can manually trigger checks from the Dashboard</li>
                      </ul>
                      <div className="mt-2 p-2 bg-white rounded border">
                        <p className="text-xs"><strong>Expected timeline:</strong> Scores appear after 1-2 days of calling activity</p>
                      </div>
                    </div>
                  </div>

                  <div className="border-l-4 border-purple-500 pl-4 bg-purple-50 p-4 rounded">
                    <h4 className="font-semibold text-purple-800 text-lg">🔒 Numbers Stuck in Quarantine</h4>
                    <div className="mt-3 space-y-2">
                      <p className="text-sm font-medium text-purple-700">Understanding quarantine system:</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                        <div className="bg-white p-3 rounded border">
                          <h5 className="font-medium text-sm">Why numbers get quarantined:</h5>
                          <ul className="text-xs text-gray-600 mt-1 space-y-1">
                            <li>• High call volume in short time</li>
                            <li>• Spam score above threshold (70+)</li>
                            <li>• Unusual calling patterns detected</li>
                            <li>• Manual quarantine by user</li>
                          </ul>
                        </div>
                        <div className="bg-white p-3 rounded border">
                          <h5 className="font-medium text-sm">How to release early:</h5>
                          <ul className="text-xs text-gray-600 mt-1 space-y-1">
                            <li>• Click "Release" button next to number</li>
                            <li>• Auto-release after 30 days</li>
                            <li>• Check if spam score improved first</li>
                            <li>• Monitor closely after release</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-l-4 border-blue-500 pl-4 bg-blue-50 p-4 rounded">
                    <h4 className="font-semibold text-blue-800 text-lg">📉 Poor Call Connection Rates</h4>
                    <div className="mt-3 space-y-2">
                      <p className="text-sm font-medium text-blue-700">Improving call success:</p>
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <div className="bg-white p-3 rounded border">
                          <h5 className="font-medium text-sm">Check these factors:</h5>
                          <ul className="text-xs text-gray-600 mt-1 space-y-1">
                            <li>• Time of day (avoid early morning/late evening)</li>
                            <li>• Area code reputation</li>
                            <li>• Number age (newer = better)</li>
                            <li>• Call frequency per number</li>
                          </ul>
                        </div>
                        <div className="bg-white p-3 rounded border">
                          <h5 className="font-medium text-sm">Best practices:</h5>
                          <ul className="text-xs text-gray-600 mt-1 space-y-1">
                            <li>• Rotate numbers frequently</li>
                            <li>• Use local area codes</li>
                            <li>• Keep calls under 50/day per number</li>
                            <li>• Monitor spam scores daily</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-l-4 border-green-500 pl-4 bg-green-50 p-4 rounded">
                    <h4 className="font-semibold text-green-800 text-lg">🔧 General Troubleshooting Steps</h4>
                    <div className="mt-3">
                      <p className="text-sm font-medium text-green-700 mb-2">When something isn't working, try these in order:</p>
                      <ol className="text-sm text-green-600 list-decimal list-inside space-y-1 ml-2">
                        <li>Refresh the page and try again</li>
                        <li>Check API Keys page - are all credentials valid?</li>
                        <li>Look at browser console (F12) for error messages</li>
                        <li>Try with a different number from your pool</li>
                        <li>Check your Twilio/Retell AI account directly</li>
                        <li>Contact support with specific error messages</li>
                      </ol>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold text-gray-800 mb-3">📞 Still Need Help?</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="text-center p-3 bg-white rounded border">
                      <BookOpen className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                      <h5 className="font-medium text-sm">Check Other Tabs</h5>
                      <p className="text-xs text-gray-600 mt-1">Setup Guide, Features, Integrations</p>
                    </div>
                    <div className="text-center p-3 bg-white rounded border">
                      <Settings className="h-8 w-8 mx-auto mb-2 text-green-600" />
                      <h5 className="font-medium text-sm">System Settings</h5>
                      <p className="text-xs text-gray-600 mt-1">API Keys, Configuration</p>
                    </div>
                    <div className="text-center p-3 bg-white rounded border">
                      <Phone className="h-8 w-8 mx-auto mb-2 text-purple-600" />
                      <h5 className="font-medium text-sm">Test Everything</h5>
                      <p className="text-xs text-gray-600 mt-1">Small tests before big campaigns</p>
                    </div>
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
