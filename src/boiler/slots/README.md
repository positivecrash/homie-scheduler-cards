# Boiler Schedule Slots Card

Card for managing schedule slots for boiler entities (switch/input_boolean).

## Structure

The card is located in `src/boiler/slots/`.

## Files

- `card-script.js` - main JavaScript file
- `card-styles.css` - styles
- `card-template.html` - HTML template
- `preview.html` - preview (optional)
- Build output: `dist/homie-scheduler-boiler-slots.js`

## Usage

The card works with the `homie-schedule` integration and displays schedule for boiler entities.

**Configuration:**
```yaml
type: custom:homie-scheduler-boiler-slots
entity: switch.boiler
title: Water Heater Schedule
```

**Features:**
- Add/edit schedule slots
- Configure time, duration (30/60 min), and weekdays
- Enable/disable individual slots
- Expandable slot cards for detailed editing
- Uses `homie-schedule` integration for schedule management and "Next run" display
- Automatically uses `switch.turn_on` and `switch.turn_off` services for boiler entities

## Building

To build the production version:

```bash
cd src/boiler/slots
bash build.sh
```

This will create `dist/homie-scheduler-boiler-slots.js` with embedded styles and templates.

## Development

Open `preview.html` in a browser to preview and test the card without Home Assistant.
