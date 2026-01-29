# Shared Components

Shared **JS and HTML only**. CSS lives in each card's `card-styles.css` so variables can be overridden per card.

## Structure

```
shared/
├── build.sh              # Common build script (reads card-styles.css, inlines shared JS/HTML)
├── schedule-helper/      # schedule-helper.js
├── selector-duration/    # duration-selector.js, duration-selector.html
└── selector-weekday/     # weekday-selector.js, weekday-selector.html
```

## Build

- **JS**: Inlined from each shared `*.js` into the card bundle.
- **HTML**: Template markers `<!-- SHARED:name -->` in card-template.html are replaced with shared `*.html` content.
- **CSS**: Not in shared. Slots cards (boiler/slots, climate/slots) have common/slot/popup/duration styles in their own `card-styles.css` for per-card `--homie-slots-*` overrides.

## Adding a shared component

1. Add a directory under `shared/` with `component.js` and optionally `component.html`.
2. Build will auto-include `.js` and replace `<!-- SHARED:component -->` with `.html`.
3. If the component needs styles, add them to the card(s) that use it (in each card's `card-styles.css`).
