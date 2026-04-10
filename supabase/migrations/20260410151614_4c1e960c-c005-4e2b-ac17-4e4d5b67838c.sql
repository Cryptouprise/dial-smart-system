-- Create pipeline boards for Solar Contract Breakers campaign
-- Campaign ID: 9cc5a2c3-6b03-4d2d-a539-218f73380588
INSERT INTO pipeline_boards (user_id, name, description, disposition_id, position, campaign_id, settings) VALUES
('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'New Leads', 'Leads not yet contacted', NULL, 0, '9cc5a2c3-6b03-4d2d-a539-218f73380588', '{}'),
('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Transferred', 'Successfully transferred to scheduling', '35f56d95-50d8-4497-a19a-0940b3390015', 1, '9cc5a2c3-6b03-4d2d-a539-218f73380588', '{}'),
('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Hot Leads', 'High interest leads', '3681e8c9-fcd5-4324-b4a7-02f67de69300', 2, '9cc5a2c3-6b03-4d2d-a539-218f73380588', '{}'),
('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Dropped Call Positive', 'Positive disposition but call dropped', '52ac55b4-0945-413b-8140-f39db5a6c38e', 3, '9cc5a2c3-6b03-4d2d-a539-218f73380588', '{}'),
('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Potential Prospects', 'Qualified but not transferred', '0245e935-8914-422f-885b-2802eb1d9463', 4, '9cc5a2c3-6b03-4d2d-a539-218f73380588', '{}'),
('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Follow Up', 'Needs follow-up action', 'f79d6392-29eb-4059-95d4-1ecd1cefe262', 5, '9cc5a2c3-6b03-4d2d-a539-218f73380588', '{}'),
('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Send More Info', 'Requested additional information', 'e5118fd1-7ca7-457a-91a1-cc97064bb129', 6, '9cc5a2c3-6b03-4d2d-a539-218f73380588', '{}'),
('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Callbacks', 'Busy/dropped/callback scheduled', 'd648ce6a-8fea-45ef-b187-db4df7ba929b', 7, '9cc5a2c3-6b03-4d2d-a539-218f73380588', '{}'),
('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Appointment Booked', 'Appointment confirmed', 'ba57e8b1-81ca-4eb1-b8ae-c6099dd36f43', 8, '9cc5a2c3-6b03-4d2d-a539-218f73380588', '{}'),
('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Bad Number / Wrong Number', 'Invalid phone numbers', '4b45006f-4ff8-47db-b140-1786f91b3a92', 9, '9cc5a2c3-6b03-4d2d-a539-218f73380588', '{}'),
('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Not Interested', 'Declined offer', '55fca001-1f94-4b77-8b22-bb266b7372d8', 10, '9cc5a2c3-6b03-4d2d-a539-218f73380588', '{}'),
('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Already Has Solar', 'Not qualified - already has solar', '2d622ead-69f9-4827-b588-8770ad9cd111', 11, '9cc5a2c3-6b03-4d2d-a539-218f73380588', '{}'),
('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'DNC', 'Do not call list', 'fa00aad6-4ca4-4811-a425-906eb6d34c59', 12, '9cc5a2c3-6b03-4d2d-a539-218f73380588', '{}');

-- Create pipeline boards for Cortana New Jersey Solar campaign
-- Campaign ID: c2756255-d99e-4c18-87f6-d756634cd8a2
INSERT INTO pipeline_boards (user_id, name, description, disposition_id, position, campaign_id, settings) VALUES
('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'New Leads', 'Leads not yet contacted', NULL, 0, 'c2756255-d99e-4c18-87f6-d756634cd8a2', '{}'),
('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Transferred', 'Successfully transferred to scheduling', '35f56d95-50d8-4497-a19a-0940b3390015', 1, 'c2756255-d99e-4c18-87f6-d756634cd8a2', '{}'),
('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Hot Leads', 'High interest leads', '3681e8c9-fcd5-4324-b4a7-02f67de69300', 2, 'c2756255-d99e-4c18-87f6-d756634cd8a2', '{}'),
('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Dropped Call Positive', 'Positive disposition but call dropped', '52ac55b4-0945-413b-8140-f39db5a6c38e', 3, 'c2756255-d99e-4c18-87f6-d756634cd8a2', '{}'),
('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Potential Prospects', 'Qualified but not transferred', '0245e935-8914-422f-885b-2802eb1d9463', 4, 'c2756255-d99e-4c18-87f6-d756634cd8a2', '{}'),
('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Follow Up', 'Needs follow-up action', 'f79d6392-29eb-4059-95d4-1ecd1cefe262', 5, 'c2756255-d99e-4c18-87f6-d756634cd8a2', '{}'),
('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Send More Info', 'Requested additional information', 'e5118fd1-7ca7-457a-91a1-cc97064bb129', 6, 'c2756255-d99e-4c18-87f6-d756634cd8a2', '{}'),
('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Callbacks', 'Busy/dropped/callback scheduled', 'd648ce6a-8fea-45ef-b187-db4df7ba929b', 7, 'c2756255-d99e-4c18-87f6-d756634cd8a2', '{}'),
('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Appointment Booked', 'Appointment confirmed', 'ba57e8b1-81ca-4eb1-b8ae-c6099dd36f43', 8, 'c2756255-d99e-4c18-87f6-d756634cd8a2', '{}'),
('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Bad Number / Wrong Number', 'Invalid phone numbers', '4b45006f-4ff8-47db-b140-1786f91b3a92', 9, 'c2756255-d99e-4c18-87f6-d756634cd8a2', '{}'),
('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Not Interested', 'Declined offer', '55fca001-1f94-4b77-8b22-bb266b7372d8', 10, 'c2756255-d99e-4c18-87f6-d756634cd8a2', '{}'),
('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'Already Has Solar', 'Not qualified - already has solar', '2d622ead-69f9-4827-b588-8770ad9cd111', 11, 'c2756255-d99e-4c18-87f6-d756634cd8a2', '{}'),
('5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'DNC', 'Do not call list', 'fa00aad6-4ca4-4811-a425-906eb6d34c59', 12, 'c2756255-d99e-4c18-87f6-d756634cd8a2', '{}');