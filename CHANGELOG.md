# Changelog

## [1.0.6]

### Status

- Max run time: formatted as "1 h 40 min" instead of raw decimal (e.g. 1.666… hours)
- Icon button: removed hover CSS (no scale/opacity on hover)
- Latest activity: today shown as time (e.g. "22:06 for 4 min"), other days as date (e.g. "10 Feb for 4 min"); updates when bridge state changes without page refresh

## [1.0.5]

### Status

- Compatible with integration 1.0.5: status card still calls `register_entity_for_last_run` when it loads so the entity is added to latest-activity tracking (stored in integration Store)

### Slots

- Configurable duration step fix: card config `duration_step` (minutes) for add-slot and edit duration selector; default 15

## [1.0.4]

### Status

- Register entity for Latest activity tracking (external turn-on recorded when app closed)
- Latest activity: show duration with seconds (e.g. "4 min 30 s")

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
