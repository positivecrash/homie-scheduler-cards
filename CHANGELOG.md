# Changelog

## [1.1.3]

### Bundle

- **Console:** Version is shown again in the browser console when cards register (e.g. "Homie Scheduler 1.1.3 · boiler-button-card"). Version is set at build time so it always matches the loaded bundle.

## [1.1.2]

### Climate slots

- **Slots with same time but different title no longer merge:** Display key and conflict checks now include title for all modes (including Off). You can add multiple slots at the same time and weekdays with different titles or modes; editing one no longer updates the other.
- **Title-only updates** apply only to items in the same display slot (same time, weekdays, duration, mode, temp, fan, title). Other slot-wide changes (time, weekdays, duration, mode) still apply to all entities in that time slot.
- **Add-slot conflict:** A new slot is blocked only when an identical slot exists (same time, days, mode, temperature, fan, duration, and title). Adding a slot at the same time with a different title or mode is allowed.

### Bundle

- **Fixed:** Duplicate `SCHEDULER_SWITCH_ENTITY` declaration in the all-in-one bundle is removed so the bundle loads without "Cannot declare a const variable twice" and configuration errors in the UI.

### Compatibility

- Works with Homie Scheduler Integration 1.1.0.

## [1.1.1]

### Climate slots

- Duration limits are fixed in code (0.5–12 h, step 0.5). Slider can no longer go to 0 or reset the add/edit form; config from the dashboard is ignored for min/max duration.

## [1.1.0]

### Climate cards

- A unique interface for add/edit slot was added, including modes, temperature, duration in hours, and entity list.

### Errors and notifications

- Error alerts are no longer shown as popups; failures are reported quietly in the browser console so the UI stays calm while still allowing debugging.

### Under the hood

- Safer handling of user and integration data in the UI (no script injection from messages or fan options). More robust parsing of numbers and duration across climate and boiler cards; internal errors are logged instead of ignored.

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
