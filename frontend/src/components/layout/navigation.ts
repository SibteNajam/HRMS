import {
  LayoutDashboard, CalendarCheck, ClipboardList, Clock, PenLine, PartyPopper,
  CalendarDays, Inbox, CalendarPlus, CheckCheck, Gauge, FileSliders, CalendarRange,
  Wallet, Play, FileText, Layers, Receipt, HandCoins,
  Users, Network, BadgeCheck, UserPlus, Briefcase, UserSearch, CalendarClock,
  ChartNoAxesColumn, Sparkles, Settings2, ShieldCheck, ScrollText, Mail, Palette,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/types';

export interface NavChild {
  label: string;
  path: string;
  roles: readonly Role[];
  icon?: LucideIcon;
  /** Key of a live count shown as a badge, e.g. pending approvals. */
  badge?: 'pendingLeave' | 'anomalies';
}

export interface NavItem {
  label: string;
  icon: LucideIcon;
  roles: readonly Role[];
  path?: string;
  children?: NavChild[];
  badge?: 'pendingLeave' | 'anomalies';
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

const ALL: readonly Role[] = ['EMPLOYEE', 'HR', 'ADMIN'];
const HR_UP: readonly Role[] = ['HR', 'ADMIN'];
const ADMIN: readonly Role[] = ['ADMIN'];

/**
 * Single source of truth for the sidebar, the routes, the breadcrumb and the
 * page title. Adding a screen is one entry here.
 */
export const NAV: NavGroup[] = [
  {
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, path: '/', roles: ALL },

      { label: 'Attendance', icon: CalendarCheck, roles: ALL, children: [
        { label: 'My Attendance', path: '/attendance', roles: ALL, icon: CalendarCheck },
        { label: 'Daily Register', path: '/attendance/register', roles: HR_UP, icon: ClipboardList },
        { label: 'Timesheet', path: '/attendance/timesheet', roles: ALL, icon: Clock },
        { label: 'Corrections', path: '/attendance/corrections', roles: HR_UP, icon: PenLine },
        { label: 'Holidays', path: '/attendance/holidays', roles: HR_UP, icon: PartyPopper },
      ]},

      { label: 'Leave', icon: CalendarDays, roles: ALL, children: [
        { label: 'My Leave', path: '/leave', roles: ALL, icon: CalendarDays },
        { label: 'Request Leave', path: '/leave/new', roles: ALL, icon: CalendarPlus },
        { label: 'Approvals', path: '/leave/approvals', roles: HR_UP, icon: CheckCheck, badge: 'pendingLeave' },
        { label: 'All Requests', path: '/leave/all', roles: HR_UP, icon: Inbox },
        { label: 'Leave Balances', path: '/leave/balances', roles: HR_UP, icon: Gauge },
        { label: 'Leave Calendar', path: '/leave/calendar', roles: ALL, icon: CalendarRange },
        { label: 'Types & Policy', path: '/leave/types', roles: ADMIN, icon: FileSliders },
      ]},

      { label: 'Payroll', icon: Wallet, roles: ALL, children: [
        { label: 'My Payslips', path: '/payroll', roles: ALL, icon: FileText },
        { label: 'Payroll Runs', path: '/payroll/runs', roles: HR_UP, icon: Play },
        { label: 'All Payslips', path: '/payroll/payslips', roles: HR_UP, icon: FileText },
        { label: 'Salary Structure', path: '/payroll/structure', roles: ADMIN, icon: Layers },
      ]},

      { label: 'Dues', icon: Receipt, roles: ALL, children: [
        { label: 'My Dues', path: '/dues', roles: ALL, icon: Receipt },
        { label: 'All Dues', path: '/dues/all', roles: HR_UP, icon: Receipt },
        { label: 'Record Payment', path: '/dues/payments', roles: HR_UP, icon: HandCoins },
      ]},
    ],
  },
  {
    label: 'Organisation',
    items: [
      { label: 'Employees', icon: Users, roles: HR_UP, children: [
        { label: 'Directory', path: '/employees', roles: HR_UP, icon: Users },
        { label: 'Departments', path: '/employees/departments', roles: HR_UP, icon: Network },
        { label: 'Designations', path: '/employees/designations', roles: ADMIN, icon: BadgeCheck },
        { label: 'Add Employee', path: '/employees/new', roles: HR_UP, icon: UserPlus },
      ]},

      { label: 'Recruitment', icon: UserPlus, roles: HR_UP, children: [
        { label: 'Job Postings', path: '/recruitment', roles: HR_UP, icon: Briefcase },
        { label: 'Candidates', path: '/recruitment/candidates', roles: HR_UP, icon: UserSearch },
        { label: 'Interviews', path: '/recruitment/interviews', roles: HR_UP, icon: CalendarClock },
      ]},

      { label: 'Reports', icon: ChartNoAxesColumn, roles: HR_UP, children: [
        { label: 'Attendance', path: '/reports/attendance', roles: HR_UP },
        { label: 'Leave', path: '/reports/leave', roles: HR_UP },
        { label: 'Payroll', path: '/reports/payroll', roles: HR_UP },
        { label: 'Dues', path: '/reports/dues', roles: HR_UP },
        { label: 'Anomalies', path: '/reports/anomalies', roles: HR_UP, badge: 'anomalies' },
      ]},
    ],
  },
  {
    items: [
      { label: 'AI Assistant', icon: Sparkles, path: '/assistant', roles: ALL },

      { label: 'Settings', icon: Settings2, roles: ALL, children: [
        { label: 'My Profile', path: '/settings/profile', roles: ALL },
        { label: 'Appearance', path: '/settings/appearance', roles: ALL, icon: Palette },
        { label: 'Users & Roles', path: '/settings/users', roles: ADMIN, icon: ShieldCheck },
        { label: 'Email Templates', path: '/settings/email', roles: ADMIN, icon: Mail },
        { label: 'Audit Log', path: '/settings/audit', roles: ADMIN, icon: ScrollText },
      ]},
    ],
  },
];

/**
 * Filters the tree for a role.
 *
 * Two collapses matter: a parent whose children all filter out disappears
 * entirely, and a parent left with exactly one child becomes a flat link —
 * an employee's "Dues" should be one clickable row, not a chevron hiding one
 * item.
 */
export function navForRole(role: Role): NavGroup[] {
  return NAV.map((group) => ({
    ...group,
    items: group.items
      .map((item) => {
        if (!item.roles.includes(role)) return null;
        if (!item.children) return item;

        const children = item.children.filter((c) => c.roles.includes(role));
        if (children.length === 0) return null;
        if (children.length === 1) {
          return { ...item, path: children[0].path, children: undefined };
        }
        return { ...item, children };
      })
      .filter((i): i is NavItem => i !== null),
  })).filter((g) => g.items.length > 0);
}

/** Breadcrumb trail for a pathname, derived from the tree — never hand-written. */
export function breadcrumbFor(pathname: string): { label: string; path?: string }[] {
  for (const group of NAV) {
    for (const item of group.items) {
      if (item.path === pathname) return [{ label: item.label }];
      const child = item.children?.find((c) => c.path === pathname);
      if (child) return [{ label: item.label }, { label: child.label }];
    }
  }
  return [];
}
