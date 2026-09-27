# 17 — UI Customization & White-Labelling

You asked for the product to be usable by large organisations worldwide. That
means an organisation must be able to make it look like *their* product without
a code change or a rebuild.

This is the payoff for the three-layer token structure in
[Design System](11-design-system.md). Because no component names a raw value, a
tenant can replace layer 1 and the entire interface re-skins itself.

---

## 1. What is customisable

| Level | Who sets it | Scope | Persisted in |
|---|---|---|---|
| **Organisation branding** | ADMIN | Everyone in the org | `organisation_settings` table |
| **User preferences** | Each user | That user only | `user_preferences` table + `localStorage` |
| **Deployment defaults** | Whoever installs it | Ships as the initial values | `.env` |

### Organisation — ADMIN, in Settings › Organisation

| Setting | Default | Notes |
|---|---|---|
| Organisation name | — | Appears in the sidebar, emails, PDF payslips |
| Logo (light) | — | SVG or PNG, max 2 MB |
| Logo (dark) | — | Optional; falls back to the light logo |
| Icon mark | — | Square, for the collapsed sidebar and favicon |
| **Brand colour** | `#2563EB` | A single hex — the ramp is generated |
| Accent colour | derived | Optional secondary |
| Border radius style | Rounded | Sharp · Rounded · Extra rounded |
| Font pairing | Jakarta + Inter | Three approved pairings |
| Default theme | System | Light · Dark · System |
| Currency | PKR | ISO 4217 code |
| Date format | `DD MMM YYYY` | Three options |
| Number format | `1,234.56` | Locale-driven |
| First day of week | Monday | |
| Weekend days | Sat, Sun | Multi-select — Fri/Sat in much of the Middle East |
| Time zone | Asia/Karachi | IANA |
| Language | English | See §6 |

### User — in Settings › Appearance

| Setting | Options | Default |
|---|---|---|
| Theme | Light · Dark · System | System |
| Density | Comfortable · Compact | Comfortable |
| Sidebar | Expanded · Collapsed | Expanded |
| Reduce motion | On · Off | Follows the OS |
| Table rows per page | 10 · 20 · 50 · 100 | 20 |
| Landing page | Dashboard · any permitted page | Dashboard |

Organisation settings set the brand. User settings set comfort. A user can never
override the organisation's brand colour — that would defeat the point.

---

## 2. Generating a ramp from one hex

The admin picks one colour. The system derives all eleven steps, so a tenant
cannot produce an inconsistent palette.

```ts
// lib/generateBrandRamp.ts
import { formatHex, oklch, parse } from 'culori';

const LIGHTNESS = [0.97,0.93,0.87,0.79,0.71,0.64,0.57,0.50,0.43,0.37,0.28];
const CHROMA_SCALE = [0.18,0.38,0.60,0.82,0.95,1.00,1.00,0.93,0.82,0.70,0.52];
const STEPS = [50,100,200,300,400,500,600,700,800,900,950];

export function generateBrandRamp(hex: string) {
  const base = oklch(parse(hex));
  if (!base) throw new Error('Invalid colour');

  return Object.fromEntries(
    STEPS.map((step, i) => [
      step,
      formatHex({
        mode: 'oklch',
        l: LIGHTNESS[i],
        c: base.c * CHROMA_SCALE[i],
        h: base.h,
      }),
    ]),
  );
}
```

**OKLCH, not HSL.** In HSL, two colours at the same lightness value can differ
enormously in perceived brightness — `hsl(60 100% 50%)` yellow looks far lighter
than `hsl(240 100% 50%)` blue. OKLCH is perceptually uniform, so step 600 looks
like step 600 at every hue. This is the difference between a generated palette
that works and one that only works for blue.

### Validating the admin's choice

Not every colour can carry white text. Check before accepting.

```ts
export function validateBrandColour(hex: string): ValidationResult {
  const ramp = generateBrandRamp(hex);

  if (contrast(ramp[600], '#FFFFFF') < 4.5) {
    return { ok: false,
      message: 'This colour is too light for white button text.',
      suggestion: ramp[700] };
  }
  if (oklch(parse(hex))!.c < 0.04) {
    return { ok: false,
      message: 'This colour is too desaturated to read as a brand colour.' };
  }
  return { ok: true, ramp };
}
```

Offer the nearest passing alternative rather than a bare rejection. An admin who
pastes their brand yellow should be told "we darkened it for contrast", not
"invalid".

### Applying at runtime

```ts
export function applyBrandRamp(ramp: Record<number, string>) {
  const root = document.documentElement;
  for (const [step, hex] of Object.entries(ramp)) {
    root.style.setProperty(`--brand-${step}`, hex);
  }
}
```

That is the whole mechanism. Eleven CSS variables change and every button, link,
active nav pill, focus ring, chart primary and progress bar follows — because
none of them ever named a hex.

**Apply before first paint**, inlined in `index.html`, or the user sees the
default blue flash to the tenant's colour on every load.

---

## 3. Preset themes

Most admins do not want a colour picker; they want to pick one. Offer six
validated presets and hide the custom picker behind "Custom".

| Preset | Brand-600 | Character |
|---|---|---|
| **Azure** *(default)* | `#2563EB` | Trust, clarity |
| Indigo | `#4F46E5` | Modern, technical |
| Emerald | `#059669` | Growth, calm |
| Violet | `#7C3AED` | Creative |
| Slate | `#475569` | Understated, conservative |
| Amber | `#B45309` | Warm — pre-darkened to pass contrast |

Amber shows the mechanism working. A naive `#F59E0B` fails white-text contrast;
the preset is the validated step.

---

## 4. Radius and font as presets

```ts
const RADIUS_PRESETS = {
  sharp:  { xs:'2px', sm:'3px',  md:'4px',  lg:'6px',  xl:'8px',  '2xl':'10px' },
  rounded:{ xs:'4px', sm:'6px',  md:'8px',  lg:'12px', xl:'16px', '2xl':'20px' },
  extra:  { xs:'6px', sm:'10px', md:'14px', lg:'18px', xl:'24px', '2xl':'28px' },
};

const FONT_PRESETS = {
  modern:      { display:'Plus Jakarta Sans', sans:'Inter' },
  neutral:     { display:'Inter',             sans:'Inter' },
  professional:{ display:'Source Serif 4',    sans:'Source Sans 3' },
};
```

Three options each, not free choice. A tenant given an arbitrary font field will
pick Comic Sans, and a tenant given an arbitrary radius field will pick 40px and
make every button an oval. Constrained customisation is the difference between
white-labelling and vandalism.

---

## 5. Logo handling

| Asset | Format | Max | Displayed at |
|---|---|---|---|
| Wordmark (light) | SVG preferred, PNG @2x | 2 MB | 32px tall in the sidebar |
| Wordmark (dark) | SVG / PNG | 2 MB | Falls back to light |
| Icon mark | SVG / PNG, square | 500 KB | 32×32 collapsed sidebar, favicon |

Rules:

- Render in a fixed-height box with `object-fit: contain`. Never stretch.
- Clear space equal to the mark's height on all sides.
- If no dark logo is supplied, place the light one on a `neutral-0` rounded tile
  rather than inverting it. Inverting a multicolour logo destroys it.
- Strip any `width` and `height` attributes from an uploaded SVG so the viewBox
  scales.
- **Sanitise uploaded SVG.** An SVG can carry `<script>`. Run it through
  DOMPurify with `USE_PROFILES: { svg: true }` before it ever reaches the DOM.

---

## 6. Internationalisation

Not translated for this project, but the interface is built so it can be without
a rewrite. State this in your report — it is what "world-wide" actually requires.

| Requirement | How |
|---|---|
| No hardcoded strings | Every label from a `t()` lookup |
| Text expansion | German runs ~35% longer than English. Never fix a button's width to its English label |
| RTL | Use `ps-4` / `pe-4` logical properties, never `pl-4` / `pr-4`. Set `dir="rtl"` on `<html>` |
| Mirrored icons | Directional icons (`ArrowLeft`, `ChevronRight`) flip in RTL. Status icons do not |
| Dates | `Intl.DateTimeFormat` with the org's locale and time zone |
| Numbers | `Intl.NumberFormat` — decimal separators differ by locale |
| Currency | `Intl.NumberFormat(locale, { style:'currency', currency: org.currency })` |
| Names | One `full_name` field is safer than first/last for many cultures |
| Weekend | Configurable — Fri/Sat in much of the Middle East |

Using Tailwind's logical properties from day one costs nothing now and saves a
full CSS audit later.

---

## 7. Data model

```sql
organisation_settings
  id, name, logo_light_url, logo_dark_url, icon_url,
  brand_color, radius_preset, font_preset, default_theme,
  currency, date_format, first_day_of_week, weekend_days,
  timezone, locale, updated_by, updated_at

user_preferences
  user_id PK, theme, density, sidebar_collapsed,
  reduce_motion, rows_per_page, landing_page, updated_at
```

Both are single-row-per-scope. No versioning, no history — a settings change is
not an auditable HR action, though *who* changed the branding is worth an audit
row.

---

## 8. Loading order

```
1. index.html inline script
   → read cached org branding + user theme from localStorage
   → set --brand-* and the .dark class BEFORE first paint
2. React mounts with correct colours, no flash
3. GET /settings/organisation and /settings/preferences
4. If changed, re-apply and re-cache
```

Step 1 is what prevents the flash. A product that blinks from default blue to
the tenant's colour on every page load does not look like a product they own.

---

## 9. Enterprise extras

Out of scope for this project; listed because "used by big companies" implies
them and a good report names what it deliberately left out.

| Capability | Note |
|---|---|
| Multi-tenancy | One deployment, many organisations. A `tenant_id` on every table |
| SSO / SAML / OIDC | Enterprises will not create passwords in your system |
| SCIM provisioning | Employees created and deactivated from the identity provider |
| Custom domain | `hr.acme.com` with per-tenant TLS |
| Custom fields | Tenant-defined employee attributes |
| Approval chains | Multi-level approval rather than single-step HR |
| Data residency | EU tenant data staying in the EU |
| Export / deletion | GDPR subject access and right to erasure |

---

## Review checklist

- [ ] No component references a raw hex, px radius or font family
- [ ] Changing `--brand-600` re-skins the whole app with no code change
- [ ] The ramp generator uses OKLCH, not HSL
- [ ] A brand colour failing contrast is rejected with a suggested alternative
- [ ] Branding applies before first paint — no colour flash
- [ ] Radius and font are constrained presets, not free input
- [ ] Logos scale with `object-fit: contain` and are never stretched
- [ ] Uploaded SVGs are sanitised
- [ ] Layout uses logical properties (`ps`/`pe`), not `pl`/`pr`
- [ ] Dates, numbers and currency go through `Intl`
- [ ] Weekend days and time zone are configurable, not hardcoded
- [ ] User preferences never override organisation branding
