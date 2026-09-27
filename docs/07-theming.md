# 07 — Theme Implementation

How dark and light mode are wired up. The colour **values** live in
[Design System](11-design-system.md) — this document is the mechanism that
applies them.

> If you are looking for "which blue is primary", that is
> [§1 Brand](11-design-system.md#1-brand). Do not duplicate values here.

---

## The one rule

**No component ever names a colour.**

```tsx
// Wrong — breaks in dark mode, and you will not notice until the demo
<div className="bg-white text-gray-900 border-gray-200">

// Right — works in both, forever
<div className="bg-surface-raised text-content-primary border-line-subtle">
```

Every component names a *semantic* token. The token's value changes with the
theme; the component does not know or care. Get this right at the start and dark
mode costs nothing for the rest of the project. Get it wrong and you will be
auditing sixty components in your final week.

---

## Token file

`styles/globals.css`. Primitives first, then semantics, then the dark overrides.
The full value tables are in [Design System](11-design-system.md#1-brand) — this
is the structure they go in.

```css
@layer base {
  :root {
    /* ── Layer 1: primitives ────────────────────────── */
    --brand-50:#EFF5FF;  --brand-100:#DBE8FE; --brand-200:#BFD6FE;
    --brand-300:#93BBFD; --brand-400:#60A5FA; --brand-500:#3B82F6;
    --brand-600:#2563EB; --brand-700:#1D4FD8; --brand-800:#1E42AF;
    --brand-900:#1E3A8A; --brand-950:#172554;

    --neutral-0:#FFFFFF;  --neutral-25:#FAFCFF; --neutral-50:#F4F7FE;
    --neutral-100:#EDF1F9;--neutral-200:#E1E7F2;--neutral-300:#CBD5E7;
    --neutral-400:#94A3BC;--neutral-500:#64748B;--neutral-600:#475569;
    --neutral-700:#334155;--neutral-800:#1E293B;--neutral-900:#0F172A;

    /* ── Layer 2: semantics ─────────────────────────── */
    --surface-page:    var(--neutral-50);
    --surface-raised:  var(--neutral-0);
    --surface-sunken:  var(--neutral-100);
    --surface-overlay: var(--neutral-0);

    --text-primary:   var(--neutral-800);
    --text-secondary: var(--neutral-500);
    --text-tertiary:  var(--neutral-400);

    --border-subtle:  var(--neutral-200);
    --border-default: var(--neutral-300);
    --border-strong:  var(--neutral-400);

    --color-primary:        var(--brand-600);
    --color-primary-hover:  var(--brand-700);
    --color-primary-active: var(--brand-800);
    --color-primary-subtle: var(--brand-50);
    --focus-ring:           var(--brand-600);

    --success:#059669; --warning:#D97706; --danger:#DC2626; --info:#0891B2;

    --shadow-sm: 0 1px 3px 0 rgba(16,24,40,.06), 0 1px 2px -1px rgba(16,24,40,.04);
    --shadow-brand: 0 6px 16px -4px rgba(37,99,235,.40);
  }

  .dark {
    --surface-page:    #0B1220;
    --surface-raised:  #131C2E;
    --surface-sunken:  #0F1724;
    --surface-overlay: #18223A;

    --text-primary:   #E8EDF7;
    --text-secondary: #94A3BC;
    --text-tertiary:  #64748B;

    --border-subtle:  #1F2A3F;
    --border-default: #2A3750;
    --border-strong:  #3A4A68;

    --color-primary:        var(--brand-500);   /* lifted for dark surfaces */
    --color-primary-hover:  var(--brand-400);
    --color-primary-active: var(--brand-600);
    --color-primary-subtle: rgba(59,130,246,.14);
    --focus-ring:           var(--brand-400);

    --success:#10B981; --warning:#F59E0B; --danger:#EF4444; --info:#06B6D4;

    --shadow-sm: none;                          /* borders carry elevation */
    --shadow-brand: 0 6px 16px -4px rgba(59,130,246,.30);
  }

  body {
    background: var(--surface-page);
    color: var(--text-primary);
    font-family: var(--font-sans);
    font-size: 14px;
    line-height: 20px;
    -webkit-font-smoothing: antialiased;
  }
}
```

### Three things that are deliberate

1. **Only layer 2 changes under `.dark`.** The primitive ramp is identical in
   both themes. This is what lets the
   [brand-colour generator](17-ui-customization.md#2-generating-a-ramp-from-one-hex)
   rewrite layer 1 at runtime and have both themes follow.
2. **Brand lifts from 600 to 500 in dark.** `#2563EB` on `#0B1220` is heavy and
   low-contrast. `#3B82F6` keeps the identity and reads correctly.
3. **Shadows go to `none` in dark**, replaced by a 1px `border-subtle`. Shadows
   are invisible on dark surfaces; elevation is signalled by lightness instead.

---

## ThemeProvider

Three modes. `system` follows the OS and reacts live when the user changes it.

```tsx
// hooks/useTheme.tsx
type Theme = 'light' | 'dark' | 'system';

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('theme') as Theme) ?? 'system',
  );
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const root = document.documentElement;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mql.matches);
      root.classList.toggle('dark', dark);
      root.style.colorScheme = dark ? 'dark' : 'light';
      setResolved(dark ? 'dark' : 'light');
    };

    apply();
    localStorage.setItem('theme', theme);

    if (theme !== 'system') return;
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme: resolved }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

`color-scheme` is not decoration — it is what makes native scrollbars, form
controls and autofill backgrounds follow the theme. Without it you get a white
scrollbar on a dark page.

`resolvedTheme` is what charts key off. See
[Data Visualization](16-data-visualization.md#5-implementation).

---

## Preventing the flash

React mounts after the browser paints, so a dark-mode user sees a white screen
for one frame on every load. Fix it with a script in `index.html` that runs
before React — and load the tenant's brand colours in the same pass.

```html
<script>
  (function () {
    try {
      var t = localStorage.getItem('theme') || 'system';
      var dark = t === 'dark' ||
        (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      if (dark) {
        document.documentElement.classList.add('dark');
        document.documentElement.style.colorScheme = 'dark';
      }
      var brand = JSON.parse(localStorage.getItem('brandRamp') || 'null');
      if (brand) {
        for (var step in brand) {
          document.documentElement.style.setProperty('--brand-' + step, brand[step]);
        }
      }
    } catch (e) {}
  })();
</script>
```

The `try/catch` matters — `localStorage` throws in some privacy modes, and an
uncaught error here blocks the page.

Small detail, and the single most noticeable polish difference between a student
project and a finished product.

---

## Never animate the theme switch

```css
/* Wrong — every colour on the page smears for 200ms */
* { transition: background-color 200ms, color 200ms; }
```

Transitioning every colour produces a visible wipe across the page. Swap
instantly. Keep transitions scoped to specific interactive properties on
specific components.

---

## Status styles

Defined once, in one map, never inlined.

```ts
// lib/statusStyles.ts
export const leaveStatusStyle: Record<LeaveStatus, string> = {
  PENDING:   'bg-warning/12 text-warning border-warning/30',
  APPROVED:  'bg-success/12 text-success border-success/30',
  REJECTED:  'bg-danger/12  text-danger  border-danger/30',
  CANCELLED: 'bg-surface-sunken text-content-tertiary border-line-subtle',
};

export const attendanceStatusStyle: Record<AttendanceStatus, string> = {
  PRESENT:  'bg-success/12 text-success border-success/30',
  LATE:     'bg-warning/12 text-warning border-warning/30',
  ABSENT:   'bg-danger/12  text-danger  border-danger/30',
  HALF_DAY: 'bg-info/12    text-info    border-info/30',
  ON_LEAVE: 'bg-info/12    text-info    border-info/30',
  HOLIDAY:  'bg-surface-sunken text-content-tertiary border-line-subtle',
};
```

A 12% tint of the semantic token with the full-strength token as text works in
both themes, because both derive from the same variable and that variable
already changed. A hardcoded `bg-green-100` does not — it is unreadable on a
dark surface.

Every status also carries an icon and a label. See
[Component Library › Badge](13-component-library.md#badge).

---

## Theme toggle

A three-way segmented control in Settings › Appearance (`Sun` · `Moon` ·
`Monitor`), and a single icon button in the topbar that cycles
light → dark → system.

The topbar button shows the icon of the **current resolved** theme and carries an
`aria-label` naming what clicking it will do.

---

## Checklist before merging any component

- [ ] No `bg-white`, `bg-gray-*`, `text-black`, `text-gray-*`, `border-gray-*`
- [ ] No hex code outside the token file
- [ ] Every colour is a semantic token
- [ ] Viewed in both themes before the PR
- [ ] Icons use `currentColor`, never a fixed fill
- [ ] Charts read colours through `useChartTheme` and remount on theme change
- [ ] Focus rings use `--focus-ring` and are visible in both themes
- [ ] Nothing transitions on theme switch
- [ ] Shadows replaced by borders in dark mode
