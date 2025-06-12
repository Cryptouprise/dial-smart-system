
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Search, 
  Phone, 
  Settings, 
  Shield, 
  Brain, 
  RotateCw, 
  AlertTriangle, 
  HelpCircle, 
  Book, 
  Video,
  Link,
  Zap,
  Users,
  Target,
  RefreshCw,
  CheckCircle,
  ArrowLeftRight
} from 'lucide-react';
import Navigation from '@/components/Navigation';

const HelpSystem = () => {
  const [searchTerm, setSearchTerm] = useState('');

  const helpSections = {
    'getting-started': {
      title: 'Getting Started',
      icon: Book,
      articles: [
        {
          title: 'Setting Up Your First Campaign',
          content: 'Learn how to create and configure your first voice campaign in Smart Dialer.',
          steps: [
            'Navigate to the Predictive Dialing tab',
            'Click "Create New Campaign"',
            'Enter campaign name and description',
            'Configure dialing settings',
            'Upload your lead list',
            'Start your campaign'
          ]
        },
        {
          title: 'Purchasing Phone Numbers',
          content: 'How to buy and manage phone numbers for your campaigns.',
          steps: [
            'Go to the Overview tab',
            'Enter desired area code',
            'Specify quantity needed',
            'Enable auto-import to Retell AI if needed',
            'Click "Purchase Numbers"'
          ]
        },
        {
          title: 'Connecting Retell AI',
          content: 'Set up AI-powered voice conversations.',
          steps: [
            'Navigate to the Retell AI tab',
            'Enter your Retell AI API key',
            'Configure your AI agent settings',
            'Test the connection',
            'Import phone numbers'
          ]
        }
      ]
    },
    'integrations': {
      title: 'Integrations',
      icon: Link,
      articles: [
        {
          title: 'Go High Level Integration',
          content: 'Complete guide to connecting and using Go High Level with Smart Dialer.',
          steps: [
            'Go to the Go High Level tab in the dashboard',
            'Enter your GHL API Key from your Go High Level settings',
            'Add your Location ID (sub-account ID)',
            'Optionally add webhook signing key for secure webhooks',
            'Click "Connect to Go High Level"',
            'Configure sync settings and automation preferences'
          ],
          features: [
            'Bidirectional lead synchronization',
            'Automatic contact updates after calls',
            'Opportunity creation in GHL pipelines',
            'Real-time webhook integration',
            'Custom field mapping',
            'Call outcome tracking'
          ],
          troubleshooting: [
            'Ensure your API key has proper permissions',
            'Verify Location ID is correct',
            'Check that your GHL plan supports API access',
            'Confirm webhook URLs are properly configured'
          ]
        },
        {
          title: 'Yellowstone Integration',
          content: 'Connect with Yellowstone for enhanced lead management.',
          steps: [
            'Navigate to Yellowstone tab',
            'Enter API credentials',
            'Configure sync preferences',
            'Test connection'
          ]
        },
        {
          title: 'Webhook Configuration',
          content: 'Set up webhooks for real-time data synchronization.',
          steps: [
            'Copy webhook URL from integration settings',
            'Add webhook to your external service',
            'Configure event types to receive',
            'Test webhook delivery'
          ]
        }
      ]
    },
    'predictive-dialing': {
      title: 'Predictive Dialing',
      icon: Target,
      articles: [
        {
          title: 'Campaign Management',
          content: 'Create, configure, and manage your calling campaigns.',
          steps: [
            'Access the Predictive Dialing dashboard',
            'Create new campaigns with specific targets',
            'Upload and manage lead lists',
            'Configure dialing algorithms and timing',
            'Monitor campaign performance in real-time'
          ]
        },
        {
          title: 'Lead Management',
          content: 'Import, organize, and track your leads effectively.',
          steps: [
            'Import leads from CSV files or integrations',
            'Organize leads by priority and status',
            'Set custom fields and tags',
            'Track call history and outcomes',
            'Schedule follow-up actions'
          ]
        },
        {
          title: 'Call Center Operations',
          content: 'Manage your calling operations and agent workflows.',
          steps: [
            'Monitor live call activities',
            'Manage agent assignments',
            'Track call outcomes and dispositions',
            'Generate real-time reports',
            'Handle call transfers and escalations'
          ]
        }
      ]
    },
    'spam-detection': {
      title: 'Spam Detection',
      icon: Shield,
      articles: [
        {
          title: 'Understanding Spam Scores',
          content: 'Learn how spam detection works and how to interpret scores.',
          steps: [
            'Spam scores range from 0-100',
            'Scores above 70 indicate high spam risk',
            'Scores 40-70 are moderate risk',
            'Scores below 40 are generally safe',
            'Numbers are auto-quarantined at 85+'
          ]
        },
        {
          title: 'Managing Quarantined Numbers',
          content: 'How to handle numbers that have been quarantined.',
          steps: [
            'Review quarantined numbers in the overview',
            'Check spam score and recent activity',
            'Release numbers if spam score improves',
            'Replace heavily flagged numbers',
            'Monitor released numbers closely'
          ]
        },
        {
          title: 'Spam Prevention Best Practices',
          content: 'Tips to maintain good number reputation.',
          steps: [
            'Rotate numbers regularly',
            'Limit daily calls per number',
            'Use legitimate caller IDs',
            'Respect do-not-call lists',
            'Monitor feedback and complaints'
          ]
        }
      ]
    },
    'ai-features': {
      title: 'AI Features',
      icon: Brain,
      articles: [
        {
          title: 'AI Decision Engine',
          content: 'Leverage AI for intelligent call routing and decisions.',
          steps: [
            'Configure AI decision rules',
            'Set up lead scoring algorithms',
            'Define automation triggers',
            'Monitor AI performance',
            'Adjust parameters as needed'
          ]
        },
        {
          title: 'Voice AI with Retell',
          content: 'Set up AI-powered voice conversations.',
          steps: [
            'Create Retell AI account',
            'Configure voice agents',
            'Set up conversation flows',
            'Train AI responses',
            'Monitor conversation quality'
          ]
        }
      ]
    },
    'troubleshooting': {
      title: 'Troubleshooting',
      icon: AlertTriangle,
      articles: [
        {
          title: 'Connection Issues',
          content: 'Resolve common connectivity problems.',
          steps: [
            'Check internet connection',
            'Verify API credentials',
            'Test firewall settings',
            'Review error logs',
            'Contact support if needed'
          ]
        },
        {
          title: 'Call Quality Issues',
          content: 'Improve call quality and success rates.',
          steps: [
            'Check number reputation',
            'Verify caller ID settings',
            'Test audio quality',
            'Review carrier restrictions',
            'Adjust calling patterns'
          ]
        },
        {
          title: 'Integration Problems',
          content: 'Fix issues with external service integrations.',
          steps: [
            'Verify API keys and permissions',
            'Check webhook configurations',
            'Test sync functionality',
            'Review error messages',
            'Update integration settings'
          ]
        }
      ]
    }
  };

  const filteredSections = Object.entries(helpSections).filter(([key, section]) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      section.title.toLowerCase().includes(searchLower) ||
      section.articles.some(article => 
        article.title.toLowerCase().includes(searchLower) ||
        article.content.toLowerCase().includes(searchLower)
      )
    );
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-950 dark:to-slate-900">
      <Navigation />
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">📚 Help Center</h1>
          <p className="text-xl text-gray-600 dark:text-gray-300">
            Find answers and learn how to use Smart Dialer effectively
          </p>
          
          {/* Search Bar */}
          <div className="max-w-md mx-auto relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search help articles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <Tabs defaultValue="getting-started" className="space-y-6">
          <div className="flex justify-center">
            <TabsList className="grid grid-cols-2 lg:grid-cols-6 w-full max-w-4xl">
              {Object.entries(helpSections).map(([key, section]) => {
                const Icon = section.icon;
                return (
                  <TabsTrigger key={key} value={key} className="flex items-center gap-2 text-xs lg:text-sm">
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{section.title}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {filteredSections.map(([key, section]) => (
            <TabsContent key={key} value={key} className="space-y-4">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  {section.title}
                </h2>
              </div>
              
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {section.articles.map((article, index) => (
                  <Card key={index} className="h-full">
                    <CardHeader>
                      <CardTitle className="text-lg">{article.title}</CardTitle>
                      <CardDescription>{article.content}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <h4 className="font-semibold mb-2">Steps:</h4>
                        <ol className="space-y-1 text-sm">
                          {article.steps.map((step, stepIndex) => (
                            <li key={stepIndex} className="flex items-start gap-2">
                              <span className="flex-shrink-0 w-5 h-5 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full flex items-center justify-center text-xs font-medium">
                                {stepIndex + 1}
                              </span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                      
                      {article.features && (
                        <div>
                          <h4 className="font-semibold mb-2">Key Features:</h4>
                          <ul className="space-y-1 text-sm">
                            {article.features.map((feature, featureIndex) => (
                              <li key={featureIndex} className="flex items-start gap-2">
                                <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                                <span>{feature}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {article.troubleshooting && (
                        <div>
                          <h4 className="font-semibold mb-2">Troubleshooting:</h4>
                          <ul className="space-y-1 text-sm">
                            {article.troubleshooting.map((tip, tipIndex) => (
                              <li key={tipIndex} className="flex items-start gap-2">
                                <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                                <span>{tip}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Quick Actions
            </CardTitle>
            <CardDescription>Common tasks and helpful resources</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Button variant="outline" className="h-auto p-4 flex flex-col items-center gap-2">
                <Video className="h-6 w-6" />
                <span className="font-medium">Video Tutorials</span>
                <span className="text-xs text-gray-500">Watch step-by-step guides</span>
              </Button>
              
              <Button variant="outline" className="h-auto p-4 flex flex-col items-center gap-2">
                <HelpCircle className="h-6 w-6" />
                <span className="font-medium">Contact Support</span>
                <span className="text-xs text-gray-500">Get personalized help</span>
              </Button>
              
              <Button variant="outline" className="h-auto p-4 flex flex-col items-center gap-2">
                <Book className="h-6 w-6" />
                <span className="font-medium">API Documentation</span>
                <span className="text-xs text-gray-500">Developer resources</span>
              </Button>
              
              <Button variant="outline" className="h-auto p-4 flex flex-col items-center gap-2">
                <Users className="h-6 w-6" />
                <span className="font-medium">Community Forum</span>
                <span className="text-xs text-gray-500">Connect with other users</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Integration Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link className="h-5 w-5" />
              Integration Status
            </CardTitle>
            <CardDescription>Check your current integration setup</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <Link className="h-4 w-4" />
                  <span className="font-medium">Go High Level</span>
                </div>
                <Badge variant="secondary">Check Setup</Badge>
              </div>
              
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  <span className="font-medium">Retell AI</span>
                </div>
                <Badge variant="secondary">Check Setup</Badge>
              </div>
              
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  <span className="font-medium">Yellowstone</span>
                </div>
                <Badge variant="secondary">Check Setup</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default HelpSystem;
