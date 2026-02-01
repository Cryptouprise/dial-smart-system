import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Phone,
  Target,
  BarChart3,
  RotateCw,
  Shield,
  MessageSquare,
  Workflow,
  Upload,
  Zap,
  Clock,
  Settings,
  Brain,
  Calendar,
  Bot,
  Sparkles,
  TrendingUp,
  FileText,
  Activity,
  Beaker,
  LayoutDashboard,
  ChevronDown,
  PanelLeftClose,
  ToggleLeft,
  ToggleRight,
  Radio,
  Rocket,
  AlertCircle,
  DollarSign,
  Users,
  Wallet,
  GitBranch,
  History,
  UserCircle,
  Lock,
  Play,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useSimpleMode } from '@/hooks/useSimpleMode';
import { Badge } from '@/components/ui/badge';
import { useIsOrganizationAdmin } from '@/contexts/OrganizationContext';

interface NavItem {
  title: string;
  value: string;
  icon: React.ElementType;
  simpleMode?: boolean; // If true, show in simple mode
  route?: string; // If set, navigates to this route instead of setting tab
  adminOnly?: boolean; // If true, only show for admin/owner users
}

interface NavGroup {
  label: string;
  items: NavItem[];
  defaultOpen?: boolean;
  simpleModeLabel?: string; // Alternative label for simple mode
}

const navigationGroups: NavGroup[] = [
  {
    label: 'Overview',
    defaultOpen: true,
    items: [
      { title: 'Dashboard', value: 'overview', icon: LayoutDashboard, simpleMode: true },
      { title: 'Try Demo', value: 'demo', icon: Play, simpleMode: true, route: '/demo' },
      { title: 'Setup Wizard', value: 'onboarding', icon: Rocket, simpleMode: true },
      { title: 'AI Setup', value: 'ai-setup', icon: Sparkles, simpleMode: true },
    ],
  },
  {
    label: 'Phone & Dialing',
    simpleModeLabel: 'Calling',
    defaultOpen: true,
    items: [
      { title: 'Voice Broadcast', value: 'broadcast', icon: Radio, simpleMode: true },
      { title: 'AI Campaigns', value: 'predictive', icon: Target, simpleMode: true },
      { title: 'Number Rotation', value: 'rotation', icon: RotateCw },
      { title: 'Spam Detection', value: 'spam', icon: Shield },
      { title: 'SMS Messaging', value: 'sms', icon: MessageSquare, simpleMode: true },
    ],
  },
  {
    label: 'Leads & Pipeline',
    defaultOpen: false,
    items: [
      { title: 'Leads', value: 'leads', icon: Users, simpleMode: true },
      { title: 'Pipeline', value: 'pipeline', icon: Workflow },
      { title: 'Lead Upload', value: 'lead-upload', icon: Upload },
      { title: 'Appointments', value: 'calendar', icon: Calendar, simpleMode: true },
      { title: 'Dispositions', value: 'dispositions', icon: Zap },
      { title: 'Follow-ups', value: 'follow-ups', icon: Clock },
    ],
  },
  {
    label: 'AI & Automation',
    defaultOpen: false,
    items: [
      { title: 'Autonomous Agent', value: 'autonomous-agent', icon: Brain, simpleMode: true },
      { title: 'Agent Builder', value: 'agent-builder', icon: GitBranch, simpleMode: true },
      { title: 'Retell AI', value: 'retell', icon: Settings },
      { title: 'Workflows', value: 'workflows', icon: Zap },
      { title: 'Automation', value: 'automation', icon: Calendar },
      { title: 'AI Workflows', value: 'ai-workflows', icon: Sparkles },
      { title: 'Reachability', value: 'reachability', icon: TrendingUp },
      { title: 'AI Error Handler', value: 'ai-errors', icon: AlertCircle },
    ],
  },
  {
    label: 'Reports & Analytics',
    simpleModeLabel: 'Results',
    defaultOpen: false,
    items: [
      { title: 'Campaign Results', value: 'campaign-results', icon: BarChart3, simpleMode: true },
      { title: 'Call History', value: 'call-history', icon: History, simpleMode: true },
      { title: 'Call Analytics', value: 'analytics', icon: BarChart3 },
      { title: 'Daily Reports', value: 'reports', icon: FileText },
      { title: 'Live Monitor', value: 'live-monitor', icon: Activity },
      { title: 'A/B Testing', value: 'ab-testing', icon: Beaker },
      { title: 'Budget Manager', value: 'budget', icon: DollarSign },
      { title: 'Credits & Billing', value: 'credits', icon: Wallet, simpleMode: true },
      { title: 'Client Portal', value: 'client-portal', icon: UserCircle, simpleMode: true },
    ],
  },
  {
    label: 'System & Settings',
    defaultOpen: false,
    items: [
      { title: 'System Testing', value: 'system-testing', icon: Beaker, simpleMode: true, route: '/system-testing' },
      { title: 'System Health', value: 'health', icon: Activity },
      { title: 'Settings', value: 'settings', icon: Settings },
      { title: 'Admin Settings', value: 'admin-settings', icon: Lock, adminOnly: true },
    ],
  },
];

// Filter navigation for simple mode and admin-only items
const getFilteredNavigation = (isSimpleMode: boolean, isAdmin: boolean): NavGroup[] => {
  let groups = navigationGroups;

  // Filter out admin-only items if not admin
  groups = groups.map(group => ({
    ...group,
    items: group.items.filter(item => !item.adminOnly || isAdmin),
  }));

  // Apply simple mode filtering
  if (isSimpleMode) {
    groups = groups
      .map(group => ({
        ...group,
        label: group.simpleModeLabel || group.label,
        items: group.items.filter(item => item.simpleMode),
      }));
  }

  return groups.filter(group => group.items.length > 0);
};

interface DashboardSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const DashboardSidebar = ({ activeTab, onTabChange }: DashboardSidebarProps) => {
  const { toggleSidebar } = useSidebar();
  const { isSimpleMode, toggleMode } = useSimpleMode();
  const navigate = useNavigate();
  const isAdmin = useIsOrganizationAdmin();

  const filteredNavigation = getFilteredNavigation(isSimpleMode, isAdmin);

  const handleNavigate = (route: string) => {
    navigate(route);
    if (window.innerWidth < 768) {
      toggleSidebar();
    }
  };

  return (
    <Sidebar collapsible="offcanvas" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Phone className="h-5 w-5 text-primary shrink-0" />
            <span className="font-semibold text-sm truncate">Smart Dialer</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="h-8 w-8 shrink-0"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Mode Toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleMode}
          className="w-full mt-2 justify-between h-8 text-xs"
        >
          <span className="flex items-center gap-2">
            {isSimpleMode ? (
              <ToggleLeft className="h-4 w-4 text-primary" />
            ) : (
              <ToggleRight className="h-4 w-4 text-primary" />
            )}
            {isSimpleMode ? 'Simple Mode' : 'Full Mode'}
          </span>
          <Badge variant="outline" className="text-[10px] h-5">
            {isSimpleMode ? '5 tabs' : '20+ tabs'}
          </Badge>
        </Button>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {filteredNavigation.map((group) => (
          <NavGroupCollapsible
            key={group.label}
            group={group}
            activeTab={activeTab}
            onTabChange={(tab) => {
              onTabChange(tab);
              // Auto-close sidebar on mobile after selection
              if (window.innerWidth < 768) {
                toggleSidebar();
              }
            }}
            onNavigate={handleNavigate}
          />
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="space-y-2">
          {isSimpleMode && (
            <p className="text-xs text-muted-foreground text-center">
              Need more features? Switch to <button onClick={toggleMode} className="text-primary hover:underline">Full Mode</button>
            </p>
          )}
          <p className="text-xs text-muted-foreground text-center hidden sm:block">
            Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">⌘B</kbd> to toggle
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};

interface NavGroupCollapsibleProps {
  group: NavGroup;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onNavigate: (route: string) => void;
}

const NavGroupCollapsible = ({
  group,
  activeTab,
  onTabChange,
  onNavigate,
}: NavGroupCollapsibleProps) => {
  const hasActiveItem = group.items.some((item) => item.value === activeTab);
  const [isOpen, setIsOpen] = React.useState(group.defaultOpen || hasActiveItem);

  React.useEffect(() => {
    if (hasActiveItem) setIsOpen(true);
  }, [hasActiveItem]);

  const handleItemClick = (item: NavItem) => {
    if (item.route) {
      onNavigate(item.route);
    } else {
      onTabChange(item.value);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="group/collapsible">
      <SidebarGroup className="py-1">
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel className="cursor-pointer hover:bg-sidebar-accent rounded-md px-2 py-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {group.label}
            <ChevronDown
              className={cn(
                'h-3 w-3 transition-transform',
                isOpen && 'rotate-180'
              )}
            />
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.value}>
                  <SidebarMenuButton
                    onClick={() => handleItemClick(item)}
                    isActive={activeTab === item.value}
                    className={cn(
                      'touch-manipulation',
                      activeTab === item.value && 'bg-primary/10 text-primary font-medium'
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
};

export default DashboardSidebar;
