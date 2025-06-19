
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Home, BarChart3, Settings, HelpCircle, Key, Workflow } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

const Navigation = () => {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="border-b bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link to="/" className="font-bold text-xl text-blue-600 dark:text-blue-400">
              Smart Dialer
            </Link>
            
            <div className="hidden md:flex items-center space-x-1">
              <Button
                variant={isActive('/') ? 'default' : 'ghost'}
                size="sm"
                asChild
              >
                <Link to="/" className="flex items-center gap-2">
                  <Home className="h-4 w-4" />
                  Dashboard
                </Link>
              </Button>
              
              <Button
                variant={isActive('/analytics') ? 'default' : 'ghost'}
                size="sm"
                asChild
              >
                <Link to="/analytics" className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Analytics
                </Link>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                asChild
              >
                <Link to="/?tab=pipeline" className="flex items-center gap-2">
                  <Workflow className="h-4 w-4" />
                  Pipeline
                </Link>
              </Button>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden md:flex items-center space-x-1">
              <Button
                variant={isActive('/api-keys') ? 'default' : 'ghost'}
                size="sm"
                asChild
              >
                <Link to="/api-keys" className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  API Keys
                </Link>
              </Button>
              
              <Button
                variant={isActive('/settings') ? 'default' : 'ghost'}
                size="sm"
                asChild
              >
                <Link to="/settings" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
              </Button>
              
              <Button
                variant={isActive('/help') ? 'default' : 'ghost'}
                size="sm"
                asChild
              >
                <Link to="/help" className="flex items-center gap-2">
                  <HelpCircle className="h-4 w-4" />
                  Help
                </Link>
              </Button>
            </div>
            
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
