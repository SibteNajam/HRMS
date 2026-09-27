# 13 — Component Library

Every UI primitive, with its variants, sizes and states fully specified. Build
these once in `components/ui/`, then never write a bespoke button again.

> A component is finished when all five states are built: **default, hover,
> focus-visible, active, disabled** — plus **loading** where it applies. A
> component with only a default state is a mockup, not a component.

---

## Button

### Variants

| Variant | Background | Text | Border | Use |
|---|---|---|---|---|
| `primary` | `brand-600` + `shadow-brand` | white | none | The one main action per view |
| `secondary` | `surface-raised` | `text-primary` | `border-default` | Everything alongside the primary |
| `ghost` | transparent | `text-secondary` | none | Toolbars, table row actions |
| `danger` | `danger` | white | none | Delete, reject, terminate |
| `link` | transparent | `text-link` | none | Inline in prose |

### States

| State | Primary | Secondary | Ghost |
|---|---|---|---|
| Hover | `brand-700` | `neutral-50` bg | `neutral-100` bg |
| Active | `brand-800`, shadow removed | `neutral-100` | `neutral-200` |
| Focus | `focus-ring` 2px, 2px offset | same | same |
| Disabled | `neutral-200` bg, `neutral-400` text, no shadow, `cursor-not-allowed` | same | same |
| Loading | spinner replaces the icon, label stays, pointer events off | same | same |

**Keep the label visible while loading.** Replacing "Save" with a bare spinner
makes the button change width and the layout jump.

### Sizes

| Size | Height | Padding X | Text | Icon | Radius |
|---|---|---|---|---|---|
| `sm` | 32 | 12 | 13 / 500 | 14 | `radius-sm` |
| `md` | 40 | 16 | 14 / 500 | 16 | `radius-md` |
| `lg` | 48 | 20 | 16 / 600 | 20 | `radius-md` |
| `icon` | 40 × 40 | — | — | 20 | `radius-md` |

```tsx
<Button variant="primary" size="md" icon={Plus} loading={isSubmitting}>
  Add Employee
</Button>
```

**One primary button per view.** Two competing primaries means the design has
not decided what the user is meant to do.

---

## Input

| Property | Value |
|---|---|
| Height | 40px |
| Padding | 12px horizontal |
| Border | 1px `border-default` |
| Radius | `radius-sm` (6px) |
| Background | `surface-raised` |
| Text | `body` (14px) |
| Placeholder | `text-tertiary` |

| State | Border | Other |
|---|---|---|
| Hover | `border-strong` | |
| Focus | `brand-600` | plus `0 0 0 3px brand-100` ring |
| Error | `danger` | plus `0 0 0 3px danger/12%` |
| Disabled | `border-subtle` | `surface-sunken` bg, `text-tertiary` |

### Field anatomy

```
Label                          ← label, 13/500, text-primary, 6px below
┌─────────────────────────┐
│ Placeholder             │    ← 40px
└─────────────────────────┘
Helper or error text           ← body-sm, 6px above
```

Helper text and error text occupy the **same slot**. Error replaces helper; both
never show at once, and the slot reserves its height so the form does not jump
when validation fires.

Required fields carry a `danger` asterisk after the label. Optional fields in a
mostly-required form say "(optional)" in `text-tertiary` — clearer than marking
eight of ten fields required.

---

## Select, Textarea, Checkbox, Radio, Switch, DatePicker

| Component | Notes |
|---|---|
| Select | Matches Input exactly, plus a `ChevronDown` at 16px in `neutral-400`. Menu is `surface-overlay` at `shadow-lg`, `radius-md`, 4px padding, 36px items |
| Textarea | Min-height 88px, `resize-y` only. Character counter bottom-right in `caption` when a max length exists |
| Checkbox | 18×18, `radius-xs`, 1.5px border. Checked: `brand-600` fill, white `Check` at stroke 2.5. 150ms `ease-spring` |
| Radio | 18×18 circle, 1.5px border. Checked: `brand-600` ring with a 7px centre dot |
| Switch | 40×22 track, `radius-full`, 18px thumb with `shadow-xs`. Off `neutral-300`, on `brand-600`. 200ms `ease-spring` |
| DatePicker | Calendar in a `shadow-lg` popover. Today = `brand-600` ring. Selected = `brand-600` fill. Range = `brand-50` band with rounded ends. Disabled dates `text-tertiary`, struck |

Labels are always **clickable** — wrap the control in `<label>` or wire `htmlFor`.
A 18px checkbox is a poor target; its label makes it a good one.

---

## Table

The most-used component in the product. Get it right once.

| Property | Value |
|---|---|
| Container | `surface-raised`, `radius-xl`, `shadow-sm`, `overflow-hidden` |
| Header row | `surface-sunken` bg, 44px |
| Header text | `overline` — 11px, 600, `0.06em`, UPPERCASE, `text-secondary` |
| Row height | 52px (44px compact) |
| Row border | 1px `border-subtle` between rows, none after the last |
| Row hover | `neutral-25` bg, 100ms |
| Cell padding | 16px horizontal |
| Numeric cells | right-aligned, `tabular-nums` |
| Action cells | right-aligned, fixed width, `ghost` icon buttons |

### Rules

- **Never zebra-stripe.** Row hover plus clean borders reads better and stays
  legible in dark mode.
- **Right-align numbers, left-align text, centre nothing.** Right-aligned
  currency lets the eye compare magnitudes down the column.
- **Sticky header** when the table scrolls.
- **Sortable headers** show a `ChevronUp`/`ChevronDown` at 14px; the inactive
  state shows `ArrowUpDown` at 30% opacity on hover only.
- **Selection** via a leading checkbox column, with a header checkbox for all.
  Selected rows get a `brand-50` background and a 2px `brand-600` left border.
- **Row click** opens the detail; put destructive actions behind the `⋯` menu so
  a mis-click cannot delete.
- **Maximum seven visible columns.** More goes behind a column-visibility menu.

### States

```tsx
if (isLoading) return <TableSkeleton rows={8} columns={6} />;
if (isError)   return <TableError onRetry={refetch} />;
if (!rows.length) return <TableEmpty />;
```

Skeletons, never spinners — the layout must not jump when data arrives.

### Pagination

Below the table, 56px, `border-subtle` top. Left: "Showing 1–20 of 143".
Right: page buttons. Include a rows-per-page select (10 / 20 / 50 / 100).

---

## Card

| Property | Value |
|---|---|
| Background | `surface-raised` |
| Border | none in light (shadow carries it), 1px `border-subtle` in dark |
| Radius | `radius-xl` (16px) |
| Shadow | `shadow-sm`; `shadow-md` on hover if interactive |
| Padding | 24px (20px compact) |
| Header–body gap | 20px |

```
┌─────────────────────────────────┐
│ ▢ Title                     ⋯   │  ← h3 + optional icon, 20px
│   Optional subtitle             │  ← body-sm, text-secondary
│ ─────────────────────────────── │  ← border-subtle, optional
│                                 │
│   Content                       │
│                                 │
└─────────────────────────────────┘
```

Never nest a card inside a card. Use a `surface-sunken` block with
`radius-lg` instead.

---

## StatCard

The dashboard's workhorse.

```
┌──────────────────────────────┐
│ PRESENT TODAY           ▢    │  ← overline + 20px icon in a
│                              │    brand-50 rounded-lg tile
│ 142                          │  ← display-lg, tabular-nums
│ ↑ 3.2%  vs last month        │  ← body-sm; arrow + value in
└──────────────────────────────┘    success/danger, rest secondary
```

| Element | Spec |
|---|---|
| Label | `overline`, `text-secondary` |
| Icon tile | 36×36, `radius-lg`, `brand-50` bg, `brand-600` icon at 20px |
| Value | `display-lg` (36/700), `text-primary`, `tabular-nums` |
| Delta | `body-sm`; `TrendingUp`/`TrendingDown` at 14px |
| Padding | 20px |
| Height | Fixed, so a row of cards aligns even when one has no delta |

**Colour the delta by meaning, not direction.** Attendance up is `success`;
absenteeism up is `danger`. Pass an `invertDelta` prop rather than assuming
up = good.

---

## Badge

Every status in the product. Always icon + label + colour.

| Property | Value |
|---|---|
| Height | 24px (20px small) |
| Padding | 8px horizontal, 6px with an icon |
| Radius | `radius-full` |
| Text | 12px / 600 |
| Icon | 14px, stroke 2, 4px gap |
| Background | semantic `-subtle` (12%) |
| Text colour | the semantic token |
| Border | 1px semantic `-border` (30%) |

```tsx
<Badge tone="success" icon={CircleCheck}>Approved</Badge>
<Badge tone="warning" icon={Clock}>Pending</Badge>
<Badge tone="danger"  icon={CircleX}>Rejected</Badge>
```

A **count badge** (sidebar, bell) is different: `radius-full`, 20px min-width,
`brand-600` bg, white 11px/600 text, centred. Over 99 shows `99+`.

---

## Modal

| Property | Value |
|---|---|
| Overlay | `neutral-900` at 40%, `backdrop-blur-sm` |
| Surface | `surface-overlay`, `radius-xl`, `shadow-xl` |
| Widths | sm 400 · md 520 · lg 680 · xl 840 |
| Padding | 24px |
| Enter | 220ms `ease-out` — fade + 8px rise + scale 0.98→1 |
| Exit | 160ms `ease-in-out` |

Header: `h2` title, optional subtitle, `X` ghost icon button top-right.
Footer: `border-subtle` top, actions right-aligned, secondary then primary.

Close on `Esc` and overlay click — **except** when the form is dirty, where a
confirmation prompt fires instead. Focus moves to the first field on open and
returns to the trigger on close. Focus is trapped inside while open.

**Destructive confirmations** state the consequence and name the object:

> Delete Ahmed Raza's employee record? Their payslips will be retained. This
> cannot be undone.

Never "Are you sure?" — it gives the user nothing to be sure about.

---

## SlideOver

Right-side panel for detail and creation without losing the list context.

Width 480 (640 wide variant), full height, `surface-overlay`, `shadow-xl`,
`radius-xl` on the left corners only. Enters 260ms `ease-out` from the right.
Same overlay, focus and dismissal rules as Modal.

Used for: the AI assistant, employee quick-view, leave request detail,
notification list.

---

## Toast

Bottom-right, stacked upward, 8px gap, max 3 visible.

| Property | Value |
|---|---|
| Width | 360px |
| Surface | `surface-overlay`, `radius-lg`, `shadow-lg` |
| Left accent | 3px bar in the tone colour |
| Duration | 4s success/info · 6s error · sticky if an action is present |
| Enter | 220ms `ease-spring`, slide from the right |

Title in `body` 600, optional description in `body-sm` `text-secondary`,
optional action link, and a close `X`.

Toasts confirm; they do not explain. A validation error belongs under its field,
not in a toast.

---

## EmptyState

Every list needs one. An empty table with headers and no rows looks broken.

```
        ▢              ← 48px icon, neutral-300, stroke 1.25
   No leave requests   ← h3
   Requests you submit ← body-sm, text-secondary, max-width 380, centred
   will appear here.
   [ Request Leave ]   ← primary button, 20px above
```

Vertical padding 64px. Write the copy for the specific case: "No employees match
'ahmd'" beats "No results", and should offer a clear-filters action.

---

## Skeleton

`surface-sunken` background with a shimmer sweep, `radius-sm` (or `radius-full`
for avatars), 1.5s linear infinite.

Match the shape of what is loading — a table skeleton has the right number of
rows and column widths. A generic grey box tells the user nothing and causes a
layout jump when the real content arrives.

---

## Avatar

Sizes 24 / 32 / 40 / 48 / 64, `radius-full`. Falls back to initials on a
deterministic background derived from the name hash, using `brand-100` /
`info-subtle` / `success-subtle` tints — never a random colour, so the same
person is always the same colour.

An `AvatarGroup` overlaps at −8px with a 2px `surface-raised` ring, showing a
`+N` chip past the maximum.

---

## Tabs

Underline style. 40px height, 16px gap, `body` 500 in `text-secondary`; active is
`text-primary` 600 with a 2px `brand-600` underline that slides 200ms
`ease-out` between tabs. A 1px `border-subtle` runs the full width beneath.

Used on Employee detail, Reports and Settings. Never more than six tabs; beyond
that use sub-navigation in the sidebar.

---

## Tooltip

`neutral-900` background (`neutral-100` in dark), white 12px text, 8×6px
padding, `radius-sm`, 400ms open delay, 0ms close. Arrow 6px. Max width 240px.

For text only. Anything interactive belongs in a Popover.

---

## AI components

The AI needs its own visual language so users always know what a machine wrote.

### AiCallout

Wraps any AI-generated content.

| Property | Value |
|---|---|
| Background | `info-subtle` |
| Border | 1px `info-border`, `radius-lg` |
| Header | `Sparkles` 16px + "AI Summary" in 12px/600 `info` |
| Body | `body`, `text-primary` |
| Footer | "AI-generated — verify before acting" in `caption` `text-tertiary` |

That footer is a design requirement, not a legal formality. It is how the
interface keeps the human in the loop.

### ChatMessage

User messages: right-aligned, `brand-600` bg, white text, `radius-xl` with the
bottom-right corner at `radius-sm`.
Assistant: left-aligned, `surface-sunken` bg, `text-primary`, mirrored radius.
Max width 680px. 16px vertical gap.

### ToolActivity

Shown while the model is calling a read tool.

```
◐  Checking your attendance…
```

Spinning `Loader2` at 14px in `info`, `body-sm` `text-secondary`, fading between
steps. Without this the wait looks like a hang.

---

## The tailwind-merge trap

`cn()` uses `tailwind-merge` to resolve conflicting classes. It has a built-in
list of Tailwind's own font sizes (`text-sm`, `text-lg`, …) and treats **any
other** `text-*` class as a text **colour**.

Our scale is custom — `text-body`, `text-h1`, `text-display-lg` — so out of the
box it classified them as colours, which made this silently drop the label
colour:

```tsx
cn('text-white', 'text-body-lg')   // → 'text-body-lg'   ✗ text-white gone
```

That is how the primary button shipped with an invisible label. The fix is to
teach it the custom groups once, in `lib/cn.ts`:

```ts
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['caption','body-sm','body','body-lg',
                             'h3','h2','h1','display-sm','display-lg'] }],
      shadow: [{ shadow: ['brand'] }],
    },
  },
});
```

```tsx
cn('text-white', 'text-body-lg')   // → 'text-white text-body-lg'  ✓
cn('text-white', 'text-danger')    // → 'text-danger'              ✓ still resolves
cn('text-body',  'text-h1')        // → 'text-h1'                  ✓ still resolves
```

**Whenever you add a token to `@theme`, add it here too.** Any custom
`text-*`, `shadow-*` or `rounded-*` value that tailwind-merge does not
recognise will be mis-grouped, and the symptom is a class vanishing with no
error.

## Review checklist

- [ ] All five states exist: default, hover, focus-visible, active, disabled
- [ ] Loading states keep the label and do not resize
- [ ] Every component reads tokens, never raw values
- [ ] Focus ring visible on every interactive element
- [ ] Modals trap focus and restore it on close
- [ ] Every list has an empty state with specific copy
- [ ] Every async surface has a shaped skeleton
- [ ] Every status badge has an icon and a label
- [ ] Numeric columns are right-aligned and tabular
- [ ] All AI output is wrapped in an `AiCallout` or marked as AI
- [ ] Checked in both themes
