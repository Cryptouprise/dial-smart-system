import Dashboard from '@/components/Dashboard';
import { SystemHealthCheck } from '@/components/SystemHealthCheck';

const Index = () => {
  return (
    <div className="space-y-6 p-6">
      <SystemHealthCheck />
      <Dashboard />
    </div>
  );
};

export default Index;
