# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/df06441e-ebac-46f8-8957-994bea19f4de

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/df06441e-ebac-46f8-8957-994bea19f4de) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Supabase Edge Functions and Integrations

This project includes several Supabase Edge Functions for outbound calling and integrations with Twilio and Retell AI.

### Required Environment Variables

The following environment variables must be set in your Supabase project:

1. **Twilio Credentials** (required for outbound calling):
   - `TWILIO_ACCOUNT_SID` - Your Twilio Account SID
   - `TWILIO_AUTH_TOKEN` - Your Twilio Auth Token

2. **Retell AI Credentials** (required for AI-powered calling):
   - `RETELL_AI_API_KEY` - Your Retell AI API Key

3. **Supabase Configuration** (automatically set):
   - `SUPABASE_URL` - Your Supabase project URL
   - `SUPABASE_ANON_KEY` - Your Supabase anonymous key
   - `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key

### Setting Environment Variables

To set environment variables in Supabase:

```sh
# Using Supabase CLI
supabase secrets set TWILIO_ACCOUNT_SID=your_account_sid
supabase secrets set TWILIO_AUTH_TOKEN=your_auth_token
supabase secrets set RETELL_AI_API_KEY=your_retell_api_key
```

Or use the Supabase Dashboard:
1. Go to Project Settings > Edge Functions
2. Add secrets under "Function Secrets"

### Deploying Edge Functions

Deploy all edge functions to your Supabase project:

```sh
# Deploy all functions
supabase functions deploy

# Or deploy individual functions
supabase functions deploy retell-credentials-check
supabase functions deploy twilio-termination-proxy
supabase functions deploy twilio-outbound-call
supabase functions deploy twilio-integration
supabase functions deploy outbound-calling
```

### Testing Edge Functions

#### Test Credentials Check

```bash
curl -X POST https://your-project.supabase.co/functions/v1/retell-credentials-check \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Content-Type: application/json"
```

Expected response:
```json
{
  "retell_configured": true,
  "twilio_configured": true,
  "message": "All credentials are configured and valid"
}
```

#### Test Twilio Outbound Call

```bash
curl -X POST https://your-project.supabase.co/functions/v1/twilio-outbound-call \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+14155551234",
    "from": "+14155556789",
    "twiml": "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Say>Hello World</Say></Response>"
  }'
```

Expected response:
```json
{
  "sid": "CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "status": "queued",
  "to": "+14155551234",
  "from": "+14155556789"
}
```

#### Test Outbound Calling (Retell AI)

```bash
curl -X POST https://your-project.supabase.co/functions/v1/outbound-calling \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create_call",
    "phoneNumber": "+14155551234",
    "callerId": "+14155556789",
    "agentId": "your-retell-agent-id"
  }'
```

Expected response:
```json
{
  "call_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "call_log_id": "uuid",
  "status": "created"
}
```

### Running Integration Tests

The project includes an integration test script that validates the end-to-end flow:

```sh
# Set required environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"
export SUPABASE_ACCESS_TOKEN="your-jwt-token"
export TEST_TO_NUMBER="+14155551234"
export TEST_FROM_NUMBER="+14155556789"

# Run the test script
node scripts/integration/test-outbound-call.js
```

The test script will:
1. Validate all environment variables are set
2. Test the credentials check endpoint
3. Test creating an outbound call (if credentials are valid)
4. Display detailed request/response information

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/df06441e-ebac-46f8-8957-994bea19f4de) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)
