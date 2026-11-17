# UI tokens

Written by `/prd design`. The single source of colours, type, spacing, radius, shadows and motion for agents.
Components use these tokens only, never raw values (`#7a5230`, `13px`, `rounded-[7px]`).

- **Source in code:** <fill> (e.g. `src/styles/globals.css` CSS variables, `tailwind.config.ts` theme, theme file).
- **Light / dark:** <fill> (how the theme switches, e.g. `next-themes` class on `<html>`).

## Colours (by purpose, not by hue)

| Token | Purpose | Never for |
|---|---|---|
| <fill> (e.g. `--primary`) | main action, active state | decoration, text on a light ground |
| <fill> (e.g. `--destructive`) | errors and destructive actions only | warnings, emphasis |

## Type, spacing, radius, shadow, motion

- Type scale: <fill> (sizes and weights in use; one heading scale).
- Spacing scale: <fill> (only these steps for margins, gaps and padding).
- Radius family: <fill> (one family; which element uses which step).
- Shadows / elevation: <fill>.
- Motion: <fill> (durations and easing for hover, press, open and close).

Last changed by: <change ID or /prd design>.
