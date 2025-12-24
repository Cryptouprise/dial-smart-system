// Demo pipeline data for kanban board
export const DEMO_PIPELINE_BOARDS = [
  {
    id: 'demo-board-1',
    name: 'New Leads',
    description: 'Fresh leads awaiting first contact',
    position: 1,
    disposition_id: 'demo-disp-1',
    disposition: { name: 'New', color: '#3B82F6' }
  },
  {
    id: 'demo-board-2',
    name: 'Contacted',
    description: 'Leads that have been reached',
    position: 2,
    disposition_id: 'demo-disp-2',
    disposition: { name: 'Contacted', color: '#F59E0B' }
  },
  {
    id: 'demo-board-3',
    name: 'Qualified',
    description: 'Leads showing interest',
    position: 3,
    disposition_id: 'demo-disp-3',
    disposition: { name: 'Qualified', color: '#10B981' }
  },
  {
    id: 'demo-board-4',
    name: 'Appointment Set',
    description: 'Meetings scheduled',
    position: 4,
    disposition_id: 'demo-disp-4',
    disposition: { name: 'Appointment', color: '#8B5CF6' }
  },
  {
    id: 'demo-board-5',
    name: 'Closed Won',
    description: 'Successful conversions',
    position: 5,
    disposition_id: 'demo-disp-5',
    disposition: { name: 'Won', color: '#22C55E' }
  }
];

export const DEMO_DISPOSITIONS = [
  { id: 'demo-disp-1', name: 'New', color: '#3B82F6', pipeline_stage: 'new', description: 'New lead' },
  { id: 'demo-disp-2', name: 'Contacted', color: '#F59E0B', pipeline_stage: 'contacted', description: 'Lead contacted' },
  { id: 'demo-disp-3', name: 'Qualified', color: '#10B981', pipeline_stage: 'qualified', description: 'Qualified lead' },
  { id: 'demo-disp-4', name: 'Appointment', color: '#8B5CF6', pipeline_stage: 'appointment', description: 'Appointment scheduled' },
  { id: 'demo-disp-5', name: 'Won', color: '#22C55E', pipeline_stage: 'won', description: 'Deal closed' },
  { id: 'demo-disp-6', name: 'Lost', color: '#EF4444', pipeline_stage: 'lost', description: 'Deal lost' }
];

export const DEMO_LEAD_POSITIONS = [
  // New leads board
  { id: 'pos-1', lead_id: 'demo-lead-1', pipeline_board_id: 'demo-board-1', position: 1, lead: { id: 'demo-lead-1', first_name: 'John', last_name: 'Smith', phone_number: '+15551234567', company: 'Smith Industries', email: 'john@smith.com' } },
  { id: 'pos-2', lead_id: 'demo-lead-6', pipeline_board_id: 'demo-board-1', position: 2, lead: { id: 'demo-lead-6', first_name: 'Jessica', last_name: 'Garcia', phone_number: '+15556789012', company: null, email: 'jgarcia@email.com' } },
  { id: 'pos-3', lead_id: 'demo-lead-9', pipeline_board_id: 'demo-board-1', position: 3, lead: { id: 'demo-lead-9', first_name: 'Matthew', last_name: 'Rodriguez', phone_number: '+15559012345', company: 'Rodriguez Corp', email: 'matt.r@corp.com' } },
  
  // Contacted board
  { id: 'pos-4', lead_id: 'demo-lead-2', pipeline_board_id: 'demo-board-2', position: 1, lead: { id: 'demo-lead-2', first_name: 'Sarah', last_name: 'Johnson', phone_number: '+15552345678', company: 'Johnson & Associates', email: 'sarah.j@company.com' } },
  { id: 'pos-5', lead_id: 'demo-lead-7', pipeline_board_id: 'demo-board-2', position: 2, lead: { id: 'demo-lead-7', first_name: 'Christopher', last_name: 'Miller', phone_number: '+15557890123', company: 'Miller Manufacturing', email: 'chris.miller@business.com' } },
  { id: 'pos-6', lead_id: 'demo-lead-10', pipeline_board_id: 'demo-board-2', position: 3, lead: { id: 'demo-lead-10', first_name: 'Ashley', last_name: 'Martinez', phone_number: '+15550123456', company: 'Design Studio', email: 'ashley.m@design.com' } },
  
  // Qualified board
  { id: 'pos-7', lead_id: 'demo-lead-3', pipeline_board_id: 'demo-board-3', position: 1, lead: { id: 'demo-lead-3', first_name: 'Michael', last_name: 'Williams', phone_number: '+15553456789', company: null, email: 'mike.w@gmail.com' } },
  { id: 'pos-8', lead_id: 'demo-lead-8', pipeline_board_id: 'demo-board-3', position: 2, lead: { id: 'demo-lead-8', first_name: 'Amanda', last_name: 'Davis', phone_number: '+15558901234', company: 'StartUp Co', email: 'amanda.d@startup.co' } },
  { id: 'pos-9', lead_id: 'demo-lead-13', pipeline_board_id: 'demo-board-3', position: 3, lead: { id: 'demo-lead-13', first_name: 'James', last_name: 'Gonzalez', phone_number: '+15553344556', company: 'Retail Plus', email: 'james.g@retail.com' } },
  
  // Appointment Set board
  { id: 'pos-10', lead_id: 'demo-lead-4', pipeline_board_id: 'demo-board-4', position: 1, lead: { id: 'demo-lead-4', first_name: 'Emily', last_name: 'Brown', phone_number: '+15554567890', company: 'Brown Real Estate', email: 'emily.brown@outlook.com' } },
  { id: 'pos-11', lead_id: 'demo-lead-11', pipeline_board_id: 'demo-board-4', position: 2, lead: { id: 'demo-lead-11', first_name: 'Daniel', last_name: 'Hernandez', phone_number: '+15551122334', company: 'Enterprise Solutions', email: 'dan.h@enterprise.com' } },
  
  // Closed Won board
  { id: 'pos-12', lead_id: 'demo-lead-16', pipeline_board_id: 'demo-board-5', position: 1, lead: { id: 'demo-lead-16', first_name: 'Thomas', last_name: 'Taylor', phone_number: '+15551601234', company: 'Company 16', email: 'lead16@example.com' } },
];
