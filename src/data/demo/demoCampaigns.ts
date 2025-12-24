export const DEMO_CAMPAIGNS = [
  {
    id: 'demo-campaign-1',
    name: 'Solar Panel Outreach',
    description: 'High-value residential solar installation leads',
    status: 'active',
    agent_id: 'demo-agent-1',
    workflow_id: 'demo-workflow-1',
    calls_per_minute: 5,
    max_attempts: 3,
    calling_hours_start: '09:00',
    calling_hours_end: '18:00',
    timezone: 'America/New_York',
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    leadCount: 156,
    completedCalls: 89,
    answeredCalls: 42,
    appointmentsSet: 12
  },
  {
    id: 'demo-campaign-2',
    name: 'Insurance Renewal',
    description: 'Auto insurance policy renewal reminders',
    status: 'active',
    agent_id: 'demo-agent-2',
    workflow_id: 'demo-workflow-2',
    calls_per_minute: 8,
    max_attempts: 2,
    calling_hours_start: '10:00',
    calling_hours_end: '20:00',
    timezone: 'America/Chicago',
    created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    leadCount: 423,
    completedCalls: 287,
    answeredCalls: 134,
    appointmentsSet: 45
  },
  {
    id: 'demo-campaign-3',
    name: 'HVAC Summer Special',
    description: 'AC maintenance promotional campaign',
    status: 'paused',
    agent_id: 'demo-agent-1',
    workflow_id: null,
    calls_per_minute: 3,
    max_attempts: 4,
    calling_hours_start: '08:00',
    calling_hours_end: '17:00',
    timezone: 'America/Los_Angeles',
    created_at: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    leadCount: 89,
    completedCalls: 67,
    answeredCalls: 31,
    appointmentsSet: 8
  },
  {
    id: 'demo-campaign-4',
    name: 'Mortgage Refinance',
    description: 'Low-rate refinance opportunity outreach',
    status: 'completed',
    agent_id: 'demo-agent-3',
    workflow_id: 'demo-workflow-1',
    calls_per_minute: 6,
    max_attempts: 3,
    calling_hours_start: '09:00',
    calling_hours_end: '19:00',
    timezone: 'America/New_York',
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    leadCount: 512,
    completedCalls: 512,
    answeredCalls: 245,
    appointmentsSet: 67
  }
];

export const DEMO_AGENTS = [
  {
    agent_id: 'demo-agent-1',
    agent_name: 'Sarah - Sales Agent',
    voice_id: 'eleven_voice_sarah',
    hasActivePhone: true,
    phoneNumber: '+1 (555) 123-4567'
  },
  {
    agent_id: 'demo-agent-2', 
    agent_name: 'Michael - Support Agent',
    voice_id: 'eleven_voice_michael',
    hasActivePhone: true,
    phoneNumber: '+1 (555) 234-5678'
  },
  {
    agent_id: 'demo-agent-3',
    agent_name: 'Emma - Appointment Setter',
    voice_id: 'eleven_voice_emma',
    hasActivePhone: true,
    phoneNumber: '+1 (555) 345-6789'
  }
];

export const DEMO_WORKFLOWS = [
  {
    id: 'demo-workflow-1',
    name: 'Standard Sales Flow',
    description: 'Intro → Qualify → Book Appointment → Follow-up SMS',
    active: true
  },
  {
    id: 'demo-workflow-2',
    name: 'Renewal Reminder',
    description: 'Friendly reminder → Collect info → Transfer to agent',
    active: true
  },
  {
    id: 'demo-workflow-3',
    name: 'Survey Collection',
    description: 'Greeting → 5 questions → Thank you',
    active: false
  }
];
