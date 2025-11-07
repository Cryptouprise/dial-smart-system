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

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/df06441e-ebac-46f8-8957-994bea19f4de) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)

## Twilio + Retell AI Integration

This project integrates Twilio and Retell AI for outbound calling capabilities.

### Required Environment Variables

Configure these environment variables in your Supabase project:

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-twilio-auth-token

# Retell AI
RETELL_AI_API_KEY=your-retell-api-key

# Site Configuration
SITE_URL=https://your-domain.com
# or
PRIMARY_DOMAIN=https://your-domain.com

# Optional: Retell webhook security
RETELL_INBOUND_SECRET=your-shared-secret
```

### Deploying Supabase Edge Functions

Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and deploy the edge functions:

```bash
# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Deploy all functions
supabase functions deploy retell-credentials-check
supabase functions deploy twilio-termination-proxy
supabase functions deploy twilio-integration
supabase functions deploy outbound-calling
supabase functions deploy twilio-outbound-call
```

Or deploy all functions at once:

```bash
supabase functions deploy
```

### Testing the Integration

#### 1. Test Retell Credentials Check

```bash
curl -X GET https://your-project.supabase.co/functions/v1/retell-credentials-check \
  -H "apikey: your-anon-key"
```

Expected response (2xx):
```json
{
  "ok": true,
  "message": "Retell credentials valid"
}
```

#### 2. Test Twilio Outbound Call

```bash
curl -X POST https://your-project.supabase.co/functions/v1/twilio-outbound-call \
  -H "Authorization: Bearer your-user-token" \
  -H "Content-Type: application/json" \
  -H "apikey: your-anon-key" \
  -d '{
    "from": "+15555551234",
    "to": "+15555555678",
    "twimlUrl": "http://demo.twilio.com/docs/voice.xml"
  }'
```

Expected response (2xx):
```json
{
  "success": true,
  "twilio": { ... }
}
```

#### 3. Test Outbound Calling (via Retell)

```bash
curl -X POST https://your-project.supabase.co/functions/v1/outbound-calling \
  -H "Authorization: Bearer your-user-token" \
  -H "Content-Type: application/json" \
  -H "apikey: your-anon-key" \
  -d '{
    "action": "create_call",
    "phoneNumber": "+15555555678",
    "callerId": "+15555551234",
    "agentId": "your-retell-agent-id",
    "campaignId": "optional-campaign-id",
    "leadId": "optional-lead-id"
  }'
```

Expected response (2xx):
```json
{
  "call_id": "...",
  "call_log_id": "...",
  "status": "created",
  "retell_response": { ... }
}
```

#### 4. Run Integration Tests

Use the automated test script:

```bash
# Set environment variables
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_ANON_KEY=your-anon-key
export USER_EMAIL=test@example.com
export USER_PASSWORD=test-password

# Run tests
node scripts/integration/test-outbound-call.js
```

### Migration Notes

- **Phone Number Parsing**: The current implementation uses basic area code extraction. For production, integrate [libphonenumber](https://www.npmjs.com/package/libphonenumber-js) for robust phone number parsing and validation.

- **Webhook Signature Verification**: Currently, the `twilio-termination-proxy` supports an optional shared secret via `RETELL_INBOUND_SECRET`. For production, implement full webhook signature verification using Retell's signature headers.

- **CI/CD Secrets Gating**: The smoke test workflow (`.github/workflows/smoke-test.yml`) is gated by the `ENABLE_SMOKE_TESTS` variable to prevent failures in forks or when secrets are not configured.

### Follow-up Tasks

1. **Implement libphonenumber**: Replace basic phone number parsing with libphonenumber for international support
2. **Add webhook signature verification**: Implement cryptographic signature verification for Retell webhooks
3. **Configure CI secrets**: Set up GitHub Actions secrets for automated testing
4. **Add monitoring**: Implement logging and monitoring for call tracking
5. **Error handling**: Enhance error messages and retry logic for failed calls
