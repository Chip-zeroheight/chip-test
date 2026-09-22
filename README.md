# Design system starter (tokens → components → Storybook)

This is a ready-to-run starting point that wires your zeroheight-synced Figma
tokens into real React components, previewed in Storybook with a theme
switcher for your four modes (Baseline, Baseline Pro, Offset, WhiteLabel).

## How it fits into your `chip-test` repo

Your repo already has a `tokens/` folder that zeroheight's automation commits
to — that's your real source of truth and should **not** be replaced. Copy
everything from this starter **except** the `tokens/` folder into the root of
your cloned `chip-test` repo, so you end up with:

```
chip-test/
├── tokens/                 ← already exists, comes from zeroheight, leave as-is
├── src/
│   ├── components/         ← from this starter
│   └── tokens/              ← generated CSS, do not hand-edit (see below)
├── scripts/
│   └── build-tokens.js     ← from this starter
├── .storybook/              ← from this starter
├── package.json
├── tsconfig.json
└── .gitignore
```

If your `tokens/` folder has a nested structure like
`tokens/Mode 1/Baseline/Desktop.tokens.json`, or a flat one like
`tokens/Mode1_Baseline_Desktop.tokens.json`, both work — the build script
handles either layout and figures out the theme name automatically. If a
theme's name comes out wrong (check the console output when you run
`npm run build-tokens`), it's worth telling me the exact file/folder names in
your repo and I'll adjust the script's naming logic.

## First-time setup

1. `npm install`
2. `npm run storybook` — this automatically converts everything in `tokens/`
   into CSS (see below), then launches Storybook at `http://localhost:6006`.
3. Open the **Button** story, and use the **Theme** dropdown in the toolbar
   at the top to switch between your four modes — the button re-skins
   instantly, no code changes needed.

## How the token pipeline works

`scripts/build-tokens.js` reads every token JSON file under `tokens/`
(zeroheight's DTCG export format) and converts it into a CSS file per theme
in `src/tokens/`, e.g. `src/tokens/baseline.css`, scoped like:

```css
[data-theme="baseline"] {
  --primitive-color-azure-900: #161865;
  --brand-color-brand-100: #1b91c0;
  --semantic-color-background-secondary-default: var(--brand-color-brand-100);
  /* ...300+ more */
}
```

Your tokens are actually three layers deep (Primitive → Brand → Semantic),
and zeroheight exports the semantic/brand layers as *references* to other
tokens (e.g. `"{00 01 Primitive Brand.brand.color.neutral.150}"`). The script
resolves these into `var(--...)` chains, so the browser's CSS cascade — not
the script — does the final resolution. This means components should always
be styled using the most **semantic** variable available (e.g.
`var(--semantic-color-background-secondary-default)`) rather than a
primitive color directly, so they automatically re-theme correctly.

This runs automatically before `npm run storybook` and
`npm run build-storybook`, so the generated CSS in `src/tokens/` is always
current — it's gitignored on purpose, don't hand-edit it or commit it.

## Adding your other three theme files

Right now this starter has only been tested against your `Baseline` token
file. Once you copy this into your real repo (which already has all four
mode files committed by zeroheight), running `npm run build-tokens` should
automatically pick up all four and generate `baseline.css`,
`baseline-pro.css`, `offset.css`, and `whitelabel.css`, and the Storybook
theme switcher will list all four automatically (it reads
`src/tokens/themes.ts`, which is generated at the same time).

## The example Button component

`src/components/Button.tsx` + `Button.css` is a real, working component built
entirely from your semantic tokens (background, text color, border radius,
border width, spacing, font) — no hardcoded values. It's meant as a
reference for how future components should be built: always reach for a
`--semantic-*` variable first, falling back to `--brand-*` or
`--primitive-*` only if no semantic token exists yet for what you need.

## Next: closing the loop

Once this is committed and pushed to `chip-test`, the remaining steps are:

1. Connect the repo to Vercel (auto-deploys `npm run build-storybook` on
   every push to `main`) so there's a permanent hosted Storybook URL.
2. Change a variable in Figma → sync via the zeroheight plugin → merge the
   PR zeroheight opens → watch Storybook redeploy with the new value, same
   as the Baseline Walkthrough demo.
