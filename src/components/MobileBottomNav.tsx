import { Link, useLocation } from 'react-router-dom';
import { Home, MessageSquare, BarChart3, Settings, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

const MobileBottomNav = () => {
  const location = useLocation();

  // Hide on demo pages - they need full screen real estate
  if (location.pathname.startsWith('/demo')) return null;
  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/sms-conversations', label: 'SMS', icon: MessageSquare },
    { path: '/analytics', label: 'Stats', icon: BarChart3 },
    { path: '/settings', label: 'Settings', icon: Settings },
    { path: '/install', label: 'Install', icon: Download },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full px-1 transition-colors touch-target',
                active 
                  ? 'text-primary' 
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className={cn('h-5 w-5 mb-1', active && 'text-primary')} />
              <span className={cn(
                'text-[10px] font-medium leading-none',
                active && 'text-primary'
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileBottomNav;