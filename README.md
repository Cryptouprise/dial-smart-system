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

## Supabase Functions Deployment

This project includes several Supabase Edge Functions for Twilio and Retell AI integrations.

### Prerequisites

1. Install [Supabase CLI](https://supabase.com/docs/guides/cli)
2. Login to Supabase:
   ```sh
   supabase login
   ```
3. Link to your project:
   ```sh
   supabase link --project-ref <your-project-ref>
   ```

### Required Environment Variables

Set the following secrets in your Supabase project:

```sh
# Twilio Credentials
supabase secrets set TWILIO_ACCOUNT_SID=your_account_sid
supabase secrets set TWILIO_AUTH_TOKEN=your_auth_token

# Retell AI Credentials
supabase secrets set RETELL_AI_API_KEY=your_retell_api_key
```

### Deploy Functions

Deploy all functions:

```sh
supabase functions deploy
```

Or deploy individual functions:

```sh
# Retell AI functions
supabase functions deploy retell-credentials-check
supabase functions deploy retell-phone-management
supabase functions deploy retell-agent-management

# Twilio functions
supabase functions deploy twilio-integration
supabase functions deploy twilio-termination-proxy
supabase functions deploy twilio-outbound-call

# Outbound calling
supabase functions deploy outbound-calling
```

### Testing

#### Quick curl tests

Test Retell credentials:
```sh
curl -X POST "https://<your-project-ref>.supabase.co/functions/v1/retell-credentials-check" \
  -H "Authorization: Bearer <your-auth-token>" \
  -H "Content-Type: application/json" \
  -H "apikey: <your-anon-key>"
```

Test Twilio integration:
```sh
curl -X POST "https://<your-project-ref>.supabase.co/functions/v1/twilio-integration" \
  -H "Authorization: Bearer <your-auth-token>" \
  -H "Content-Type: application/json" \
  -H "apikey: <your-anon-key>" \
  -d '{"action": "list_numbers"}'
```

#### Integration tests

Run the full integration test suite:

```sh
export SUPABASE_URL=https://<your-project-ref>.supabase.co
export SUPABASE_ANON_KEY=<your-anon-key>
export TEST_AUTH_TOKEN=<valid-user-token>
export TEST_PHONE_NUMBER=+1234567890
export TEST_CALLER_ID=+1234567890
export TEST_AGENT_ID=<retell-agent-id>

node scripts/integration/test-outbound-call.js
```

#### CI/CD Smoke Tests

The repository includes a GitHub Actions workflow (`.github/workflows/smoke-test.yml`) that runs smoke tests on push/PR.

To enable:
1. Set `ENABLE_SMOKE_TESTS` repository variable to `true`
2. Configure the required secrets in GitHub:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `TEST_AUTH_TOKEN`
   - Optional: `TEST_PHONE_NUMBER`, `TEST_CALLER_ID`, `TEST_AGENT_ID`

### Migration Notes

When deploying these functions for the first time:

1. Ensure your database has the `call_logs` table with the following columns:
   - `id` (uuid, primary key)
   - `user_id` (uuid, references auth.users)
   - `campaign_id` (uuid, nullable)
   - `lead_id` (uuid, nullable)
   - `phone_number` (text)
   - `caller_id` (text)
   - `retell_call_id` (text, nullable)
   - `status` (text)
   - `created_at` (timestamp)

2. Ensure your database has the `phone_numbers` table with the following columns:
   - `id` (uuid, primary key)
   - `user_id` (uuid, references auth.users)
   - `number` (text)
   - `area_code` (text)
   - `status` (text)
   - `daily_calls` (integer)
   - `retell_phone_id` (text, nullable)
   - `created_at` (timestamp)

3. Run any pending migrations in `supabase/migrations/`
