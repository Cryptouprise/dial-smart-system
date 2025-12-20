
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Home, BarChart3, Settings, HelpCircle, Key, Menu, MessageSquare, LogOut } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import { useAuth } from '@/contexts/AuthContext';

const Navigation = () => {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { signOut } = useAuth();

  const isActive = (path: string) => location.pathname === path;

  const navLinks = [
    { path: '/', label: 'Dashboard', icon: Home },
    { path: '/sms-conversations', label: 'AI SMS', icon: MessageSquare },
    { path: '/analytics', label: 'Analytics', icon: BarChart3 },
    { path: '/api-keys', label: 'API Keys', icon: Key },
    { path: '/settings', label: 'Settings', icon: Settings },
    { path: '/help', label: 'Help', icon: HelpCircle },
  ];

  return (
    <nav className="border-b bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            {/* Mobile Menu Button */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild className="md:hidden">
                <Button variant="ghost" size="icon">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px]">
                <div className="flex flex-col space-y-4 mt-8">
                  <div className="font-bold text-xl text-blue-600 dark:text-blue-400 mb-4">
                    Smart Dialer
                  </div>
                  {navLinks.map((link) => {
                    const Icon = link.icon;
                    return (
                      <Button
                        key={link.path}
                        variant={isActive(link.path) ? 'default' : 'ghost'}
                        size="lg"
                        asChild
                        className="justify-start"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <Link to={link.path} className="flex items-center gap-3">
                          <Icon className="h-5 w-5" />
                          {link.label}
                        </Link>
                      </Button>
                    );
                  })}
                </div>
              </SheetContent>
            </Sheet>

            <Link to="/" className="font-bold text-xl text-blue-600 dark:text-blue-400">
              Smart Dialer
            </Link>
            
            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-1">
              {navLinks.slice(0, 3).map((link) => {
                const Icon = link.icon;
                return (
                  <Button
                    key={link.path}
                    variant={isActive(link.path) ? 'default' : 'ghost'}
                    size="sm"
                    asChild
                  >
                    <Link to={link.path} className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {link.label}
                    </Link>
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Desktop Right Side Navigation */}
            <div className="hidden md:flex items-center space-x-1">
              {navLinks.slice(3).map((link) => {
                const Icon = link.icon;
                return (
                  <Button
                    key={link.path}
                    variant={isActive(link.path) ? 'default' : 'ghost'}
                    size="sm"
                    asChild
                  >
                    <Link to={link.path} className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {link.label}
                    </Link>
                  </Button>
                );
              })}
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
            
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
