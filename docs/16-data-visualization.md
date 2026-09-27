# 16 — Data Visualization

Chart rules for the dashboard and reports. The palettes below were generated
against a contrast and colour-vision-deficiency validator — **they are not a
matter of taste and must not be edited by eye.**

---

## 1. Pick the form before the colour

Most bad charts start with colour. Start with the data's job.

| The data's job | Form |
|---|---|
| One headline number | **Stat tile — not a chart** |
| Change over time | Line (multi-point) · Bar (few periods) |
| Compare categories | Horizontal bar, sorted by value |
| Part of a whole | Donut — **only at 2–5 slices**, else a bar |
| Composition over time | Stacked bar |
| Distribution | Histogram |
| Two measures related | Scatter |
| Density over a grid | Heatmap — the attendance calendar |

**One number is not a chart.** "142 present today" is a stat tile. A donut
showing 94% vs 6% is worse than the text "94%".

### The charts this product needs

| Where | Chart | Series |
|---|---|---|
| Dashboard | Attendance trend, 6 months | 1 |
| Dashboard | Attendance by department | 1 |
| Reports · Attendance | Status distribution | 4 |
| Reports · Leave | Days by leave type | 4 |
| Reports · Leave | Leave taken per month | 1–2 |
| Reports · Payroll | Cost composition per month | 4, stacked |
| Reports · Dues | Outstanding by ageing bucket | 1 |

Nothing here needs more than four series. That is a good sign.

---

## 2. Colour by job

Four jobs, four rules. Never mix them.

| Job | Rule |
|---|---|
| **Categorical** — identity (leave types, departments) | Fixed hue order, never cycled |
| **Sequential** — magnitude (heatmap density) | One hue, light → dark |
| **Diverging** — polarity (above/below target) | Two hues + a **neutral grey** midpoint |
| **Status** — state | Reserved semantic colours, never a series |

### Categorical — validated

Assign in this order. Series 1 always gets slot 1, whatever the chart.

| Slot | Light (on `#FFFFFF`) | Dark (on `#131C2E`) | Typical use |
|---|---|---|---|
| 1 | `#2563EB` | `#3B82F6` | Primary series — brand |
| 2 | `#D97706` | `#CC7A06` | |
| 3 | `#0D9488` | `#12A594` | |
| 4 | `#7C3AED` | `#9061F9` | |
| 5 | `#E11D48` | `#F04F6B` | |
| 6 | `#0891B2` | `#0EA5C4` | |
| 7 | `#4D7C0F` | `#74A017` | |
| 8 | `#C026D3` | `#D14FE0` | |

Both sets pass all five checks — lightness band, chroma floor, CVD separation
(worst adjacent pair ΔE 12.5 light / 14.2 dark), normal-vision separation, and
3:1 contrast against their surface.

**Rules that keep them valid:**

- **Never cycle.** A ninth series is not a generated hue. Fold the tail into
  "Other", or split into small multiples.
- **Colour follows the entity, not its rank.** If a filter removes "Sales", the
  remaining departments keep their colours. Repainting survivors destroys the
  reader's memory of what blue meant.
- **Never eyeball an edit.** Changing one hex invalidates the CVD separation of
  both its neighbours.

Dark mode is a **selected** set, not an automatic lightening. Slots 2 and 7 are
deliberately darker than a naive lift would give, because amber and lime run
past the dark-mode lightness band.

### Sequential — validated

One hue, light to dark. For the attendance heatmap and density maps.

| Step | Light | Dark |
|---|---|---|
| 1 (lowest) | `#8FB6FC` | `#2A55C4` |
| 2 | `#5A93F8` | `#3475EE` |
| 3 | `#2563EB` | `#5C9BF9` |
| 4 | `#1B4BC4` | `#8FB8FD` |
| 5 (highest) | `#17357A` | `#CBE0FE` |

Note the direction flips. On a light surface, more = darker. On a dark surface,
more = lighter. Both ramps are monotone in lightness with adequate step
separation, and both keep their pale end readable against the surface.

Never a rainbow ramp. Viridis and its relatives exist because rainbow ramps
create false boundaries at hue transitions.

### Diverging

For "above or below target" — attendance against the 80% threshold.

| Pole | Light | Dark |
|---|---|---|
| Negative (below target) | `#E11D48` | `#F04F6B` |
| **Midpoint** | **`#94A3BC`** | **`#64748B`** |
| Positive (above target) | `#0D9488` | `#12A594` |

**The midpoint is grey.** A hue at the centre of a diverging scale reads as a
third category and destroys the polarity.

### Status — reserved

`success` / `warning` / `danger` / `info` mean state. They are never "series 4".
When a chart genuinely encodes status — the attendance distribution — it uses
them and takes no categorical slots.

| Status | Light | Dark |
|---|---|---|
| Present | `#059669` | `#10B981` |
| Late | `#D97706` | `#F59E0B` |
| Absent | `#DC2626` | `#EF4444` |
| On leave | `#0891B2` | `#06B6D4` |

---

## 3. Marks and anatomy

| Element | Spec |
|---|---|
| Line | 2px, round cap and join. Never dashed for a primary series |
| Line point | Hidden at rest; 8px on hover with a 2px surface ring |
| Bar | 4px rounded on the data end only; the baseline end stays square |
| Bar width | 60% of the band; 2px gap between adjacent bars |
| Stacked segment | 2px surface-coloured gap between segments |
| Area fill | Series colour at 12% opacity, or a gradient to 0% |
| Donut | 60% inner radius, 2px surface gap between arcs |
| Heatmap cell | 2px gap, `radius-xs` |

**The 2px surface-coloured gap between fills is the detail that reads as
expensive.** Segments that touch merge visually; a hairline of page colour
between them keeps each one distinct.

### Axes and grid

| Element | Spec |
|---|---|
| Grid lines | 1px `border-subtle`, **horizontal only** |
| Axis line | None — the grid is enough |
| Tick labels | `caption` (12px), `text-tertiary`, tabular for numbers |
| Axis title | Omit when the unit is obvious from the labels |
| Y start | **Zero for bars, always.** Free for lines |

A truncated bar axis exaggerates differences and is the most common way charts
mislead. Lines may start off zero — they encode change, not magnitude.

**One y-axis.** Never a dual-axis chart. Two measures of different scale become
two charts or one indexed chart. This is the single most common serious charting
error.

### Labels

- Direct-label the series **when there are two to four**. Place the label at the
  line's end in the series colour.
- Never put a value on every point. Label the max, the min and the latest.
- Text always wears text tokens — `text-secondary` or `text-tertiary`, never the
  series colour. A coloured mark beside the label carries the identity.

### Legend

- **Two or more series: a legend is always present.** One series needs none —
  the chart title names it.
- Top-left, above the plot, horizontal, 16px gap. 10px round swatch, 6px gap,
  `body-sm` `text-secondary`.
- Clicking a legend entry toggles that series; toggled-off drops to 30% opacity
  and the others keep their colours.

---

## 4. Interaction

An HTML chart is interactive by default. Ship the hover layer.

| Form | Hover behaviour |
|---|---|
| Line / area | Vertical crosshair + tooltip with **all** series at that x |
| Bar | Per-bar tooltip; the hovered bar keeps full opacity, others drop to 60% |
| Donut | Arc lifts 4px outward; centre shows that slice's value |
| Heatmap | Cell gets a 2px `brand-600` ring; tooltip with date and value |

Tooltip: `surface-overlay`, `radius-md`, `shadow-lg`, 12px padding. The x value
as a `body-sm` 600 header, then a swatch + name + right-aligned tabular value per
row. Follows the cursor with an 8px offset and flips near the viewport edge.

Hit targets must be larger than the marks — a 2px line needs roughly 20px of
hover band.

Filters go in **one row above the charts**, never repeated per card.

---

## 5. Implementation

Recharts. It does not read CSS variables, so resolve them at render and remount
on theme change.

```ts
// lib/chartTheme.ts
const CATEGORICAL = {
  light: ['#2563EB','#D97706','#0D9488','#7C3AED','#E11D48','#0891B2','#4D7C0F','#C026D3'],
  dark:  ['#3B82F6','#CC7A06','#12A594','#9061F9','#F04F6B','#0EA5C4','#74A017','#D14FE0'],
};

const SEQUENTIAL = {
  light: ['#8FB6FC','#5A93F8','#2563EB','#1B4BC4','#17357A'],
  dark:  ['#2A55C4','#3475EE','#5C9BF9','#8FB8FD','#CBE0FE'],
};

function cssVar(name: string) {
  return `hsl(${getComputedStyle(document.documentElement)
    .getPropertyValue(name).trim()})`;
}

export function useChartTheme() {
  const { resolvedTheme } = useTheme();
  return useMemo(() => ({
    key: resolvedTheme,                       // use as the chart's React key
    categorical: CATEGORICAL[resolvedTheme],
    sequential:  SEQUENTIAL[resolvedTheme],
    grid:    cssVar('--border-subtle'),
    axis:    cssVar('--text-tertiary'),
    surface: cssVar('--surface-raised'),
  }), [resolvedTheme]);
}
```

```tsx
const t = useChartTheme();

<ResponsiveContainer key={t.key} width="100%" height={280}>
  <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
    <CartesianGrid stroke={t.grid} vertical={false} />
    <XAxis dataKey="month" stroke={t.axis} tickLine={false} axisLine={false}
           tick={{ fontSize: 12 }} />
    <YAxis stroke={t.axis} tickLine={false} axisLine={false}
           tick={{ fontSize: 12 }} width={44} />
    <Tooltip content={<ChartTooltip />} cursor={{ stroke: t.grid }} />
    <Line type="monotone" dataKey="attendance"
          stroke={t.categorical[0]} strokeWidth={2}
          dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: t.surface }} />
  </LineChart>
</ResponsiveContainer>
```

The `key={t.key}` remounts the chart on theme change so the resolved colours are
re-read. Without it, a chart rendered in light mode keeps light colours on a dark
surface.

Heights: 240px compact, **280px default**, 360px for a full-width report chart.

---

## 6. Accessibility

- **Never colour alone.** Two or more series always carry a legend; two to four
  are also direct-labelled.
- **A table view exists** for every chart — a "View as table" toggle. This serves
  screen readers, and it is also what a manager wants when they need the exact
  number.
- **Dark mode is validated separately**, not flipped.
- **Pattern fills** available for the print and forced-colours case: 45° and 135°
  diagonal hatching on top of the fill.
- `<title>` and `<desc>` on the SVG, and `role="img"` with an `aria-label`
  summarising the trend in a sentence.

---

## 7. Anti-patterns

If a chart matches one of these, it is wrong.

| Anti-pattern | Instead |
|---|---|
| Dual y-axes | Two charts, or index to a common base |
| Truncated bar axis | Start bars at zero |
| Pie with 8 slices | Horizontal bar, sorted |
| 3D anything | Never |
| Rainbow sequential ramp | Single-hue ramp |
| Hue at the diverging midpoint | Neutral grey |
| Value printed on every point | Label max, min, latest |
| Cycled categorical palette | Cap at 8, fold the rest into "Other" |
| Colour repainted when a filter changes the series count | Bind colour to the entity |
| Status colour used as series 4 | Take the next categorical slot |
| Spinner while a chart loads | Chart-shaped skeleton |
| Label text in the series colour | Text tokens |

---

## Review checklist

- [ ] The form matches the data's job — and it is not a stat tile in disguise
- [ ] Categorical hues assigned in fixed order, never cycled
- [ ] Colour bound to the entity, not to rank
- [ ] Sequential is single-hue; diverging has a grey midpoint
- [ ] Status colours are not used as series
- [ ] One y-axis. Bars start at zero
- [ ] Grid is horizontal only, 1px, `border-subtle`
- [ ] Legend present for ≥ 2 series; direct labels at 2–4
- [ ] Hover tooltip on every chart
- [ ] 2px surface gap between adjacent and stacked fills
- [ ] Dark palette used on dark, chart remounts on theme change
- [ ] "View as table" available
- [ ] Rendered and eyeballed for label collisions before merge
