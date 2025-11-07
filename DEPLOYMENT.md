# Deployment Guide: Retell AI & Twilio Integration

This guide covers deploying the Retell AI and Twilio integration features for the Dial Smart System.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variables](#environment-variables)
3. [Deploying Edge Functions](#deploying-edge-functions)
4. [Testing the Integration](#testing-the-integration)
5. [Troubleshooting](#troubleshooting)

## Prerequisites

Before deploying, ensure you have:

1. **Supabase CLI** installed:
   ```bash
   npm install -g supabase
   ```

2. **Supabase Project** set up and linked:
   ```bash
   supabase login
   supabase link --project-ref your-project-ref
   ```

3. **Twilio Account** with:
   - Account SID
   - Auth Token
   - At least one purchased phone number

4. **Retell AI Account** with:
   - API Key
   - At least one configured agent

## Environment Variables

### Required Secrets

Set these secrets in your Supabase project:

```bash
# Twilio Credentials
supabase secrets set TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
supabase secrets set TWILIO_AUTH_TOKEN=your_auth_token_here

# Retell AI Credentials
supabase secrets set RETELL_AI_API_KEY=your_retell_api_key_here
```

### Verification

Verify secrets are set correctly:

```bash
supabase secrets list
```

You should see:
- TWILIO_ACCOUNT_SID
- TWILIO_AUTH_TOKEN
- RETELL_AI_API_KEY
- SUPABASE_URL (automatically set)
- SUPABASE_ANON_KEY (automatically set)
- SUPABASE_SERVICE_ROLE_KEY (automatically set)

## Deploying Edge Functions

### Deploy All Functions

```bash
# Deploy all edge functions at once
supabase functions deploy
```

### Deploy Individual Functions

```bash
# New functions added in this release
supabase functions deploy retell-credentials-check
supabase functions deploy twilio-termination-proxy
supabase functions deploy twilio-outbound-call

# Updated functions
supabase functions deploy twilio-integration
supabase functions deploy outbound-calling
```

### Verify Deployment

List all deployed functions:

```bash
supabase functions list
```

## Testing the Integration

### 1. Test Credentials Check

Verify that credentials are configured correctly:

```bash
curl -X POST https://your-project.supabase.co/functions/v1/retell-credentials-check \
  -H "Authorization: Bearer YOUR_USER_JWT_TOKEN" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "retell_configured": true,
  "twilio_configured": true,
  "message": "All credentials are configured and valid"
}
```

### 2. Test Twilio Outbound Call

Make a test outbound call:

```bash
curl -X POST https://your-project.supabase.co/functions/v1/twilio-outbound-call \
  -H "Authorization: Bearer YOUR_USER_JWT_TOKEN" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+14155551234",
    "from": "+14155556789",
    "twiml": "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Say voice=\"alice\">This is a test call. Goodbye.</Say></Response>"
  }'
```

**Expected Response:**
```json
{
  "sid": "CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "status": "queued",
  "to": "+14155551234",
  "from": "+14155556789"
}
```

### 3. Test Retell AI Outbound Call

Create an outbound call with Retell AI:

```bash
curl -X POST https://your-project.supabase.co/functions/v1/outbound-calling \
  -H "Authorization: Bearer YOUR_USER_JWT_TOKEN" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create_call",
    "phoneNumber": "+14155551234",
    "callerId": "+14155556789",
    "agentId": "your-retell-agent-id"
  }'
```

**Expected Response:**
```json
{
  "call_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "call_log_id": "uuid",
  "status": "created"
}
```

### 4. Integration Test Script

Use the automated test script:

```bash
# Set environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"
export SUPABASE_ACCESS_TOKEN="your-jwt-token"
export TEST_TO_NUMBER="+14155551234"
export TEST_FROM_NUMBER="+14155556789"

# Run the test
node scripts/integration/test-outbound-call.js
```

## Troubleshooting

### Common Issues

#### 1. "Twilio credentials not configured"

**Cause:** TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set.

**Solution:**
```bash
supabase secrets set TWILIO_ACCOUNT_SID=your_sid
supabase secrets set TWILIO_AUTH_TOKEN=your_token
# Re-deploy functions
supabase functions deploy
```

#### 2. "Retell AI credentials not configured"

**Cause:** RETELL_AI_API_KEY not set.

**Solution:**
```bash
supabase secrets set RETELL_AI_API_KEY=your_key
# Re-deploy functions
supabase functions deploy
```

#### 3. "Unauthorized" or 401 errors

**Cause:** Invalid or expired JWT token.

**Solution:**
- Get a fresh JWT token from your Supabase auth session
- Use the correct Authorization header format: `Bearer <token>`

#### 4. Twilio API errors (21608, 21606, etc.)

**Cause:** Invalid phone numbers or Twilio account issues.

**Solution:**
- Verify phone numbers are in E.164 format (e.g., +14155551234)
- Ensure "from" number is a valid Twilio number you own
- Check Twilio account balance and phone number capabilities

#### 5. "Area code extraction failed"

**Cause:** Phone number format not recognized by parser.

**Solution:**
- Use E.164 format for all phone numbers (+1XXXXXXXXXX)
- Check the phone-parser.ts utility logs for details

### Viewing Logs

View edge function logs:

```bash
# Real-time logs
supabase functions logs retell-credentials-check --tail

# Specific function logs
supabase functions logs twilio-outbound-call --limit 100
```

### Testing Locally

Test functions locally before deploying:

```bash
# Start Supabase locally
supabase start

# Serve functions locally
supabase functions serve

# Test locally
curl http://localhost:54321/functions/v1/retell-credentials-check \
  -H "Authorization: Bearer YOUR_LOCAL_JWT" \
  -H "Content-Type: application/json"
```

## Migration Notes

### Breaking Changes

None - this is a new feature addition.

### New Features

1. **Credentials Validation**: New endpoint to verify Twilio and Retell AI credentials
2. **Twilio Outbound Calls**: Direct integration for making calls via Twilio
3. **Twilio Termination Proxy**: Proxy endpoint for Retell AI call termination
4. **Phone Number Parsing**: Robust utility for extracting area codes
5. **Frontend Hooks**: React hooks for easy integration with UI

### Database Schema

No database changes required. The functions use existing tables:
- `call_logs`: Stores call information
- `phone_numbers`: Stores phone number inventory

## CI/CD Integration

The project includes a GitHub Actions workflow (`.github/workflows/smoke-test.yml`) that:
- Runs ESLint checks
- Validates TypeScript compilation
- Runs integration tests (if secrets configured)
- Builds the application

To enable integration tests in CI:

1. Set repository variables:
   ```
   ENABLE_INTEGRATION_TESTS=true
   ```

2. Set repository secrets:
   - SUPABASE_URL
   - SUPABASE_ANON_KEY
   - SUPABASE_ACCESS_TOKEN
   - TEST_TO_NUMBER
   - TEST_FROM_NUMBER

## Support

For issues or questions:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review edge function logs in Supabase dashboard
3. Check Twilio and Retell AI dashboards for API errors
4. Open an issue on GitHub with relevant logs and error messages
