# Dial Smart System — Architecture

## The Autonomous Loop

Every 5 minutes, the AI engine runs this complete cycle:

```mermaid
flowchart TD
    subgraph INPUT["📥 INPUT"]
        LEADS[("5,000 Leads\nCSV / CRM / API")]
        GOAL["🎯 Goal: Book Appointments"]
    end

    subgraph BRAIN["🧠 AI BRAIN (27 Steps Every 5 Min)"]
        direction TB
        SCORE["Score & Rank Leads\n9-feature ML model"]
        INTENT["Extract Intent\nTimeline • Budget • Decision Maker"]
        DECIDE["Make Decisions\nQueue calls • Send SMS • Adjust pacing"]
        JOURNEY["Fire Playbook Rules\n19+ rules per journey stage"]
        PREDICT["Predict Outcomes\nP(convert) • P(churn) • Best hour"]
        OPTIMIZE["Self-Optimize\nA/B test • Rewrite copy • Adjust timing"]
    end

    subgraph EXECUTE["⚡ EXECUTION"]
        DIAL["📞 AI Dialer\n50-600 calls/min\nNumber rotation"]
        SMS["💬 SMS Engine\nA/B tested copy\nAI-generated messages"]
        VOICE["🤖 AI Voice Agent\nRetell AI / Telnyx\nNatural conversation"]
    end

    subgraph OUTCOMES["📊 OUTCOMES"]
        APPT["✅ Appointment Set"]
        CALLBACK["📅 Callback Scheduled"]
        INTERESTED["🔥 Interested"]
        VOICEMAIL["📱 Voicemail Left"]
        NOANSWER["📵 No Answer"]
        NOTINTERESTED["👋 Not Interested"]
        DNC["🚫 DNC"]
    end

    subgraph FOLLOWUP["♻️ AUTOMATED FOLLOW-UP"]
        CONFIRM["Confirm + Remind\nDay before + Morning of"]
        EXACTCALL["Exact-Time Callback\nWith conversation context"]
        HOTPATH["Hot Lead Sequence\nFollow-up in 24hrs"]
        RETRY["Retry Sequence\nDifferent time + SMS first"]
        NURTURE["Perpetual Nurture\nMonthly value touches\nForever until DNC"]
    end

    INPUT --> BRAIN
    SCORE --> INTENT --> DECIDE --> JOURNEY --> PREDICT --> OPTIMIZE
    BRAIN --> EXECUTE
    DIAL --> VOICE
    SMS --> OUTCOMES
    VOICE --> OUTCOMES

    APPT --> CONFIRM
    CALLBACK --> EXACTCALL
    INTERESTED --> HOTPATH
    VOICEMAIL --> RETRY
    NOANSWER --> RETRY
    NOTINTERESTED --> NURTURE
    DNC -.- STOP(("⛔ STOP"))

    CONFIRM -.->|"No-show?"| RETRY
    EXACTCALL -.-> VOICE
    HOTPATH -.-> VOICE
    RETRY -.-> DIAL
    NURTURE -.->|"Responds?"| HOTPATH

    style BRAIN fill:#1a1a2e,color:#fff
    style EXECUTE fill:#16213e,color:#fff
    style OUTCOMES fill:#0f3460,color:#fff
    style FOLLOWUP fill:#533483,color:#fff
    style INPUT fill:#e94560,color:#fff
    style STOP fill:#ff0000,color:#fff
```

## Workflow Branching — How Every Lead Takes a Different Path

```mermaid
flowchart LR
    START(("New Lead")) --> CALL1["📞 Call #1\n5 min after import"]

    CALL1 --> ANSWERED{Answered?}

    ANSWERED -->|YES| INTEREST{Interest > 7?}
    INTEREST -->|YES| BOOK["📅 Book Appointment"]
    INTEREST -->|NO| FOLLOWUP_CALL["📞 Follow-up\nin 24hrs"]

    ANSWERED -->|NO| SMS1["💬 SMS\nHey, just tried calling..."]
    SMS1 --> WAIT1["⏳ Wait 4hrs"]
    WAIT1 --> CALL2["📞 Call #2"]

    CALL2 --> ANSWERED2{Answered?}
    ANSWERED2 -->|YES| INTEREST
    ANSWERED2 -->|NO| AI_SMS["🤖 AI SMS\nPersonalized re-engagement"]
    AI_SMS --> WAIT2["⏳ Wait 48hrs"]
    WAIT2 --> CALL3["📞 Call #3"]

    CALL3 --> ANSWERED3{Answered?}
    ANSWERED3 -->|YES| INTEREST
    ANSWERED3 -->|NO| NURTURE["♻️ Monthly Nurture\nValue-driven SMS\nLoop forever"]

    BOOK --> CONFIRM["✅ Confirmation SMS"]
    CONFIRM --> REMIND1["📱 Remind Day Before"]
    REMIND1 --> REMIND2["📱 Remind Morning Of"]

    FOLLOWUP_CALL --> ANSWERED
    NURTURE -->|"Lead responds"| INTEREST

    style START fill:#e94560,color:#fff
    style BOOK fill:#00b894,color:#fff
    style NURTURE fill:#6c5ce7,color:#fff
```

## The ML Learning Loop

```mermaid
flowchart TD
    subgraph COLLECT["📊 Data Collection (Every Call)"]
        TRANSCRIPT["Full Transcript"]
        SENTIMENT["Sentiment Score"]
        DURATION["Call Duration"]
        OUTCOME["Disposition"]
        TIMING["Time of Day / Day of Week"]
    end

    subgraph LEARN["🧠 ML Training (Weekly)"]
        FEATURES["Extract 9 Features\nRecency • Calls • Interest\nEngagement • Sentiment\nIntent • Source • Stage"]
        TRAIN["Logistic Regression\nGradient Descent\nEarly Stopping\n80/20 Train/Test Split"]
        VALIDATE["Validate\nAccuracy • AUC\nConvergence Check"]
    end

    subgraph PREDICT_BLOCK["🔮 Predictions (Daily)"]
        CONVERSION["P(Will Convert)\nper lead"]
        CHURN["P(Will Churn)\n6 risk factors"]
        SEGMENT["Segment Assignment\nHigh Value • Nurture\nAt Risk • Low Priority"]
    end

    subgraph ACT["⚡ Actions"]
        PRIORITIZE["Prioritize high-value leads"]
        REENGAGE["Re-engage at-risk leads"]
        ADJUST["Adjust playbook timing"]
        REWRITE["Rewrite losing SMS copy"]
    end

    COLLECT --> LEARN
    LEARN --> PREDICT_BLOCK
    PREDICT_BLOCK --> ACT
    ACT -->|"Results feed back"| COLLECT

    style COLLECT fill:#0984e3,color:#fff
    style LEARN fill:#6c5ce7,color:#fff
    style PREDICT_BLOCK fill:#00b894,color:#fff
    style ACT fill:#e94560,color:#fff
```

## Disposition Flow — What Happens After Every Call

```mermaid
flowchart TD
    CALL_ENDS(("Call Ends")) --> WEBHOOK["Webhook fires\nTranscript + Sentiment + Outcome"]

    WEBHOOK --> DISPOSITION{"What happened?"}

    DISPOSITION -->|"Appointment Set"| PIPE_BOOKED["Pipeline: Booked"]
    DISPOSITION -->|"Interested / Callback"| PIPE_HOT["Pipeline: Hot"]
    DISPOSITION -->|"Voicemail"| PIPE_ATTEMPT["Pipeline: Attempting"]
    DISPOSITION -->|"No Answer"| PIPE_ATTEMPT
    DISPOSITION -->|"Not Interested"| PIPE_CLOSED["Pipeline: Closed"]
    DISPOSITION -->|"DNC / Stop Calling"| PIPE_DNC["Pipeline: DNC"]

    PIPE_BOOKED --> ACTION_BOOK["✅ Book calendar\n📱 Send confirmation\n⏰ Queue reminders"]
    PIPE_HOT --> ACTION_HOT["📅 Schedule exact callback\n📱 Send recap SMS\n⏰ Remind 1hr before"]
    PIPE_ATTEMPT --> ACTION_RETRY["📞 Retry at different time\n💬 SMS after missed call\n🔄 Max 3 attempts"]
    PIPE_CLOSED --> ACTION_NURTURE["♻️ Enter nurture loop\n📱 Monthly value SMS\n⏰ Win-back in 60 days"]
    PIPE_DNC --> ACTION_DNC["🚫 Add to DNC list\n❌ Remove from all queues\n🔒 Never contact again"]

    ACTION_RETRY -->|"3 attempts failed"| ACTION_NURTURE

    style CALL_ENDS fill:#e94560,color:#fff
    style PIPE_BOOKED fill:#00b894,color:#fff
    style PIPE_HOT fill:#fdcb6e,color:#000
    style PIPE_DNC fill:#d63031,color:#fff
    style ACTION_DNC fill:#d63031,color:#fff
```

## Tech Stack

```mermaid
graph LR
    subgraph FRONTEND["Frontend"]
        REACT["React 18"]
        TS["TypeScript"]
        TAILWIND["Tailwind CSS"]
        VITE["Vite"]
    end

    subgraph BACKEND["Backend"]
        SUPA["Supabase\nPostgreSQL + Auth + RLS"]
        EDGE["63 Edge Functions\nDeno Runtime"]
        CRON["pg_cron\n5-min engine cycle"]
    end

    subgraph AI["AI / ML"]
        RETELL["Retell AI\nVoice Agents"]
        TELNYX["Telnyx\nVoice + SMS"]
        TWILIO["Twilio\nSMS + Numbers"]
        LLM["Claude / Gemini\nStrategy + Copy"]
        ML["Logistic Regression\nConversion Prediction"]
    end

    subgraph INTEGRATIONS["Integrations"]
        GHL["Go High Level\nCRM Sync"]
        GCAL["Google Calendar\nAppointment Booking"]
        STRIPE["Stripe\nCredit System"]
    end

    FRONTEND --> BACKEND
    BACKEND --> AI
    BACKEND --> INTEGRATIONS

    style FRONTEND fill:#61dafb,color:#000
    style BACKEND fill:#3ecf8e,color:#000
    style AI fill:#6c5ce7,color:#fff
    style INTEGRATIONS fill:#fd79a8,color:#fff
```
