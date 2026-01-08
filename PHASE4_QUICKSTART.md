# Phase 4: Production Monitoring - Quick Setup Guide

## 🚀 Quick Start (5 Minutes)

### Step 1: Environment Configuration (Optional)

Add to your `.env` file:

```env
# Optional: Sentry Error Tracking
# If not set, monitoring runs in local-only mode (console logging)
VITE_SENTRY_DSN=https://your-dsn@sentry.io/your-project-id

# Environment
VITE_ENVIRONMENT=production

# App Version
VITE_APP_VERSION=1.0.0
```

**Note**: Monitoring works WITHOUT Sentry! It just won't send data to external service.

### Step 2: Sentry Setup (Optional - 5 minutes)

1. **Create Account**: https://sentry.io (Free tier available)
2. **Create Project**: Select "React" platform
3. **Copy DSN**: Add to `.env` file
4. **Done!** Errors will automatically be tracked

### Step 3: Verify Installation

```bash
# Build should succeed
npm run build

# Run development
npm run dev
```

## ✅ What's Already Working

Without any configuration, you get:

- ✅ Error boundary catching React errors
- ✅ Console logging for all errors
- ✅ Performance tracking (console output)
- ✅ Health dashboard ready to use
- ✅ Structured logging

With Sentry DSN configured, you also get:

- ✅ Remote error tracking
- ✅ Session replays
- ✅ Performance monitoring
- ✅ User context tracking
- ✅ Alerting and notifications

## 📊 Using the Health Dashboard

Add to any admin page:

```tsx
import { ProductionHealthDashboard } from '@/components/ProductionHealthDashboard';

function AdminPage() {
  return (
    <div>
      <h1>System Monitoring</h1>
      <ProductionHealthDashboard />
    </div>
  );
}
```

## 🔍 Testing Error Tracking

Try this in your app:

```tsx
// This will trigger the error boundary
<button onClick={() => { throw new Error('Test error'); }}>
  Test Error Tracking
</button>
```

You should see:
1. User-friendly error page
2. Console log (always)
3. Sentry dashboard update (if configured)

## 📝 Using Structured Logging

```typescript
import { logger } from '@/lib/logger';

// Log user actions
logger.logUserAction('Campaign Created', { campaignId: '123' });

// Log errors
logger.error('API call failed', error, { endpoint: '/api/data' });

// Log feature usage
logger.logFeatureUsage('Voice Broadcast', 'Launch');
```

## ⚡ Using Performance Tracking

```typescript
import { trackAPICall } from '@/lib/performance';

// Wrap API calls for automatic timing
const fetchData = async () => {
  return await trackAPICall('fetchCampaigns', async () => {
    return await api.getCampaigns();
  });
};
```

## 🎯 What's Monitored Automatically

- JavaScript errors
- Promise rejections
- React component errors
- API failures (when using trackAPICall)
- Page load times
- Memory usage
- Web Vitals (FCP, LCP, FID, CLS)
- Navigation events

## 📈 Monitoring Dashboard (Sentry)

Once configured, view at: https://sentry.io

- **Issues**: All errors with stack traces
- **Performance**: API and page load times
- **Replays**: Watch user sessions leading to errors
- **Releases**: Track by version

## 🔔 Setting Up Alerts (Sentry)

1. Go to Settings > Alerts in Sentry
2. Create alert rules:
   - New issue types
   - Error spikes
   - Performance degradation
3. Configure notifications:
   - Email
   - Slack
   - Discord
   - PagerDuty

## 💡 Best Practices

### DO:
- ✅ Wrap critical API calls with trackAPICall()
- ✅ Use logger for important events
- ✅ Set user context on login
- ✅ Clear user context on logout
- ✅ Monitor Sentry dashboard daily

### DON'T:
- ❌ Track every tiny operation
- ❌ Log sensitive user data
- ❌ Ignore error patterns
- ❌ Disable error boundary
- ❌ Silent error catching

## 🐛 Troubleshooting

**Build fails?**
- Check that all files are created
- Run `npm install` again
- Verify TypeScript compilation: `npm run build`

**Sentry not working?**
- Verify DSN is correct in .env
- Check browser console for Sentry logs
- Ensure environment variables loaded
- Try triggering a test error

**Health dashboard not showing?**
- Import component correctly
- Check browser console for errors
- Verify UI components are available

## 📚 Learn More

- [Sentry React Docs](https://docs.sentry.io/platforms/javascript/guides/react/)
- [Web Vitals](https://web.dev/vitals/)
- [Error Boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)

## ✅ Checklist

- [ ] Add environment variables (optional)
- [ ] Run `npm run build` successfully
- [ ] Test error boundary
- [ ] View health dashboard
- [ ] Configure Sentry (optional)
- [ ] Set up alerts (optional)
- [ ] Test in production

## 🎉 You're Done!

Your system now has production-grade monitoring. Errors will be caught, performance will be tracked, and you'll have visibility into production issues.

**Without Sentry**: Local console logging
**With Sentry**: Full error tracking, replays, and alerting

Start monitoring your production app today! 🚀
