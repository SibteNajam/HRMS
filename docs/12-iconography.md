# 12 — Iconography

Icons carry more of the perceived quality of an interface than almost anything
else. A mismatched icon set — some filled, some outlined, some at 1px stroke and
some at 2.5px — makes an otherwise good product look assembled from parts.

This document fixes the library, the geometry, and which icon means what.

---

## 1. The library

**[Lucide](https://lucide.dev) — `lucide-react`. One library. No exceptions.**

```bash
npm install lucide-react
```

| Why Lucide | |
|---|---|
| Geometry | Drawn on a 24×24 grid with consistent optical weight |
| Stroke | Uniform, adjustable, round caps and joins |
| Coverage | 1,400+ icons — every concept in this product is covered |
| Tree-shaking | Only imported icons ship |
| `currentColor` | Inherits text colour, so theming is free |

Do **not** mix in Font Awesome, Material Icons, Heroicons or Bootstrap Icons.
The moment two libraries coexist, stroke weights and corner radii stop matching
and the interface reads as inconsistent even to people who cannot name why.

---

## 2. Geometry — the numbers that matter

You asked specifically about shape, stroke and thickness. These are the values.

```tsx
<Icon size={20} strokeWidth={1.75} absoluteStrokeWidth />
```

| Property | Value | Why |
|---|---|---|
| **Stroke width** | **1.75** | Lucide's 2 is slightly heavy beside Inter at 14px; 1.5 goes weak at 16px. 1.75 sits exactly with 400–500 weight text |
| **`absoluteStrokeWidth`** | **on** | Without it, a 16px icon renders a visually thicker stroke than a 24px one, because stroke scales with the icon. This single prop is why a set looks uniform across sizes |
| Line cap | `round` | Lucide default. Matches the rounded radius language |
| Line join | `round` | Lucide default |
| Grid | 24×24 | Never author a custom icon on a different grid |

### Size scale

| Token | px | Used for |
|---|---|---|
| `icon-xs` | 14 | Inside badges, inline with `caption` text |
| `icon-sm` | 16 | Inside buttons, table cells, form field adornments |
| **`icon-md`** | **20** | **Sidebar, topbar, card headers. The default** |
| `icon-lg` | 24 | Section headers, empty-state headings |
| `icon-xl` | 32 | Stat card accents |
| `icon-2xl` | 48 | Empty states, error pages |

**Optical alignment:** an icon at the same px size as text looks larger, because
text has ascenders and descenders that the icon does not. Beside 14px text, use
a 16px icon; beside 16px text, use 20px. Matching the numbers exactly produces
an icon that looks oversized.

### Stroke by context

Adjust stroke, not size, when an icon needs more or less presence.

| Context | Stroke | Rationale |
|---|---|---|
| Sidebar, idle | 1.75 | Default |
| **Sidebar, active** | **2** | Slightly heavier reads as "selected" alongside the pill |
| Button | 1.75 | Matches the label weight |
| Table cell | 1.5 | Recedes; the data is the content |
| Empty state / hero | 1.25 | Large icons at 1.75 look coarse and heavy |
| Status badge | 2 | Small size needs weight to stay legible |

### Wrapper component

Do not let call sites pass their own stroke. Centralise it.

```tsx
// components/ui/Icon.tsx
import type { LucideIcon } from 'lucide-react';

const SIZES = { xs: 14, sm: 16, md: 20, lg: 24, xl: 32, '2xl': 48 } as const;

export function Icon({
  icon: Glyph,
  size = 'md',
  strokeWidth = 1.75,
  className,
}: {
  icon: LucideIcon;
  size?: keyof typeof SIZES;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <Glyph
      size={SIZES[size]}
      strokeWidth={strokeWidth}
      absoluteStrokeWidth
      className={className}
      aria-hidden="true"
      focusable="false"
    />
  );
}
```

`aria-hidden` is correct for decorative icons — which is nearly all of them. An
icon beside a label is decorative; the label is the accessible name. An
**icon-only** button must carry `aria-label` on the *button*, not the icon.

---

## 3. Colour

Icons use `currentColor`. They inherit text colour and therefore theme for free.
Never set an icon's colour directly unless it is carrying status.

| Context | Colour token |
|---|---|
| Sidebar idle | `brand-300` |
| Sidebar hover | `brand-600` |
| Sidebar active | `text-on-brand` (white on the pill) |
| Sidebar group header | `neutral-400` |
| Topbar | `neutral-500` |
| Button (primary) | inherits `text-on-brand` |
| Button (secondary) | inherits `text-primary` |
| Table cell | `neutral-400` |
| Empty state | `neutral-300` |
| Status | the matching semantic token |

The `brand-300` idle sidebar icon against `neutral-800` labels is the detail
that gives the reference UI its airy, unfussy feel. Idle icons in full-strength
text colour make a ten-item sidebar look crowded and loud.

---

## 4. Module icon map

One icon per concept, used everywhere that concept appears — sidebar, page
header, empty state, notification. An icon that means "Leave" in the sidebar and
something else on the leave page destroys the association.

### Primary navigation

| Module | Icon | Why this one |
|---|---|---|
| Dashboard | `LayoutDashboard` | Panel grid — universally read as "overview" |
| Employees | `Users` | People, plural |
| Attendance | `CalendarCheck` | A calendar with confirmation, not a bare clock |
| Leave | `CalendarDays` | A calendar of days — distinct from attendance's check |
| Payroll | `Wallet` | Money that belongs to a person. Clearer than `DollarSign`, and not currency-specific |
| Dues | `Receipt` | An amount owed with a record. Better than `CreditCard` (implies payment method) |
| Recruitment | `UserPlus` | Adding a person |
| Reports | `ChartNoAxesColumn` | Analysis. `BarChart3` also acceptable |
| AI Assistant | `Sparkles` | The established convention for AI. Do not invent a robot |
| Settings | `Settings2` | Sliders, not the toothed cog — softer, matches the rounded language |

**`Wallet` over `DollarSign`** matters for a product meant to ship worldwide. A
`$` glyph is a currency, not a concept, and it silently signals "built for the
US" to everyone else.

### Sub-navigation

| Item | Icon |
|---|---|
| All Employees / Directory | `Users` |
| Departments | `Network` |
| Designations | `BadgeCheck` |
| Daily Register | `ClipboardList` |
| My Attendance | `CalendarCheck` |
| Timesheet | `Clock` |
| Corrections | `PenLine` |
| Holidays | `PartyPopper` |
| All Leave Requests | `Inbox` |
| Request Leave | `CalendarPlus` |
| Approvals | `CheckCheck` |
| Leave Balances | `Gauge` |
| Leave Types & Policy | `FileSliders` |
| Leave Calendar | `CalendarRange` |
| Payroll Runs | `Play` |
| Payslips | `FileText` |
| Salary Structure | `Layers` |
| All Dues | `Receipt` |
| Record Payment | `HandCoins` |
| Job Postings | `Briefcase` |
| Candidates | `UserSearch` |
| Interviews | `CalendarClock` |
| Users & Roles | `ShieldCheck` |
| Audit Log | `ScrollText` |
| Email Templates | `Mail` |
| Appearance | `Palette` |

### Actions

| Action | Icon |
|---|---|
| Create / Add | `Plus` |
| Edit | `PenLine` (not `Pencil` — thinner, more modern) |
| Delete | `Trash2` |
| Approve | `Check` |
| Reject | `X` |
| Download | `Download` |
| Upload | `Upload` |
| Filter | `ListFilter` |
| Search | `Search` |
| Sort | `ArrowUpDown` |
| More actions | `MoreHorizontal` |
| Refresh | `RotateCw` |
| Export | `FileDown` |
| Print | `Printer` |
| Close | `X` |
| Back | `ArrowLeft` |
| Expand / collapse | `ChevronDown` (rotate 180° when open) |
| External link | `ArrowUpRight` |

### Status

Every status badge is **icon + label + colour**. Never colour alone.

| Status | Icon | Colour |
|---|---|---|
| Approved / Present / Cleared | `CircleCheck` | `success` |
| Pending / Draft / Late | `Clock` | `warning` |
| Rejected / Absent / Overdue | `CircleX` | `danger` |
| On Leave / Info | `Info` | `info` |
| Cancelled / Inactive | `CircleMinus` | `neutral-400` |
| Half day | `CircleDashed` | `info` |
| AI generated | `Sparkles` | `info` |

### Empty & error states

| State | Icon |
|---|---|
| No data yet | `Inbox` |
| No search results | `SearchX` |
| Error | `TriangleAlert` |
| No permission | `Lock` |
| Offline | `WifiOff` |
| AI unavailable | `SparklesIcon` at 40% opacity |

---

## 5. Icon-with-label rules

```tsx
// Button: 16px icon, 8px gap, both vertically centred
<button className="inline-flex items-center gap-2">
  <Icon icon={Plus} size="sm" />
  Add Employee
</button>

// Nav item: 20px icon, 12px gap
<a className="flex items-center gap-3">
  <Icon icon={CalendarDays} size="md" />
  Leave
</a>
```

| Pairing | Gap |
|---|---|
| Badge (14px icon) | 4px |
| Button (16px icon) | 8px |
| Nav item (20px icon) | 12px |
| Card header (20px icon) | 12px |
| Empty state (48px icon) | 16px below |

Use `items-center` on a flex container, never manual `margin-top` nudges.

---

## 6. Custom SVG

Only two things in this product need custom artwork: the logo and the empty-state
illustrations.

### Authoring rules

If you must draw an icon, match the system or it will look foreign:

- 24×24 viewBox
- `fill="none"`, `stroke="currentColor"`
- `stroke-width="1.75"`, `stroke-linecap="round"`, `stroke-linejoin="round"`
- 2px padding inside the viewBox — strokes must not touch the edge
- Snap points to whole or half pixels; off-grid coordinates render blurry
- No gradients, no drop shadows, no more than two path elements

```tsx
export function CustomIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
         aria-hidden="true" {...props}>
      <path d="M3 7h18M3 12h18M3 17h10" />
    </svg>
  );
}
```

### Logo

The one place a filled, coloured mark is correct — a logo is a brand asset, not
an icon.

- Provide an SVG with the wordmark and a standalone glyph for the collapsed
  sidebar
- Two variants: full colour for light, adjusted for dark
- Minimum clear space equal to the glyph's cap height on all sides
- Never below 24px tall; never stretched; never recoloured outside its variants

### Empty-state illustrations

Line art in `brand-200` and `neutral-200`, drawn at the same 1.75 stroke weight
so it reads as a large icon rather than clip art. Keep them abstract — no faces,
no photos, no stock illustration.

---

## 7. Performance

```tsx
// Right — tree-shaken, only these ship
import { Users, CalendarDays, Wallet } from 'lucide-react';

// Wrong — can pull the entire library into the bundle
import * as Icons from 'lucide-react';
```

Never build an icon component that maps a string name to a dynamic import — that
defeats tree-shaking. Use the static maps in this document.

---

## Review checklist

- [ ] Every icon comes from `lucide-react`
- [ ] Stroke is 1.75 by default, with `absoluteStrokeWidth` set
- [ ] Size comes from the scale, never an arbitrary px value
- [ ] Icons are optically one step larger than adjacent text
- [ ] Colour is inherited via `currentColor`, not hardcoded
- [ ] Each concept uses the same icon everywhere it appears
- [ ] Decorative icons are `aria-hidden`; icon-only buttons have `aria-label`
- [ ] Every status badge has an icon **and** a text label
- [ ] No namespace import of the icon library
- [ ] Custom SVGs match the 24-grid, 1.75-stroke, round-cap spec
