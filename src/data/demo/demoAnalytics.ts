// Demo analytics data for charts and reports
export const DEMO_CALL_VOLUME_DATA = [
  { day: 'Mon', calls: 142, answered: 52, appointments: 8 },
  { day: 'Tue', calls: 168, answered: 61, appointments: 11 },
  { day: 'Wed', calls: 155, answered: 58, appointments: 9 },
  { day: 'Thu', calls: 189, answered: 72, appointments: 14 },
  { day: 'Fri', calls: 176, answered: 65, appointments: 12 },
  { day: 'Sat', calls: 45, answered: 18, appointments: 3 },
  { day: 'Sun', calls: 32, answered: 12, appointments: 2 }
];

export const DEMO_HOURLY_DATA = [
  { hour: '9am', calls: 24, answered: 9 },
  { hour: '10am', calls: 38, answered: 14 },
  { hour: '11am', calls: 45, answered: 18 },
  { hour: '12pm', calls: 32, answered: 11 },
  { hour: '1pm', calls: 28, answered: 10 },
  { hour: '2pm', calls: 52, answered: 21 },
  { hour: '3pm', calls: 48, answered: 19 },
  { hour: '4pm', calls: 41, answered: 16 },
  { hour: '5pm', calls: 35, answered: 12 }
];

export const DEMO_CAMPAIGN_PERFORMANCE = [
  { name: 'Solar Outreach', calls: 312, answered: 118, rate: 37.8, appointments: 28 },
  { name: 'Insurance Renewal', calls: 456, answered: 187, rate: 41.0, appointments: 52 },
  { name: 'HVAC Summer', calls: 89, answered: 31, rate: 34.8, appointments: 8 },
  { name: 'Mortgage Refinance', calls: 234, answered: 98, rate: 41.9, appointments: 24 }
];

export const DEMO_AGENT_PERFORMANCE = [
  { name: 'Sarah - Sales', calls: 287, avgDuration: 185, conversions: 34, rating: 4.8 },
  { name: 'Michael - Support', calls: 312, avgDuration: 142, conversions: 28, rating: 4.6 },
  { name: 'Emma - Appointments', calls: 248, avgDuration: 168, conversions: 42, rating: 4.9 }
];

export const DEMO_OUTCOME_DISTRIBUTION = [
  { name: 'Answered', value: 412, color: '#22C55E' },
  { name: 'Voicemail', value: 156, color: '#F59E0B' },
  { name: 'No Answer', value: 198, color: '#EF4444' },
  { name: 'Busy', value: 81, color: '#6B7280' }
];

export const DEMO_DAILY_REPORTS = [
  {
    id: 'report-1',
    report_date: new Date().toISOString().split('T')[0],
    total_calls: 247,
    connected_calls: 89,
    answer_rate: 36,
    appointments_set: 12,
    sms_sent: 156,
    sms_received: 43,
    avg_call_duration: 185,
    performance_score: 82,
    wins: ['Beat daily appointment target', 'Highest answer rate this week', '3 new qualified leads'],
    improvements: ['Response time could be faster', 'More callbacks needed'],
    recommendations: ['Focus on morning calls', 'Try SMS follow-up for no-answers']
  },
  {
    id: 'report-2',
    report_date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    total_calls: 312,
    connected_calls: 118,
    answer_rate: 38,
    appointments_set: 15,
    sms_sent: 189,
    sms_received: 52,
    avg_call_duration: 172,
    performance_score: 87,
    wins: ['Record appointments set', 'Excellent callback completion'],
    improvements: ['Some calls too short'],
    recommendations: ['Maintain current pace']
  }
];

export const DEMO_TRANSCRIPT_ANALYSES = [
  {
    id: 'analysis-1',
    call_id: 'demo-call-1',
    lead_name: 'John Smith',
    sentiment: 'positive',
    summary: 'Customer showed strong interest in solar installation. Discussed pricing and financing options. Scheduled follow-up appointment.',
    key_topics: ['solar panels', 'pricing', 'financing', 'installation timeline'],
    action_items: ['Send quote', 'Schedule site survey', 'Follow up in 3 days'],
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'analysis-2',
    call_id: 'demo-call-5',
    lead_name: 'Sarah Johnson',
    sentiment: 'neutral',
    summary: 'Discussed insurance renewal options. Customer comparing with other providers. Needs time to decide.',
    key_topics: ['insurance', 'renewal', 'pricing comparison'],
    action_items: ['Send competitive analysis', 'Call back next week'],
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  }
];
