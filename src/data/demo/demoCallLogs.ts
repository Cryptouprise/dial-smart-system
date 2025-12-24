const generateCallLogs = () => {
  const outcomes = ['answered', 'voicemail', 'no_answer', 'busy', 'appointment_set', 'callback_requested'];
  const statuses = ['completed', 'completed', 'completed', 'in_progress', 'completed'];
  
  const names = [
    { first: 'John', last: 'Smith' },
    { first: 'Sarah', last: 'Johnson' },
    { first: 'Michael', last: 'Williams' },
    { first: 'Emily', last: 'Brown' },
    { first: 'David', last: 'Jones' },
    { first: 'Jessica', last: 'Garcia' },
    { first: 'Christopher', last: 'Miller' },
    { first: 'Amanda', last: 'Davis' },
    { first: 'Matthew', last: 'Rodriguez' },
    { first: 'Ashley', last: 'Martinez' },
    { first: 'Daniel', last: 'Hernandez' },
    { first: 'Jennifer', last: 'Lopez' },
    { first: 'James', last: 'Gonzalez' },
    { first: 'Lisa', last: 'Wilson' },
    { first: 'Robert', last: 'Anderson' }
  ];

  const logs = [];
  
  for (let i = 0; i < 50; i++) {
    const name = names[i % names.length];
    const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const duration = outcome === 'answered' || outcome === 'appointment_set' 
      ? Math.floor(Math.random() * 300) + 30 
      : outcome === 'voicemail' 
        ? Math.floor(Math.random() * 60) + 15
        : 0;
    
    const hoursAgo = Math.floor(Math.random() * 72);
    const createdAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    
    logs.push({
      id: `demo-call-${i + 1}`,
      lead_id: `demo-lead-${(i % 25) + 1}`,
      lead_name: `${name.first} ${name.last}`,
      phone_number: `+1${Math.floor(Math.random() * 900 + 100)}${Math.floor(Math.random() * 900 + 100)}${Math.floor(Math.random() * 9000 + 1000)}`,
      caller_id: `+1555${Math.floor(Math.random() * 900 + 100)}${Math.floor(Math.random() * 9000 + 1000)}`,
      campaign_id: `demo-campaign-${(i % 4) + 1}`,
      status,
      outcome,
      duration_seconds: duration,
      created_at: createdAt.toISOString(),
      answered_at: outcome !== 'no_answer' && outcome !== 'busy' ? new Date(createdAt.getTime() + 5000).toISOString() : null,
      ended_at: new Date(createdAt.getTime() + duration * 1000).toISOString(),
      notes: outcome === 'appointment_set' ? 'Scheduled for next week' : outcome === 'callback_requested' ? 'Call back tomorrow afternoon' : null,
      retell_call_id: `retell_${Math.random().toString(36).substr(2, 9)}`
    });
  }
  
  return logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
};

export const DEMO_CALL_LOGS = generateCallLogs();

export const DEMO_CALL_STATS = {
  today: {
    totalCalls: 127,
    answered: 58,
    voicemails: 23,
    noAnswer: 31,
    busy: 15,
    appointmentsSet: 14,
    avgDuration: 145
  },
  week: {
    totalCalls: 847,
    answered: 412,
    voicemails: 156,
    noAnswer: 198,
    busy: 81,
    appointmentsSet: 89,
    avgDuration: 138
  },
  month: {
    totalCalls: 3254,
    answered: 1587,
    voicemails: 612,
    noAnswer: 756,
    busy: 299,
    appointmentsSet: 342,
    avgDuration: 142
  }
};
