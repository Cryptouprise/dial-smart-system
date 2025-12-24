// Demo SMS data
export const DEMO_SMS_MESSAGES = [
  {
    id: 'sms-1',
    from_number: '+15551234567',
    to_number: '+15559876543',
    body: 'Hi! Just following up on our conversation yesterday. Would you like to schedule a call?',
    direction: 'outbound',
    status: 'delivered',
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'sms-2',
    from_number: '+15559876543',
    to_number: '+15551234567',
    body: 'Yes, I\'m interested! Can we talk tomorrow at 2pm?',
    direction: 'inbound',
    status: 'received',
    created_at: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'sms-3',
    from_number: '+15551234567',
    to_number: '+15559876543',
    body: 'Perfect! I\'ve scheduled our call for tomorrow at 2pm. Looking forward to it!',
    direction: 'outbound',
    status: 'delivered',
    created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'sms-4',
    from_number: '+15552345678',
    to_number: '+15558765432',
    body: 'Your appointment reminder: Meeting scheduled for Friday at 10am.',
    direction: 'outbound',
    status: 'delivered',
    created_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'sms-5',
    from_number: '+15558765432',
    to_number: '+15552345678',
    body: 'Thanks for the reminder! See you then.',
    direction: 'inbound',
    status: 'received',
    created_at: new Date(Date.now() - 3.5 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'sms-6',
    from_number: '+15553456789',
    to_number: '+15557654321',
    body: 'Hi there! We have a special offer on solar installations this month. Interested in learning more?',
    direction: 'outbound',
    status: 'delivered',
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'sms-7',
    from_number: '+15557654321',
    to_number: '+15553456789',
    body: 'Sure, send me some info please',
    direction: 'inbound',
    status: 'received',
    created_at: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'sms-8',
    from_number: '+15551234567',
    to_number: '+15556543210',
    body: 'Thank you for your interest in our insurance plans. Here\'s a link to our quote calculator: example.com/quote',
    direction: 'outbound',
    status: 'delivered',
    created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  }
];

export const DEMO_SMS_CONVERSATIONS = [
  {
    id: 'conv-1',
    lead_id: 'demo-lead-1',
    lead_name: 'John Smith',
    phone_number: '+15559876543',
    last_message: 'Yes, I\'m interested! Can we talk tomorrow at 2pm?',
    last_message_at: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
    unread_count: 0,
    status: 'active'
  },
  {
    id: 'conv-2',
    lead_id: 'demo-lead-2',
    lead_name: 'Sarah Johnson',
    phone_number: '+15558765432',
    last_message: 'Thanks for the reminder! See you then.',
    last_message_at: new Date(Date.now() - 3.5 * 60 * 60 * 1000).toISOString(),
    unread_count: 1,
    status: 'active'
  },
  {
    id: 'conv-3',
    lead_id: 'demo-lead-3',
    lead_name: 'Michael Williams',
    phone_number: '+15557654321',
    last_message: 'Sure, send me some info please',
    last_message_at: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
    unread_count: 1,
    status: 'pending'
  }
];
