# VICIdial Integration Guide

## Overview

The dial-smart-system now includes native integration with VICIdial, the industry-leading open-source contact center platform. This integration enables enterprises already using VICIdial to leverage the AI-powered features of dial-smart-system while maintaining their existing VICIdial infrastructure.

## Why VICIdial Integration?

### Enterprise Reality
Many large organizations have invested significantly in VICIdial infrastructure:
- Hundreds or thousands of agents trained on VICIdial
- Custom scripts and workflows built over years
- Compliance processes tied to VICIdial features
- Extensive historical data in VICIdial databases

### The Solution
Rather than requiring a complete platform migration, dial-smart-system integrates directly with VICIdial through its comprehensive Agent and Non-Agent APIs, enabling:
- Hybrid AI-human workflows
- Gradual adoption of AI features
- Preservation of existing investments
- Best-of-both-worlds architecture

---

## Features

### Agent API Integration
Control VICIdial agents in real-time through the dial-smart-system:

1. **external_dial** - Initiate outbound calls
   - Trigger calls from dial-smart campaigns
   - Automatic lead lookup in VICIdial
   - Agent session management

2. **external_hangup** - Terminate active calls
   - Remote call control
   - Emergency disconnect capability
   - Supervisor intervention

3. **external_status** - Set call dispositions
   - Sync dispositions between systems
   - Custom status codes
   - Real-time reporting

4. **external_pause** - Pause/resume agents
   - Break management
   - Workload balancing
   - Agent availability control

5. **external_add_lead** - Add leads during calls
   - Real-time lead creation
   - Dynamic campaign updates
   - Transfer enrichment

6. **external_update_lead** - Update lead information
   - Data enrichment
   - Status synchronization
   - Custom field updates

### Non-Agent API Integration
Administrative and campaign management functions:

1. **add_lead** - Bulk lead import
2. **update_lead** - Lead data maintenance
3. **add_user** - Agent account management
4. **update_user** - Agent profile updates
5. **call_log_export** - Historical data sync
6. **recording_lookup** - Call recording access

---

## Architecture

### Hybrid System Design

```
┌─────────────────────────┐
│  Dial Smart System      │
│  (AI & Automation)      │
│                         │
│  - AI Pipeline Manager  │
│  - Predictive Dialing   │
│  - Script Optimization  │
│  - Disposition Auto     │
└────────┬────────────────┘
         │ VICIdial API
         │ (Agent & Non-Agent)
         ▼
┌─────────────────────────┐
│  VICIdial              │
│  (Agent & Campaigns)    │
│                         │
│  - Agent Management     │
│  - Call Routing         │
│  - Recording System     │
│  - Compliance Features  │
└─────────────────────────┘
```

### Data Flow

1. **Outbound Calls**
   ```
   Dial Smart Campaign → VICIdial Agent API → VICIdial Agent → Customer
   ```

2. **Dispositions**
   ```
   Agent Action → VICIdial → Dial Smart Sync → AI Analysis
   ```

3. **Lead Updates**
   ```
   AI Insights → Dial Smart → VICIdial Non-Agent API → VICIdial Lists
   ```

---

## Setup Guide

### Prerequisites

1. **VICIdial Requirements**
   - VICIdial 2.14 or higher
   - API access enabled
   - API user with appropriate permissions
   - HTTPS recommended for security

2. **Network Requirements**
   - HTTP/HTTPS access from dial-smart-system to VICIdial
   - Firewall rules configured
   - SSL certificate (recommended)

3. **Authentication**
   - VICIdial API username
   - VICIdial API password
   - API source identifier

### Step 1: Enable VICIdial API

On your VICIdial server:

```bash
# Edit VICIdial configuration
sudo vi /etc/astguiclient.conf

# Ensure these settings are enabled:
# enable_api_login=1
# api_web_directory=/var/www/html/agc

# Restart Apache
sudo systemctl restart apache2
```

### Step 2: Create API User

In VICIdial admin panel:

1. Navigate to Admin → Users
2. Click "Add New User"
3. Set User Level to "9" (API user)
4. Enable "API Only Access"
5. Set strong password
6. Grant necessary permissions:
   - Modify Leads
   - Load Leads
   - Campaign Controls
   - Agent Functions

### Step 3: Configure Dial-Smart-System

#### Option A: Environment Variables

Add to your `.env` file:

```env
# VICIdial Configuration
VITE_VICI_SERVER_URL=https://your-vicidial-server.com
VITE_VICI_API_USER=your_api_username
VITE_VICI_API_PASS=your_api_password
VITE_VICI_SOURCE=dial-smart
VITE_VICI_AGENT_USER=default_agent
VITE_VICI_CAMPAIGN_ID=default_campaign
VITE_VICI_PHONE_CODE=1
VITE_VICI_USE_AGENT_API=true
```

#### Option B: UI Configuration

1. Navigate to Settings → Providers
2. Click "Add Provider"
3. Select "VICIdial"
4. Enter configuration details
5. Click "Test Connection"
6. Save configuration

### Step 4: Test Integration

```typescript
// Test VICIdial connection
import { ViciAdapter } from '@/services/providers/viciAdapter';

const adapter = new ViciAdapter({
  server_url: 'https://your-vicidial-server.com',
  api_user: 'your_api_username',
  api_pass: 'your_api_password',
  source: 'dial-smart',
  use_agent_api: true,
});

const result = await adapter.testConnection();
console.log(result);
// { success: true, message: "Connected to VICIdial: Version 2.14..." }
```

---

## Usage Examples

### Example 1: Initiate Call Through VICIdial

```typescript
import { carrierRouter } from '@/services/carrierRouter';

// Select VICIdial as provider
const router = new CarrierRouter({ defaultProvider: 'vicidial' });

// Create call through VICIdial agent
const result = await router.selectProvider(
  { capabilities: ['voice'] },
  { user_id: 'user123' }
);

if (result) {
  const callResult = await result.adapter.createCall({
    to: '+14155551234',
    from: '+14155556789',
    agentId: 'agent001',
    metadata: {
      campaign_id: 'SALES_CAMPAIGN',
      lead_id: 'lead123',
    },
  });
  
  console.log('Call initiated:', callResult);
}
```

### Example 2: Sync Disposition from VICIdial

```typescript
import { ViciAdapter } from '@/services/providers/viciAdapter';

const adapter = new ViciAdapter();

// Set disposition after call
await adapter.setStatus('agent001', 'SALE');

// Update lead in both systems
await adapter.updateLead('12345', {
  status: 'SALE',
  comments: 'Customer purchased premium package',
});
```

### Example 3: Pause Agent for Break

```typescript
import { ViciAdapter } from '@/services/providers/viciAdapter';

const adapter = new ViciAdapter();

// Pause agent with break code
await adapter.pauseAgent('agent001', true, 'BREAK');

// Resume agent after break
setTimeout(async () => {
  await adapter.pauseAgent('agent001', false);
}, 15 * 60 * 1000); // 15 minute break
```

### Example 4: Add Lead to VICIdial

```typescript
import { ViciAdapter } from '@/services/providers/viciAdapter';

const adapter = new ViciAdapter();

// Add new lead from dial-smart to VICIdial
await adapter.addLead({
  phoneNumber: '+14155551234',
  firstName: 'John',
  lastName: 'Doe',
  listId: '101',
  campaignId: 'SALES_CAMPAIGN',
  address: '123 Main St',
  city: 'San Francisco',
  state: 'CA',
  zip: '94102',
});
```

---

## Integration Patterns

### Pattern 1: AI Qualification → Human Close

Use AI agents to qualify leads, then transfer qualified leads to VICIdial agents for closing:

```typescript
// In your campaign workflow:
1. AI Agent calls lead
2. AI qualifies interest level
3. If qualified → Transfer to VICIdial agent
4. VICIdial agent closes sale
5. Disposition syncs back to dial-smart
```

### Pattern 2: Predictive Dialing with VICIdial Agents

Use dial-smart's predictive algorithm with VICIdial agent pool:

```typescript
// Configure campaign:
{
  "dialingMode": "predictive",
  "provider": "vicidial",
  "agentPool": ["agent001", "agent002", "agent003"],
  "maxConcurrent": 30,
  "dialRatio": 2.5
}
```

### Pattern 3: Blended AI-Human Workforce

Mix AI agents and human agents in the same campaign:

```typescript
// Route based on lead characteristics:
if (lead.priority === 'high') {
  // Route to best human agents via VICIdial
  await viciRouter.selectAgent('top_tier');
} else {
  // Handle with AI agent
  await retellAgent.handleCall(lead);
}
```

---

## API Reference

### ViciAdapter Class

#### Constructor
```typescript
new ViciAdapter(config?: ViciConfig)
```

#### Configuration Options
```typescript
interface ViciConfig {
  server_url: string;      // VICIdial server URL
  api_user: string;        // API username
  api_pass: string;        // API password
  source: string;          // API source identifier
  agent_user?: string;     // Default agent username
  campaign_id?: string;    // Default campaign ID
  phone_code?: string;     // Phone code/country code
  use_agent_api: boolean;  // Use Agent API (true) or Non-Agent (false)
}
```

#### Methods

##### testConnection()
```typescript
async testConnection(): Promise<{
  success: boolean;
  message: string;
}>
```
Test connectivity to VICIdial server.

##### createCall()
```typescript
async createCall(params: CreateCallParams): Promise<CreateCallResult>
```
Initiate an outbound call through VICIdial agent.

##### hangupCall()
```typescript
async hangupCall(agentUser: string, callId?: string): Promise<boolean>
```
Hang up an active call.

##### setStatus()
```typescript
async setStatus(agentUser: string, status: string): Promise<boolean>
```
Set agent status/disposition.

##### pauseAgent()
```typescript
async pauseAgent(
  agentUser: string,
  pause: boolean,
  pauseCode?: string
): Promise<boolean>
```
Pause or resume an agent.

##### addLead()
```typescript
async addLead(leadData: {
  phoneNumber: string;
  firstName?: string;
  lastName?: string;
  listId: string;
  campaignId?: string;
  [key: string]: any;
}): Promise<boolean>
```
Add a new lead to VICIdial.

##### updateLead()
```typescript
async updateLead(
  leadId: string,
  leadData: Record<string, any>
): Promise<boolean>
```
Update an existing lead in VICIdial.

---

## Best Practices

### Security

1. **Use HTTPS**
   - Always use HTTPS for VICIdial API connections
   - Never transmit credentials over unencrypted connections

2. **Credential Management**
   - Store credentials in environment variables or secure vaults
   - Never commit credentials to version control
   - Rotate API passwords regularly

3. **API User Permissions**
   - Create dedicated API users
   - Grant minimum necessary permissions
   - Monitor API usage logs

### Performance

1. **Connection Pooling**
   - Reuse ViciAdapter instances
   - Avoid creating new adapters for each request

2. **Rate Limiting**
   - Respect VICIdial API rate limits
   - Implement exponential backoff for retries

3. **Batching**
   - Batch lead updates when possible
   - Use bulk operations for large datasets

### Monitoring

1. **Track API Calls**
   - Log all API requests and responses
   - Monitor error rates
   - Alert on connection failures

2. **Agent Status**
   - Monitor agent availability
   - Track pause/break times
   - Alert on agent issues

3. **Call Quality**
   - Track successful connections
   - Monitor call durations
   - Analyze disposition patterns

---

## Troubleshooting

### Connection Issues

**Problem:** "Connection failed: HTTP 401"
```
Solution: Verify API credentials are correct
- Check api_user and api_pass
- Ensure API user exists in VICIdial
- Verify API permissions
```

**Problem:** "Connection failed: net::ERR_CONNECTION_REFUSED"
```
Solution: Verify network connectivity
- Check VICIdial server is running
- Verify firewall rules
- Test with curl: curl https://your-vicidial-server.com/agc/api.php
```

**Problem:** "ERROR: No campaigns found"
```
Solution: Configure campaigns in VICIdial
- Create at least one active campaign
- Assign agents to campaign
- Set campaign to "Auto-Dial"
```

### API Issues

**Problem:** "ERROR: Invalid user"
```
Solution: Verify agent user exists
- Check agent_user in VICIdial admin
- Ensure agent is active
- Verify agent is assigned to campaign
```

**Problem:** "ERROR: Lead not found"
```
Solution: Verify lead exists in VICIdial
- Check lead_id is correct
- Ensure lead is in correct list
- Verify list is active
```

### Performance Issues

**Problem:** Slow API responses
```
Solution: Optimize VICIdial server
- Check MySQL performance
- Verify server resources (CPU, RAM, disk)
- Review VICIdial logs for errors
- Consider dedicated API server
```

---

## Migration Guide

### Gradual Migration from Pure VICIdial

#### Phase 1: Parallel Testing (Week 1-2)
- Set up dial-smart-system alongside VICIdial
- Configure API integration
- Test with small subset of leads
- Compare results and performance

#### Phase 2: Hybrid Operations (Week 3-8)
- Route low-priority leads to AI agents
- Keep high-priority leads on human agents
- Sync dispositions between systems
- Train staff on new features

#### Phase 3: Optimization (Week 9-12)
- Analyze performance data
- Adjust routing rules
- Optimize AI scripts
- Fine-tune disposition mapping

#### Phase 4: Full Integration (Week 13+)
- Increase AI agent usage
- Implement advanced features
- Full system integration
- Continuous optimization

---

## Support

### Documentation
- [VICIdial API Documentation](https://www.vicidial.org/docs/AGENT_API.txt)
- [Dial-Smart-System Provider Guide](./PROVIDER_INTEGRATION.md)

### Community
- VICIdial Forums: https://www.vicidial.org/
- Dial-Smart-System GitHub: Issues and Discussions

### Enterprise Support
Contact your dial-smart-system account manager for:
- Custom VICIdial integrations
- Advanced workflow design
- Performance optimization
- Training and onboarding

---

## Changelog

### v1.0.0 (December 2025)
- Initial VICIdial integration
- Agent API support (dial, hangup, status, pause)
- Non-Agent API support (add/update leads)
- Configuration UI
- Test connection functionality
- Comprehensive documentation

---

## License

This integration is part of the dial-smart-system and follows the same license as the main project.

---

**Last Updated:** December 8, 2025
**Version:** 1.0.0
**Status:** ✅ Production Ready
