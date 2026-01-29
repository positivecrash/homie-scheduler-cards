# Homie Scheduler Cards

Lovelace cards for schedule management (boiler, climate). Work together with the **homie-scheduler-integration** in Home Assistant.

## Project Structure

```
homie-scheduler-cards/
├── src/
│   ├── boiler/
│   │   ├── button/       # Boiler schedule button card
│   │   ├── slots/        # Boiler schedule slots card
│   │   └── status/       # Boiler status card
│   ├── climate/
│   │   └── slots/        # Climate schedule slots card
│   ├── shared/           # Shared build script and components
│   └── homie-custom-styles.css  # Template for custom styles
├── dist/                  # Build output (loader + all .js + homie-custom-styles.css)
├── install.sh            # Installation script
└── README.md
```

## Integration (homie-scheduler-integration)

Cards read data from the **Homie Scheduler** integration. You must install and configure it first.

**Entities created by the integration:**

1. **sensor.homie_scheduler_scheduler_info** – bridge for cards: `items`, `entity_ids`, `next_run`, `active_buttons`
2. **switch.homie_scheduler_schedule_enabled** – global scheduler on/off
3. **sensor.homie_scheduler_status** – status + next run (e.g. "On • Next in 15m")
4. **sensor.homie_scheduler_next_run** – next transition timestamp

**Services:** `homie_scheduler.set_items`, `add_item`, `update_item`, `delete_item`, `set_enabled`, `toggle_enabled`, `set_active_button`, `clear_active_button`

After adding the integration: **Settings → Devices & Services → Homie Scheduler → Configure** (e.g. boiler max runtime).

---

## Cards

### boiler/slots

Schedule management card for boiler/switch entities:
- Add/edit schedule slots
- Time, duration (optional), weekdays
- Enable/disable individual slots
- Intuitive interface with expandable cards
- Automatic service_start/service_end injection for switch entities

**Usage:**
```yaml
type: custom:homie-scheduler-boiler-slots
entity: switch.boiler
title: Water Heater Schedule
# Optional: duration configuration
duration_range: [15, 1440]  # [min, max] in minutes (default: [15, 1440])
duration_step: 15            # Step in minutes (default: 15)
# Or use separate parameters:
# min_duration: 15
# max_duration: 1440
# duration_step: 15
```

### boiler/button

Button card for running boiler schedule on demand with two display modes:
- **Normal mode**: Timer icon with "Run for" label and duration
- **Recirculation mode**: Large reload icon with "Recirculation" text (fixed 30 minutes)

**Features:**
- One-click schedule activation
- Configurable duration (in minutes) for normal mode, fixed 30 minutes for recirculation
- Smart state detection (disabled when entity is already on)
- Active schedule indicator (yellow button when running)
- Human-readable duration formatting
- State synchronization across multiple buttons for the same entity
- State persistence via integration (works across browser tabs/devices)

**How it works:**
- Uses JavaScript `setTimeout` for scheduling automatic turn-off (no schedule slot creation)
- Button state (active/inactive) is stored in the integration via `homie_scheduler.set_active_button` and `homie_scheduler.clear_active_button` services
- State is synchronized through the bridge sensor's `active_buttons` attribute
- Timer is restored from integration state if page is reloaded while boiler is running

**Usage - Normal Mode:**
```yaml
type: custom:homie-scheduler-boiler-button
entity: switch.boiler
duration: 60  # Duration in minutes (default: 60)
```

**Usage - Recirculation Mode:**
```yaml
type: custom:homie-scheduler-boiler-button
entity: switch.boiler
mode: recirculation
# Duration defaults to 30 minutes, but can be overridden:
# duration: 45  # Optional: custom duration in minutes
```

**Button States:**
- **Normal** – Blue button with timer icon, "Run for" label and duration (e.g., "1 hour")
- **Active** – Yellow button when schedule is running, shows duration (disabled, not clickable)
- **Disabled** – Grayed out and non-clickable when entity is already on (for other buttons of the same entity)
- **Recirculation (Normal)** – Blue button with large reload icon and "Recirculation" text below
- **Recirculation (Active)** – Yellow button with large reload icon and "Recirculation" text (disabled, not clickable)

### boiler/status

Status card for boiler/switch entities with icon-based toggle and automatic turn-off:
- Icon in circle (blue when off, yellow when on) – click to toggle switch
- Configurable title (falls back to entity friendly_name or entity_id)
- Dynamic subtitle showing status and next run information
- Optional automatic turn-off timer (default: 2 hours)

**Features:**
- One-click toggle via icon circle
- Automatic turn-off timer (configurable, default 120 minutes)
- Smart subtitle text:
  - When off + has schedules: "Next run: [time]"
  - When on + has turn-off time: "Runs, will be off at [time]"
  - When on + no turn-off time: "Runs, please switch off manually"
- Title fallback: config.title → entity friendly_name → entity_id
- Timer persistence via integration (works across browser tabs/devices)
- Timer restoration on page reload

**Usage:**
```yaml
type: custom:homie-scheduler-boiler-status
entity: switch.boiler
title: Boiler  # Optional: custom title (falls back to friendly_name or entity_id)
auto_off: 120  # Optional: auto-off duration in minutes (default: 120, set to 0 to disable)
```

**Configuration:**
- `entity` (required) – Switch/input_boolean entity to control
- `title` (optional) – Custom title for the card. If not provided, uses entity's friendly_name, or falls back to entity_id
- `auto_off` (optional) – Automatic turn-off duration in minutes:
  - Not specified: defaults to 120 minutes (2 hours)
  - `0`: disables automatic turn-off
  - Any positive number: sets custom duration in minutes

**Card States:**
- **Icon Circle (Off)** – Blue circle with water thermometer icon
- **Icon Circle (On)** – Yellow circle with water thermometer icon
- **Subtitle (Off + Schedules)** – "Next run: [time]" when schedules exist
- **Subtitle (On + Timer)** – "Runs, will be off at [time]" when auto-off timer is active
- **Subtitle (On + No Timer)** – "Runs, please switch off manually" when manually turned on

### climate/slots

Schedule management card for climate entities:
- Add/edit schedule slots
- HVAC mode selection (heat/cool/auto/etc.)
- Time, duration (optional), weekdays
- Enable/disable individual slots
- Intuitive interface with expandable cards
- Shows HVAC mode in slot status and "Next run"

**Usage:**
```yaml
type: custom:homie-scheduler-climate-slots
entity: climate.ac
title: AC Schedule
# Optional: duration configuration (duration is optional for climate)
duration_range: [15, 1440]  # [min, max] in minutes (default: [15, 1440])
duration_step: 15            # Step in minutes (default: 15)
```

---

## Customization

All Homie Scheduler cards support customization through CSS variables. Override styles in **`/config/www/homie/homie-custom-styles.css`** (added to Lovelace Resources during installation). Cards live in shadow DOM: set variables on **`home-assistant`** for global overrides, or on the card type (e.g. `homie-scheduler-boiler-slots`) for per-card overrides.

### Slots cards (homie-scheduler-boiler-slots, homie-scheduler-climate-slots)

```css
homie-scheduler-boiler-slots,
homie-scheduler-climate-slots {
  /* Card (header, slot card) */
  --homie-slots-accent: var(--primary-color, #03a9f4);
  --homie-slots-bg: var(--ha-card-background, rgba(255, 255, 255, 0.9));
  --homie-slots-radius: var(--ha-card-border-radius, 8px);
  --homie-slots-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0, 0, 0, 0.1));
  --homie-slots-text: var(--primary-text-color, #212121);
  --homie-slots-text-secondary: var(--secondary-text-color, #757575);
  --homie-slots-text-on-accent: var(--text-primary-on-background, #ffffff);
  --homie-slots-disabled: var(--disabled-color, #9e9e9e);

  /* Select (.homie-select) */
  --homie-slots-bg-select: var(--ha-card-background, rgba(255, 255, 255, 0.9));
  --homie-slots-divider-select: var(--divider-color, rgba(0, 0, 0, 0.12));
  --homie-slots-text-select: var(--primary-text-color, #212121);
  --homie-slots-radius-select: var(--mdc-shape-small, 4px);
  --homie-slots-focus-ring: 0 0 0 2px rgba(3, 169, 244, 0.1);

  /* Input / select padding (shared for .homie-input and .homie-select) */
  --homie-slots-padding-input-vertical: var(--mdc-shape-small, 4px);
  --homie-slots-padding-input-horizontal: var(--mdc-shape-small, 8px);
  /* Input (.homie-input) border and radius */
  --homie-slots-border-input: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
  --homie-slots-radius-input: var(--mdc-shape-small, 4px);

  /* Dividers, radii, secondary bg, error */
  --homie-slots-divider: var(--divider-color, rgba(0, 0, 0, 0.12));
  --homie-slots-radius-small: var(--mdc-shape-small, 4px);
  --homie-slots-radius-medium: var(--mdc-shape-medium, 8px);
  --homie-slots-secondary-bg: var(--secondary-background-color, #f5f5f5);
  --homie-slots-error-color: var(--error-color, #f44336);

  /* Button outline (.button-outline) */
  --homie-slots-button-outline-padding: var(--mdc-button-horizontal-padding, 16px);
  --homie-slots-button-outline-margin-top: var(--mdc-layout-grid-gutter, 12px);
  --homie-slots-button-outline-radius: var(--ha-card-border-radius, 8px);
  --homie-slots-button-outline-bg: transparent;
  --homie-slots-button-outline-border: 2px solid var(--primary-color, #03a9f4);
  --homie-slots-button-outline-color: var(--primary-color, #03a9f4);
  --homie-slots-button-outline-font-size: var(--mdc-typography-button-font-size, 14px);
  --homie-slots-button-outline-font-weight: var(--mdc-typography-button-font-weight, 900);
  --homie-slots-button-outline-letter-spacing: var(--mdc-typography-button-letter-spacing, 0em);
  --homie-slots-button-outline-min-height: var(--mdc-button-height, 36px);
  --homie-slots-button-outline-hover-shadow: 0 2px 8px rgba(3, 169, 244, 0.3);
  --homie-slots-button-outline-active-transform: scale(0.98);
  --homie-slots-button-outline-active-shadow: 0 1px 4px rgba(3, 169, 244, 0.2);

  /* Popup (.popup-content) */
  --homie-slots-popup-background: var(--ha-dialog-background, var(--ha-card-background));
  --homie-slots-popup-color: var(--primary-text-color, #212121);
  --homie-slots-popup-backdrop-filter: var(--ha-card-backdrop-filter, none);
  --homie-slots-popup-box-shadow: var(--ha-card-box-shadow, none);
  --homie-slots-popup-border-radius: var(--ha-card-border-radius, 16px);
}
```

### Button card (homie-scheduler-boiler-button)

```css
homie-scheduler-boiler-button {
  --homie-button-accent: var(--primary-color, #03a9f4);
  --homie-button-radius: var(--ha-card-border-radius, 12px);
  --homie-button-bg-inactive: var(--ha-card-background);
  --homie-button-bg-active: var(--primary-color, #03a9f4);
  --homie-button-bg-disabled: var(--ha-card-background);
  --homie-button-text-inactive: var(--primary-color, #03a9f4);
  --homie-button-text-active: var(--text-primary-color, #fff);
  --homie-button-text-disabled: var(--disabled-text-color, rgba(255,255,255,0.5));
  --homie-button-shadow: var(--ha-card-box-shadow, none);
  --homie-button-shadow-active: var(--ha-card-box-shadow, none);
  --homie-button-backdrop-filter: var(--ha-card-backdrop-filter, none);
  --homie-button-border-color: var(--divider-color, rgba(255, 255, 255, 0.12));
}
```

### Status card (homie-scheduler-boiler-status)

```css
homie-scheduler-boiler-status {
  --homie-status-accent: var(--state-switch-on-color, var(--warning-color, #ffc107));
  --homie-status-bg: var(--ha-card-background, rgba(255, 255, 255, 0.9));
  --homie-status-radius: var(--ha-card-border-radius, 4px);
  --homie-status-shadow: var(--ha-card-box-shadow, 0 2px 4px rgba(0, 0, 0, 0.1));
  --homie-status-text: var(--primary-text-color, #212121);
  --homie-status-text-secondary: var(--secondary-text-color, #757575);
  --homie-status-text-on-accent: var(--text-primary-on-background, #ffffff);
  --homie-status-disabled: var(--disabled-color, #9e9e9e);
}
```

---

## Build

From each card directory:

```bash
cd src/boiler/button && bash build.sh
cd src/boiler/slots  && bash build.sh
cd src/boiler/status && bash build.sh
cd src/climate/slots && bash build.sh
```

Output goes to `dist/` (and `homie-custom-styles.css` is copied there on each build).

## Installation

### Via HACS (recommended)

1. In HACS go to **Frontend** → **Explore & Download Repositories** → search for **Homie Scheduler Cards** → Download.
2. **Settings → Dashboards → Resources** → Add resource:
   - **URL:** the path HACS shows for the plugin (e.g. `/hacsfiles/homie-scheduler-cards/homie-scheduler-cards.js`)
   - **Type:** JavaScript Module
3. Optionally add **Stylesheet** with URL to `homie-custom-styles.css` from the same HACS folder (for global CSS variables).
4. Add cards to the dashboard (e.g. `type: custom:homie-scheduler-boiler-slots`).

Only one resource (the loader) is required; it loads all card modules from the same directory.

### Manual

```bash
bash install.sh /path/to/homeassistant/config
```

This copies `dist/*.js` and `dist/homie-custom-styles.css` to `config/www/homie/`.

Then in HA:
1. **Settings → Dashboards → Resources** → Add one resource: `/local/homie/homie-scheduler-cards.js` as **JavaScript Module** (loader loads all cards from the same folder)
2. Optionally add `/local/homie/homie-custom-styles.css` as **Stylesheet**
3. Add cards to the dashboard (e.g. `type: custom:homie-scheduler-boiler-slots`)

### Example dashboard configuration

```yaml
# Boiler schedule slots
type: custom:homie-scheduler-boiler-slots
entity: switch.boiler
title: Water Heater Schedule
duration_range: [15, 1440]

# Climate schedule slots
type: custom:homie-scheduler-climate-slots
entity: climate.ac
title: AC Schedule

# Boiler button (normal)
type: custom:homie-scheduler-boiler-button
entity: switch.boiler
duration: 60

# Boiler button (recirculation)
type: custom:homie-scheduler-boiler-button
entity: switch.boiler
mode: recirculation

# Boiler status
type: custom:homie-scheduler-boiler-status
entity: switch.boiler
title: Boiler
auto_off: 120
```

## Requirements

- **homie-scheduler-integration** installed and configured in Home Assistant
- Home Assistant Core 2025.9 or newer

## Publishing to GitHub (first time)

1. On GitHub create a new **empty** repository (e.g. `homie-scheduler-cards`); do not add README or .gitignore.
2. In the project folder (if this folder is inside another git repo, use a separate copy or a new clone so this project is the only content):

```bash
cd /path/to/homie-scheduler-cards
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/homie-scheduler-cards.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username. If the repo already has git and remote, just push.

## Releasing

Releases are used for versioning and for HACS to offer updates.

1. **Build** so `dist/` is up to date:

```bash
cd src/boiler/button && bash build.sh
cd ../slots && bash build.sh
cd ../status && bash build.sh
cd ../../climate/slots && bash build.sh
```

2. **Commit** changes (including `dist/`), then **tag** and **push**:

```bash
git add .
git commit -m "Release v1.0.0"
git tag v1.0.0
git push origin main
git push origin v1.0.0
```

3. On GitHub: **Releases** → **Create a new release** → choose tag `v1.0.0`, set title (e.g. `v1.0.0`) and optional release notes → **Publish release**.

Use [semantic versioning](https://semver.org/) (e.g. `v1.0.1` for fixes, `v1.1.0` for new features).

## License

MIT – see [LICENSE](LICENSE).
