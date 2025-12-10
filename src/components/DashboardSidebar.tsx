import React from 'react';
import { useSearchParams } from 'react-router-dom';
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
  PanelLeft,
  Radio,
  AlertCircle,
  DollarSign,
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

interface NavItem {
  title: string;
  value: string;
  icon: React.ElementType;
}

interface NavGroup {
  label: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

const navigationGroups: NavGroup[] = [
  {
    label: 'Overview',
    defaultOpen: true,
    items: [
      { title: 'Dashboard', value: 'overview', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Phone & Dialing',
    defaultOpen: true,
    items: [
      { title: 'Predictive Dialer', value: 'predictive', icon: Target },
      { title: 'Voice Broadcast', value: 'broadcast', icon: Radio },
      { title: 'Number Rotation', value: 'rotation', icon: RotateCw },
      { title: 'Spam Detection', value: 'spam', icon: Shield },
      { title: 'SMS Messaging', value: 'sms', icon: MessageSquare },
    ],
  },
  {
    label: 'Leads & Pipeline',
    defaultOpen: false,
    items: [
      { title: 'Pipeline', value: 'pipeline', icon: Workflow },
      { title: 'Lead Upload', value: 'lead-upload', icon: Upload },
      { title: 'Dispositions', value: 'dispositions', icon: Zap },
      { title: 'Follow-ups', value: 'follow-ups', icon: Clock },
    ],
  },
  {
    label: 'AI & Automation',
    defaultOpen: false,
    items: [
      { title: 'Retell AI', value: 'retell', icon: Settings },
      { title: 'Workflows', value: 'workflows', icon: Zap },
      { title: 'AI Engine', value: 'ai-engine', icon: Brain },
      { title: 'Automation', value: 'automation', icon: Calendar },
      { title: 'AI Manager', value: 'ai-manager', icon: Brain },
      { title: 'Agent Activity', value: 'agent-activity', icon: Bot },
      { title: 'AI Workflows', value: 'ai-workflows', icon: Sparkles },
      { title: 'Reachability', value: 'reachability', icon: TrendingUp },
      { title: 'AI Error Handler', value: 'ai-errors', icon: AlertCircle },
    ],
  },
  {
    label: 'Reports & Analytics',
    defaultOpen: false,
    items: [
      { title: 'Call Analytics', value: 'analytics', icon: BarChart3 },
      { title: 'Daily Reports', value: 'reports', icon: FileText },
      { title: 'Campaign Results', value: 'campaign-results', icon: BarChart3 },
      { title: 'Live Monitor', value: 'live-monitor', icon: Activity },
      { title: 'A/B Testing', value: 'ab-testing', icon: Beaker },
      { title: 'Budget Manager', value: 'budget', icon: DollarSign },
    ],
  },
];

interface DashboardSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const DashboardSidebar = ({ activeTab, onTabChange }: DashboardSidebarProps) => {
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === 'collapsed';

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-3">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              <span className="font-semibold text-sm">Smart Dialer</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="h-8 w-8"
          >
            {isCollapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {navigationGroups.map((group) => (
          <NavGroupCollapsible
            key={group.label}
            group={group}
            activeTab={activeTab}
            onTabChange={onTabChange}
            isCollapsed={isCollapsed}
          />
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        {!isCollapsed && (
          <p className="text-xs text-muted-foreground text-center">
            Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">⌘B</kbd> to toggle
          </p>
        )}
      </SidebarFooter>
    </Sidebar>
  );
};

interface NavGroupCollapsibleProps {
  group: NavGroup;
  activeTab: string;
  onTabChange: (tab: string) => void;
  isCollapsed: boolean;
}

const NavGroupCollapsible = ({
  group,
  activeTab,
  onTabChange,
  isCollapsed,
}: NavGroupCollapsibleProps) => {
  const hasActiveItem = group.items.some((item) => item.value === activeTab);
  const [isOpen, setIsOpen] = React.useState(group.defaultOpen || hasActiveItem);

  React.useEffect(() => {
    if (hasActiveItem) setIsOpen(true);
  }, [hasActiveItem]);

  if (isCollapsed) {
    return (
      <SidebarGroup className="py-1">
        <SidebarMenu>
          {group.items.map((item) => (
            <SidebarMenuItem key={item.value}>
              <SidebarMenuButton
                onClick={() => onTabChange(item.value)}
                isActive={activeTab === item.value}
                tooltip={item.title}
                className={cn(
                  'justify-center',
                  activeTab === item.value && 'bg-primary/10 text-primary'
                )}
              >
                <item.icon className="h-4 w-4" />
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
    );
  }

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
                    onClick={() => onTabChange(item.value)}
                    isActive={activeTab === item.value}
                    className={cn(
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
