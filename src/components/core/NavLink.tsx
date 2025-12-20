import { NavLink as RouterNavLink, NavLinkProps } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface CustomNavLinkProps extends Omit<NavLinkProps, 'className'> {
  className?: string;
  activeClassName?: string;
}

export const NavLink = ({ className, activeClassName, ...props }: CustomNavLinkProps) => {
  return (
    <RouterNavLink
      className={({ isActive }) =>
        cn(className, isActive && activeClassName)
      }
      {...props}
    />
  );
};

export default NavLink;
