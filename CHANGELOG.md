# Changelog

## [1.0.3]

### Button

- Recirculation: when entity is turned ON from outside (physical button, another toggle), set timer for duration and turn off; fallback in render if `state_changed` was missed

### Slots

- Remove slot without confirmation dialog

### Status

- Show On/Off after title

## [1.0.2]

### Status

- Fixed countdown "will be off in" not updating after slot start until page refresh (use bridge state from state_changed)

### Build / Docs

- Short header in built cards and CSS (name, last build, version)
- homie-custom-styles.css: comments in English, fixed nested-comment linter errors

## [1.0.1]

### Button

- Fixed disabled state

### Status

- Fixed remaining time display until work ends
- Added info whether max runtime limit is set for the entity
- Removed `auto_off` parameter from card config

### Slots

- Fixed empty name input
