/**
 * Business Profile Templates
 *
 * Pre-configured templates for different industries/use cases.
 * Each template includes suggested pipelines, agent scripts, fields to capture,
 * tracking goals, and autonomous engine settings.
 */

export interface BusinessTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'home_services' | 'insurance' | 'real_estate' | 'healthcare' | 'financial' | 'general' | 'lead_gen';

  // Pipeline stages (in order)
  pipelineStages: {
    name: string;
    description: string;
    isTerminal?: boolean;
  }[];

  // Dispositions mapped to pipeline stages
  dispositionMap: Record<string, string>;

  // Fields the AI should capture during calls
  fieldsToCapture: {
    name: string;
    label: string;
    type: 'text' | 'number' | 'boolean' | 'select';
    options?: string[];
    required?: boolean;
  }[];

  // Suggested agent script / instructions
  agentInstructions: string;
  agentGreeting: string;

  // Autonomous settings
  suggestedGoals: {
    daily_goal_calls: number;
    daily_goal_appointments: number;
    daily_goal_conversations: number;
    daily_budget_cents: number;
    calls_per_minute: number;
  };

  // Playbook overrides
  followUpStrategy: string;
}

export const BUSINESS_TEMPLATES: BusinessTemplate[] = [
  {
    id: 'solar',
    name: 'Solar Sales',
    description: 'Residential solar panel sales. Qualify homeowners, book appointments with closers.',
    icon: '☀️',
    category: 'home_services',
    pipelineStages: [
      { name: 'New Leads', description: 'Fresh leads not yet contacted' },
      { name: 'Contacted', description: 'Reached by phone or SMS' },
      { name: 'Qualified', description: 'Confirmed homeowner, interested in solar' },
      { name: 'Appointment Set', description: 'Consultation booked with closer' },
      { name: 'Appointment Completed', description: 'Consultation happened' },
      { name: 'Proposal Sent', description: 'Proposal/quote delivered' },
      { name: 'Closed Won', description: 'Contract signed', isTerminal: true },
      { name: 'Not Interested', description: 'Declined', isTerminal: true },
      { name: 'Not Qualified', description: 'Renter, bad credit, wrong area', isTerminal: true },
      { name: 'DNC', description: 'Do not contact', isTerminal: true },
    ],
    dispositionMap: {
      'appointment_set': 'Appointment Set',
      'qualified': 'Qualified',
      'interested': 'Qualified',
      'callback_requested': 'Contacted',
      'not_interested': 'Not Interested',
      'wrong_number': 'Not Qualified',
      'renter': 'Not Qualified',
      'already_has_solar': 'Not Qualified',
      'bad_credit': 'Not Qualified',
      'dnc': 'DNC',
      'no_answer': 'New Leads',
      'voicemail': 'New Leads',
      'completed': 'Contacted',
      'short_call': 'Contacted',
    },
    fieldsToCapture: [
      { name: 'is_homeowner', label: 'Homeowner?', type: 'boolean', required: true },
      { name: 'roof_age', label: 'Roof Age (years)', type: 'number' },
      { name: 'monthly_electric_bill', label: 'Monthly Electric Bill ($)', type: 'number', required: true },
      { name: 'credit_score_range', label: 'Credit Score Range', type: 'select', options: ['Excellent (720+)', 'Good (680-719)', 'Fair (620-679)', 'Below 620', 'Unknown'] },
      { name: 'roof_type', label: 'Roof Type', type: 'select', options: ['Shingle', 'Tile', 'Metal', 'Flat', 'Other'] },
      { name: 'shading', label: 'Shade on Roof?', type: 'select', options: ['No shade', 'Some shade', 'Heavy shade'] },
      { name: 'utility_company', label: 'Utility Company', type: 'text' },
      { name: 'decision_makers_present', label: 'Both Decision Makers Available?', type: 'boolean' },
      { name: 'best_appointment_time', label: 'Best Time for Appointment', type: 'text' },
    ],
    agentInstructions: `You are a friendly solar energy consultant. Your goal is to qualify homeowners for a free solar consultation and book an appointment.

QUALIFICATION CRITERIA (must confirm ALL):
1. They are the HOMEOWNER (not renting)
2. Monthly electric bill is $100+ (ideally $150+)
3. Credit score is 620+ (or willing to check)
4. Roof is less than 15 years old (or in good condition)
5. Minimal roof shading

CONVERSATION FLOW:
1. Introduce yourself, mention you're calling about their inquiry/the solar program in their area
2. Ask if they're the homeowner
3. Ask about their monthly electric bill
4. Briefly explain the value (reduce/eliminate electric bill, tax credits, increase home value)
5. Qualify credit and roof condition
6. If qualified, book the appointment - emphasize it's FREE, no obligation, 30-45 minutes
7. Confirm both decision makers will be present

IF NOT QUALIFIED: Be polite, thank them for their time
IF INTERESTED BUT NOT READY: Schedule a callback at their preferred time

IMPORTANT: Never pressure. Be conversational, not scripted. Listen more than you talk.`,
    agentGreeting: "Hi, this is {{agent_name}} calling about the solar energy program available in your area. Am I speaking with {{first_name}}?",
    suggestedGoals: {
      daily_goal_calls: 500,
      daily_goal_appointments: 15,
      daily_goal_conversations: 50,
      daily_budget_cents: 10000,
      calls_per_minute: 50,
    },
    followUpStrategy: 'aggressive',
  },

  {
    id: 'roofing',
    name: 'Roofing Sales',
    description: 'Storm damage / roof replacement leads. Qualify and book inspections.',
    icon: '🏠',
    category: 'home_services',
    pipelineStages: [
      { name: 'New Leads', description: 'Fresh leads' },
      { name: 'Contacted', description: 'Reached by phone' },
      { name: 'Qualified', description: 'Confirmed homeowner with potential damage' },
      { name: 'Inspection Booked', description: 'Free inspection scheduled' },
      { name: 'Inspection Complete', description: 'Roof inspected' },
      { name: 'Claim Filed', description: 'Insurance claim submitted' },
      { name: 'Approved', description: 'Claim approved' },
      { name: 'Job Scheduled', description: 'Installation date set' },
      { name: 'Completed', description: 'Roof installed', isTerminal: true },
      { name: 'Not Interested', description: 'Declined', isTerminal: true },
      { name: 'DNC', description: 'Do not contact', isTerminal: true },
    ],
    dispositionMap: {
      'appointment_set': 'Inspection Booked',
      'qualified': 'Qualified',
      'interested': 'Qualified',
      'not_interested': 'Not Interested',
      'dnc': 'DNC',
      'no_answer': 'New Leads',
    },
    fieldsToCapture: [
      { name: 'is_homeowner', label: 'Homeowner?', type: 'boolean', required: true },
      { name: 'storm_damage', label: 'Storm Damage Noticed?', type: 'boolean' },
      { name: 'roof_age', label: 'Roof Age', type: 'number' },
      { name: 'insurance_company', label: 'Insurance Company', type: 'text' },
      { name: 'has_filed_claim', label: 'Already Filed Claim?', type: 'boolean' },
    ],
    agentInstructions: `You are a roofing consultant following up on storm damage in the area. Your goal is to book a FREE roof inspection.

FLOW:
1. Introduce yourself, mention recent storms in their area
2. Ask if they've noticed any damage (leaks, missing shingles, dents)
3. Confirm they're the homeowner
4. Explain the free inspection (no obligation, 15 minutes)
5. Book the inspection appointment
6. Collect insurance company name for preparation`,
    agentGreeting: "Hi {{first_name}}, this is {{agent_name}}. I'm calling because we've been doing free storm damage inspections in your neighborhood. Have you noticed any issues with your roof lately?",
    suggestedGoals: {
      daily_goal_calls: 400,
      daily_goal_appointments: 20,
      daily_goal_conversations: 60,
      daily_budget_cents: 8000,
      calls_per_minute: 40,
    },
    followUpStrategy: 'aggressive',
  },

  {
    id: 'insurance',
    name: 'Insurance Sales',
    description: 'Health, auto, or life insurance leads. Quote and close or book agent meeting.',
    icon: '🛡️',
    category: 'insurance',
    pipelineStages: [
      { name: 'New Leads', description: 'Fresh leads' },
      { name: 'Contacted', description: 'Reached' },
      { name: 'Needs Assessment', description: 'Coverage needs identified' },
      { name: 'Quote Delivered', description: 'Quote provided' },
      { name: 'Follow Up', description: 'Reviewing quote' },
      { name: 'Closed Won', description: 'Policy bound', isTerminal: true },
      { name: 'Not Interested', description: 'Declined', isTerminal: true },
      { name: 'DNC', description: 'Do not contact', isTerminal: true },
    ],
    dispositionMap: {
      'appointment_set': 'Needs Assessment',
      'qualified': 'Needs Assessment',
      'not_interested': 'Not Interested',
      'dnc': 'DNC',
    },
    fieldsToCapture: [
      { name: 'insurance_type', label: 'Insurance Type Needed', type: 'select', options: ['Health', 'Auto', 'Life', 'Home', 'Business'], required: true },
      { name: 'current_provider', label: 'Current Insurance Provider', type: 'text' },
      { name: 'current_premium', label: 'Current Monthly Premium ($)', type: 'number' },
      { name: 'household_size', label: 'Household Size', type: 'number' },
      { name: 'renewal_date', label: 'Policy Renewal Date', type: 'text' },
    ],
    agentInstructions: `You are a licensed insurance advisor helping people find better coverage at lower rates.

FLOW:
1. Introduce yourself, mention you're following up on their insurance inquiry
2. Ask what type of insurance they need
3. Ask about their current coverage and what they're paying
4. Identify pain points (too expensive, bad coverage, bad service)
5. Explain you can get them quotes from multiple carriers
6. Book a time to review quotes together`,
    agentGreeting: "Hi {{first_name}}, this is {{agent_name}} with {{company_name}}. I'm calling about your recent request for insurance quotes. Do you have a quick minute?",
    suggestedGoals: {
      daily_goal_calls: 300,
      daily_goal_appointments: 10,
      daily_goal_conversations: 40,
      daily_budget_cents: 6000,
      calls_per_minute: 30,
    },
    followUpStrategy: 'moderate',
  },

  {
    id: 'real_estate',
    name: 'Real Estate',
    description: 'Buyer/seller leads. Qualify motivation, timeline, and book showing or listing appointment.',
    icon: '🏡',
    category: 'real_estate',
    pipelineStages: [
      { name: 'New Leads', description: 'Fresh leads' },
      { name: 'Contacted', description: 'Reached' },
      { name: 'Qualified', description: 'Motivated buyer/seller confirmed' },
      { name: 'Appointment Set', description: 'Meeting/showing scheduled' },
      { name: 'Under Contract', description: 'Offer accepted' },
      { name: 'Closed', description: 'Transaction complete', isTerminal: true },
      { name: 'Nurture', description: 'Long-term follow-up' },
      { name: 'Not Interested', description: 'Declined', isTerminal: true },
      { name: 'DNC', description: 'Do not contact', isTerminal: true },
    ],
    dispositionMap: {
      'appointment_set': 'Appointment Set',
      'qualified': 'Qualified',
      'not_interested': 'Not Interested',
      'dnc': 'DNC',
    },
    fieldsToCapture: [
      { name: 'buyer_or_seller', label: 'Buying or Selling?', type: 'select', options: ['Buying', 'Selling', 'Both'], required: true },
      { name: 'timeline', label: 'Timeline', type: 'select', options: ['ASAP', '1-3 months', '3-6 months', '6+ months', 'Just looking'], required: true },
      { name: 'pre_approved', label: 'Pre-Approved?', type: 'boolean' },
      { name: 'budget_range', label: 'Budget Range', type: 'text' },
      { name: 'area_preference', label: 'Area/Neighborhood', type: 'text' },
      { name: 'current_agent', label: 'Working with an Agent?', type: 'boolean' },
    ],
    agentInstructions: `You are a real estate assistant helping connect buyers and sellers with the right agent.

FLOW:
1. Introduce yourself, reference their property search or listing inquiry
2. Ask if they're looking to buy, sell, or both
3. Assess timeline and motivation level
4. For buyers: pre-approval status, budget, area preferences
5. For sellers: reason for selling, expected timeline, price expectations
6. Book an appointment with the agent`,
    agentGreeting: "Hi {{first_name}}, this is {{agent_name}} following up on your recent real estate inquiry. Are you still looking to {{buyer_or_seller}} in the area?",
    suggestedGoals: {
      daily_goal_calls: 200,
      daily_goal_appointments: 8,
      daily_goal_conversations: 30,
      daily_budget_cents: 5000,
      calls_per_minute: 25,
    },
    followUpStrategy: 'moderate',
  },

  {
    id: 'debt_consolidation',
    name: 'Debt Relief / Consolidation',
    description: 'Qualify consumers for debt consolidation programs. Capture debt amount and transfer to closers.',
    icon: '💰',
    category: 'financial',
    pipelineStages: [
      { name: 'New Leads', description: 'Fresh leads' },
      { name: 'Contacted', description: 'Reached' },
      { name: 'Pre-Qualified', description: 'Meets basic criteria ($10K+ debt)' },
      { name: 'Transferred', description: 'Warm transferred to specialist' },
      { name: 'Enrolled', description: 'Signed up for program', isTerminal: true },
      { name: 'Not Qualified', description: 'Does not meet criteria', isTerminal: true },
      { name: 'DNC', description: 'Do not contact', isTerminal: true },
    ],
    dispositionMap: {
      'qualified': 'Pre-Qualified',
      'appointment_set': 'Transferred',
      'not_interested': 'Not Qualified',
      'dnc': 'DNC',
    },
    fieldsToCapture: [
      { name: 'total_debt', label: 'Total Unsecured Debt ($)', type: 'number', required: true },
      { name: 'debt_types', label: 'Types of Debt', type: 'select', options: ['Credit Cards', 'Medical', 'Personal Loans', 'Multiple'], required: true },
      { name: 'monthly_payments', label: 'Current Monthly Payments ($)', type: 'number' },
      { name: 'employment_status', label: 'Employment Status', type: 'select', options: ['Employed', 'Self-Employed', 'Retired', 'Unemployed'] },
      { name: 'hardship_reason', label: 'Reason for Financial Hardship', type: 'text' },
    ],
    agentInstructions: `You are a financial assistance coordinator helping consumers explore debt relief options.

QUALIFICATION (must meet):
1. $10,000+ in unsecured debt (credit cards, medical, personal loans)
2. Currently making minimum payments or falling behind
3. Experiencing financial hardship

FLOW:
1. Introduce yourself, reference their request for debt relief information
2. Ask about their debt situation (total amount, types)
3. Confirm they're making payments but struggling
4. Explain the program (reduce debt by 40-60%, single monthly payment)
5. If qualified, transfer to a specialist immediately

COMPLIANCE: Never guarantee specific savings. Say "may" or "up to". Never give legal advice.`,
    agentGreeting: "Hi {{first_name}}, this is {{agent_name}} from the debt assistance program. I understand you were looking into options for managing your debt. Is this still something you need help with?",
    suggestedGoals: {
      daily_goal_calls: 600,
      daily_goal_appointments: 25,
      daily_goal_conversations: 70,
      daily_budget_cents: 12000,
      calls_per_minute: 60,
    },
    followUpStrategy: 'aggressive',
  },

  {
    id: 'home_warranty',
    name: 'Home Warranty / Home Services',
    description: 'Sell home warranty plans or schedule home service appointments.',
    icon: '🔧',
    category: 'home_services',
    pipelineStages: [
      { name: 'New Leads', description: 'Fresh leads' },
      { name: 'Contacted', description: 'Reached' },
      { name: 'Interested', description: 'Wants more info' },
      { name: 'Quote Sent', description: 'Pricing delivered' },
      { name: 'Enrolled', description: 'Signed up', isTerminal: true },
      { name: 'Not Interested', description: 'Declined', isTerminal: true },
      { name: 'DNC', description: 'Do not contact', isTerminal: true },
    ],
    dispositionMap: {
      'qualified': 'Interested',
      'appointment_set': 'Quote Sent',
      'not_interested': 'Not Interested',
      'dnc': 'DNC',
    },
    fieldsToCapture: [
      { name: 'home_age', label: 'Home Age (years)', type: 'number' },
      { name: 'home_size_sqft', label: 'Home Size (sq ft)', type: 'number' },
      { name: 'systems_concern', label: 'Systems Most Concerned About', type: 'select', options: ['HVAC', 'Plumbing', 'Electrical', 'Appliances', 'All'] },
      { name: 'current_warranty', label: 'Have Existing Warranty?', type: 'boolean' },
    ],
    agentInstructions: `You are a home warranty specialist helping homeowners protect their biggest investment.

FLOW:
1. Introduce yourself, mention the home warranty program
2. Ask about their home (age, size, major systems)
3. Identify pain points (recent breakdowns, expensive repairs)
4. Explain coverage options and pricing
5. Close on the phone or schedule a follow-up`,
    agentGreeting: "Hi {{first_name}}, this is {{agent_name}}. I'm calling about protecting your home from unexpected repair costs. Do you currently have a home warranty?",
    suggestedGoals: {
      daily_goal_calls: 400,
      daily_goal_appointments: 12,
      daily_goal_conversations: 50,
      daily_budget_cents: 8000,
      calls_per_minute: 40,
    },
    followUpStrategy: 'moderate',
  },

  {
    id: 'custom',
    name: 'Custom / Other',
    description: 'Start from scratch. Define your own pipelines, scripts, and goals.',
    icon: '⚙️',
    category: 'general',
    pipelineStages: [
      { name: 'New Leads', description: 'Not yet contacted' },
      { name: 'Contacted', description: 'Reached by phone or SMS' },
      { name: 'Qualified', description: 'Meets your criteria' },
      { name: 'Appointment Set', description: 'Meeting scheduled' },
      { name: 'Closed Won', description: 'Deal closed', isTerminal: true },
      { name: 'Not Interested', description: 'Declined', isTerminal: true },
      { name: 'DNC', description: 'Do not contact', isTerminal: true },
    ],
    dispositionMap: {
      'appointment_set': 'Appointment Set',
      'qualified': 'Qualified',
      'not_interested': 'Not Interested',
      'dnc': 'DNC',
    },
    fieldsToCapture: [],
    agentInstructions: 'Customize your agent instructions here.',
    agentGreeting: "Hi {{first_name}}, this is {{agent_name}} calling from {{company_name}}. Do you have a quick moment?",
    suggestedGoals: {
      daily_goal_calls: 300,
      daily_goal_appointments: 10,
      daily_goal_conversations: 40,
      daily_budget_cents: 6000,
      calls_per_minute: 30,
    },
    followUpStrategy: 'moderate',
  },
];

export function getTemplateById(id: string): BusinessTemplate | undefined {
  return BUSINESS_TEMPLATES.find(t => t.id === id);
}

export function getTemplatesByCategory(category: string): BusinessTemplate[] {
  return BUSINESS_TEMPLATES.filter(t => t.category === category);
}
