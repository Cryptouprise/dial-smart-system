# Dial Smart System

An AI-powered calling and lead management platform with predictive dialing, CRM integrations, and intelligent pipeline management.

## Overview

Dial Smart System is a comprehensive web-based calling platform that combines:
- **Predictive Dialing**: Automated calling campaigns with intelligent routing
- **AI Voice Conversations**: Powered by Retell AI for natural interactions
- **Lead Pipeline Management**: Visual Kanban boards with drag-and-drop
- **CRM Integrations**: Seamless sync with Go High Level, Yellowstone, and Airtable
- **Spam Detection**: Real-time phone number health monitoring
- **Call Analytics**: Detailed reporting and performance metrics

## Features

### Core Capabilities
- **Predictive Dialing Engine**: Automated outbound calling with configurable pacing
- **AI-Powered Analysis**: Automatic call transcript analysis and sentiment detection
- **Pipeline Kanban**: Visual lead management with custom dispositions
- **Number Rotation**: Automated phone number rotation to maintain deliverability
- **Spam Detection**: Real-time monitoring and quarantine of flagged numbers
- **Call Tracking**: Comprehensive logging and analytics
- **Multi-Integration**: Connect to Go High Level, Yellowstone, Telnyx, and more

### User Interface
- Modern, responsive design with dark/light theme support
- Real-time updates via Supabase subscriptions
- Interactive charts and visualizations with Recharts
- Intuitive drag-and-drop pipeline management
- Comprehensive help system

## Tech Stack

### Frontend
- **Framework**: React 18.3 with TypeScript
- **Build Tool**: Vite 7.x
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS with custom theming
- **State Management**: TanStack React Query
- **Forms**: React Hook Form + Zod validation
- **Routing**: React Router DOM v6
- **Drag & Drop**: @hello-pangea/dnd

### Backend
- **Platform**: Supabase (PostgreSQL + Edge Functions)
- **Database**: PostgreSQL with Row Level Security
- **Functions**: 16 Deno-based Edge Functions
- **Real-time**: Supabase subscriptions
- **Authentication**: Supabase Auth

### External Integrations
- **Retell AI**: AI voice conversations
- **Go High Level**: CRM integration
- **Yellowstone**: Lead data provider
- **Telnyx**: Phone number provider
- **Airtable**: Data sync

## Getting Started

### Prerequisites
- Node.js 18+ (install with [nvm](https://github.com/nvm-sh/nvm))
- npm or bun package manager
- Supabase account

### Installation

```bash
# Clone the repository
git clone <YOUR_GIT_URL>
cd dial-smart-system

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your Supabase credentials
# VITE_SUPABASE_URL=your-project-url
# VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Development

```bash
# Start development server (http://localhost:8080)
npm run dev

# Run linting
npm run lint

# Build for production
npm run build

# Preview production build
npm run preview
```

### Environment Variables

See `.env.example` for all available environment variables. Key variables:

- `VITE_SUPABASE_URL`: Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Your Supabase anonymous key
- `VITE_RETELL_API_KEY`: Retell AI API key (optional)
- `VITE_GHL_API_KEY`: Go High Level API key (optional)
- `VITE_TELNYX_API_KEY`: Telnyx API key (optional)

## Project Structure

```
dial-smart-system/
├── src/
│   ├── components/          # React components
│   │   ├── ui/             # shadcn/ui components
│   │   ├── Dashboard.tsx   # Main dashboard
│   │   ├── PipelineKanban.tsx
│   │   ├── ErrorBoundary.tsx
│   │   └── ...
│   ├── pages/              # Route pages
│   │   ├── Index.tsx
│   │   ├── Analytics.tsx
│   │   ├── Settings.tsx
│   │   └── ...
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utility functions
│   │   ├── utils.ts
│   │   └── errorHandling.ts
│   ├── integrations/       # External integrations
│   │   └── supabase/
│   ├── types/              # TypeScript types
│   └── App.tsx             # Main app component
├── supabase/
│   ├── functions/          # Edge Functions
│   ├── migrations/         # Database migrations
│   └── config.toml         # Supabase config
├── public/                 # Static assets
└── package.json
```

## Database Schema

The application uses Supabase PostgreSQL with the following main tables:

- `campaigns`: Calling campaigns and configurations
- `leads`: Lead database with contact information
- `call_logs`: Call history and outcomes
- `dispositions`: Call result categories
- `pipeline_boards`: Kanban board columns
- `lead_pipeline_positions`: Lead positions in pipeline
- `dialing_queues`: Predictive dialing queue
- `rotation_settings`: Number rotation configuration
- `rotation_history`: Number rotation audit log
- `system_health_logs`: System monitoring

All tables include Row Level Security (RLS) policies for data protection.

## Key Features Guide

### Pipeline Management
1. Navigate to Analytics → Pipeline tab
2. Create custom dispositions for your workflow
3. Drag and drop leads between stages
4. Auto-disposition based on AI analysis

### Call Analytics
1. Visit Analytics → Reports tab
2. View call volume, connect rates, and conversions
3. Analyze performance by campaign
4. Track number health and spam scores

### Number Rotation
1. Go to Settings → Number Rotation
2. Configure rotation interval and thresholds
3. Enable auto-import and auto-quarantine
4. Monitor rotation history

### AI Transcript Analysis
1. Access Analytics → AI Analysis tab
2. Upload or paste call transcripts
3. Get automatic sentiment analysis
4. Detect objections and key insights

## Development

### Code Style
- TypeScript with gradual strict mode adoption (see tsconfig.json TODOs)
- ESLint for code quality
- Tailwind CSS for styling
- Component-based architecture

### Error Handling
Use the centralized error handling utilities in `src/lib/errorHandling.ts`:

```typescript
import { handleAsyncError, logError } from '@/lib/errorHandling';

// Wrap async operations
const result = await handleAsyncError(
  fetchData(),
  { component: 'MyComponent', action: 'fetchData' },
  'Failed to load data'
);
```

### Testing
Currently no tests are implemented. Future additions should include:
- Unit tests with Vitest
- Component tests with React Testing Library
- E2E tests with Playwright

## Deployment

### Via Lovable
1. Open [Lovable Project](https://lovable.dev/projects/df06441e-ebac-46f8-8957-994bea19f4de)
2. Click Share → Publish
3. Configure custom domain if needed

### Manual Deployment
Build the project and deploy the `dist` folder to:
- Vercel
- Netlify
- Cloudflare Pages
- Any static hosting provider

```bash
npm run build
# Deploy ./dist folder
```

## Security

- Environment variables for sensitive keys
- Supabase Row Level Security (RLS) on all tables
- Authentication required for all operations
- HTTPS enforced in production

## Known Issues & TODOs

### Type Safety
- [ ] Enable `strict` mode in TypeScript
- [ ] Add explicit types (currently `noImplicitAny: false`)
- [ ] Enable `strictNullChecks`
- [ ] Clean up unused variables

### Performance
- [ ] Large bundle size (1.2MB) - implement code splitting
- [ ] Refactor `usePredictiveDialing.ts` (13,569 lines)
- [ ] Break down large components (HelpSystem: 1069 lines)

### Testing
- [ ] Add unit tests
- [ ] Add integration tests
- [ ] Add E2E tests
- [ ] Set up CI/CD pipeline

### Features
- [ ] Complete AI Decision Engine execution logic
- [ ] Add webhook configuration UI
- [ ] Implement advanced reporting

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is private and proprietary.

## Support

For issues, questions, or support:
- Check the in-app Help system
- Review documentation at docs/
- Contact the development team

## Recent Updates

### Latest Improvements (2025-10-23)
- ✅ Fixed all npm security vulnerabilities (upgraded to Vite 7.x)
- ✅ Added global error boundary for app-wide error handling
- ✅ Completed Analytics Reports feature
- ✅ Improved TypeScript configuration with safety guidelines
- ✅ Added environment variable support (.env.example)
- ✅ Created centralized error handling utilities
- ✅ Enhanced project documentation

---

Built with [Lovable](https://lovable.dev) • Powered by [Supabase](https://supabase.com)
