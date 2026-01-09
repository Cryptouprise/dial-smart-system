/**
 * Organization Selector Component
 * 
 * Dropdown to select and switch between organizations.
 * Phase 2 Multi-Tenancy Support.
 */

import { Building2, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useOrganizationContext } from '@/contexts/OrganizationContext';

export function OrganizationSelector() {
  const {
    organizations,
    currentOrganization,
    setCurrentOrganization,
    loading
  } = useOrganizationContext();

  if (loading) {
    return (
      <Button variant="ghost" size="sm" disabled>
        <Building2 className="mr-2 h-4 w-4" />
        Loading...
      </Button>
    );
  }

  if (organizations.length === 0) {
    return null;
  }

  // Don't show selector if user only has one organization
  if (organizations.length === 1) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
        <Building2 className="h-4 w-4" />
        <span className="font-medium">{currentOrganization?.name}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Building2 className="h-4 w-4" />
          <span className="max-w-[150px] truncate">
            {currentOrganization?.name || 'Select Organization'}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[250px]">
        <DropdownMenuLabel>Switch Organization</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => setCurrentOrganization(org)}
            className="cursor-pointer"
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{org.name}</span>
                {org.id === currentOrganization?.id && (
                  <span className="text-xs text-muted-foreground">(current)</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="capitalize">{org.user_role}</span>
                <span>•</span>
                <span className="capitalize">{org.subscription_tier}</span>
              </div>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
