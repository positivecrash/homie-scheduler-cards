# Climate Schedule Slots Card

Card for managing schedule slots for climate entities (AC, heaters, etc.).

## Structure

The card is located in `src/climate/slots/`.

## Files

- `card-script.js` - main JavaScript file
- `card-styles.css` - styles
- `card-template.html` - HTML template
- `preview.html` - preview (optional)
- Build output: `dist/homie-scheduler-climate-slots.js`

## Usage

The card works with the `homie-schedule` integration and displays schedule for climate entities.

**Configuration:**
```yaml
type: custom:homie-scheduler-climate-slots
entity: climate.ac
title: AC Schedule
```

**Features:**
- Add/edit schedule slots for climate entities
- Select HVAC mode (heat/cool/auto/etc.) from available modes
- Configure time, duration (optional), and weekdays
- Enable/disable individual slots
- Expandable slot cards for detailed editing
- Uses `homie-schedule` integration for schedule management and "Next run" display
- Duration is optional - if not specified, slot will only turn on (not turn off)

**Special features for climate:**
- Automatically loads available HVAC modes from entity's `attributes.hvac_modes` (excludes "off")
- If duration is not specified, `service_end` is not added - entity will stay on in selected mode
- If duration is specified, entity will turn off after the duration

## Building

To build the production version:

```bash
cd src/climate/slots
bash build.sh
```

This will create `dist/homie-scheduler-climate-slots.js` with embedded styles and templates.

## Development

Open `preview.html` in a browser to preview and test the card without Home Assistant.
