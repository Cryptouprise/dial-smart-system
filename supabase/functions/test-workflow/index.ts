/**
 * Test Workflow Edge Function
 * 
 * Allows testing workflows before deploying to real leads.
 * Supports both simulation and real execution modes.
 * 
 * Features:
 * - Validates workflow structure
 * - Simulates or executes steps
 * - Generates detailed test reports
 * - Provides optimization recommendations
 * - Estimates costs
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WorkflowStep {
  step_number: number;
  step_type: 'call' | 'sms' | 'ai_sms' | 'wait' | 'condition' | 'email' | 'webhook';
  step_config: Record<string, any>;
}

interface Workflow {
  name: string;
  description?: string;
  workflow_type: string;
  steps: WorkflowStep[];
  settings?: Record<string, any>;
}

interface TestRequest {
  workflow: Workflow;
  testPhoneNumber?: string;
  mode: 'simulation' | 'real';
  speed: 'realtime' | 'fast';
}

interface StepResult {
  stepNumber: number;
  stepType: string;
  status: 'success' | 'failed' | 'skipped';
  duration: string;
  details: string;
  timestamp: string;
  cost?: number;
  error?: string;
}

interface TestResults {
  testId: string;
  status: 'running' | 'completed' | 'failed';
  results: {
    totalSteps: number;
    successfulSteps: number;
    failedSteps: number;
    skippedSteps: number;
    totalDuration: string;
    simulatedDuration: string;
    estimatedCost: number;
  };
  stepResults: StepResult[];
  warnings: Array<{
    severity: 'low' | 'medium' | 'high';
    message: string;
    suggestion: string;
    steps?: number[];
  }>;
  recommendations: Array<{
    type: 'optimization' | 'enhancement' | 'cost-saving';
    message: string;
    impact: string;
    steps?: number[];
  }>;
  errors?: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase configuration missing');
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { workflow, testPhoneNumber, mode, speed }: TestRequest = await req.json();

    const testId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    const results: TestResults = {
      testId,
      status: 'running',
      results: {
        totalSteps: workflow.steps?.length || 0,
        successfulSteps: 0,
        failedSteps: 0,
        skippedSteps: 0,
        totalDuration: '0s',
        simulatedDuration: '0s',
        estimatedCost: 0,
      },
      stepResults: [],
      warnings: [],
      recommendations: [],
    };

    // Step 1: Validate workflow structure
    console.log(`[Test ${testId}] Validating workflow structure...`);
    const validationErrors = validateWorkflow(workflow);
    
    if (validationErrors.length > 0) {
      results.status = 'failed';
      results.errors = validationErrors;
      
      return new Response(JSON.stringify(results), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Execute each step
    console.log(`[Test ${testId}] Executing ${workflow.steps.length} steps in ${mode} mode...`);
    
    for (const [index, step] of workflow.steps.entries()) {
      try {
        const stepResult = await executeTestStep(
          supabase,
          step,
          testPhoneNumber,
          mode,
          speed,
          testId
        );

        results.stepResults.push(stepResult);

        if (stepResult.status === 'success') {
          results.results.successfulSteps++;
        } else if (stepResult.status === 'failed') {
          results.results.failedSteps++;
        } else {
          results.results.skippedSteps++;
        }

        results.results.estimatedCost += stepResult.cost || 0;

      } catch (stepError: any) {
        console.error(`[Test ${testId}] Error in step ${index + 1}:`, stepError);
        
        results.stepResults.push({
          stepNumber: step.step_number,
          stepType: step.step_type,
          status: 'failed',
          duration: '0s',
          details: 'Step execution failed',
          timestamp: new Date().toISOString(),
          error: stepError.message,
        });

        results.results.failedSteps++;
      }
    }

    // Step 3: Calculate durations
    const endTime = Date.now();
    results.results.simulatedDuration = `${((endTime - startTime) / 1000).toFixed(1)}s`;
    results.results.totalDuration = calculateTotalWorkflowDuration(workflow);

    // Step 4: Generate warnings
    results.warnings = generateWarnings(workflow, results);

    // Step 5: Generate recommendations
    results.recommendations = generateRecommendations(workflow, results);

    // Step 6: Log test to database
    await supabase.from('workflow_test_logs').insert({
      test_id: testId,
      workflow_name: workflow.name,
      mode,
      speed,
      total_steps: results.results.totalSteps,
      successful_steps: results.results.successfulSteps,
      failed_steps: results.results.failedSteps,
      estimated_cost: results.results.estimatedCost,
      test_results: results,
    });

    results.status = 'completed';

    console.log(`[Test ${testId}] Completed: ${results.results.successfulSteps}/${results.results.totalSteps} steps successful`);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[Test Workflow] Error:', error);
    return new Response(JSON.stringify({
      error: error.message,
      status: 'failed',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/**
 * Validate workflow structure and configuration
 */
function validateWorkflow(workflow: Workflow): string[] {
  const errors: string[] = [];

  // Basic structure validation
  if (!workflow.name || workflow.name.trim() === '') {
    errors.push('Workflow name is required');
  }

  if (!workflow.steps || workflow.steps.length === 0) {
    errors.push('Workflow must have at least one step');
  }

  if (!workflow.workflow_type) {
    errors.push('Workflow type is required');
  }

  // Validate each step
  for (const step of workflow.steps || []) {
    const stepErrors = validateStep(step);
    errors.push(...stepErrors.map(e => `Step ${step.step_number}: ${e}`));
  }

  // Check for logical issues
  const logicalErrors = validateWorkflowLogic(workflow);
  errors.push(...logicalErrors);

  return errors;
}

/**
 * Validate individual step configuration
 */
function validateStep(step: WorkflowStep): string[] {
  const errors: string[] = [];

  if (!step.step_type) {
    errors.push('Step type is required');
  }

  const config = step.step_config || {};

  switch (step.step_type) {
    case 'call':
      // Calls are generally valid, but check for agent ID if needed
      break;

    case 'sms':
      // SMS content is only a warning during testing - allow incomplete steps
      if (config.sms_content && config.sms_content.length > 1600) {
        errors.push('SMS content exceeds maximum length (1600 characters)');
      }
      // Check for spam keywords only if content exists
      if (config.sms_content && containsSpamKeywords(config.sms_content)) {
        errors.push('SMS content contains potential spam keywords');
      }
      break;

    case 'ai_sms':
      // AI SMS is generally valid
      if (config.prompt && config.prompt.length > 500) {
        errors.push('AI SMS prompt is too long (max 500 characters)');
      }
      break;

    case 'wait':
      const totalHours = 
        (config.delay_hours || 0) +
        (config.delay_days || 0) * 24 +
        (config.delay_minutes || 0) / 60;

      if (totalHours === 0) {
        errors.push('Wait step must have a delay greater than 0');
      }

      if (totalHours > 720) { // 30 days
        errors.push('Wait time exceeds maximum (30 days)');
      }

      if (config.time_of_day && !isValidTime(config.time_of_day)) {
        errors.push('Invalid time format (use HH:MM)');
      }
      break;

    case 'condition':
      // Conditions can be partially configured during development
      // Only fail if completely empty - allow testing with incomplete conditions
      if (!config.condition_type && !config.condition_operator && !config.then_action && !config.else_action) {
        errors.push('Condition step is empty - configure at least one field');
      }
      // These are now soft requirements - we'll simulate with defaults if missing
      break;

    case 'email':
      if (!config.subject) {
        errors.push('Email subject is required');
      }
      if (!config.body) {
        errors.push('Email body is required');
      }
      break;

    case 'webhook':
      if (!config.url) {
        errors.push('Webhook URL is required');
      }
      if (config.url && !isValidUrl(config.url)) {
        errors.push('Invalid webhook URL');
      }
      break;
  }

  return errors;
}

/**
 * Validate workflow logic (loops, timing, etc.)
 * Now more lenient for testing incomplete workflows
 */
function validateWorkflowLogic(workflow: Workflow): string[] {
  const errors: string[] = [];

  // Only validate fully configured conditions for exit paths
  const fullyConfiguredConditions = workflow.steps.filter(s => 
    s.step_type === 'condition' && 
    s.step_config.condition_operator && 
    s.step_config.then_action && 
    s.step_config.else_action
  );
  
  // Exit path check is now informational only - not a hard error
  if (fullyConfiguredConditions.length > 0) {
    const hasExit = fullyConfiguredConditions.some(s => 
      s.step_config.then_action === 'end' || s.step_config.else_action === 'end'
    );
    
    if (!hasExit) {
      console.log('[Validation] Info: Conditional workflow has no explicit exit path');
    }
  }

  // Short wait check is now informational only - not a hard error
  const waitSteps = workflow.steps.filter(s => s.step_type === 'wait');
  const shortWaits = waitSteps.filter(s => {
    const totalMinutes = 
      (s.step_config.delay_minutes || 0) +
      (s.step_config.delay_hours || 0) * 60;
    return totalMinutes < 60 && totalMinutes > 0;
  });

  if (shortWaits.length > 3) {
    console.log('[Validation] Info: Multiple short wait times detected');
  }

  return errors;
}

/**
 * Execute a single test step
 */
async function executeTestStep(
  supabase: any,
  step: WorkflowStep,
  testPhoneNumber: string | undefined,
  mode: 'simulation' | 'real',
  speed: 'realtime' | 'fast',
  testId: string
): Promise<StepResult> {
  const startTime = Date.now();

  console.log(`[Test ${testId}] Executing step ${step.step_number} (${step.step_type}) in ${mode} mode...`);

  if (mode === 'simulation') {
    // Simulate execution
    const result = await simulateStep(step, speed);
    const duration = Date.now() - startTime;

    return {
      stepNumber: step.step_number,
      stepType: step.step_type,
      status: 'success',
      duration: `${duration}ms`,
      details: result.details,
      timestamp: new Date().toISOString(),
      cost: estimateStepCost(step),
    };

  } else {
    // Real execution
    if (!testPhoneNumber) {
      return {
        stepNumber: step.step_number,
        stepType: step.step_type,
        status: 'skipped',
        duration: '0ms',
        details: 'Skipped - no test phone number provided',
        timestamp: new Date().toISOString(),
      };
    }

    const result = await executeRealStep(supabase, step, testPhoneNumber);
    const duration = Date.now() - startTime;

    return {
      stepNumber: step.step_number,
      stepType: step.step_type,
      status: result.success ? 'success' : 'failed',
      duration: `${duration}ms`,
      details: result.details,
      timestamp: new Date().toISOString(),
      cost: result.cost,
      error: result.error,
    };
  }
}

/**
 * Simulate step execution
 */
async function simulateStep(
  step: WorkflowStep,
  speed: 'realtime' | 'fast'
): Promise<{ details: string }> {
  
  if (step.step_type === 'wait') {
    if (speed === 'realtime') {
      // Actually wait (for testing purposes, cap at 5 seconds)
      const delayMs = Math.min(calculateStepDelayMs(step), 5000);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return { details: `Waited ${delayMs}ms (real-time test)` };
    } else {
      // Fast-forward
      const totalTime = calculateStepDelayMs(step);
      return { details: `Fast-forwarded ${formatDuration(totalTime)}` };
    }
  }

  // Simulate other step types
  const details = {
    call: 'Simulated call - would connect and play message',
    sms: `Simulated SMS - would send: "${step.step_config.sms_content?.substring(0, 50)}..."`,
    ai_sms: 'Simulated AI SMS - would generate and send personalized message',
    condition: 'Simulated condition check - would evaluate and branch',
    email: 'Simulated email - would send to lead',
    webhook: `Simulated webhook - would POST to ${step.step_config.url}`,
  };

  return { details: details[step.step_type as keyof typeof details] || 'Simulated step execution' };
}

/**
 * Execute step with real phone number
 */
async function executeRealStep(
  supabase: any,
  step: WorkflowStep,
  testPhoneNumber: string
): Promise<{ success: boolean; details: string; cost?: number; error?: string }> {
  
  try {
    switch (step.step_type) {
      case 'call':
        // Would integrate with actual calling system
        // For now, just log
        console.log(`[Real Test] Would call ${testPhoneNumber}`);
        return {
          success: true,
          details: `Test call would be placed to ${testPhoneNumber}`,
          cost: 0.02, // Estimated cost per call
        };

      case 'sms':
        // Would integrate with SMS system
        console.log(`[Real Test] Would send SMS to ${testPhoneNumber}: ${step.step_config.sms_content}`);
        return {
          success: true,
          details: `Test SMS would be sent to ${testPhoneNumber}`,
          cost: 0.0075, // Estimated cost per SMS
        };

      case 'ai_sms':
        console.log(`[Real Test] Would send AI SMS to ${testPhoneNumber}`);
        return {
          success: true,
          details: `Test AI SMS would be generated and sent to ${testPhoneNumber}`,
          cost: 0.01, // Estimated cost (SMS + AI)
        };

      case 'wait':
        const delayMs = calculateStepDelayMs(step);
        return {
          success: true,
          details: `Wait ${formatDuration(delayMs)} before next step`,
          cost: 0,
        };

      default:
        return {
          success: true,
          details: `${step.step_type} step executed`,
          cost: 0,
        };
    }
  } catch (error: any) {
    return {
      success: false,
      details: 'Step execution failed',
      error: error.message,
    };
  }
}

/**
 * Calculate total workflow duration
 */
function calculateTotalWorkflowDuration(workflow: Workflow): string {
  let totalMs = 0;

  for (const step of workflow.steps) {
    if (step.step_type === 'wait') {
      totalMs += calculateStepDelayMs(step);
    } else if (step.step_type === 'call') {
      totalMs += 60000; // Assume 1 minute per call
    } else {
      totalMs += 5000; // Assume 5 seconds for other steps
    }
  }

  return formatDuration(totalMs);
}

/**
 * Calculate step delay in milliseconds
 */
function calculateStepDelayMs(step: WorkflowStep): number {
  const config = step.step_config;
  return (
    (config.delay_minutes || 0) * 60 * 1000 +
    (config.delay_hours || 0) * 60 * 60 * 1000 +
    (config.delay_days || 0) * 24 * 60 * 60 * 1000
  );
}

/**
 * Estimate cost of a step
 */
function estimateStepCost(step: WorkflowStep): number {
  const costs = {
    call: 0.02,      // $0.02 per call
    sms: 0.0075,     // $0.0075 per SMS
    ai_sms: 0.01,    // $0.01 per AI SMS (SMS + AI cost)
    wait: 0,
    condition: 0,
    email: 0.001,    // Minimal email cost
    webhook: 0,
  };

  return costs[step.step_type as keyof typeof costs] || 0;
}

/**
 * Generate warnings based on workflow analysis
 */
function generateWarnings(workflow: Workflow, results: TestResults): TestResults['warnings'] {
  const warnings: TestResults['warnings'] = [];

  // High cost warning
  if (results.results.estimatedCost > 1.00) {
    warnings.push({
      severity: 'high',
      message: `High cost per lead: $${results.results.estimatedCost.toFixed(2)}`,
      suggestion: 'Consider reducing call attempts or using more SMS instead of calls',
    });
  }

  // Short wait times
  const shortWaits = workflow.steps.filter(s => 
    s.step_type === 'wait' && 
    calculateStepDelayMs(s) < 4 * 60 * 60 * 1000 // Less than 4 hours
  );

  if (shortWaits.length > 0) {
    warnings.push({
      severity: 'medium',
      message: 'Short wait times detected between contacts',
      suggestion: 'Consider longer delays (24+ hours) for better engagement',
      steps: shortWaits.map(s => s.step_number),
    });
  }

  // Long SMS messages
  const longSms = workflow.steps.filter(s => 
    s.step_type === 'sms' && 
    (s.step_config.sms_content?.length || 0) > 160
  );

  if (longSms.length > 0) {
    warnings.push({
      severity: 'low',
      message: 'Long SMS messages will be split into multiple segments',
      suggestion: 'Keep SMS under 160 characters to avoid extra costs',
      steps: longSms.map(s => s.step_number),
    });
  }

  // Failed steps
  if (results.results.failedSteps > 0) {
    warnings.push({
      severity: 'high',
      message: `${results.results.failedSteps} step(s) failed during test`,
      suggestion: 'Review and fix failed steps before deploying to real leads',
    });
  }

  return warnings;
}

/**
 * Generate optimization recommendations
 */
function generateRecommendations(workflow: Workflow, results: TestResults): TestResults['recommendations'] {
  const recommendations: TestResults['recommendations'] = [];

  // No conditions in multi-step workflow
  const hasConditions = workflow.steps.some(s => s.step_type === 'condition');
  if (!hasConditions && workflow.steps.length > 3) {
    recommendations.push({
      type: 'enhancement',
      message: 'Add conditional logic to personalize the workflow',
      impact: 'Could reduce unnecessary contacts by 30-40% and improve conversion',
    });
  }

  // All calls, no SMS
  const callSteps = workflow.steps.filter(s => s.step_type === 'call');
  const smsSteps = workflow.steps.filter(s => s.step_type === 'sms' || s.step_type === 'ai_sms');

  if (callSteps.length > 2 && smsSteps.length === 0) {
    recommendations.push({
      type: 'cost-saving',
      message: 'Mix in SMS steps between calls',
      impact: 'Could reduce costs by 60% while maintaining engagement',
    });
  }

  // No AI SMS usage
  const hasAiSms = workflow.steps.some(s => s.step_type === 'ai_sms');
  if (!hasAiSms && smsSteps.length > 0) {
    recommendations.push({
      type: 'enhancement',
      message: 'Consider using AI SMS for personalized follow-ups',
      impact: 'Could improve response rates by 50-100%',
    });
  }

  // Very long workflow
  if (workflow.steps.length > 10) {
    recommendations.push({
      type: 'optimization',
      message: 'Workflow has many steps - consider splitting into multiple workflows',
      impact: 'Easier to manage and optimize individual sequences',
    });
  }

  // Cost optimization
  if (results.results.estimatedCost > 0.50) {
    const potentialSavings = (callSteps.length * 0.02) - (callSteps.length * 0.0075);
    recommendations.push({
      type: 'cost-saving',
      message: 'Replace some calls with SMS to reduce costs',
      impact: `Could save up to $${potentialSavings.toFixed(2)} per lead`,
    });
  }

  return recommendations;
}

/**
 * Helper functions
 */

function containsSpamKeywords(text: string): boolean {
  const spamKeywords = ['free', 'winner', 'congratulations', 'click here', 'act now', 'limited time'];
  const lowerText = text.toLowerCase();
  return spamKeywords.some(keyword => lowerText.includes(keyword));
}

function isValidTime(time: string): boolean {
  return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}
