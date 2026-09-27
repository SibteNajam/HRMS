# 11 — Design System: Foundations

The visual contract for the entire product. Every colour, size, weight and space
in the application comes from a token defined here. Nothing is chosen at the
component level.

> **The rule that makes this work:** a component never names a raw value. Not a
> hex code, not a pixel, not a font size. It names a token. When you need a
> colour that is not in this file, you do not add it to the component — you
> decide whether the system needs it, and if it does, you add it here first.

This is what separates a product that looks designed from one that looks
assembled. Twelve slightly different greys is the signature of the second kind.

---

## 1. Brand

The identity is a confident, high-clarity blue on near-white surfaces, with a
cool blue-tinted neutral ramp. The feel to aim for: **calm, precise,
trustworthy**. This is software people use to look at their salary. It should
feel like a bank, not like a toy.

### Brand ramp

| Token | Hex | Used for |
|---|---|---|
| `brand-50` | `#EFF5FF` | Tinted page sections, selected row background |
| `brand-100` | `#DBE8FE` | Hover on brand-tinted surfaces, chart fills |
| `brand-200` | `#BFD6FE` | Borders on brand surfaces, disabled brand states |
| `brand-300` | `#93BBFD` | **Idle sidebar icons**, decorative accents |
| `brand-400` | `#60A5FA` | Hover accents, focus ring on dark |
| `brand-500` | `#3B82F6` | Secondary actions, links on dark surfaces |
| **`brand-600`** | **`#2563EB`** | **Primary. Active nav, primary buttons, links** |
| `brand-700` | `#1D4FD8` | Primary hover |
| `brand-800` | `#1E42AF` | Primary pressed |
| `brand-900` | `#1E3A8A` | Deep accents, dark-mode brand surfaces |
| `brand-950` | `#172554` | Brand text on light tint |

`brand-600` is the product. It is the sidebar's active pill, the primary button,
every link, every focus ring. If you are unsure which blue, it is `brand-600`.

### Neutral ramp — blue-tinted, never pure grey

| Token | Hex | Used for |
|---|---|---|
| `neutral-0` | `#FFFFFF` | Cards, sidebar, modals, table surfaces |
| `neutral-25` | `#FAFCFF` | Subtle stripe, hover on white |
| `neutral-50` | `#F4F7FE` | **App background** |
| `neutral-100` | `#EDF1F9` | Table header, muted fills, skeletons |
| `neutral-200` | `#E1E7F2` | **Default border**, dividers |
| `neutral-300` | `#CBD5E7` | Input borders, stronger dividers |
| `neutral-400` | `#94A3BC` | Placeholder text, disabled text, axis labels |
| `neutral-500` | `#64748B` | **Secondary text**, captions, icons in tables |
| `neutral-600` | `#475569` | Body text on tinted surfaces |
| `neutral-700` | `#334155` | Headings on tinted surfaces |
| `neutral-800` | `#1E293B` | **Primary text** |
| `neutral-900` | `#0F172A` | Display headings, hero numbers |
| `neutral-950` | `#080F1E` | Dark-mode background |

The blue tint is deliberate and it is the whole reason the reference UI feels
cohesive rather than clinical. A pure `#808080` grey next to `#2563EB` reads as
dirty. Every neutral here carries a trace of the brand hue, so the interface
reads as one material.

### Semantic

Reserved. These four colours mean state and nothing else. Never use `success`
because you wanted a green, and never use them as chart series.

| Role | Light | Dark | Meaning in this product |
|---|---|---|---|
| `success` | `#059669` | `#10B981` | Approved · Present · Cleared · Paid |
| `warning` | `#D97706` | `#F59E0B` | Pending · Late · Draft · Needs review |
| `danger` | `#DC2626` | `#EF4444` | Rejected · Absent · Overdue · Destructive |
| `info` | `#0891B2` | `#06B6D4` | On leave · Informational · AI-generated |

Each ships with a `-subtle` background at 12% and a `-border` at 30%:

```css
--success-subtle: color-mix(in srgb, var(--success) 12%, transparent);
--success-border: color-mix(in srgb, var(--success) 30%, transparent);
```

That formula is why status badges look correct in both themes without a second
set of hardcoded pastels.

---

## 2. Token layer

Three layers. Components only ever touch layer 3.

```
Layer 1  PRIMITIVE   brand-600 = #2563EB          the raw ramp
Layer 2  SEMANTIC    --color-primary = brand-600  what it means
Layer 3  COMPONENT   --btn-bg = --color-primary   where it is used
```

A rebrand changes layer 1. A dark theme changes layer 2. A button restyle
changes layer 3. Nothing else moves. This is the structure that makes the
[white-label customisation](17-ui-customization.md) possible at all.

### Semantic tokens

```css
:root {
  /* Surfaces */
  --surface-page:       var(--neutral-50);
  --surface-raised:     var(--neutral-0);
  --surface-sunken:     var(--neutral-100);
  --surface-overlay:    var(--neutral-0);
  --surface-inverse:    var(--neutral-900);

  /* Text */
  --text-primary:       var(--neutral-800);
  --text-secondary:     var(--neutral-500);
  --text-tertiary:      var(--neutral-400);
  --text-on-brand:      var(--neutral-0);
  --text-link:          var(--brand-600);

  /* Borders */
  --border-subtle:      var(--neutral-200);
  --border-default:     var(--neutral-300);
  --border-strong:      var(--neutral-400);
  --border-brand:       var(--brand-600);

  /* Interactive */
  --color-primary:         var(--brand-600);
  --color-primary-hover:   var(--brand-700);
  --color-primary-active:  var(--brand-800);
  --color-primary-subtle:  var(--brand-50);

  /* Focus */
  --focus-ring:         var(--brand-600);
  --focus-ring-offset:  var(--surface-raised);
}
```

### Dark theme

Dark mode is **designed**, not inverted. An automatic flip produces glare,
muddy brand colour and unreadable status badges.

```css
.dark {
  --surface-page:    #0B1220;
  --surface-raised:  #131C2E;
  --surface-sunken:  #0F1724;
  --surface-overlay: #18223A;
  --surface-inverse: var(--neutral-50);

  --text-primary:    #E8EDF7;
  --text-secondary:  #94A3BC;
  --text-tertiary:   #64748B;

  --border-subtle:   #1F2A3F;
  --border-default:  #2A3750;
  --border-strong:   #3A4A68;

  --color-primary:        #3B82F6;  /* lifted — brand-600 is too heavy on dark */
  --color-primary-hover:  #60A5FA;
  --color-primary-active: #2563EB;
  --color-primary-subtle: rgba(59, 130, 246, 0.14);
}
```

Three deliberate decisions here, each of which you would get wrong by inverting:

1. **The dark page is `#0B1220`, not black.** Pure black with white text causes
   halation — the text appears to vibrate. A deep blue-black is calmer and keeps
   the brand hue present.
2. **Raised surfaces get *lighter*, not darker.** In light mode a card is white
   on grey; in dark mode it is `#131C2E` on `#0B1220`. Elevation is signalled by
   lightness, and the direction flips.
3. **Brand lifts from 600 to 500.** `#2563EB` on a dark surface is heavy and
   low-contrast. `#3B82F6` keeps the same identity and reads correctly.

---

## 3. Typography

### Families

| Role | Family | Why |
|---|---|---|
| Display | **Plus Jakarta Sans** | Geometric, slightly rounded, confident. Headings, page titles, nav labels, hero numbers |
| UI / body | **Inter** | Designed for screen UI. Excellent at 13–14px, where most of this interface lives |
| Numeric | **Inter, `font-variant-numeric: tabular-nums`** | Every salary, balance and percentage |

```css
--font-display: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
--font-sans:    'Inter', system-ui, -apple-system, sans-serif;
```

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

Load only the weights listed. Every extra weight is a font file the user waits
for.

### Tabular numerals — not optional

```css
.tabular { font-variant-numeric: tabular-nums; }
```

Apply to **every** numeric table column, every currency figure, every
percentage, every countdown. Without it, proportional digits make column values
jitter left and right as they change, and a payroll table looks broken:

```
Proportional          Tabular
  45,000.00             45,000.00
 123,450.50            123,450.50
   9,800.00              9,800.00
```

### Type scale

| Token | Size / line-height | Weight | Tracking | Family | Used for |
|---|---|---|---|---|---|
| `display-lg` | 36 / 44 | 700 | −0.02em | Display | Hero numbers on dashboard |
| `display-sm` | 30 / 38 | 700 | −0.02em | Display | Payslip net salary |
| `h1` | 24 / 32 | 700 | −0.015em | Display | Page title |
| `h2` | 20 / 28 | 600 | −0.01em | Display | Section heading, modal title |
| `h3` | 16 / 24 | 600 | −0.005em | Display | Card title |
| `body-lg` | 16 / 24 | 400 | 0 | Sans | Long-form, AI replies |
| **`body`** | **14 / 20** | **400** | **0** | **Sans** | **Default. Tables, forms, most text** |
| `body-sm` | 13 / 18 | 400 | 0 | Sans | Secondary text, helper text |
| `label` | 13 / 16 | 500 | 0 | Sans | Form labels, nav items |
| `caption` | 12 / 16 | 400 | 0 | Sans | Timestamps, table meta |
| `overline` | 11 / 16 | 600 | 0.06em | Sans | Table headers, section eyebrows — UPPERCASE |

**14px is the base**, not 16. Dense data applications read better at 14; 16px
body in a table of 30 employees forces scrolling that costs more than the
legibility gains.

**Negative tracking on large text** is what makes headings look typeset rather
than defaulted. At 24px and above, default letter-spacing is visibly loose.

### Weight discipline

Four weights. Not six.

| Weight | Use |
|---|---|
| 400 Regular | Body, table cells, descriptions |
| 500 Medium | Labels, nav items, secondary buttons, table headers |
| 600 Semibold | Card titles, section headings, primary buttons, emphasised values |
| 700 Bold | Page titles, hero numbers only |

Never 800 or 900 in the UI. Never 300 — light weights fail at small sizes and on
low-quality displays.

**Emphasise with weight and colour, never with size.** Three font sizes in one
card is noise; one size at two weights is hierarchy.

---

## 4. Spacing

4px base unit. Every margin, padding and gap is a multiple.

| Token | px | Use |
|---|---|---|
| `space-1` | 4 | Icon-to-label inside a badge |
| `space-2` | 8 | Icon-to-label in a button, tight stacks |
| `space-3` | 12 | Form field internal padding, nav item gap |
| `space-4` | 16 | **Default.** Card padding (compact), grid gutters |
| `space-5` | 20 | Card padding (comfortable) |
| `space-6` | 24 | **Card padding (default)**, section gaps |
| `space-8` | 32 | Between major sections |
| `space-10` | 40 | Page top padding |
| `space-12` | 48 | Between page regions |
| `space-16` | 64 | Empty-state vertical padding |

### The 8px rule

Use multiples of 8 for layout (16, 24, 32, 48) and multiples of 4 for component
internals (4, 12, 20). An interface built on a consistent rhythm looks
intentional even when nobody can say why.

### Fixed layout dimensions

| Element | Value |
|---|---|
| Sidebar width (expanded) | 264px |
| Sidebar width (collapsed) | 76px |
| Topbar height | 64px |
| Page max content width | 1440px |
| Page horizontal padding | 32px desktop · 16px mobile |
| Table row height | 52px |
| Table row height (compact) | 44px |
| Input height | 40px |
| Button height | 40px (md) · 32px (sm) · 48px (lg) |

---

## 5. Radius

The reference UI is generously rounded. That softness is a large part of why it
feels modern rather than corporate-2014.

| Token | px | Use |
|---|---|---|
| `radius-xs` | 4 | Badges, tags, checkbox |
| `radius-sm` | 6 | Inputs, small buttons |
| `radius-md` | 8 | Buttons, dropdown items |
| `radius-lg` | 12 | **Active nav pill**, cards (compact), modals |
| `radius-xl` | 16 | Cards (default), panels |
| `radius-2xl` | 20 | **Sidebar container**, large surfaces |
| `radius-full` | 9999 | Avatars, pills, toggles |

**Nesting rule:** an inner radius is always smaller than its container. A 12px
card inside a 20px panel looks right; the same 20px on both looks like a
mistake.

---

## 6. Elevation

Soft, blue-tinted, never grey-black. A `rgba(0,0,0,0.2)` shadow is the fastest
way to make a light UI look cheap.

```css
--shadow-xs: 0 1px 2px 0 rgba(16, 24, 40, 0.04);
--shadow-sm: 0 1px 3px 0 rgba(16, 24, 40, 0.06),
             0 1px 2px -1px rgba(16, 24, 40, 0.04);
--shadow-md: 0 4px 8px -2px rgba(16, 24, 40, 0.08),
             0 2px 4px -2px rgba(16, 24, 40, 0.04);
--shadow-lg: 0 12px 16px -4px rgba(16, 24, 40, 0.08),
             0 4px 6px -2px rgba(16, 24, 40, 0.03);
--shadow-xl: 0 20px 24px -4px rgba(16, 24, 40, 0.10),
             0 8px 8px -4px rgba(16, 24, 40, 0.04);

/* The brand glow under the active nav pill and primary buttons */
--shadow-brand: 0 6px 16px -4px rgba(37, 99, 235, 0.40);
```

| Level | Token | Applied to |
|---|---|---|
| 0 | none | Page background, table rows |
| 1 | `shadow-xs` | Table container, inputs at rest |
| 2 | `shadow-sm` | **Cards, sidebar** |
| 3 | `shadow-md` | Hovered card, sticky topbar on scroll |
| 4 | `shadow-lg` | Dropdowns, popovers, tooltips |
| 5 | `shadow-xl` | Modals, slide-over panels |

In dark mode shadows barely read. Signal elevation with a lighter surface plus a
1px `--border-subtle` instead:

```css
.dark .card {
  box-shadow: none;
  border: 1px solid var(--border-subtle);
  background: var(--surface-raised);
}
```

---

## 7. Motion

Fast, short, purposeful. Animation in a data application should be almost
subliminal — you should feel that something moved, not watch it move.

```css
--ease-out:     cubic-bezier(0.16, 1, 0.3, 1);     /* entering, expanding */
--ease-in-out:  cubic-bezier(0.65, 0, 0.35, 1);    /* moving, morphing */
--ease-spring:  cubic-bezier(0.34, 1.56, 0.64, 1); /* toggles, checkmarks */

--duration-instant: 100ms;  /* hover, focus */
--duration-fast:    160ms;  /* dropdowns, tooltips, accordions */
--duration-base:    220ms;  /* modals, slide-overs, nav expand */
--duration-slow:    320ms;  /* page transitions, skeleton fade */
```

| Interaction | Duration | Easing |
|---|---|---|
| Button / row hover | 100ms | `ease-out` |
| Nav submenu expand | 220ms | `ease-out` |
| Dropdown open | 160ms | `ease-out` |
| Modal enter | 220ms | `ease-out` (fade + 8px rise + 0.98→1 scale) |
| Slide-over enter | 260ms | `ease-out` |
| Toast enter | 220ms | `ease-spring` |
| Theme switch | 0ms | none — see below |

**Never animate a theme switch.** Transitioning every colour on the page
produces a visible smear. Swap instantly.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Required, not optional. Some users get motion sickness from UI animation.

---

## 8. Focus

One focus style everywhere. Visible, branded, never removed.

```css
:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  border-radius: inherit;
}
```

`:focus-visible` rather than `:focus` means mouse users do not see a ring on
click, while keyboard users always do.

`outline: none` without a replacement is a bug. It makes the product unusable by
keyboard and fails every accessibility audit.

---

## 9. Accessibility floors

Non-negotiable, and all of them are checkable.

| Rule | Threshold |
|---|---|
| Body text vs background | 4.5:1 |
| Large text (≥18px or ≥14px bold) | 3:1 |
| UI component borders, icons | 3:1 |
| Focus indicator | 3:1 against adjacent colours |
| Minimum touch target | 44 × 44px |
| Minimum interactive spacing | 8px |

**Colour is never the only carrier of meaning.** Every status badge is a colour
**and** a label. Every chart series is a colour **and** a legend entry. A
red-green colourblind user (about 1 in 12 men) must be able to read every
screen.

---

## 10. Tailwind configuration

**Tailwind v4 — CSS-first.** There is no `tailwind.config.js`. Tokens are
declared in `@theme` inside `src/app/globals.css`, and Tailwind generates the
utility classes from them: `--color-brand-600` produces `bg-brand-600`,
`text-brand-600`, `border-brand-600` automatically.

```css
/* src/app/globals.css */
@import "tailwindcss";

@theme {
  /* Layer 1 — primitives. Identical in both themes. */
  --color-brand-50:  #EFF5FF;
  --color-brand-300: #93BBFD;   /* idle sidebar icons */
  --color-brand-600: #2563EB;   /* primary */
  --color-brand-700: #1D4FD8;
  /* … full ramp in §1 … */

  --color-ink-50:  #F4F7FE;     /* app background */
  --color-ink-200: #E1E7F2;     /* default border */
  --color-ink-800: #1E293B;     /* primary text */
  /* … full ramp in §1 … */

  /* Layer 2 — semantic aliases pointing at plain CSS variables,
     which is what lets .dark swap them. */
  --color-surface-page:      var(--surface-page);
  --color-surface-raised:    var(--surface-raised);
  --color-content-primary:   var(--text-primary);
  --color-content-secondary: var(--text-secondary);
  --color-line-subtle:       var(--border-subtle);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-danger:  var(--danger);
  --color-info:    var(--info);

  --font-display: var(--font-jakarta), ui-sans-serif, system-ui, sans-serif;
  --font-sans:    var(--font-inter),   ui-sans-serif, system-ui, sans-serif;

  --text-body: 14px;
  --text-body--line-height: 20px;
  --text-h1: 24px;
  --text-h1--line-height: 32px;
  --text-h1--letter-spacing: -0.015em;
  /* … full scale in §3 … */

  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-2xl: 20px;

  --shadow-sm: 0 1px 3px 0 rgb(16 24 40 / 0.06), 0 1px 2px -1px rgb(16 24 40 / 0.04);
  --shadow-brand: 0 6px 16px -4px rgb(37 99 235 / 0.40);
}

/* Layer 2 values — the only thing that changes per theme. */
:root { --surface-page: #F4F7FE; --text-primary: #1E293B; /* … */ color-scheme: light; }
.dark { --surface-page: #0B1220; --text-primary: #E8EDF7; /* … */ color-scheme: dark; }
```

### Why the two-step indirection

`@theme` generates the utility classes; plain `:root` / `.dark` variables hold
the values those classes resolve to. Declaring a semantic token in `@theme` as
`var(--surface-page)` means `bg-surface-raised` compiles once and follows the
theme at runtime.

Declaring the dark values inside a second `@theme` block would not work —
`@theme` is build-time, so both sets would generate competing classes.

### Notes for v4

- `darkMode: 'class'` no longer exists as config. The `.dark` selector is
  written directly in CSS, and `next-themes` puts the class on `<html>`.
- `content` globbing is gone. v4 detects source files automatically.
- Naming is prescriptive: a colour must be `--color-*`, a font `--font-*`, a
  radius `--radius-*`. `--brand-600` alone generates nothing.
- The neutral ramp is named `ink-*` rather than `neutral-*` so it cannot
  collide with Tailwind's own built-in `neutral` palette.
- One-off values still use arbitrary syntax: `bg-[var(--color-primary)]`.
  `--color-primary` is a semantic alias, not a `@theme` entry, because its
  value differs per theme and it is only used by a handful of components.

## Review checklist

Reject any component that fails one of these.

- [ ] No hex code anywhere outside the token files
- [ ] No `bg-gray-*`, `text-gray-*`, `bg-white`, `text-black`
- [ ] Every font size is a scale token
- [ ] Only weights 400 / 500 / 600 / 700
- [ ] Every spacing value is a multiple of 4
- [ ] Inner radius smaller than outer radius
- [ ] Every numeric column uses `tabular-nums`
- [ ] Focus ring visible on keyboard navigation
- [ ] Every status carries a label, not colour alone
- [ ] Viewed in both light and dark before merge
- [ ] Nothing animates on theme switch
- [ ] `prefers-reduced-motion` respected
