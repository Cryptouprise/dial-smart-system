
import React from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate, useLocation } from 'react-router-dom';
import { Settings, Home, Key, Users, HelpCircle } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

const Navigation = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Dashboard', icon: Home },
    { path: '/settings', label: 'Settings', icon: Settings },
    { path: '/api-keys', label: 'API Keys', icon: Key },
    { path: '/help', label: 'Help', icon: HelpCircle },
  ];

  return (
    <nav className="bg-background border-b border-border px-3 sm:px-6 py-2 sm:py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 sm:space-x-8 min-w-0 flex-1">
          <h1 className="text-lg sm:text-xl font-bold text-foreground whitespace-nowrap">📞 Smart Dialer</h1>
          
          {/* Mobile scrollable navigation */}
          <div className="flex-1 overflow-x-auto sm:overflow-visible">
            <div className="flex space-x-2 sm:space-x-4 min-w-max pb-2 sm:pb-0">
              {navItems.map(({ path, label, icon: Icon }) => (
                <Button
                  key={path}
                  variant={location.pathname === path ? "default" : "ghost"}
                  onClick={() => navigate(path)}
                  className="flex items-center space-x-1 sm:space-x-2 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 h-8 sm:h-auto"
                >
                  <Icon size={14} className="sm:w-4 sm:h-4" />
                  <span>{label}</span>
                </Button>
              ))}
            </div>
          </div>
        </div>
        
        <div className="ml-2 sm:ml-4 flex-shrink-0">
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
