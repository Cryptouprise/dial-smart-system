import Navigation from '@/components/Navigation';
import Dashboard from '@/components/Dashboard';
import { SystemHealthCheck } from '@/components/SystemHealthCheck';

const Index = () => {
  return (
    <div className="min-h-screen">
      <Navigation />
      <div className="space-y-6 p-6">
        <SystemHealthCheck />
        <Dashboard />
      </div>
    </div>
  );
};

export default Index;
