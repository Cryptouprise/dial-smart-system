
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Navigation from '@/components/Navigation';
import TranscriptAnalyzer from '@/components/TranscriptAnalyzer';
import PipelineKanban from '@/components/PipelineKanban';
import ScriptAnalyticsDashboard from '@/components/ScriptAnalyticsDashboard';
import { Brain, BarChart3, Workflow, TrendingUp } from 'lucide-react';

const Analytics = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-950 dark:to-slate-900">
      <Navigation />
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">📊 Analytics & Pipeline</h1>
          <p className="text-xl text-gray-600 dark:text-gray-300">
            AI-powered call analysis and visual pipeline management
          </p>
        </div>

        <Tabs defaultValue="transcript-analyzer" className="space-y-6">
          <div className="flex justify-center">
            <TabsList className="grid grid-cols-3 w-full max-w-2xl">
              <TabsTrigger value="transcript-analyzer" className="flex items-center gap-2">
                <Brain className="h-4 w-4" />
                <span className="hidden sm:inline">AI Analysis</span>
              </TabsTrigger>
              <TabsTrigger value="pipeline" className="flex items-center gap-2">
                <Workflow className="h-4 w-4" />
                <span className="hidden sm:inline">Pipeline</span>
              </TabsTrigger>
              <TabsTrigger value="reports" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Reports</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="transcript-analyzer" className="space-y-6">
            <TranscriptAnalyzer />
          </TabsContent>

          <TabsContent value="pipeline" className="space-y-6">
            <PipelineKanban />
          </TabsContent>

          <TabsContent value="reports" className="space-y-6">
            <ScriptAnalyticsDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Analytics;
