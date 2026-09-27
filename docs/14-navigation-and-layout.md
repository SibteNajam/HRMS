# 14 — Navigation & Layout

The app shell, and the two-level sidebar with sub-modules per feature.

---

## 1. App shell

```
┌────────────┬──────────────────────────────────────────────────────┐
│            │  TOPBAR                                    64px      │
│            │  breadcrumb · search · theme · bell · avatar         │
│  SIDEBAR   ├──────────────────────────────────────────────────────┤
│  264px     │                                                      │
│            │  PAGE HEADER                                         │
│  logo      │  title · subtitle · primary action                   │
│  nav tree  │                                                      │
│            │  CONTENT                                             │
│  ────────  │  max-width 1440 · padding 32                         │
│  user card │                                                      │
└────────────┴──────────────────────────────────────────────────────┘
```

```tsx
<div className="flex h-screen bg-surface-page">
  <Sidebar />
  <div className="flex flex-1 flex-col overflow-hidden">
    <Topbar />
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1440px] px-8 py-6">
        <Outlet />
      </div>
    </main>
  </div>
</div>
```

The sidebar and topbar are fixed; only `<main>` scrolls. Navigation must never
scroll out of reach.

---

## 2. Sidebar

### Anatomy

```
┌──────────────────────────────┐  ← surface-raised, radius-2xl,
│                              │    shadow-sm, 12px inset from
│   ◆  HR-AI MANAGER           │    the page edge
│      Human Resources          │
│                              │
│  ┌────────────────────────┐  │  ← ACTIVE: brand-600 fill,
│  │ ⌂  Dashboard           │  │    radius-lg, shadow-brand,
│  └────────────────────────┘  │    white icon at stroke 2
│                              │
│     ◷  Attendance        ⌄   │  ← has children: chevron
│     ▤  Leave             ⌃   │  ← expanded
│        · My Leave            │  ← child, 44px indent
│        · Request Leave       │
│        · Approvals      (3)  │  ← count badge
│     ▭  Payroll           ⌄   │
│     ▤  Dues                  │  ← no children
│                              │
│  ─────────────────────────   │  ← group divider
│  ORGANISATION                │  ← overline, neutral-400
│     ⚇  Employees         ⌄   │
│     ⊕  Recruitment       ⌄   │
│     ▧  Reports           ⌄   │
│                              │
│  ─────────────────────────   │
│     ✦  AI Assistant          │
│     ⚙  Settings          ⌄   │
│                              │
├──────────────────────────────┤  ← footer, border-subtle
│   (AR)  Ahmed Raza      ⌄    │
│         HR Manager           │
└──────────────────────────────┘
```

### Specification

| Property | Value |
|---|---|
| Width expanded | 264px |
| Width collapsed | 76px |
| Background | `surface-raised` (white in light mode) |
| Inset from page edge | 12px all sides |
| Radius | `radius-2xl` (20px) |
| Shadow | `shadow-sm` |
| Item height | 44px |
| Item radius | `radius-lg` (12px) |
| Item horizontal padding | 12px |
| Icon–label gap | 12px |
| Gap between items | 4px |
| Sidebar horizontal padding | 12px |

The sidebar floats as a rounded card inset from the page rather than running
edge to edge. That inset is most of why the reference design feels light.

### Item states

| State | Background | Icon | Label |
|---|---|---|---|
| Idle | transparent | `brand-300`, stroke 1.75 | `neutral-700`, 500 |
| Hover | `brand-50` | `brand-600` | `neutral-800`, 500 |
| **Active** | **`brand-600` + `shadow-brand`** | **white, stroke 2** | **white, 600** |
| Active parent (collapsed children) | `brand-50` | `brand-600` | `brand-700`, 600 |
| Disabled | transparent | `neutral-300` | `neutral-400` |

```tsx
<NavLink
  to={item.path}
  className={({ isActive }) => cn(
    'group flex h-11 items-center gap-3 rounded-lg px-3',
    'text-body font-medium transition-colors duration-100 ease-out',
    isActive
      ? 'bg-brand-600 text-white shadow-brand'
      : 'text-neutral-700 hover:bg-brand-50 hover:text-neutral-800',
  )}
>
  <Icon
    icon={item.icon}
    size="md"
    strokeWidth={isActive ? 2 : 1.75}
    className={isActive ? 'text-white' : 'text-brand-300 group-hover:text-brand-600'}
  />
  <span className="truncate">{item.label}</span>
  {item.badge ? <Badge count={badgeValue} /> : null}
</NavLink>
```

### Sub-navigation

A parent with children does not navigate. Clicking it expands.

| Property | Value |
|---|---|
| Child indent | 44px (aligns with the parent's label, not its icon) |
| Child height | 38px |
| Child font | `body-sm` (13px), weight 400 idle / 600 active |
| Child icon | none — a 4px dot marker instead |
| Active child | `brand-50` background, `brand-700` text, dot → `brand-600` |
| Guide line | 1px `border-subtle`, vertical, at 26px |
| Expand animation | 220ms `ease-out` on height and opacity |

Children carry **no icons**. Ten sub-items each with an icon produces visual
noise, and at 13px the icons are too small to read anyway. The dot marker plus
indentation is enough.

**Auto-expand rules:**

1. The group containing the current route is expanded on load.
2. Expanding one group does not collapse the others — this is not an accordion.
   Users build muscle memory around their own open groups.
3. Expanded state persists in `localStorage` per user.

### Collapsed sidebar

At 76px, only icons. The label appears in a tooltip on hover after 400ms.

Parents with children show a **flyout panel** on hover rather than expanding in
place — there is no room to indent. The flyout is a `surface-overlay` card at
`shadow-lg`, positioned to the right, with the group title as its header.

Toggle persists to `localStorage`. Auto-collapse below 1280px viewport width.

### Group dividers

Three groups, separated by a 1px `border-subtle` line with 16px of space above
and below, and an `overline`-styled label in `neutral-400`.

| Group | Contains |
|---|---|
| *(no label)* | Dashboard, Attendance, Leave, Payroll, Dues |
| ORGANISATION | Employees, Recruitment, Reports |
| *(no label)* | AI Assistant, Settings |

The first group is what a user touches daily. The ungrouped-first pattern means
the most-used items need no scanning.

---

## 3. The navigation tree

One configuration object drives the sidebar, the routes, the breadcrumbs and the
page titles. Adding a screen is one entry here.

```ts
// components/layout/navigation.ts
import {
  LayoutDashboard, CalendarCheck, ClipboardList, Clock, PenLine, PartyPopper,
  CalendarDays, Inbox, CalendarPlus, CheckCheck, Gauge, FileSliders, CalendarRange,
  Wallet, Play, FileText, Layers, Receipt, HandCoins,
  Users, Network, BadgeCheck, UserPlus, Briefcase, UserSearch, CalendarClock,
  ChartNoAxesColumn, Sparkles, Settings2, ShieldCheck, ScrollText, Mail, Palette,
} from 'lucide-react';

const ALL = [Role.EMPLOYEE, Role.HR, Role.ADMIN];
const HR_UP = [Role.HR, Role.ADMIN];
const ADMIN = [Role.ADMIN];

export const NAV: NavGroup[] = [
  {
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, path: '/', roles: ALL },

      { label: 'Attendance', icon: CalendarCheck, roles: ALL, children: [
        { label: 'My Attendance', path: '/attendance',             roles: ALL },
        { label: 'Daily Register', path: '/attendance/register',   roles: HR_UP, icon: ClipboardList },
        { label: 'Timesheet',      path: '/attendance/timesheet',  roles: ALL,   icon: Clock },
        { label: 'Corrections',    path: '/attendance/corrections',roles: HR_UP, icon: PenLine },
        { label: 'Holidays',       path: '/attendance/holidays',   roles: HR_UP, icon: PartyPopper },
      ]},

      { label: 'Leave', icon: CalendarDays, roles: ALL, children: [
        { label: 'My Leave',       path: '/leave',           roles: ALL,   icon: CalendarDays },
        { label: 'Request Leave',  path: '/leave/new',       roles: ALL,   icon: CalendarPlus },
        { label: 'Approvals',      path: '/leave/approvals', roles: HR_UP, icon: CheckCheck, badge: 'pendingLeave' },
        { label: 'All Requests',   path: '/leave/all',       roles: HR_UP, icon: Inbox },
        { label: 'Leave Balances', path: '/leave/balances',  roles: HR_UP, icon: Gauge },
        { label: 'Leave Calendar', path: '/leave/calendar',  roles: ALL,   icon: CalendarRange },
        { label: 'Types & Policy', path: '/leave/types',     roles: ADMIN, icon: FileSliders },
      ]},

      { label: 'Payroll', icon: Wallet, roles: ALL, children: [
        { label: 'My Payslips',      path: '/payroll',           roles: ALL,   icon: FileText },
        { label: 'Payroll Runs',     path: '/payroll/runs',      roles: HR_UP, icon: Play },
        { label: 'All Payslips',     path: '/payroll/payslips',  roles: HR_UP, icon: FileText },
        { label: 'Salary Structure', path: '/payroll/structure', roles: ADMIN, icon: Layers },
      ]},

      { label: 'Dues', icon: Receipt, roles: ALL, children: [
        { label: 'My Dues',        path: '/dues',          roles: ALL,   icon: Receipt },
        { label: 'All Dues',       path: '/dues/all',      roles: HR_UP, icon: Receipt },
        { label: 'Record Payment', path: '/dues/payments', roles: HR_UP, icon: HandCoins },
      ]},
    ],
  },
  {
    label: 'ORGANISATION',
    items: [
      { label: 'Employees', icon: Users, roles: HR_UP, children: [
        { label: 'Directory',    path: '/employees',              roles: HR_UP, icon: Users },
        { label: 'Departments',  path: '/employees/departments',  roles: HR_UP, icon: Network },
        { label: 'Designations', path: '/employees/designations', roles: ADMIN, icon: BadgeCheck },
        { label: 'Add Employee', path: '/employees/new',          roles: HR_UP, icon: UserPlus },
      ]},

      { label: 'Recruitment', icon: UserPlus, roles: HR_UP, children: [
        { label: 'Job Postings', path: '/recruitment',            roles: HR_UP, icon: Briefcase },
        { label: 'Candidates',   path: '/recruitment/candidates', roles: HR_UP, icon: UserSearch },
        { label: 'Interviews',   path: '/recruitment/interviews', roles: HR_UP, icon: CalendarClock },
      ]},

      { label: 'Reports', icon: ChartNoAxesColumn, roles: HR_UP, children: [
        { label: 'Attendance', path: '/reports/attendance', roles: HR_UP },
        { label: 'Leave',      path: '/reports/leave',      roles: HR_UP },
        { label: 'Payroll',    path: '/reports/payroll',    roles: HR_UP },
        { label: 'Dues',       path: '/reports/dues',       roles: HR_UP },
        { label: 'Anomalies',  path: '/reports/anomalies',  roles: HR_UP, badge: 'anomalies' },
      ]},
    ],
  },
  {
    items: [
      { label: 'AI Assistant', icon: Sparkles, path: '/assistant', roles: ALL },

      { label: 'Settings', icon: Settings2, roles: ALL, children: [
        { label: 'My Profile',      path: '/settings/profile',   roles: ALL },
        { label: 'Appearance',      path: '/settings/appearance',roles: ALL,   icon: Palette },
        { label: 'Users & Roles',   path: '/settings/users',     roles: ADMIN, icon: ShieldCheck },
        { label: 'Email Templates', path: '/settings/email',     roles: ADMIN, icon: Mail },
        { label: 'Audit Log',       path: '/settings/audit',     roles: ADMIN, icon: ScrollText },
        { label: 'Organisation',    path: '/settings/org',       roles: ADMIN },
      ]},
    ],
  },
];
```

### Role filtering

```ts
export function navForRole(role: Role): NavGroup[] {
  return NAV
    .map((group) => ({
      ...group,
      items: group.items
        .filter((i) => i.roles.includes(role))
        .map((i) => ({
          ...i,
          children: i.children?.filter((c) => c.roles.includes(role)),
        }))
        // a parent whose children are all filtered out disappears too
        .filter((i) => i.path || (i.children && i.children.length > 0)),
    }))
    .filter((g) => g.items.length > 0);
}
```

That last filter is the important one. Without it, an employee sees an
"Employees" group that expands to nothing.

### What each role actually sees

| | EMPLOYEE | HR | ADMIN |
|---|:--:|:--:|:--:|
| Dashboard | ✓ | ✓ | ✓ |
| Attendance | 2 children | 5 | 5 |
| Leave | 3 children | 6 | 7 |
| Payroll | 1 child | 3 | 4 |
| Dues | 1 child | 3 | 3 |
| Employees | — | 3 children | 4 |
| Recruitment | — | ✓ | ✓ |
| Reports | — | ✓ | ✓ |
| AI Assistant | ✓ | ✓ | ✓ |
| Settings | 2 children | 2 | 6 |

An employee's sidebar shows six top-level items. HR's shows nine. Neither feels
sparse or crowded, because the same tree collapses gracefully.

**Single-child collapse:** when a role leaves a parent with exactly one child,
render it as a flat link to that child instead of an expandable group. An
employee's "Dues" should be one clickable row, not a chevron hiding one item.

---

## 4. Topbar

64px, `surface-raised`, `border-subtle` bottom, sticky. Gains `shadow-sm` once
the page scrolls past 8px.

```
┌────────────────────────────────────────────────────────────────┐
│ ☰  Leave › Approvals        ⌕ Search…      ☾  🔔3   (AR) ⌄     │
└────────────────────────────────────────────────────────────────┘
```

| Slot | Content |
|---|---|
| Left | Collapse toggle (`PanelLeft`), then breadcrumb |
| Centre | Global search — 360px, `⌘K` shortcut hint |
| Right | Theme toggle · notification bell · avatar menu |

### Breadcrumb

Derived from the nav tree, never hand-written.

```
Leave  ›  Approvals
```

Ancestors are `neutral-500` and clickable; the current page is `neutral-800`
weight 600 and is not a link. Separator is a `ChevronRight` at 14px in
`neutral-300`. Never show the breadcrumb on the dashboard.

### Global search

`⌘K` / `Ctrl+K` opens a command palette. Searches employees, leave requests and
navigation destinations in one list, grouped by type. This is a small amount of
code and disproportionately raises the perceived quality of the product.

---

## 5. Page header

Every page below the topbar opens the same way.

```tsx
<PageHeader
  title="Leave Approvals"
  subtitle="3 requests awaiting your decision"
  actions={<Button icon={Download} variant="secondary">Export</Button>}
/>
```

| Element | Spec |
|---|---|
| Title | `h1` — 24px, 700, `-0.015em`, `text-primary` |
| Subtitle | `body-sm` — 13px, 400, `text-secondary`, 4px below |
| Actions | Right-aligned, at most one primary + two secondary |
| Spacing | 24px below the header before content |

If a page needs more than three actions, the rest belong in a `MoreHorizontal`
menu. A header with five buttons has no primary action.

---

## 6. Content layouts

Four layouts cover every screen in the product.

| Layout | Used by |
|---|---|
| **Stat row + table** | Employees, Attendance register, All Dues |
| **Stat row + charts + table** | Dashboard, Reports |
| **Card grid** | My Leave, Approvals, Job Postings |
| **Split detail** | Employee detail, Payslip, Candidate detail |

### Stat row

Four cards across, `gap-4`, collapsing to 2 at `lg` and 1 at `sm`.

```
┌──────────┬──────────┬──────────┬──────────┐
│ Present  │ On Leave │ Pending  │ Payroll  │
│   142    │    8     │    3     │  4.2M    │
│  ↑ 3%    │          │  needs   │  Sept    │
└──────────┴──────────┴──────────┴──────────┘
```

### Split detail

60/40 on desktop, stacked below `lg`. Primary content left, metadata and actions
right in a sticky column.

---

## 7. Responsive

| Breakpoint | Width | Behaviour |
|---|---|---|
| `sm` | 640 | Sidebar becomes an overlay drawer. Tables become cards |
| `md` | 768 | Stat row 2-up. Split detail stacks |
| `lg` | 1024 | Sidebar auto-collapses to 76px |
| `xl` | 1280 | Sidebar expands to 264px. Full layout |
| `2xl` | 1536 | Content caps at 1440px, centred |

**Tables on mobile become cards, never horizontal scroll.** A payroll table with
nine columns is unusable on a phone at any zoom level. Each row renders as a
card with the two most important fields prominent and the rest as label/value
pairs.

---

## 8. Keyboard

| Shortcut | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Command palette |
| `⌘B` / `Ctrl+B` | Toggle sidebar |
| `⌘/` | Shortcut help |
| `g` then `d` | Go to Dashboard |
| `g` then `l` | Go to Leave |
| `g` then `p` | Go to Payroll |
| `Esc` | Close modal, drawer or palette |

Full keyboard navigation through the sidebar: `Tab` between items, `Enter` to
activate, `→` to expand a group, `←` to collapse.

---

## Review checklist

- [ ] Sidebar renders from `NAV` only — no hardcoded items anywhere
- [ ] A parent with no visible children does not render
- [ ] A parent with exactly one visible child renders flat
- [ ] The group containing the current route auto-expands
- [ ] Expanding one group does not collapse others
- [ ] Expanded state and collapsed state persist across reloads
- [ ] Active item has the brand pill, white icon at stroke 2, and the glow
- [ ] Children are indented to align with the parent's label
- [ ] Children have no icons in the collapsed-width rail
- [ ] Breadcrumb is derived from the tree, not written per page
- [ ] Every page uses `PageHeader`
- [ ] Sidebar is an overlay drawer below `sm`
- [ ] Tables become cards below `sm`
- [ ] Sidebar is fully keyboard-navigable
