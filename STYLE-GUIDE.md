
# Style Transfer Spec — "Structural Grid" / devn. aesthetic

A complete, self-contained specification for recreating this visual system in another project.
Everything below is extracted from a working Next.js 16 + Tailwind v4 codebase. Numbers are exact,
not approximations. Copy the CSS blocks verbatim.

**Target stack assumption:** Next.js App Router + React 19 + Tailwind CSS v4 (CSS-first config, no
`tailwind.config.js`). If the destination project is on Tailwind v3, see [§16 Porting to Tailwind v3](#16-porting-to-tailwind-v3).

---

## Table of contents

1. [Design thesis — what makes this look the way it does](#1-design-thesis)
2. [Dependencies & setup](#2-dependencies--setup)
3. [`globals.css` — copy verbatim](#3-globalscss--copy-verbatim)
4. [`typeset.css` — copy verbatim](#4-typesetcss--copy-verbatim)
5. [Color system](#5-color-system)
6. [Radius system](#6-radius-system)
7. [Typography](#7-typography)
8. [Layout, margins & vertical rhythm](#8-layout-margins--vertical-rhythm)
9. [Root layout — copy the structure](#9-root-layout--copy-the-structure)
10. [Header & footer](#10-header--footer)
11. [Component recipes (exact class strings)](#11-component-recipes)
12. [Motion system](#12-motion-system)
13. [Interaction & state conventions](#13-interaction--state-conventions)
14. [Long-form article / MDX styling](#14-long-form-article--mdx-styling)
15. [Accessibility conventions baked into the style](#15-accessibility-conventions)
16. [Porting to Tailwind v3](#16-porting-to-tailwind-v3)
17. [Gotchas & anti-patterns](#17-gotchas--anti-patterns)
18. [Build order & verification checklist](#18-build-order--verification-checklist)

---

## 1. Design thesis

Read this first. Every rule below follows from these five ideas.

1. **Single narrow column, no sidebars.** The entire site lives in one `max-w-3xl` (768px) centered
   column with `px-6` gutters. Effective content width is **720px**. There is no wide/full-bleed
   layout anywhere. Nothing is centered vertically; content is top-anchored with a soft inset.

2. **Warm near-monochrome.** There is no brand accent color. The whole palette is one hue
   (`--neutral-hue: 98`, a warm stone/greige) at very low chroma (0.003–0.014). The only saturated
   color in the system is `--destructive` (red, hue 12). Emphasis is created by
   **lightness contrast**, not by color.

3. **Muted-by-default, foreground-on-hover.** Almost all secondary text and every icon starts at
   `text-muted-foreground` and resolves to `text-foreground` on hover. This single idiom carries
   nearly all interactive feedback. Learn it; it appears ~40 times.

4. **Borders and hairlines instead of shadows.** Structure comes from 1px borders at 12% opacity
   and `divide-y divide-border/60` separators. Shadows are used sparingly and only on cards
   (`shadow-sm` → `shadow-md` on hover). Grids are drawn by putting `border-l border-t` on the
   container and `border-r border-b` on each cell — a border-collapse trick that yields perfect
   1px hairlines with no doubling.

5. **Concentric radii.** Cards are a frame inside a frame: outer `rounded-2xl` + `p-1` → inner
   `rounded-xl`. The radius scale is derived from a single `--radius: 0.5rem` via multipliers, so
   the whole system rescales from one value.

Overall read: quiet, editorial, dense-but-airy, dark-mode-first developer portfolio. Closer to a
well-typeset document than to a marketing page.

---

## 2. Dependencies & setup

### Exact production dependencies that affect styling

```json
{
  "dependencies": {
    "@base-ui/react": "^1.6.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^1.25.0",
    "motion": "^12.42.2",
    "next-themes": "^0.4.6",
    "shadcn": "^4.13.1",
    "tailwind-merge": "^3.6.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.3.3",
    "tailwindcss": "^4.3.3",
    "tw-animate-css": "^1.4.0"
  }
}
```

Notes on non-obvious ones:

- **`shadcn` is a runtime dependency, not just a CLI.** `globals.css` does
  `@import "shadcn/tailwind.css"`. Without this the base layer and several utilities are missing.
  Install it as a regular dependency.
- **`tw-animate-css`** supplies `animate-in`, `fade-in-0`, `zoom-in-95`, `slide-in-from-top-2`,
  `fill-mode-both`, etc. used by tooltips and toasts. Tailwind v4 does not ship these.
- **`@base-ui/react`** is the headless primitive library (Base UI, the successor to Radix used by
  shadcn's newer registry). Button, Tooltip, Avatar and Toast are built on it. If the destination
  project uses Radix instead, the *classes* below still apply unchanged — only the wrappers differ.
- **`motion`** (Framer Motion v12, imported as `motion/react`) drives the expandable sections and
  the floating table-of-contents.
- **No `tailwindcss-animate`**, no `@tailwindcss/typography`. Prose styling is hand-rolled
  (see §4).

### PostCSS config

`postcss.config.mjs`:

```js
const config = {
  plugins: ["@tailwindcss/postcss"],
};

export default config;
```

### shadcn config

`components.json` — matters only if the destination project pulls more shadcn components; it
determines that new components inherit this same look.

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "base-luma",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "rtl": false,
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "menuColor": "default",
  "menuAccent": "subtle",
  "registries": {}
}
```

### The `cn` helper

`src/lib/utils.ts` — required by every component below.

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### Formatter settings (for visual consistency of the source itself)

Biome, `lineWidth: 100`, 2-space indent, double quotes, semicolons always, `trailingCommas: "es5"`.
Not required, but the class strings below are wrapped assuming a 100-column limit.

---

## 3. `globals.css` — copy verbatim

This is the entire foundation. Place at `src/app/globals.css` and import it first in the root
layout. Do not reorder the `@import` statements — `tailwindcss` must come first, and `typeset.css`
must come after `shadcn/tailwind.css` so its `@layer components` rules land correctly.

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "./typeset.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-space-grotesk);
  --font-mono: var(--font-jetbrains-mono);
  --font-heading: var(--font-sans);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --color-code: var(--code);
  --color-code-foreground: var(--code-foreground);
  --color-code-highlight: var(--code-highlight);
  --color-code-number: var(--code-number);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-4xl: calc(var(--radius) * 2.6);
}

:root {
  --neutral-hue: 98;
  --radius: 0.5rem;
  --background: oklch(0.958 0.005 var(--neutral-hue));
  --foreground: oklch(0.263 0.013 var(--neutral-hue));
  --card: oklch(0.985 0.003 var(--neutral-hue));
  --card-foreground: oklch(0.263 0.013 var(--neutral-hue));
  --popover: oklch(0.985 0.003 var(--neutral-hue));
  --popover-foreground: oklch(0.263 0.013 var(--neutral-hue));
  --primary: oklch(0.263 0.013 var(--neutral-hue));
  --primary-foreground: oklch(0.985 0.003 var(--neutral-hue));
  --secondary: oklch(0.921 0.007 var(--neutral-hue));
  --secondary-foreground: oklch(0.263 0.013 var(--neutral-hue));
  --muted: oklch(0.936 0.007 var(--neutral-hue));
  --muted-foreground: oklch(0.5 0.012 var(--neutral-hue));
  --accent: oklch(0.936 0.007 var(--neutral-hue));
  --accent-foreground: oklch(0.263 0.013 var(--neutral-hue));
  --destructive: oklch(0.55 0.18 12);
  --border: oklch(0.263 0.013 var(--neutral-hue) / 0.12);
  --input: oklch(0.263 0.013 var(--neutral-hue) / 0.14);
  --ring: oklch(0.45 0.02 var(--neutral-hue));
  --code: var(--card);
  --code-foreground: var(--card-foreground);
  --code-highlight: oklch(0.94 0.006 var(--neutral-hue));
  --code-number: oklch(0.52 0.012 var(--neutral-hue));
}

.dark {
  --background: oklch(0.18 0.01 var(--neutral-hue));
  --foreground: oklch(0.94 0.006 var(--neutral-hue));
  --card: oklch(0.22 0.012 var(--neutral-hue));
  --card-foreground: oklch(0.94 0.006 var(--neutral-hue));
  --popover: oklch(0.22 0.012 var(--neutral-hue));
  --popover-foreground: oklch(0.94 0.006 var(--neutral-hue));
  --primary: oklch(0.94 0.006 var(--neutral-hue));
  --primary-foreground: oklch(0.22 0.012 var(--neutral-hue));
  --secondary: oklch(0.28 0.012 var(--neutral-hue));
  --secondary-foreground: oklch(0.94 0.006 var(--neutral-hue));
  --muted: oklch(0.28 0.012 var(--neutral-hue));
  --muted-foreground: oklch(0.72 0.01 var(--neutral-hue));
  --accent: oklch(0.28 0.012 var(--neutral-hue));
  --accent-foreground: oklch(0.94 0.006 var(--neutral-hue));
  --destructive: oklch(0.68 0.16 12);
  --border: oklch(0.94 0.006 var(--neutral-hue) / 0.12);
  --input: oklch(0.94 0.006 var(--neutral-hue) / 0.15);
  --ring: oklch(0.65 0.015 var(--neutral-hue));
  --code: var(--card);
  --code-foreground: var(--card-foreground);
  --code-highlight: oklch(0.26 0.012 var(--neutral-hue));
  --code-number: oklch(0.65 0.01 var(--neutral-hue));
}

@utility no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

@layer base {
  * {
    @apply border-border outline-ring/50;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in oklch, var(--foreground) 35%, transparent) transparent;
  }

  *::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  *::-webkit-scrollbar-thumb {
    background: color-mix(in oklch, var(--foreground) 35%, transparent);
    border-radius: 10px;
    border: 2px solid transparent;
    background-clip: padding-box;
  }

  *::-webkit-scrollbar-thumb:hover {
    background: color-mix(in oklch, var(--foreground) 50%, transparent);
    background-clip: padding-box;
  }

  html {
    @apply min-h-full bg-background font-sans antialiased;
    font-synthesis: none;
  }

  body {
    @apply min-h-full bg-background text-foreground;
  }

  ::selection {
    background-color: color-mix(in oklch, var(--muted-foreground) 28%, transparent);
    color: var(--foreground);
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
}

@layer components {
  [data-rehype-pretty-code-figure] {
    background-color: var(--color-code);
    color: var(--color-code-foreground);
    border-radius: var(--radius-xl);
    margin-top: calc(var(--spacing) * 6);
    overflow: hidden;
    font-size: var(--text-sm);
    outline: none;
    position: relative;
    margin-inline: calc(var(--spacing) * -1);
  }

  [data-rehype-pretty-code-figure] code,
  [data-rehype-pretty-code-figure] code span {
    font-variant-ligatures: none;
    font-feature-settings:
      "liga" 0,
      "calt" 0;
  }

  [data-line-numbers] {
    display: grid;
    min-width: 100%;
    white-space: pre;
    border: 0;
    background: transparent;
    padding: 0;
    counter-reset: line;
    box-decoration-break: clone;
  }

  [data-line-numbers] [data-line]::before {
    font-size: var(--text-sm);
    counter-increment: line;
    content: counter(line);
    display: inline-block;
    width: calc(var(--spacing) * 16);
    padding-right: calc(var(--spacing) * 6);
    text-align: right;
    color: var(--color-code-number);
    background-color: var(--color-code);
    position: sticky;
    left: 0;
  }

  [data-line-numbers] [data-highlighted-line][data-line]::before {
    background-color: var(--color-code-highlight);
  }

  [data-line] {
    padding-top: calc(var(--spacing) * 0.25);
    padding-bottom: calc(var(--spacing) * 0.25);
    min-height: calc(var(--spacing) * 0.875);
    width: 100%;
    display: inline-block;
  }

  [data-rehype-pretty-code-figure] [data-line] span {
    color: var(--shiki-light);
  }

  .dark [data-rehype-pretty-code-figure] [data-line] span {
    color: var(--shiki-dark) !important;
  }

  [data-highlighted-line],
  [data-highlighted-chars] {
    position: relative;
    background-color: var(--color-code-highlight);
  }

  [data-highlighted-line]::after {
    position: absolute;
    top: 0;
    left: 0;
    width: 2px;
    height: 100%;
    content: "";
    background-color: color-mix(in oklch, var(--muted-foreground) 50%, transparent);
  }

  [data-highlighted-chars] {
    border-radius: var(--radius-sm);
    padding-inline: 0.3rem;
    padding-block: 0.1rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
  }
}
```

### What each block does

| Block | Purpose |
|---|---|
| `@custom-variant dark` | Enables `dark:` variants driven by a `.dark` class on `<html>` (class strategy, required by `next-themes` with `attribute="class"`). |
| `@theme inline` | Maps the raw CSS variables into Tailwind's color/font/radius namespaces so `bg-background`, `text-code-number`, `rounded-4xl` etc. exist. `inline` keeps them as `var()` references so theme switching works without recompiling. |
| `:root` / `.dark` | The actual token values. Only place colors are defined. |
| `@utility no-scrollbar` | Hides scrollbars while keeping scroll. Used on horizontally-scrolling code blocks and tables. |
| `@layer base` | Global resets: universal `border-border` (so any `border` class works without specifying a color), custom thin scrollbars, `font-synthesis: none` (prevents fake bold/italic — important with Space Grotesk), tinted `::selection`, and a global reduced-motion kill switch. |
| `@layer components` | All the syntax-highlighting chrome for `rehype-pretty-code`. Only needed if the destination project renders code blocks. |

---

## 4. `typeset.css` — copy verbatim

This is `shadcn/typeset` (see <https://ui.shadcn.com/docs/typeset>) — a hand-rolled replacement for
`@tailwindcss/typography`. It is applied by adding `class="typeset"` to a container; everything
inside is styled. Place at `src/app/typeset.css`.

You can alternatively fetch it fresh with the shadcn CLI, but the version below is what this design
is tuned against — including the project-specific `.typeset-article` preset at the top.

```css
/*
 * shadcn/typeset
 * https://ui.shadcn.com/docs/typeset.
 */

@layer components {
  .typeset {
    --typeset-font-body: inherit;
    --typeset-font-heading: var(--font-heading);
    --typeset-font-mono: var(--font-mono);
    --typeset-size: 1em;
    --typeset-leading: 1.75;
    --typeset-flow: 1.25em;
  }

  /* Long-form reading preset (blog articles). */
  .typeset-article {
    --typeset-size: 1.0625rem;
    --typeset-leading: 1.7;
    --typeset-flow: 1.4em;
  }

  .dark .typeset-article {
    --typeset-leading: 1.85;
  }
}

@layer components {
  .typeset {
    font-family: var(--typeset-font-body);
    font-size: calc(var(--typeset-size) * 1.125);
    line-height: var(--typeset-leading);
    color: var(--color-foreground, currentColor);
    overflow-wrap: break-word;
    margin-trim: block-start;

    @media (min-width: 48rem), print {
      font-size: var(--typeset-size);
    }

    --typeset-muted: var(
      --color-muted-foreground,
      color-mix(in oklab, currentColor 60%, transparent)
    );
    --typeset-rule: var(--color-border, color-mix(in oklab, currentColor 20%, transparent));
  }

  .typeset *:not(:where(.not-typeset, [data-not-typeset], .not-typeset *, [data-not-typeset] *)) {
    /* Paragraphs. */
    &:where(p) {
      margin-block-start: var(--typeset-flow);
      margin-block-end: 0;
      text-wrap: pretty;
    }

    /* Headings. */
    &:where(h1, h2, h3, h4, h5, h6) {
      color: var(--color-foreground, currentColor);
      font-family: var(--typeset-font-heading);
      font-weight: 600;
      margin-block-end: 0;
      text-wrap: balance;
    }
    &:where(h1) {
      font-size: 1.75em;
      line-height: 1.25;
      letter-spacing: -0.02em;
      margin-block-start: var(--typeset-flow);
    }
    &:where(h2) {
      font-size: 1.25em;
      line-height: 1.3;
      letter-spacing: -0.015em;
      margin-block-start: calc(var(--typeset-flow) * 1.4);
    }
    &:where(h3) {
      font-size: 1.125em;
      line-height: 1.35;
      margin-block-start: var(--typeset-flow);
    }
    &:where(h4) {
      font-size: 1em;
      line-height: 1.5;
      margin-block-start: var(--typeset-flow);
    }
    &:where(h5) {
      font-size: 0.875em;
      line-height: 1.5;
      font-weight: 500;
      color: var(--typeset-muted);
      margin-block-start: calc(var(--typeset-flow) / 0.875);
    }
    &:where(h6) {
      font-size: 0.8125em;
      line-height: 1.5;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--typeset-muted);
      margin-block-start: calc(var(--typeset-flow) / 0.8125);
    }
    /* Anchors. */
    &:where([id]) {
      scroll-margin-block-start: var(--typeset-flow);
    }

    /* Headings own the space below them. */
    &:where(h1 + *, h2 + *, h3 + *, h4 + *, h5 + *, h6 + *) {
      margin-block-start: 1em;
    }
    &:where(:is(h1, h2, h3, h4) :is(code)) {
      font-size: 0.9em;
    }

    /* Links. */
    &:where(a) {
      color: var(--color-foreground, currentColor);
      font-weight: 500;
      text-decoration-line: underline;
      text-decoration-thickness: from-font;
      text-underline-position: from-font;
      text-underline-offset: 0.12em;
      text-decoration-skip-ink: auto;
      text-decoration-color: color-mix(in oklab, currentColor 55%, transparent);
      transition: text-decoration-color 150ms ease-out;
    }
    &:where(a:hover) {
      text-decoration-color: currentColor;
    }
    &:where(a:focus-visible) {
      outline: 2px solid var(--color-ring, currentColor);
      outline-offset: 2px;
      border-radius: 0.125em;
    }
    &:where(:is(h1, h2, h3, h4, h5, h6) :is(a)) {
      font-weight: inherit;
    }

    /* Inline semantics. */
    &:where(strong, b) {
      font-weight: 600;
    }
    &:where(:is(h1, h2, h3, h4) :is(strong, b)) {
      font-weight: 600;
    }
    &:where(mark) {
      background-color: color-mix(in oklch, var(--muted) 70%, var(--foreground));
      color: inherit;
      padding: 0.05em 0.15em;
      border-radius: 0.2em;
    }
    &:where(abbr[title]) {
      text-decoration-line: underline;
      text-decoration-style: dotted;
      text-underline-offset: 0.2em;
      cursor: help;
    }
    &:where(del, s) {
      color: var(--typeset-muted);
      text-decoration-line: line-through;
    }
    &:where(sup, sub) {
      font-size: 0.75em;
      line-height: 0;
      position: relative;
      vertical-align: baseline;
    }
    &:where(sup) {
      top: -0.5em;
    }
    &:where(sub) {
      bottom: -0.25em;
    }
    &:where(sup a) {
      text-decoration-line: none;
      font-weight: 500;
    }

    /* Lists. */
    &:where(ul) {
      list-style-type: disc;
    }
    &:where(ol) {
      list-style-type: decimal;
    }
    &:where(ul ul) {
      list-style-type: circle;
    }
    &:where(ul ul ul) {
      list-style-type: square;
    }
    &:where(ol[type="a" i]) {
      list-style-type: lower-alpha;
    }
    &:where(ol[type="i" i]) {
      list-style-type: lower-roman;
    }
    &:where(ol[type="A" s]) {
      list-style-type: upper-alpha;
    }
    &:where(ol[type="I" s]) {
      list-style-type: upper-roman;
    }
    &:where(ul, ol) {
      margin-block-start: var(--typeset-flow);
      margin-block-end: 0;
      padding-inline-start: 1.5em;
    }
    &:where(li) {
      margin-block-start: 0.5em;
      padding-inline-start: 0.4em;
    }
    &:where(li > p, li > ul, li > ol) {
      margin-block-start: 0.5em;
    }
    &:where(ul > li)::marker {
      color: var(--typeset-muted);
    }
    &:where(ol > li)::marker {
      color: var(--typeset-muted);
    }

    /* GFM task lists. */
    &:where(ul.contains-task-list) {
      list-style-type: none;
      padding-inline-start: 0.25em;
    }
    &:where(li.task-list-item > input[type="checkbox"]) {
      margin-inline-end: 0.5em;
      vertical-align: -0.1em;
      accent-color: var(--color-primary, currentColor);
    }

    /* Disclosures. */
    &:where(details) {
      margin-block-start: var(--typeset-flow);
      margin-block-end: 0;
    }
    &:where(summary) {
      cursor: pointer;
      font-weight: 500;
    }
    &:where(summary)::marker {
      color: var(--typeset-muted);
    }

    /* Keyboard keys. */
    &:where(kbd) {
      font-family: inherit;
      font-size: 0.85em;
      font-weight: 500;
      border: 1px solid var(--typeset-rule);
      border-block-end-width: 2px;
      border-radius: min(calc(var(--radius, 0.5em) * 0.6), 0.35em);
      padding: 0.0625em 0.35em;
    }

    /* Definition lists. */
    &:where(dl) {
      margin-block-start: var(--typeset-flow);
      margin-block-end: 0;
    }
    &:where(dt) {
      font-weight: 500;
      margin-block-start: 1em;
    }
    &:where(dt + dt) {
      margin-block-start: 0.25em;
    }
    &:where(dd) {
      margin-block-start: 0.25em;
      margin-inline-start: 0;
      padding-inline-start: 1em;
      color: var(--typeset-muted);
    }

    /* Inline code. */
    &:where(:not(pre) > code) {
      background-color: var(--color-muted, color-mix(in oklab, currentColor 8%, transparent));
      font-family: var(--typeset-font-mono);
      font-size: 0.85em;
      border-radius: min(calc(var(--radius, 0.5em) * 0.6), 0.35em);
      padding: 0.125em 0.3em;
    }

    /* Code blocks. */
    &:where(pre) {
      background-color: var(--color-muted, color-mix(in oklab, currentColor 8%, transparent));
      font-family: var(--typeset-font-mono);
      font-size: 0.875em;
      line-height: 1.5;
      tab-size: 2;
      direction: ltr;
      border-radius: var(--radius, 0.5em);
      padding: 0.75em 1em;
      overflow-x: auto;
      margin-block-start: calc(var(--typeset-flow) / 0.875);
      margin-block-end: 0;
    }
    &:where(pre code) {
      background-color: transparent;
      font-family: inherit;
      font-size: inherit;
      padding: 0;
      border-radius: 0;
    }

    /* Blockquote. */
    &:where(blockquote) {
      border-inline-start: 2px solid var(--typeset-rule);
      padding-inline-start: 1em;
      margin-block-start: var(--typeset-flow);
      margin-block-end: 0;
      margin-inline: 0;
    }

    /* Dividers. */
    &:where(hr) {
      border: 0;
      border-block-start: 1px solid var(--typeset-rule);
      margin-block-start: calc(var(--typeset-flow) * 2.4);
      margin-block-end: 0;
    }
    &:where(hr + h1, hr + h2, hr + h3, hr + h4) {
      margin-block-start: var(--typeset-flow);
    }

    /* GFM footnotes. */
    &:where(.footnotes, [data-footnotes]) {
      margin-block-start: calc(var(--typeset-flow) * 2);
      border-block-start: 1px solid var(--typeset-rule);
      padding-block-start: var(--typeset-flow);
      font-size: 0.875em;
      color: var(--typeset-muted);
    }

    /* Math. */
    &:where(math[display="block"]) {
      margin-block-start: var(--typeset-flow);
      margin-block-end: 0;
      overflow-x: auto;
      overflow-y: hidden;
      padding-block: 0.25em;
    }

    /* Media. */
    &:where(img, video) {
      border-radius: var(--radius, 0.5em);
      max-width: 100%;
      height: auto;
      margin-block-start: var(--typeset-flow);
      margin-block-end: 0;
    }
    &:where(p img) {
      margin-block-start: 0;
    }
    &:where(figure) {
      margin-block-start: var(--typeset-flow);
      margin-block-end: 0;
      margin-inline: 0;
    }
    &:where(figcaption, caption) {
      color: var(--typeset-muted);
      font-size: 0.875em;
      text-align: center;
      margin-block-start: calc(0.75em / 0.875);
    }
    &:where(caption) {
      caption-side: bottom;
    }

    /* Tables. Separators sit on cells, not tr:last-child: append-safe.
       Bare tables stay real tables (keep their semantics) and wrap to fit. */
    &:where(table) {
      max-width: 100%;
      font-size: 1em;
      line-height: 1.5;
      font-variant-numeric: tabular-nums;
      border-collapse: separate;
      border-spacing: 0;
      border-block-end: 1px solid var(--typeset-rule);
      margin-block-start: var(--typeset-flow);
      margin-block-end: 0;
    }

    /* Horizontal scroll for any wide block. Wrap it and the wrapper owns the
       flow margin. Tables shrink to fit, so widen the table to make it scroll
       instead of compress. */
    &:where(.typeset-scroll) {
      overflow-x: auto;
      margin-block-start: var(--typeset-flow);
    }
    &:where(.typeset-scroll > *) {
      margin-block-start: 0;
    }
    &:where(.typeset-scroll table) {
      width: max-content;
      max-width: none;
    }
    &:where(thead th) {
      font-weight: 500;
      text-align: start;
      white-space: nowrap;
      padding: 0.65em 1em;
    }
    &:where(:is(tbody, tfoot) :is(td, th)) {
      padding: 0.75em 1em;
      text-align: start;
      vertical-align: top;
      border-block-start: 1px solid var(--typeset-rule);
    }
    &:where(tbody th, tfoot th) {
      font-weight: 500;
    }
    &:where(th:first-child, td:first-child) {
      padding-inline-start: 0;
    }
    &:where(th[align="center"], td[align="center"]) {
      text-align: center;
    }
    &:where(th[align="right"], td[align="right"]) {
      text-align: end;
    }

    /* Blocks inside list items keep the list's tighter rhythm. */
    &:where(li > blockquote, li > table, li > figure) {
      margin-block-start: 0.5em;
    }
    &:where(li > pre) {
      margin-block-start: calc(0.5em / 0.875);
    }

    @media print {
      &:where(pre, table, blockquote, figure) {
        break-inside: avoid;
      }
      &:where(h1, h2, h3, h4) {
        break-after: avoid;
      }
    }

    /* Forced colors strips the code background, so give it a border. */
    @media (forced-colors: active) {
      &:where(:not(pre) > code) {
        border: 1px solid;
      }
    }
  }

  /* First child adds no space above. Last so it wins ties. */
  .typeset
  > :where(:first-child):not(
    :where(.not-typeset, [data-not-typeset], .not-typeset *, [data-not-typeset] *)
  ),
  .typeset
    > :where(:first-child)
    > :where(:first-child):not(
      :where(.not-typeset, [data-not-typeset], .not-typeset *, [data-not-typeset] *)
    ),
  .typeset
    :where(
      li > :first-child,
      blockquote > :first-child,
      td > :first-child,
      th > :first-child,
      dd > :first-child,
      figure > :first-child,
      figure > picture > img
    ):not(:where(.not-typeset, [data-not-typeset], .not-typeset *, [data-not-typeset] *)) {
    margin-block-start: 0;
  }
}
```

### Key mechanics worth understanding

- **All spacing is `margin-block-start` only.** No element ever sets bottom margin. Combined with
  `margin-trim: block-start` and the last rule (first-child gets zero top margin), this makes
  vertical rhythm compose predictably regardless of what appears first or last.
- **`--typeset-flow`** is the one rhythm knob (default `1.25em`, article preset `1.4em`). Every
  block-level gap derives from it.
- **Everything uses `:where()`** → zero specificity, so any Tailwind utility on a child wins
  without `!important`.
- **Escape hatch:** add `class="not-typeset"` or `data-not-typeset` to opt an element and its
  subtree out. The code-block `<pre>` uses `data-not-typeset` so `rehype-pretty-code` styling wins.
- **Fluid step-down:** base font-size is `calc(var(--typeset-size) * 1.125)` on mobile and drops to
  `var(--typeset-size)` at `min-width: 48rem`. Larger text on small screens, not smaller.
- **Dark mode gets looser leading** (`1.85` vs `1.7`) in the article preset — deliberate, because
  light text on dark needs more air.

---

## 5. Color system

### The trick

All colors are OKLCH with a **single shared hue variable**, `--neutral-hue: 98` (warm stone/greige).
Change that one number to re-tint the entire site. Chroma stays between `0.003` and `0.014` for
every neutral — enough to read as warm, not enough to read as colored.

`--destructive` is the only token with a different hue (`12`, red) and real chroma.

### Light theme (`:root`)

| Token | Value | Role |
|---|---|---|
| `--background` | `oklch(0.958 0.005 98)` | Page background. Warm off-white, not `#fff`. |
| `--foreground` | `oklch(0.263 0.013 98)` | Primary text. Warm near-black, not `#000`. |
| `--card` | `oklch(0.985 0.003 98)` | Card / popover surface — *lighter* than the page. |
| `--card-foreground` | `oklch(0.263 0.013 98)` | Same as `--foreground`. |
| `--popover` | `oklch(0.985 0.003 98)` | = `--card`. |
| `--popover-foreground` | `oklch(0.263 0.013 98)` | = `--foreground`. |
| `--primary` | `oklch(0.263 0.013 98)` | = `--foreground`. Primary buttons are near-black. |
| `--primary-foreground` | `oklch(0.985 0.003 98)` | Text on primary. |
| `--secondary` | `oklch(0.921 0.007 98)` | Secondary button fill. |
| `--secondary-foreground` | `oklch(0.263 0.013 98)` | |
| `--muted` | `oklch(0.936 0.007 98)` | Subtle fills, badge backgrounds, inline code bg. |
| `--muted-foreground` | `oklch(0.5 0.012 98)` | **The workhorse.** All secondary text and icons. |
| `--accent` | `oklch(0.936 0.007 98)` | = `--muted`. Hover surface. |
| `--accent-foreground` | `oklch(0.263 0.013 98)` | |
| `--destructive` | `oklch(0.55 0.18 12)` | Only saturated color in the system. |
| `--border` | `oklch(0.263 0.013 98 / 0.12)` | **12% alpha** — hairline, not a hard line. |
| `--input` | `oklch(0.263 0.013 98 / 0.14)` | Slightly stronger than border. |
| `--ring` | `oklch(0.45 0.02 98)` | Focus ring. |
| `--code` | `var(--card)` | Code block background. |
| `--code-foreground` | `var(--card-foreground)` | |
| `--code-highlight` | `oklch(0.94 0.006 98)` | Highlighted line background. |
| `--code-number` | `oklch(0.52 0.012 98)` | Line numbers. |
| `--radius` | `0.5rem` | Base radius. |

### Dark theme (`.dark`)

| Token | Value | Notes |
|---|---|---|
| `--background` | `oklch(0.18 0.01 98)` | Deep warm charcoal. Not pure black. |
| `--foreground` | `oklch(0.94 0.006 98)` | Off-white, never `#fff`. |
| `--card` | `oklch(0.22 0.012 98)` | *Lighter* than background (elevation = lighter). |
| `--card-foreground` | `oklch(0.94 0.006 98)` | |
| `--popover` | `oklch(0.22 0.012 98)` | |
| `--popover-foreground` | `oklch(0.94 0.006 98)` | |
| `--primary` | `oklch(0.94 0.006 98)` | Inverts — primary buttons are light on dark. |
| `--primary-foreground` | `oklch(0.22 0.012 98)` | |
| `--secondary` | `oklch(0.28 0.012 98)` | |
| `--secondary-foreground` | `oklch(0.94 0.006 98)` | |
| `--muted` | `oklch(0.28 0.012 98)` | |
| `--muted-foreground` | `oklch(0.72 0.01 98)` | Deliberately high (0.72) for readability. |
| `--accent` | `oklch(0.28 0.012 98)` | |
| `--accent-foreground` | `oklch(0.94 0.006 98)` | |
| `--destructive` | `oklch(0.68 0.16 12)` | Lighter + less chroma than light mode. |
| `--border` | `oklch(0.94 0.006 98 / 0.12)` | Light at 12% alpha. |
| `--input` | `oklch(0.94 0.006 98 / 0.15)` | |
| `--ring` | `oklch(0.65 0.015 98)` | |
| `--code-highlight` | `oklch(0.26 0.012 98)` | |
| `--code-number` | `oklch(0.65 0.01 98)` | |

### Rules for using colors

1. **Never hardcode a color.** There are exactly two exceptions in the source, both deliberate:
   - The GitHub contribution-graph heatmap, which reproduces GitHub's own greens:
     ```
     light: #ebedf0  #9be9a8  #40c463  #30a14e  #216e39
     dark:  #161b22  #0e4429  #006d32  #26a641  #39d353
     ```
     A tokenized alternative is available — see §11.13.
   - The OpenGraph image generator, which cannot read CSS variables. See
     [§14.5](#145-opengraph-images--a-known-divergence).

   Everything else goes through a token.
2. **Alpha modifiers over new tokens.** The system leans hard on `/N` opacity: `bg-muted/40`
   (hover surface), `bg-muted/70` (badge fill), `divide-border/60` (softer separator),
   `border-foreground/20` (card hover border), `outline-foreground/10` (image hairline),
   `text-foreground/10` (giant ghost numerals), `text-muted-foreground/60` (interpuncts),
   `bg-background/80` (header), `bg-background/95` (floating panels).
3. **`color-mix(in oklch, …)`** for derived colors, e.g. the secondary button hover:
   `hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]`.
4. **Theme-color meta must be recomputed** if you change `--neutral-hue`. See §9.

---

## 6. Radius system

Derived from `--radius: 0.5rem` with multipliers. **These override Tailwind's defaults** — do not
assume stock values.

| Class | Formula | Value | Where used |
|---|---|---|---|
| `rounded-sm` | `--radius * 0.6` | **0.30rem** | `Kbd`, highlighted inline chars |
| `rounded-md` | `--radius * 0.8` | **0.40rem** | Default: nav links, icon frames, avatars/logos, images, TOC rows, stack grid, tooltips |
| `rounded-lg` | `--radius * 1.0` | **0.50rem** | (available; rarely used) |
| `rounded-xl` | `--radius * 1.4` | **0.70rem** | Inner card frame, code block figures, connect grid |
| `rounded-2xl` | `--radius * 1.8` | **0.90rem** | Outer card frame |
| `rounded-4xl` | `--radius * 2.6` | **1.30rem** | **All buttons** |
| `rounded-full` | — | pill | Toasts, TOC pill, status dots |

### The concentric-frame rule

Outer radius − padding = inner radius. Cards use:

```
outer: rounded-2xl (0.90rem) + p-1 (0.25rem)
inner: rounded-xl  (0.70rem)          ← 0.90 − 0.25 = 0.65 ≈ 0.70
```

Always maintain this relationship when nesting rounded boxes. It's why the cards look right.

### Buttons are `rounded-4xl` (1.30rem)

At `h-9` (2.25rem) that is *nearly* a pill but not quite — corners stay slightly squared. Combined
with `bg-clip-padding` and a transparent border, this is the signature button shape. Do not
substitute `rounded-full` or `rounded-md`.

---

## 7. Typography

### Fonts

Both loaded via `next/font/google` in the root layout:

```tsx
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";

const sans = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});
```

Applied as `<html className={`${sans.variable} ${mono.variable}`}>` and `<body className={sans.className}>`.

| Role | Family | Tailwind |
|---|---|---|
| Sans / UI / body | **Space Grotesk** | `font-sans` |
| Mono / code | **JetBrains Mono** | `font-mono` |
| Headings | **Space Grotesk** (`--font-heading: var(--font-sans)`) | — |

There is **no separate display face**. Headings are the same family at heavier weight and tighter
tracking. `font-synthesis: none` on `html` prevents the browser from faking weights.

Code blocks disable ligatures: `font-variant-ligatures: none; font-feature-settings: "liga" 0, "calt" 0;`
— so JetBrains Mono's `=>`/`!=` ligatures do not fire in syntax-highlighted code.

### Weight scale — only three weights, ever

| Weight | Class | Use |
|---|---|---|
| 400 | (default) | Body copy, descriptions |
| 500 | `font-medium` | **All headings in the UI chrome**, nav brand, card titles, buttons, kbd, table headers |
| 600 | — | Only inside `.typeset` (article `h1`–`h4`, `strong`) |

**There is no `font-bold` (700) anywhere on the site.** Headings get their presence from size and
tracking, not weight. This is central to the aesthetic — do not reach for `font-bold`. (The only
700 in the codebase is inside the OG image generator, which renders off-site — see §14.5.)

### The applied type scale

Copy these class strings exactly.

| Element | Classes | Computed |
|---|---|---|
| **Page H1** (name, blog/bookmarks title, 404/500 heading) | `text-3xl font-medium tracking-tight text-balance leading-[1.1] md:text-4xl` | 1.875rem → 2.25rem |
| **Blog post H1** | `text-3xl font-medium md:text-4xl` | same, no tracking-tight |
| **Section H2** | `text-xl font-medium tracking-tight text-balance leading-[1.15] md:text-2xl` | 1.25rem → 1.5rem |
| **Item H3** (project/company/school/card title) | `text-base font-medium leading-snug text-balance` | 1rem |
| **Eyebrow label** (above H1) | `text-sm text-muted-foreground` | 0.875rem |
| **Section description** | `max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground` | 0.875rem |
| **Bio / lead paragraph** | `max-w-xl text-pretty text-base leading-relaxed text-muted-foreground` | 1rem |
| **Item description** | `text-pretty text-sm leading-relaxed text-muted-foreground` | 0.875rem |
| **Date / meta** | `shrink-0 text-xs tracking-wide text-muted-foreground tabular-nums sm:text-sm` | 0.75rem → 0.875rem |
| **Nav links** | `text-sm` on the `<nav>` | 0.875rem |
| **Brand wordmark** | `shrink-0 font-medium tracking-tight text-foreground` | 1rem |
| **Footer wordmark** | `text-lg font-medium` | 1.125rem |
| **Badge** | `text-xs font-medium` | 0.75rem |
| **Kbd** | `text-xs font-medium` | 0.75rem |
| **Tooltip** | `text-xs` | 0.75rem |
| **Error digest** | `font-mono text-xs text-muted-foreground/80` | 0.75rem |
| **TOC section label** | `text-[11px] font-medium tracking-[0.08em] text-muted-foreground` | 11px |
| **Giant ghost numeral** (404/500) | `select-none font-medium leading-none tracking-tight text-foreground/10 text-[clamp(6rem,22vw,12rem)]` | fluid 96–192px |

### Text-wrapping discipline — apply consistently

| Utility | Applied to |
|---|---|
| `text-balance` | **Every heading** (`h1`, `h2`, `h3`, card titles). Prevents orphan words. |
| `text-pretty` | **Every multi-line paragraph** and the `<article>` root. |
| `truncate` | Single-line labels in constrained cells (stack grid, connect grid, bookmark titles) |
| `line-clamp-2` | Card titles and card descriptions |
| `tabular-nums` | All dates, counts, percentages, contribution tooltips |

### Measure

Descriptive paragraphs are capped at `max-w-xl` (**36rem / 576px**) even though the column is 720px.
This keeps line length in the comfortable 60–75 character range. Headings and item rows use the full
column width.

### Tracking

- `tracking-tight` (−0.025em) on large headings and the wordmark
- `tracking-wide` (0.025em) on dates
- `tracking-[0.08em]` on the one uppercase micro-label (TOC header)
- Inside `.typeset`: `h1` = −0.02em, `h2` = −0.015em, `h6` = +0.08em uppercase

### Line height

- `leading-[1.1]` — page H1
- `leading-[1.15]` — section H2
- `leading-snug` (1.375) — item titles, card titles, TOC rows
- `leading-relaxed` (1.625) — all body copy and descriptions
- `leading-none` — the giant ghost numerals, toast text
- Article body: `1.7` light / `1.85` dark

---

## 8. Layout, margins & vertical rhythm

### The one and only column

```
┌─────────────────────────────────────────┐
│  viewport                               │
│   ┌───────────────────────────────┐     │  mx-auto
│   │ max-w-3xl = 48rem = 768px     │     │
│   │  px-6      content     px-6   │     │  24px gutters
│   │  24px   ← 720px →      24px   │     │
│   └───────────────────────────────┘     │
└─────────────────────────────────────────┘
```

Root shell class string (on the div wrapping header + main + footer):

```
mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6
```

There is no secondary container, no `max-w-5xl` section, no full-bleed band. Everything obeys this.

### Vertical rhythm — the exact stack

| Level | Class string | Value |
|---|---|---|
| Sticky header | `h-12` | **48px** tall |
| Page shell top inset | `mt-16` | **64px** below header |
| Between top-level sections | `gap-16` | **64px** |
| Inside a section | `gap-4` | **16px** |
| Section header internals (label / title / description) | `gap-1.5` | **6px** |
| Expandable group wrapper | `gap-3` | **12px** |
| List row padding | `py-4 first:pt-1 last:pb-1` | **16px**, trimmed at the ends |
| Card grid gap | `gap-4` | **16px** |
| Footer | `py-8` | **32px** top and bottom |

Page shell component:

```tsx
const PageShellWrapper = ({ children }: { children: ReactNode }) => {
  // Soft top inset — content starts a bit below the nav (not flush, not dead-centered).
  return <div className="flex w-full flex-1 flex-col gap-16 mt-16">{children}</div>;
};
```

Section wrapper component (used once per section, always):

```tsx
const ShellWrapper = ({ className, children, ...props }: ComponentPropsWithoutRef<"section">) => {
  return (
    <section className={cn("flex w-full flex-col gap-4", className)} {...props}>
      {children}
    </section>
  );
};
```

**Rule: never put margins on section children.** All vertical spacing comes from `gap-*` on flex
parents. The only `mt-*`/`mb-*` in the entire layout are the page shell's `mt-16` and the
expandable content's `mt-3`. This is why the rhythm never drifts.

### Section header component

```tsx
interface SectionHeaderProps extends ComponentPropsWithoutRef<"header"> {
  label?: string;
  title: string;
  description?: string;
  headingLevel?: "h1" | "h2";
}

export function SectionHeader({
  label,
  title,
  description,
  headingLevel: Heading = "h2",
  className,
  ...props
}: SectionHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-1.5", className)} {...props}>
      {label ? <p className="text-sm text-muted-foreground">{label}</p> : null}
      <Heading className="text-xl font-medium tracking-tight text-balance leading-[1.15] md:text-2xl">
        {title}
      </Heading>
      {description ? (
        <p className="max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </header>
  );
}
```

Every section on every page opens with this. Titles are single words or short phrases —
`Work`, `Experience`, `Education`, `Stack`, `Templates`, `Connect`, `Writing`.
Descriptions are one short sentence, sentence case, ending in a period.

### Breakpoints

**Only two are used in the entire codebase:**

| Breakpoint | Width | What changes |
|---|---|---|
| `sm:` | 640px | Card grids go 1→2 columns; date rows go stacked→inline baseline-aligned; dates step 12px→14px |
| `md:` | 768px | Headings step up one size; the intro avatar/text goes column→row; avatar 112px→128px; `.typeset` steps its base size down |

No `lg:`, `xl:`, or `2xl:` anywhere. Because the column is capped at 768px, there is nothing to
reflow above `md`. Resist adding larger breakpoints.

### Mobile-specific notes

- Avatar: `size-28` (112px) → `md:size-32` (128px), with `md:mt-1` optical alignment nudge.
- Intro block: `flex-col` → `md:flex-row`, `gap-3`.
- Date rows: `flex-col gap-0.5` → `sm:flex-row sm:items-baseline sm:justify-between sm:gap-4`.
- Error/404 hero: `min-h-72` (288px) → `md:min-h-88` (352px).
- `.typeset` renders **larger** on mobile (1.125×) and steps down at 48rem.

---

## 9. Root layout — copy the structure

```tsx
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/pill-toaster";
import SiteFooter from "@/components/layouts/site-footer";
import SiteHeader from "@/components/layouts/site-header";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    // Must visually match --background in each theme.
    { media: "(prefers-color-scheme: light)", color: "#f2f1ed" },
    { media: "(prefers-color-scheme: dark)", color: "#2c2b26" },
  ],
};

const sans = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className={sans.className} suppressHydrationWarning>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:rounded-md focus:border focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:ring-2 focus:ring-ring"
        >
          Skip to main content
        </a>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <TooltipProvider>
            <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6">
              <SiteHeader />
              <main id="main-content" className="flex flex-1 flex-col">
                {children}
              </main>
              <SiteFooter />
            </div>
            <Toaster position="bottom-center" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

Non-negotiable details:

- `attribute="class"` + `defaultTheme="dark"` + `enableSystem` + `disableTransitionOnChange`.
  **This design is dark-first** — dark is the default even when the OS says light, until the user
  picks. `disableTransitionOnChange` prevents the whole page from cross-fading on toggle.
- `suppressHydrationWarning` on **both** `html` and `body` (required by `next-themes`).
- `TooltipProvider` wraps everything with `delay = 0` (see §11).
- The skip link is the first focusable element and is fully styled — keep it.
- `min-h-screen` on the shell + `flex-1` on `<main>` pins the footer to the bottom on short pages.

**Theme-color caveat:** the two hex values are hand-approximations of `--background`. The dark one
(`#2c2b26`) is closer to `--card` than to the actual dark `--background`
(`oklch(0.18 0.01 98)`). If you change `--neutral-hue` or the lightness values, recompute both
hexes from the real token values rather than copying these.

---

## 10. Header & footer

### Sticky header

```tsx
<header className="sticky top-0 z-50 -mx-6 bg-background/80 backdrop-blur-md">
  <div className="mx-auto flex h-12 max-w-3xl items-center justify-between gap-4 px-6">
    {/* brand */}
    {/* nav */}
  </div>
</header>
```

**The `-mx-6` / re-apply pattern is the important part.** The header lives *inside* the `px-6`
shell, so `-mx-6` cancels that padding and lets the translucent blur band span the full viewport
width. The inner div then re-applies `mx-auto max-w-3xl px-6` so the brand and nav align exactly
with the content column below. Reproduce this exactly — it's what makes the header read as a
full-width bar while staying in the column flow.

Other specs:

- Height **`h-12` (48px)** — deliberately short.
- `bg-background/80 backdrop-blur-md` — translucent, not opaque. No border, no shadow. Separation
  comes only from the blur.
- `z-50`.
- Brand: `shrink-0 font-medium tracking-tight text-foreground`, lowercase wordmark with a trailing
  period (`devn.`). No logo mark.

Nav:

```tsx
<nav aria-label="Main navigation" className="flex items-center gap-1 text-sm">
```

- Text link: `rounded-md px-2.5 py-1.5 transition-colors` + active `text-foreground`
  / inactive `text-muted-foreground hover:text-foreground`
- Icon button: `rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground`,
  icons `size-4`
- Labels are **lowercase** (`blog`, `links`)
- Active state is a color change only — no underline, no pill, no indicator bar
- Every nav item is wrapped in a `Tooltip` whose content includes a `<Kbd>` shortcut hint
- Theme toggle swaps icons with pure CSS, no JS branch:
  ```tsx
  <Sun className="size-4 dark:hidden" />
  <Moon className="hidden size-4 dark:block" />
  ```

### Footer

```tsx
<footer className="flex flex-col items-center gap-1 py-8 text-center">
  <p className="text-lg font-medium">devn.</p>
  <p className="text-muted-foreground">
    Built by{" "}
    <Link
      href={githubUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="transition-colors hover:text-primary hover:underline underline-offset-2"
    >
      nabinkhair
      <ArrowUpRight size={15} className="inline-block" />
    </Link>
  </p>
</footer>
```

- Centered, `py-8`, `gap-1`. No border, no top rule, no columns, no link lists.
- Repeats the wordmark at `text-lg`.
- External links get an inline `ArrowUpRight size={15} className="inline-block"` — this is the
  system's universal external-link affordance.

---

## 11. Component recipes

Exact class strings. Copy them.

### 11.1 Button (CVA variants)

Base — note `rounded-4xl`, `border border-transparent`, `bg-clip-padding`, and the explicit
transition property list:

```
group/button inline-flex shrink-0 items-center justify-center rounded-4xl border border-transparent
bg-clip-padding text-sm font-medium whitespace-nowrap outline-none select-none
transition-[background-color,border-color,color,box-shadow,transform,opacity]
focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30
active:not-aria-[haspopup]:scale-[0.96] disabled:pointer-events-none disabled:opacity-50
aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20
dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40
[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4
```

Variants:

| Variant | Classes |
|---|---|
| `default` | `bg-primary text-primary-foreground hover:bg-primary/80` |
| `outline` | `border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:bg-transparent dark:hover:bg-input/30` |
| `secondary` | `bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground` |
| `ghost` | `hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50` |
| `destructive` | `bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40` |
| `link` | `text-primary underline-offset-4 hover:underline decoration-from-font` |

Sizes:

| Size | Classes |
|---|---|
| `default` | `h-9 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5` |
| `xs` | `h-6 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3` |
| `sm` | `h-8 gap-1 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2` |
| `lg` | `h-10 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3` |
| `icon` | `size-9` |
| `icon-xs` | `size-6 [&_svg:not([class*='size-'])]:size-3` |
| `icon-sm` | `size-8` |
| `icon-lg` | `size-10` |

Defaults: `variant: "default"`, `size: "default"`.

Notable behaviors:
- **`active:not-aria-[haspopup]:scale-[0.96]`** — press-scale feedback on plain buttons but not on
  menu triggers.
- **`destructive` is a tint, not a fill** — `bg-destructive/10 text-destructive`, never solid red.
- Icons auto-size to `size-4` unless a `size-*` class is present.
- `bg-clip-padding` + transparent border reserves the border box so hover/focus border changes
  don't shift layout.
- **Notably absent:** no `shadow` on any button variant.

### 11.2 Card (the concentric double-frame)

The signature card. Used for blog posts and templates.

Outer frame (the link/article root):

```
group flex h-full flex-col overflow-hidden rounded-2xl border p-1 shadow-sm
transition-[box-shadow,border-color] duration-200 ease-out
hover:border-foreground/20 hover:shadow-md
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
focus-visible:ring-offset-2 focus-visible:ring-offset-background
```

Inner frame:

```
flex h-full w-full flex-col overflow-hidden rounded-xl border bg-background
transition-[border-color] duration-200 ease-out group-hover:border-foreground/30
```

Media area:

```
relative aspect-192/100 w-full shrink-0 bg-muted
```
with the image at `object-cover outline-1 outline-foreground/10`.

Body:

```
flex flex-1 flex-col px-4 pt-2 pb-4 font-medium
```

Title row (fixed height so cards align in a grid):

```
flex min-h-11 w-full items-center justify-between gap-1
```
title span: `line-clamp-2 flex-1 text-balance leading-snug`

Chevron reveal (the nicest micro-interaction in the system):

```
flex shrink-0 -translate-x-0.5 scale-75 items-center justify-center text-foreground opacity-0
transition-[opacity,translate,scale] duration-300 ease-out
group-hover:translate-x-0 group-hover:scale-100 group-hover:opacity-100
```
containing `<ChevronRight className="size-4" />`.

Description (fixed min-height so cards align):

```
line-clamp-2 min-h-12 text-pretty font-normal leading-relaxed text-muted-foreground
```

Card grid:

```
grid gap-4 sm:auto-rows-fr sm:grid-cols-2
```

`sm:auto-rows-fr` + `h-full` on cards + `min-h-11` / `min-h-12` on the text rows is what makes
every card in a row exactly the same height with aligned baselines.

**Note the aspect ratio: `aspect-192/100` (1.92:1)** — not 16:9, not 2:1. Arbitrary-value aspect
ratio, used for every card thumbnail.

### 11.3 Timeline logo / icon frame

The universal small-image container:

```
size-10 shrink-0 rounded-md border bg-muted outline-1 outline-foreground/10
```
plus `p-px` and `object-contain` (logos) or `object-cover` (screenshots), rendered at 40×40.

The `outline-1 outline-foreground/10` **in addition to** `border` is deliberate: the border is the
theme hairline, the outline is a subtle extra edge that keeps light images from bleeding into a
light background. This pairing appears on every image in the system, including the avatar
(`rounded-md border object-cover shadow-md outline-1 outline-foreground/10`).

### 11.4 Stack badge (tech pill)

```
inline-flex h-6 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border
bg-muted/70 px-1.5 text-xs font-medium
```
with the icon at `size-3.5 rounded`.

Fixed `h-6` (24px), `px-1.5`, `rounded-md` — a small squared chip, not a pill. Container:
`flex flex-wrap gap-2`.

### 11.5 Kbd

```
pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm
bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none
[&_svg:not([class*='size-'])]:size-3
[[data-slot=tooltip-content]_&]:bg-background/20 [[data-slot=tooltip-content]_&]:text-background
dark:[[data-slot=tooltip-content]_&]:bg-background/10
```

`h-5 min-w-5` guarantees single characters render as squares. **`font-sans`, not `font-mono`** —
shortcut hints stay in the UI face. The last three classes auto-invert the Kbd when it sits inside
a tooltip (which has an inverted background) — a nice contextual-styling pattern worth keeping.

### 11.6 Tooltip

Content:

```
z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md
bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5
data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2
data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2
data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2
**:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50
**:data-[slot=kbd]:rounded-sm
data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0
data-[state=delayed-open]:zoom-in-95
data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95
data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95
```

Arrow:

```
z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground
```
plus per-side positioning offsets.

Positioner: `isolate z-50`. Defaults: `side="top"`, `sideOffset={4}`, `align="center"`.
Provider delay: **`0`** — tooltips appear instantly.

**Tooltips are fully inverted** (`bg-foreground text-background`). This is the only inverted
surface in the system and it's what makes them read as chrome rather than content.

### 11.7 Expandable section (accordion rows)

Structure and spacing:

| Part | Classes |
|---|---|
| Root | `flex flex-col gap-3` |
| List | `flex flex-col gap-3`, overridden per use with `gap-0 divide-y divide-border/60` |
| Item | `group/item py-4 first:pt-1 last:pb-1` + `data-state="open"\|"closed"` |
| Trigger | `group/trigger cursor-pointer flex w-full items-start gap-3 text-left` + `aria-expanded` |
| Content | `mt-3 flex flex-col gap-3 pl-[3.25rem]` |

**`pl-[3.25rem]` = 52px = `size-10` logo (40px) + `gap-3` (12px).** The expanded body aligns
exactly with the text column of the collapsed row. That precise number is load-bearing — if you
change the logo size or gap, recompute it.

Rows use `divide-y divide-border/60` (border at 60% of the already-12% token — a very faint
hairline) with `first:pt-1 last:pb-1` trimming the outer padding so the group doesn't gain
phantom space.

The trigger has **no chevron and no visible affordance** — the whole row is the target, and the
first item is `defaultOpen`. Motion spec in §12.

"View all" toggle:

```
inline-flex min-h-9 items-center gap-1 text-sm tabular-nums text-muted-foreground
transition-colors hover:text-foreground
```
inside `flex justify-center pt-2`, with the chevron at
`size-3.5 transition-transform duration-200` + `rotate-180` when expanded.

### 11.8 Hairline grid (the border-collapse trick)

Used twice, and it's the most distinctive layout pattern in the system.

**Icon grid** (auto-fitting square cells):

```tsx
<div
  className="grid overflow-hidden rounded-md border-l border-t"
  style={{ gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))" }}
>
  {items.map(({ name, icon: Icon }) => (
    <div
      key={name}
      className="group flex aspect-square flex-col items-center justify-center gap-2 border-r border-b p-2 transition-colors hover:bg-muted/40"
    >
      <Icon className="size-6 shrink-0" aria-hidden />
      <p className="w-full min-w-0 truncate text-center text-sm leading-tight text-muted-foreground">
        {name}
      </p>
    </div>
  ))}
</div>
```

**The mechanism:** container gets `border-l border-t`, each cell gets `border-r border-b`.
Adjacent cells share edges, so you get exactly 1px hairlines with no doubling and no
`border-collapse`. `overflow-hidden` + `rounded-md` clips the corners. `aspect-square` cells with
`repeat(auto-fit, minmax(80px, 1fr))` reflow the count per breakpoint without media queries.

**Two-column link grid** (explicit last-row/last-column suppression instead):

```
grid grid-cols-2 overflow-hidden rounded-xl border *:border-r *:border-b
[&>*:nth-child(2n)]:border-r-0 [&>*:nth-last-child(-n+2)]:border-b-0
```

Row content:

```
group flex min-h-14 items-stretch transition-colors hover:bg-muted/40
```
with a `flex w-12 shrink-0 items-center justify-center border-r` icon gutter, a
`flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-2 py-2` text column, and a trailing
`mr-3 size-4 shrink-0 self-center text-muted-foreground transition-colors group-hover:text-foreground`
arrow.

`hover:bg-muted/40` is the standard cell hover surface throughout.

### 11.9 Avatar

```
group/avatar relative flex size-8 shrink-0 rounded-full select-none
after:absolute after:inset-0 after:rounded-full after:border after:border-border
after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6
dark:after:mix-blend-lighten
```
Image: `aspect-square size-full rounded-full object-cover`.
Fallback: `flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground group-data-[size=sm]/avatar:text-xs`.

The border is an `::after` pseudo-element with **`mix-blend-darken` (light) / `mix-blend-lighten`
(dark)** so the ring blends with whatever the photo contains instead of drawing a hard line.

### 11.10 Toast (pill style)

Root:

```
pointer-events-auto relative w-max max-w-[min(100%,20rem)] select-none
will-change-[transform,opacity] rounded-full bg-primary text-primary-foreground
shadow-sm shadow-foreground/10
translate-x-(--toast-swipe-movement-x,0px) translate-y-(--toast-swipe-movement-y,0px)
transition-[transform,opacity,filter,margin,padding,height] duration-400
ease-[cubic-bezier(0.16,1,0.3,1)]
data-ending-style:duration-200 data-ending-style:ease-in
data-swiping:transition-none
```

Position-dependent origin/margins: `origin-top mb-1.5 last:mb-0` (top) or
`origin-bottom mt-1.5 last:mt-0` (bottom).

Enter: `data-starting-style:scale-95 data-starting-style:opacity-0 data-starting-style:blur-[3px]`
plus `±translate-y-5`.
Exit: `data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-ending-style:blur-[2px]`
plus `±translate-y-2`.
Swipe fling: `translate-y-[calc(var(--toast-swipe-movement-y,0px)±130%)] scale-95 opacity-0 blur-none`.
Reduced motion: `motion-reduce:transition-none` + neutralized start/end styles.

Content: `flex items-center gap-2 px-2.5 py-2`, icon badge
`flex size-4 shrink-0 items-center justify-center rounded-full` with the glyph at
`size-2.5 strokeWidth={3}`, title `truncate text-xs font-medium leading-none tracking-tight`,
description `truncate text-xs leading-none tabular-nums text-primary-foreground/75`.

Viewport: `pointer-events-none fixed z-99 flex w-max max-w-[min(100vw-2rem,20rem)] outline-none`
with `--toast-offset: 16px`; bottom positions use `flex-col-reverse`.

This is a **tiny inverted pill**, ~28px tall, not a rectangular card. `blur-[3px]` on enter/exit is
the distinctive touch. Mounted with `position="bottom-center"`.

### 11.11 Floating table of contents

A bottom-right "dynamic island" that morphs between a reading-position pill and a panel.

Nav wrapper:

```
fixed z-50 flex items-end gap-2 pointer-events-none
right-[max(1rem,env(safe-area-inset-right))]
bottom-[max(1.25rem,env(safe-area-inset-bottom))]
```

Collapsed pill:

```
pointer-events-auto inline-flex h-11 max-w-[min(50vw,18rem)] items-center gap-2
rounded-full border bg-background/95 px-4 shadow-lg backdrop-blur-xl
cursor-pointer transition-colors hover:bg-accent
outline-none focus-visible:ring-2 focus-visible:ring-ring
```

Expanded shell: `pointer-events-auto relative overflow-hidden border bg-background/95 shadow-lg backdrop-blur-xl`
with `animate={{ borderRadius: isOpen ? 20 : 999 }}` and `style={{ originX: 1, originY: 1 }}`.

Panel: `flex w-[min(86vw,20rem)] origin-bottom-right flex-col`; header
`flex items-center justify-between px-4 pt-3 pb-2`; list container
`max-h-[60vh] overflow-y-auto px-2 pb-2`.

Row:

```
block rounded-md py-1.5 pr-2 text-sm leading-snug outline-none transition-colors duration-200
focus-visible:bg-accent
```
`pl-4` top level / `pl-5` nested; active `font-medium text-foreground`, idle
`text-muted-foreground hover:text-foreground`.

Active indicator: a **1px vertical bar** (`absolute z-10 w-px rounded-full bg-foreground`) animated
between measured row rects — `left: 8` for top-level, `left: 12` for nested. Nested groups get a
static `absolute left-0 w-px bg-border` guide line.

`env(safe-area-inset-*)` with `max()` for iPhone notch/home-bar safety. Springs in §12.

### 11.12 Copy button (on code blocks)

```
absolute top-3 right-2 z-10 size-7 bg-code hover:opacity-100 focus-visible:opacity-100
```
`size="icon-sm"`, `variant="ghost"`, icon swaps `<Copy />` → `<Check />` for 2000ms, and fires a
toast on success.

### 11.13 Contribution heatmap

Container: `max-w-full overflow-x-auto overflow-y-hidden border rounded-md p-2`.
Root: `flex w-max max-w-full flex-col gap-2`.
Footer: `flex flex-wrap gap-1 whitespace-nowrap sm:gap-x-4`; legend
`ml-auto flex items-center gap-0.75` with `h-3 w-3 rounded border` swatches.
Loading skeleton: `h-[11.9rem] border bg-muted`.
Empty/error state: `flex flex-col items-start gap-3 border border-dashed`.

Default (tokenized) block fills, which is the preferred approach if you don't need GitHub's greens:

```
data-[level="0"]:fill-muted
data-[level="1"]:fill-muted-foreground/20
data-[level="2"]:fill-muted-foreground/40
data-[level="3"]:fill-muted-foreground/60
data-[level="4"]:fill-muted-foreground/80
```

### 11.14 Soft link (the standard secondary link)

```tsx
export function SoftLink({ className, underline = false, children, ...props }: SoftLinkProps) {
  return (
    <Link
      className={cn(
        "inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground",
        underline &&
          "underline decoration-from-font underline-offset-4 [text-underline-position:from-font]",
        className
      )}
      {...props}
    />
  );
}
```

`decoration-from-font` + `[text-underline-position:from-font]` uses the font's own underline
metrics instead of a synthetic line — subtle but it's why underlines here look typeset.

### 11.15 Inline meta row

The repeated "icon + label" pattern:

```
inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground
```
with the icon at `size-3.5` and an optional trailing `<Kbd>`.
Container: `flex flex-wrap items-center gap-x-4 gap-y-2 pt-1` (note asymmetric gaps).

### 11.16 Status dot

```tsx
<span className="inline-flex" title="Current role">
  <span className="sr-only">Current</span>
  <span className="size-2 rounded-full bg-primary" aria-hidden />
</span>
```
8px `bg-primary` dot. No pulse, no ring, no "Current" text badge.

### 11.17 Gradient divider (bookmarks)

```tsx
<div className="flex items-center gap-3">
  <span className="text-sm text-muted-foreground">{label}</span>
  <div className="h-px flex-1 bg-linear-to-r from-border to-transparent" />
</div>
```
The only gradient in the entire system: a 1px rule fading out to the right. Groups are separated by
`flex flex-col gap-12` with `space-y-4` inside.

### 11.18 Error / 404 pages

```tsx
<PageShellWrapper>
  <ShellWrapper>
    <div className="flex min-h-72 items-end p-2 md:min-h-88">
      <span
        aria-hidden="true"
        className="select-none font-medium leading-none tracking-tight text-foreground/10 text-[clamp(6rem,22vw,12rem)]"
      >
        404
      </span>
    </div>
  </ShellWrapper>

  <ShellWrapper>
    <header className="flex flex-col gap-3 p-2">
      <p className="text-sm text-muted-foreground">Page missing</p>
      <h1 className="text-3xl font-medium tracking-tight md:text-4xl">
        This page took a different route
      </h1>
      <p className="text-base leading-relaxed text-muted-foreground">
        The link you followed is no longer available.
      </p>
    </header>
  </ShellWrapper>

  <ShellWrapper>
    <div className="flex flex-wrap items-center gap-2 p-2">
      <Button size="sm" nativeButton={false} render={<Link href="/">Return home</Link>} />
      <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/blog">Read the blog</Link>} />
    </div>
  </ShellWrapper>
</PageShellWrapper>
```

The giant numeral at **`text-foreground/10`** (10% opacity), bottom-aligned in a tall box, is the
whole design. Copy is calm and non-apologetic. Use the same treatment for both 404 and 500.

---

## 12. Motion system

### Easing curves — there are exactly three

| Name | Value | Used for |
|---|---|---|
| **Apple ease** | `cubic-bezier(0.32, 0.72, 0, 1)` | Accordion expand/collapse. Fast out, long settle. |
| **Expo-out** | `cubic-bezier(0.16, 1, 0.3, 1)` | Toast enter, toast icon pop. |
| **`ease-out`** | Tailwind default | Every hover/color/shadow transition. |
| (`ease-in`) | Tailwind default | Exits only. |

Define the first as a constant:

```ts
const APPLE_EASE = [0.32, 0.72, 0, 1] as const;
```

### Durations

| Interaction | Duration |
|---|---|
| Color / hover transitions (`transition-colors`) | 150ms (Tailwind default) |
| Card hover (shadow + border) | **200ms** `ease-out` |
| Chevron rotate | **200ms** |
| Chevron reveal (opacity + translate + scale) | **300ms** `ease-out` |
| Toast enter | **400ms** expo-out |
| Toast exit | **200ms** `ease-in` |
| Accordion height (open) | **380ms** Apple ease |
| Accordion opacity (open) | **280ms** Apple ease |
| Accordion height (close) | **300ms** Apple ease |
| Accordion opacity (close) | **180ms** `ease-in` |
| Accordion inner content | **320ms** Apple ease, **40ms delay** |
| Underline color (typeset links) | **150ms** `ease-out` |

**Asymmetry rule: exits are always faster than entrances.** Roughly 60% of the enter duration.

### Accordion motion spec (Framer Motion)

```tsx
// Outer wrapper — animates height
initial={{ height: 0, opacity: 0 }}
animate={{
  height: "auto",
  opacity: 1,
  transition: {
    height: { duration: 0.38, ease: APPLE_EASE },
    opacity: { duration: 0.28, ease: APPLE_EASE },
  },
}}
exit={{
  height: 0,
  opacity: 0,
  transition: {
    height: { duration: 0.3, ease: APPLE_EASE },
    opacity: { duration: 0.18, ease: "easeIn" },
  },
}}
className="overflow-hidden"

// Inner wrapper — slight downward slide, delayed so it trails the height
initial={{ opacity: 0, y: -6 }}
animate={{ opacity: 1, y: 0, transition: { duration: 0.32, ease: APPLE_EASE, delay: 0.04 } }}
exit={{ opacity: 0, y: -4, transition: { duration: 0.16, ease: "easeIn" } }}
```

The **two-layer** structure (height on the outer, opacity+translate on the inner, offset by 40ms) is
what makes it feel physical rather than mechanical. Don't collapse it into one animated div.

### Spring family (floating TOC)

```ts
const SPRING = {
  island:    { type: "spring", stiffness: 340, damping: 32, mass: 0.85 }, // shell morph
  content:   { type: "spring", stiffness: 380, damping: 34, mass: 0.7  }, // content fade/scale
  indicator: { type: "spring", stiffness: 520, damping: 42, mass: 0.55 }, // active row bar
  title:     { type: "spring", stiffness: 440, damping: 36, mass: 0.6  }, // pill crossfade
  tap:       { type: "spring", stiffness: 520, damping: 28 },             // press feedback
};
```

All slightly underdamped for a physical settle. Stagger on the list:
`staggerChildren: 0.028, delayChildren: 0.04` in, `staggerChildren: 0.012, staggerDirection: -1` out.
Items animate `{ opacity: 0, y: 8 }` → `{ opacity: 1, y: 0 }`.

### Reduced motion — three layers

1. **Global CSS kill switch** in `globals.css` (`prefers-reduced-motion: reduce` → all
   animation/transition durations to `0.01ms`, `scroll-behavior: auto`).
2. **`useReducedMotion()`** checked in every Framer component; transitions become
   `{ duration: 0 }` and `initial` becomes `false`.
3. **`motion-reduce:`** Tailwind variants on the toast (`motion-reduce:transition-none`,
   neutralized start/end styles).
4. `<MotionConfig reducedMotion="user">` wraps the TOC.
5. Smooth-scroll calls branch: `behavior: reduceMotion ? "auto" : "smooth"`.

Implement all of these. Partial coverage is what makes reduced-motion support feel broken.

---

## 13. Interaction & state conventions

### The core hover idiom

```
text-muted-foreground transition-colors hover:text-foreground
```

Apply to: nav links, icon buttons, meta links, "View all" toggles, arrow icons, bookmark titles,
TOC rows, footer links. If something is interactive and secondary, it uses this. Nothing else.

### Surface hover

```
hover:bg-muted/40
```
For grid cells and list rows. `hover:bg-accent` for the floating TOC pill.

### Focus-visible — two shapes

| Context | Classes |
|---|---|
| Buttons | `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30` |
| Links / cards / interactive regions | `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background` |
| Typeset links | `outline: 2px solid var(--color-ring); outline-offset: 2px` |
| TOC rows | `focus-visible:bg-accent` (background, not ring) |

Global fallback: `* { @apply outline-ring/50 }` in the base layer.

### Always name the transition property

The codebase never uses bare `transition` or `transition-all`. Always an explicit list:

```
transition-colors
transition-transform
transition-[box-shadow,border-color]
transition-[border-color]
transition-[opacity,translate,scale]
transition-[background-color,border-color,color,box-shadow,transform,opacity]
transition-[transform,opacity,filter,margin,padding,height]
```

Keep this discipline — it prevents accidental layout-property animation.

### Group hover

Uses **named groups** to avoid collisions in nested interactive structures:
`group/button`, `group/item`, `group/trigger`, `group/avatar`, plus plain `group` on cards and
grid cells. When nesting, always name.

### Elevation

- `shadow-sm` → `hover:shadow-md` on cards only
- `shadow-md` on the avatar image
- `shadow-lg` on floating overlays (TOC) and the focused skip link
- `shadow-sm shadow-foreground/10` on toasts (tinted, not neutral)
- **Buttons, badges, inputs, and grid cells have no shadow at all**

### Z-index ladder

| Layer | z |
|---|---|
| Copy button on code blocks | `z-10` |
| Sticky header | `z-50` |
| Tooltips | `z-50` |
| Floating TOC | `z-50` |
| Toast viewport | `z-99` |
| Focused skip link | `z-100` |

### Backdrop blur

| Element | Value |
|---|---|
| Sticky header | `bg-background/80 backdrop-blur-md` |
| Floating TOC | `bg-background/95 backdrop-blur-xl` |

Only these two. Everything else is opaque.

---

## 14. Long-form article / MDX styling

### The article container

```tsx
<article className="typeset typeset-article text-pretty text-muted-foreground">
  {/* MDX */}
</article>
```

**Note: body copy is `text-muted-foreground`, not `text-foreground`.** `typeset` then pulls
headings, links, and `strong` back up to full `--foreground`. The result is a deliberate
two-tier contrast: structure pops, prose recedes. This is a signature move — preserve it.

### Blog post header

```tsx
<header className="space-y-4">
  <div className="space-y-2">
    <h1 className="text-3xl font-medium md:text-4xl">{title}</h1>
    <p className="text-muted-foreground">{description}</p>
  </div>

  <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
    <div className="inline-flex items-center gap-1.5">
      <Avatar className="size-6 border">…</Avatar>
      {author}
    </div>
    <div className="inline-flex items-center gap-1.5">
      <Calendar className="size-4" aria-hidden />
      <time dateTime={date}>{formatDate(date)}</time>
    </div>
    <div className="inline-flex items-center gap-1.5">
      <Clock className="size-4" aria-hidden />
      {readingTime}
    </div>
  </div>

  {image && (
    <div className="overflow-hidden border">
      <Image … className="aspect-video w-full object-cover" />
    </div>
  )}
</header>
```

Note the cover image wrapper is `overflow-hidden border` with **no radius** — square corners, unlike
the cards. Cover is `aspect-video` (16:9), while card thumbnails are `aspect-192/100`.

### Heading anchors

Every MDX heading is wrapped so hovering reveals a `#`:

```tsx
<a className="group no-underline" href={`#${id}`}>
  <span className="underline-offset-4 group-hover:underline">{children}</span>
  <span aria-hidden="true" className="ml-2 text-muted-foreground opacity-0 group-hover:opacity-100">
    #
  </span>
</a>
```

IDs are slugified as: trim → collapse whitespace to `-` → strip `'` and `?` → lowercase.
(Deliberately simple — match it exactly if you want the TOC and anchors to agree.)

### Code blocks

Pipeline: `rehype-pretty-code` + `shiki` with dual themes.

```ts
export const mdxOptions = {
  mdxOptions: {
    remarkPlugins: [remarkGfm],
    rehypePlugins: [
      [
        rehypePrettyCode,
        {
          theme: { dark: "github-dark-default", light: "github-light-default" },
          keepBackground: false,
          transformers,
        },
      ],
    ],
  },
};
```

`keepBackground: false` is essential — the background comes from `--code` (= `--card`), so code
blocks match the theme instead of shipping GitHub's own background.

A transformer stashes the raw source on the `<code>` node so the copy button can read it:

```ts
export const transformers: ShikiTransformer[] = [
  {
    code(node) {
      if (node.tagName === "code") {
        node.properties.__raw__ = this.source;
      }
    },
  },
];
```

`<pre>` override:

```
no-scrollbar min-w-0 overflow-x-auto overflow-y-auto overscroll-x-contain overscroll-y-auto
px-4 py-3.5 outline-none has-data-highlighted-line:px-0 has-data-line-numbers:px-0
```
plus `data-not-typeset` so typeset's `pre` rules don't fight it.

`has-data-*:px-0` drops the horizontal padding when line numbers or highlighted lines are present,
because those need full-bleed backgrounds.

Figure caption (filename bar):

```
flex items-center gap-2 text-code-foreground [&_svg]:size-4 [&_svg]:text-code-foreground [&_svg]:opacity-70
```
with a language icon prepended based on `data-language`.

Table wrapper:

```tsx
<div className="typeset-scroll no-scrollbar">
  <table {...props} />
</div>
```

MDX images: `mt-6 rounded-md border`, default 800×400.

### Code block chrome details (from `globals.css`)

- Figure: `rounded-xl`, `margin-top: 1.5rem`, `margin-inline: -0.25rem` — a **4px negative inline
  margin** so code bleeds very slightly past the text column. Subtle and intentional.
- Line numbers: `width: 4rem`, `padding-right: 1.5rem`, right-aligned, `position: sticky; left: 0`
  so they stay pinned during horizontal scroll.
- Highlighted line: `--code-highlight` background + a 2px left bar at
  `color-mix(in oklch, var(--muted-foreground) 50%, transparent)`.
- Highlighted chars: `rounded-sm`, `padding-inline: 0.3rem`, `padding-block: 0.1rem`,
  `font-size: 0.8rem`.
- Ligatures disabled inside code.

### 14.5 OpenGraph images — a known divergence

Worth flagging honestly: the OG image generator in the source project **does not match this design
system**. `next/og` (Satori) cannot resolve CSS custom properties, cannot use `next/font` variables,
and supports only a subset of CSS — so the generator falls back to inline styles with a completely
different palette:

| OG image uses | Site uses |
|---|---|
| `#0a0a0a` background (neutral near-black) | warm `oklch(0.18 0.01 98)` |
| `#fafafa` / `#a1a1aa` / `#71717a` text (cool zinc) | warm stone tokens |
| `#27272a` avatar circle | `--muted` |
| `fontFamily: "system-ui, sans-serif"` | Space Grotesk |
| `fontWeight: 700` for the title | max 500 on the site |
| `letterSpacing: "0.15em"` uppercase eyebrow | no such treatment on the site |

Layout that *is* worth reusing: 1200×630, `padding: 60px`, `flexDirection: column` with
`justifyContent: "space-between"`, title clamped to `maxWidth: 900px` and size-switched
(`52px`, dropping to `42px` when the title exceeds 50 characters), description truncated at 120
characters with an ellipsis, and a footer row with an initials circle + name/domain on the left and
the date on the right.

**Recommendation for the new project:** keep the layout, but replace the palette with the resolved
sRGB equivalents of your actual `--background` / `--foreground` / `--muted-foreground` / `--muted`
tokens (hardcoded, since Satori can't read the vars), and load Space Grotesk explicitly via the
`fonts` option of `ImageResponse`. That closes the gap the original left open. If you'd rather not
spend the effort, at minimum swap the cool zinc greys for warm ones so shared links don't look like
a different site.

---

## 15. Accessibility conventions

These are part of the design, not additions to it.

- **Skip link** as the first focusable element, fully styled on focus (see §9).
- `<main id="main-content" className="flex flex-1 flex-col">`.
- `aria-label` on every icon-only control, including the keyboard shortcut in the label:
  `aria-label="Toggle theme (D)"`, `aria-label="Home (H)"`.
- `aria-current="page"` on the active nav link; `aria-current="location"` on the active TOC row.
- `aria-hidden` on every decorative icon.
- `aria-expanded` on every disclosure trigger; `data-state="open"|"closed"` for styling.
- Screen-reader text for icon-only status: `<span className="sr-only">Current</span>` beside the dot.
- `role="status" aria-busy="true" aria-label="…"` on loading skeletons.
- Descriptive `alt` text with context: `` `Profile photo of ${name}, ${designation}` ``,
  `` `${company} logo` ``, `` `Cover image for ${title}` ``.
- `min-h-9` (36px) on small text triggers to preserve touch-target size.
- Every external link: `target="_blank" rel="noreferrer noopener"` + a visible `ArrowUpRight`.
- `env(safe-area-inset-*)` wrapped in `max()` for fixed-position elements.
- Full reduced-motion support at every layer (§12).
- `@media (forced-colors: active)` gives inline code a border, since forced colors strips
  backgrounds.
- Focus is never removed — `outline-none` always appears alongside a `focus-visible:ring-*`.

---

## 16. Porting to Tailwind v3

If the destination project is on Tailwind v3, the CSS in §3 will not compile as-is. Translation:

| v4 feature | v3 equivalent |
|---|---|
| `@import "tailwindcss"` | `@tailwind base; @tailwind components; @tailwind utilities;` |
| `@theme inline { --color-* }` | `theme.extend.colors` in `tailwind.config.ts`, referencing the CSS vars |
| `@theme inline { --radius-* }` | `theme.extend.borderRadius` |
| `@custom-variant dark (&:is(.dark *))` | `darkMode: ["class"]` |
| `@utility no-scrollbar { … }` | A plugin, or a plain CSS class in `@layer utilities` |
| OKLCH values | Keep them — supported in all current browsers. Wrap in `hsl()`-style var references if you need alpha modifiers to work: v3 needs `--background: 0.958 0.005 98` + `oklch(var(--background) / <alpha-value>)` |
| `bg-linear-to-r` | `bg-gradient-to-r` |
| `size-*` | Requires v3.4+; otherwise `h-* w-*` |
| `data-*:` / `has-*:` arbitrary variants | Mostly work in v3.4; complex ones like `has-data-[icon=inline-end]:pr-2.5` may need `plugin()` helpers |
| `text-*` opacity like `text-foreground/10` | Requires the `<alpha-value>` var format above |
| `--spacing` references in raw CSS | Replace `calc(var(--spacing) * 6)` with `1.5rem` etc. (v4's `--spacing` is `0.25rem`) |
| `origin-(--transform-origin)` shorthand | `origin-[var(--transform-origin)]` |
| `z-99`, `z-100` | Add to `theme.extend.zIndex` |
| `aspect-192/100` | `aspect-[192/100]` |

The alpha-modifier issue is the main gotcha. Everything else is mechanical.

---

## 17. Gotchas & anti-patterns

Things that will silently break the look if you get them wrong.

### Do

- Use `gap-*` on flex/grid parents for all spacing. Not margins.
- Use `text-balance` on every heading and `text-pretty` on every paragraph.
- Keep the two-tier contrast in articles: muted body, foreground headings.
- Preserve `pl-[3.25rem]` = logo size + gap in the accordion. Recompute if either changes.
- Preserve the concentric radius math when nesting rounded boxes.
- Pair `border` with `outline-1 outline-foreground/10` on images.
- Name transition properties explicitly.
- Name your `group/*` when nesting.
- Use `tabular-nums` on every number.
- Make exits ~60% the duration of entrances.

### Don't

- ❌ **`font-bold` / weight 700.** Max is 500 in the chrome, 600 inside `.typeset`.
- ❌ **Hardcoded hex colors.** Only exception: the GitHub heatmap greens.
- ❌ **Pure black or pure white.** `--foreground` light is `oklch(0.263 …)`, dark is `oklch(0.94 …)`.
- ❌ **A brand accent color.** There isn't one. Emphasis = lightness contrast.
- ❌ **`transition-all`.** Always enumerate.
- ❌ **Breakpoints above `md`.** The column caps at 768px; there is nothing to reflow.
- ❌ **Shadows on buttons, badges, or grid cells.** Cards and floating overlays only.
- ❌ **Assuming stock Tailwind radii.** `rounded-md` is 0.40rem here, not 0.375rem; `rounded-4xl` is
  1.30rem, not 2rem.
- ❌ **`rounded-full` on buttons.** They're `rounded-4xl`.
- ❌ **Wrapping the header in the padded column without `-mx-6`.** The blur band must span full width.
- ❌ **Solid `bg-destructive` fills.** Destructive is a 10%/20% tint with colored text.
- ❌ **Adding vertical margins to section children.** Breaks the rhythm.
- ❌ **`@tailwindcss/typography`.** Use the `typeset.css` in §4 instead; they conflict.
- ❌ **Forgetting `data-not-typeset` on custom `<pre>`.** Typeset will override your code styling.
- ❌ **Forgetting `shadcn` as a runtime dependency.** `@import "shadcn/tailwind.css"` will fail.
- ❌ **Light default theme.** `defaultTheme="dark"` — this system is designed dark-first.

### Copy voice (it's part of the design)

Section titles are one word or a short phrase: `Work`, `Experience`, `Stack`, `Connect`, `Writing`.
Descriptions are a single short sentence in sentence case with a period —
"Tools I reach for most days.", "Roles and teams I've shipped with.", "Pick the channel that fits."
Nav labels are lowercase. Error copy is calm, not apologetic. The wordmark is lowercase with a
trailing period. Keep it terse; the layout depends on short strings.

---

## 18. Build order & verification checklist

### Build in this order

1. Install dependencies (§2), including `shadcn` as a **runtime** dependency.
2. Add `postcss.config.mjs`.
3. Create `src/app/typeset.css` (§4) — before globals, since globals imports it.
4. Create `src/app/globals.css` (§3).
5. Add `src/lib/utils.ts` (`cn`).
6. Set up the root layout (§9): fonts, `ThemeProvider`, shell, skip link, providers.
7. Build `SiteHeader` and `SiteFooter` (§10).
8. Build `PageShellWrapper`, `ShellWrapper`, `SectionHeader` (§8).
9. Build the primitives: `Button`, `Kbd`, `Tooltip`, `Avatar` (§11.1, 11.5, 11.6, 11.9).
10. Build the composites you need: `TimelineLogo`, `StackBadge`, `SoftLink`, `Card`,
    `ExpandableSection` (§11).
11. Add `typeset` article rendering and code-block pipeline if the project has long-form content
    (§14).
12. Add `Toaster` and the floating TOC last (§11.10, 11.11) — they're independent.

### Verify

- [ ] Content column measures **720px** at viewport ≥ 768px (768 − 48 gutters).
- [ ] Header is **48px** tall, translucent, blurred, and its band spans the **full viewport width**
      while its contents align with the column.
- [ ] First section starts **64px** below the header; sections are **64px** apart.
- [ ] Toggling theme causes **no page-wide cross-fade** (`disableTransitionOnChange`).
- [ ] Dark is the default on first load even with a light OS preference.
- [ ] `rounded-md` computes to **0.4rem** and `rounded-4xl` to **1.3rem** in devtools.
- [ ] Cards in a `sm:grid-cols-2` row are exactly equal height with aligned title baselines.
- [ ] Card chevron fades + slides + scales in over 300ms on hover.
- [ ] Grid hairlines are **1px, never 2px** at any cell boundary, in both themes.
- [ ] No element uses `font-weight: 700`.
- [ ] Every secondary text element goes muted → foreground on hover.
- [ ] Every interactive element shows a visible focus ring on keyboard focus.
- [ ] Accordion expand feels like two layers (height, then content trailing by 40ms).
- [ ] Expanded accordion body aligns with the collapsed row's text column (52px inset).
- [ ] With `prefers-reduced-motion: reduce`, nothing animates and smooth-scroll is off.
- [ ] Article prose renders muted with foreground headings and links.
- [ ] Code blocks use the theme's `--card` background, not GitHub's.
- [ ] Line numbers stay pinned when a code block scrolls horizontally.
- [ ] Tables scroll horizontally with hidden scrollbars instead of compressing.
- [ ] Selection highlight is a warm tint, not the browser default blue.
- [ ] Scrollbars are 8px and foreground-tinted.
- [ ] `themeColor` meta matches the actual `--background` in each theme.
- [ ] Tab to the top of the page reveals a styled "Skip to main content" link.
