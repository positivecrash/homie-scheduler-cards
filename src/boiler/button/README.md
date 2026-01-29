# Homie Boiler Schedule Button Card

A simple square button card for running a boiler schedule on demand for a specified duration.

## Features

- **Square button design** - Clean, modern square button
- **Configurable duration** - Set how long to run (in minutes)
- **Smart state detection** - Button becomes inactive if entity is already on
- **Active schedule indicator** - Button turns yellow when schedule is running
- **Human-readable duration** - Displays duration in a friendly format (e.g., "1 hour", "2h 30min")

## Installation

1. Build (writes to `dist/`; then copy to HA or use `install.sh`):
   ```bash
   cd homie-scheduler/src/boiler/button
   bash build.sh
   ```
   Output: `dist/homie-scheduler-boiler-button.js`

2. In HA: **Settings → Dashboards → Resources** add:
   - `/local/homie/homie-scheduler-boiler-button.js?v=YYYYMMDD_NNNN` (bump version after deploy for cache refresh)

3. Add the card to your Lovelace dashboard:
   ```yaml
   type: custom:homie-scheduler-boiler-button
   entity: switch.boiler
   duration: 60
   ```

## Configuration

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `entity` | string | Yes | - | Entity ID to control (e.g., `switch.boiler`) |
| `duration` | number | No | 60 | Duration in minutes to run the schedule |

## Usage

### Basic Configuration

```yaml
type: custom:homie-scheduler-boiler-button
entity: switch.boiler
duration: 60
```

### Custom Duration

```yaml
type: custom:homie-scheduler-boiler-button
entity: switch.boiler
duration: 90  # 1 hour 30 minutes
```

## Button States

1. **Normal** - White/gray button with "Run for" label and duration (e.g., "1 hour")
2. **Active** - Yellow button when schedule is running, shows "Run for - Heating"
3. **Disabled** - Grayed out and non-clickable when entity is already on

## Duration Formatting

The card automatically formats duration in a human-readable way:
- Less than 60 minutes: "30 min"
- Exactly 60 minutes: "1 hour"
- More than 60 minutes: "2 hours" or "2h 30min"

## Requirements

- Home Assistant with `homie-schedule` integration installed and configured
- The entity must be a switch or input_boolean that supports `turn_on` and `turn_off` services

## Development

To build the card from source:

```bash
cd dev
bash ../build.sh
```

The built file will be in `dist/homie-scheduler-boiler-button.js`.
