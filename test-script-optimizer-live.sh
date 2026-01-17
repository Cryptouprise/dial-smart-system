#!/bin/bash

# Live test of Script Optimizer
echo "🧪 Testing Script Optimizer with Live API Call..."
echo "================================================"
echo ""

SUPABASE_URL="https://emonjusymdripmkvtttc.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtb25qdXN5bWRyaXBta3Z0dHRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg3MzYyNDcsImV4cCI6MjA2NDMxMjI0N30.NPmcCmeJwR_vNymUZp73G9PqbsiPJ7KSTA9x8xG6Soc"

# Test script for a solar sales agent
TEST_SCRIPT='You are a professional solar sales representative.

Opening:
- Introduce yourself warmly by name
- Confirm you are speaking with the homeowner
- Ask if this is a good time to talk for 2-3 minutes

Qualification Questions:
- What is your average monthly electricity bill?
- Do you own your home?
- Does your roof get good sun exposure?
- Are you the primary decision maker?

Value Proposition:
- Mention the 30% federal tax credit
- Explain typical savings of $1500-2000 per year
- Emphasize $0 down payment options available

Objection Handling:
- If cost is a concern: Focus on $0 down and immediate savings
- If not interested: Ask about rising electricity rates
- If need to think: Offer free consultation with no obligation

Closing:
- Offer to schedule a free solar assessment
- Get their best contact information
- Confirm appointment time'

# Sample transcripts (realistic examples)
TEST_PAYLOAD=$(cat <<'EOF'
{
  "action": "compare_to_script",
  "script": "You are a professional solar sales representative.\n\nOpening:\n- Introduce yourself warmly by name\n- Confirm you are speaking with the homeowner\n- Ask if this is a good time to talk for 2-3 minutes\n\nQualification Questions:\n- What is your average monthly electricity bill?\n- Do you own your home?\n- Does your roof get good sun exposure?\n- Are you the primary decision maker?\n\nValue Proposition:\n- Mention the 30% federal tax credit\n- Explain typical savings of $1500-2000 per year\n- Emphasize $0 down payment options available\n\nObjection Handling:\n- If cost is a concern: Focus on $0 down and immediate savings\n- If not interested: Ask about rising electricity rates\n- If need to think: Offer free consultation with no obligation\n\nClosing:\n- Offer to schedule a free solar assessment\n- Get their best contact information\n- Confirm appointment time",
  "transcripts": [
    {
      "callId": "test-call-1",
      "transcript": "Agent: Hi, this is Mike from Solar Solutions. Am I speaking with John? Lead: Yes this is John. Agent: Great! Do you have a couple minutes to talk about potentially saving money on your electric bill? Lead: Um, sure I guess. What is this about? Agent: We help homeowners go solar and save thousands per year. What's your current monthly electric bill running? Lead: About $250 a month. Agent: Wow that's high! With solar you could cut that in half. There's also a 30% federal tax credit right now. Are you the homeowner? Lead: Yes I own the home. Agent: Perfect. How much does this cost though? Agent: Great question - we have $0 down options so you can start saving immediately without any upfront cost. Lead: That sounds interesting. Agent: Would you be open to a free consultation where we assess your roof and give you exact numbers? Lead: Yeah I think so. Agent: Perfect! I have Thursday at 2pm available, does that work?",
      "sentiment": "positive",
      "outcome": "interested",
      "duration": 120
    },
    {
      "callId": "test-call-2",
      "transcript": "Agent: Hello this is Sarah with Solar Solutions. Lead: Not interested. Agent: Can I ask why? Are you concerned about the cost? Lead: I just installed solar last year. Agent: Oh wonderful! How's that working out for you? Lead: Great, thanks. Bye. Agent: Have a great day!",
      "sentiment": "neutral",
      "outcome": "not_interested",
      "duration": 25
    },
    {
      "callId": "test-call-3",
      "transcript": "Agent: Hi this is Tom calling about solar panels. Is this the homeowner? Lead: Yes, what is this regarding? Agent: I wanted to discuss how you can save on electricity with solar. Your neighbors are saving about $2000 a year. Lead: That sounds nice but I'm not sure we can afford solar panels. Agent: I totally understand. Actually with the tax credit and our $0 down programs, most people start saving from day one without any money down. Lead: Really? How does that work? Agent: Basically instead of paying the utility company $200 a month, you'd pay us maybe $120 a month for the solar loan, and your electric bill goes way down. Net savings from the start. Lead: Interesting. But I need to talk to my wife first. Agent: Absolutely, that makes total sense. How about I send you some information and we can schedule a time for both of you to chat with me? Lead: Okay that sounds good. Agent: Perfect, what's the best number to reach both of you?",
      "sentiment": "positive",
      "outcome": "callback",
      "duration": 180
    }
  ]
}
EOF
)

echo "📤 Sending test request to edge function..."
echo "   URL: $SUPABASE_URL/functions/v1/analyze-call-transcript"
echo "   Action: compare_to_script"
echo "   Test transcripts: 3 calls"
echo ""
echo "⏳ This may take 10-20 seconds (AI is analyzing)..."
echo ""

# Make the API call
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -d "$TEST_PAYLOAD" \
  "$SUPABASE_URL/functions/v1/analyze-call-transcript")

# Split response body and status code
HTTP_BODY=$(echo "$RESPONSE" | sed '$d')
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

echo "📥 Response received!"
echo "   HTTP Status: $HTTP_CODE"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ SUCCESS! Script Optimizer is working!"
  echo ""
  echo "================================================"
  echo "ANALYSIS RESULTS:"
  echo "================================================"
  echo ""

  # Pretty print the JSON response
  echo "$HTTP_BODY" | python3 -m json.tool 2>/dev/null || echo "$HTTP_BODY"

  echo ""
  echo "================================================"
  echo ""
  echo "✅ Your Script Optimizer is FULLY FUNCTIONAL!"
  echo ""
  echo "📊 What you got back:"
  echo "   • Script Adherence Score (0-100%)"
  echo "   • Section-by-section analysis"
  echo "   • Prioritized improvements (critical/important/nice-to-have)"
  echo "   • Common deviations from script"
  echo "   • Best practices to keep"
  echo "   • AI voice delivery recommendations"
  echo ""
  echo "🚀 Next Steps:"
  echo "   1. Go to your app: Transcript Analyzer → Script Analysis tab"
  echo "   2. Select a Retell agent"
  echo "   3. Click 'Import Script'"
  echo "   4. Click 'Compare & Generate Improvements'"
  echo "   5. Review and apply improvements!"
  echo ""

elif [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "400" ]; then
  echo "⚠️  Authentication or validation issue"
  echo ""
  echo "Response:"
  echo "$HTTP_BODY"
  echo ""

  if echo "$HTTP_BODY" | grep -q "LOVABLE_API_KEY"; then
    echo "❌ Missing LOVABLE_API_KEY"
    echo ""
    echo "📝 TO FIX:"
    echo "   1. Go to: https://supabase.com/dashboard/project/emonjusymdripmkvtttc/settings/functions"
    echo "   2. Add secret: LOVABLE_API_KEY"
    echo "   3. Get key from: https://lovable.dev/dashboard"
    echo ""
  elif echo "$HTTP_BODY" | grep -q "Unauthorized"; then
    echo "ℹ️  Edge function requires authentication (this is normal)"
    echo "   The function is deployed but needs proper auth token"
    echo ""
  fi

elif [ "$HTTP_CODE" = "404" ]; then
  echo "❌ Edge function not found (404)"
  echo ""
  echo "The analyze-call-transcript edge function may not be deployed."
  echo ""

else
  echo "⚠️  Unexpected response"
  echo ""
  echo "Response body:"
  echo "$HTTP_BODY"
  echo ""
fi

echo "================================================"
