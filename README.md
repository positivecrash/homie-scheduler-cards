# Dashboard-first scheduling for Home Assistant — slots, buttons, status

Lovelace cards for schedule management in Home Assistant. Set up in one click when to switch off your smart home device. Easy UI scheduler for intuitive run slots. The [Homie Scheduler](https://github.com/positivecrash/homie-scheduler-integration) integration supports all switch-like entities (switch, input_boolean, light, fan, cover) and climate. Cards are split by purpose because the UI for different devices should be different: boiler cards for water heaters and on/off appliances, climate cards for AC and thermostats (e.g. underfloor heating). More card variants are planned.

[![Open your Home Assistant instance and open a repository in the HACS store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=positivecrash&repository=homie-scheduler-cards&category=plugin)

## Cards list

- **Boiler slots** – add/edit schedule slots for boiler/switch (time, duration, weekdays)
- **Boiler button** – one-click run for X minutes or recirculation mode
- **Boiler status** – icon toggle, status text, latest activity info, optional auto turn-off
- **Climate slots** – schedule slots for climate entities (presets, time, weekdays)

## Requirements

- [**Homie Scheduler** integration](https://github.com/positivecrash/homie-scheduler-integration)
- Home Assistant 2025.9 or newer

## Demonstration

You can build the dashboard you prefer with customizable separate cards. See how the Water Heater dashboard is built (for the iOS theme I also overrode some CSS variables for the cards).

![Boiler Homie Scheduler cards demonstration](https://github.com/positivecrash/homie-scheduler-cards/raw/main/docs/images/Homie-Scheduler-Boiler-Cards.gif)


## Water Heater cards features

In the integration settings you can set a maximum run time per entity; it applies whenever the device is on and Home Assistant is running, regardless of how the device was turned on (schedule, button, or manually).

### Boiler status

![Boiler status](https://github.com/positivecrash/homie-scheduler-cards/raw/main/docs/images/homie-scheduler-boiler-status.png)

- Latest activity status: when and for how long the boiler was switched on
- Max run status: if set in the integration settings, shows max run time
- Next run status: if a schedule is set up via the slots card, shows time left until the next run
- Customizable name
- On/off status next to the name
- Toggle by clicking the icon circle

### Boiler schedule slots

![Boiler schedule slots](https://github.com/positivecrash/homie-scheduler-cards/raw/main/docs/images/homie-scheduler-boiler-slots.png)

Runs the boiler on a schedule without creating automations one by one: change times and weekdays, enable or disable slots, and set clear names—all from the card. For how the schedule is stored and enforced, see the [integration README](https://github.com/positivecrash/homie-scheduler-integration).

### Boiler run button

![Boiler buttons](https://github.com/positivecrash/homie-scheduler-cards/raw/main/docs/images/homie-scheduler-boiler-buttons.png)

Set fixed run durations in the card. Configure your own set of duration buttons.

## Climate cards features

These cards are for the climate domain. Typically they target devices such as air conditioners and underfloor heating thermostats. In the integration settings you can set a maximum run time per entity; it applies whenever the device is on and Home Assistant is running, regardless of how the device was turned on (schedule, button, or manually).

### Climate schedule slots

Schedule climate entities (HVAC mode, temperature, fan, optional duration in hours) by adding and editing slots: set time, weekdays, and optionally which entities the slot applies to.

## Manual installation

1. Copy files from `dist/` into your Home Assistant config under `config/www/homie/` (create the `homie` folder if needed).
2. In HA: **Settings → Dashboards → Resources** → add **one** resource:
   - **`homie-scheduler-cards.js`** as **JavaScript Module** — this single file includes all cards (boiler button, status, slots, climate slots).
   Optionally add **`homie-custom-styles.css`** as **Stylesheet**. Then add cards to the dashboard (e.g. `type: custom:homie-scheduler-boiler-slots`).

   *Alternatively*, you can add each card file from `dist/` as a separate JavaScript Module instead of the bundle.

### When HA runs in Docker

The container usually mounts the config from a folder **other than** `~/.homeassistant` (e.g. `./config` next to `docker-compose.yml`). Deploy into that folder so the new files are actually served:

```bash
# Example: config is in ./config
./deploy.sh ./config

# Or deploy to both local and Docker config
./deploy.sh ~/.homeassistant && ./deploy.sh /path/to/docker/config
```

After copying, restart the container or reload the frontend. In DevTools → Network, check that the loaded JS shows the latest "Last build" date.


---


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
├── dist/                  # Build output (bundle homie-scheduler-cards.js + individual .js + homie-custom-styles.css)
│
└── README.md
```

---

## Cards Usage

### boiler/slots

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

**Normal Mode:**
```yaml
type: custom:homie-scheduler-boiler-button
entity: switch.boiler
duration: 60  # Duration in minutes (default: 60)
```

**Recirculation Mode:**

Works same as normal, but has different appearance.

```yaml
type: custom:homie-scheduler-boiler-button
entity: switch.boiler
mode: recirculation
# Duration defaults to 30 minutes, but can be overridden:
# duration: 45  # Optional: custom duration in minutes
```


### boiler/status

```yaml
type: custom:homie-scheduler-boiler-status
entity: switch.boiler
title: Boiler  # Optional: custom title (falls back to friendly_name or entity_id)
```


### climate/slots

```yaml
type: custom:homie-scheduler-climate-slots
entity: climate.ac
title: AC Schedule
# Optional: duration (hours) — same mechanism as boiler slots
# duration_range: [0.5, 12]   # [min, max] in hours (default: [0.5, 12])
# min_duration: 0.5
# max_duration: 12
# duration_step: 0.5
```

---

## Customization

All Homie Scheduler cards support customization through CSS variables. Override styles in **`/config/www/homie/homie-custom-styles.css`** (added to Lovelace Resources during installation).

All CSS variables are listed in **`src/homie-custom-styles.css`** with comments for each card (slots cards, button card, status card). Copy that file to `/config/www/homie/homie-custom-styles.css`, add it as a Lovelace Stylesheet, then uncomment and edit the blocks you need.

---

## Build (only for developers)

From each card directory:

```bash
cd src/boiler/button && bash build.sh
cd src/boiler/slots  && bash build.sh
cd src/boiler/status && bash build.sh
cd src/climate/slots && bash build.sh
node build-bundle.js
```

Output goes to `dist/`. The last step builds **homie-scheduler-cards.js** as a single bundle of all cards (for one-file install). `homie-custom-styles.css` is copied to `dist/` on each card build.


## License

MIT – see [LICENSE](LICENSE).
