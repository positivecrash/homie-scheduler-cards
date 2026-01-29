# Homie Scheduler Cards

Lovelace cards for schedule management (boiler, climate). Work with the **Homie Scheduler** integration.

## Cards

- **Boiler slots** – add/edit schedule slots for boiler/switch (time, duration, weekdays)
- **Boiler button** – one-click run for X minutes or recirculation mode (30 min)
- **Boiler status** – icon toggle, status text, optional auto turn-off
- **Climate slots** – schedule slots for climate entities (presets, time, weekdays)

## Requirements

- **Homie Scheduler** integration (install from HACS or manually)
- Home Assistant 2025.9 or newer

## After install

1. Add **one** Lovelace resource: **JavaScript Module** → URL of `homie-scheduler-cards.js` (HACS gives it after install).
2. Optionally add **Stylesheet** → `homie-custom-styles.css` from the same HACS folder for global CSS variables.
3. Add cards to the dashboard (e.g. `type: custom:homie-scheduler-boiler-slots`).

See the repository README for full configuration and customization.
