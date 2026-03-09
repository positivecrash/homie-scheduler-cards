/**
 * Scheduler Climate Slots Card
 * Last build: 2026-03-06T15:15:51.756Z
 * Version: 1.1.1
 */

const SCHEDULER_SWITCH_ENTITY = 'switch.homie_scheduler_enabled';

// Use hours duration selector (0.5–12 h, step 0.5). In bundle, boiler loads first and sets DurationSelector = mins; climate must use DurationSelectorHours.
const DurationSelector = window.DurationSelectorHours || window.DurationSelector;

// Shared Components (auto-included from shared/)
// Shared component: card-console-info/card-console-info.js
/**
 * Shared console info for Homie Scheduler cards.
 * Logs branded card name. No version in resources to avoid cache sticking to old builds.
 */
if (typeof window.logCardInfo === 'undefined') {
  window.logCardInfo = function (cardName) {
    console.info(
      '%c Homie Scheduler %c ' + cardName,
      'color: white; background:rgb(94, 94, 243); font-weight: 700; padding 5px;',
      'color: rgb(94, 94, 243); background: white; font-weight: 700; padding 5px;'
    );
  };
}

// Shared component: entities-selector/entities-selector.js
/**
 * Shared: entities-selector
 * Fills an entities list from HTML template and attaches change handlers.
 * All HTML structure is in entities-selector.html (list container + row template).
 *
 * @param {Element} root - Container that has .entities-selector-list and .entities-selector-row-tpl
 * @param {Object} options
 * @param {string[]} options.entities - Entity IDs to show
 * @param {string[]|Set<string>} options.checkedEntityIds - Which entities are checked
 * @param {Object} options.hass - Home Assistant state object (for friendly_name)
 * @param {function(string)} [options.onCheck] - Called when an entity is checked
 * @param {function(string)} [options.onUncheck] - Called when an entity is unchecked
 * @param {function(string): boolean} [options.isEntityDisabled] - If true, row is disabled and unchecked
 */
function attachEntitiesList(root, options) {
  if (!root) return;
  const listEl = root.querySelector('.entities-selector-list');
  const rowTpl = root.querySelector('.entities-selector-row-tpl');
  if (!listEl || !rowTpl || !rowTpl.content) return;

  const {
    entities = [],
    checkedEntityIds = [],
    hass = null,
    onCheck = null,
    onUncheck = null,
    isEntityDisabled = null
  } = options;

  const checkedSet = checkedEntityIds instanceof Set
    ? checkedEntityIds
    : new Set(Array.isArray(checkedEntityIds) ? checkedEntityIds : []);

  listEl.innerHTML = '';
  entities.forEach(entityId => {
    const clone = rowTpl.content.cloneNode(true);
    const row = clone.querySelector('.entities-selector-row');
    const input = clone.querySelector('input[name="entities-selector-entity"]');
    const nameEl = clone.querySelector('.entities-selector-entity-name');
    if (!input || !nameEl) return;

    const name = (hass && hass.states && hass.states[entityId] && hass.states[entityId].attributes && hass.states[entityId].attributes.friendly_name) || entityId;
    const disabled = typeof isEntityDisabled === 'function' && isEntityDisabled(entityId);
    const checked = !disabled && checkedSet.has(entityId);

    input.value = entityId;
    input.checked = checked;
    input.disabled = !!disabled;
    nameEl.textContent = name;
    if (disabled) row.classList.add('entities-selector-row-unsupported');

    input.addEventListener('change', () => {
      if (input.checked && onCheck) onCheck(entityId);
      if (!input.checked && onUncheck) onUncheck(entityId);
    });
    listEl.appendChild(clone);
  });
}

// Expose for cards (build strips export)
if (typeof window !== 'undefined') {
  window.EntitiesSelector = { attachEntitiesList };
}

// Shared component: schedule-helper/schedule-helper.js
/**
 * Schedule Helper Utility
 * 
 * Shared utility for adding schedule slots.
 * Used by both boiler and climate schedule cards.
 */

// Prevent duplicate class declaration when multiple cards are loaded
if (typeof window.ScheduleHelper === 'undefined') {
  window.ScheduleHelper = class ScheduleHelper {
  /**
   * Escape string for safe use in HTML (prevents XSS when interpolating into innerHTML).
   * @param {string} str - Raw string
   * @returns {string} Escaped string
   */
  static escapeHtml(str) {
    if (str == null || typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Convert duration in hours to minutes (for climate card; API uses minutes).
   * @param {number|null|string} hours - Duration in hours
   * @returns {number|null} Minutes or null if invalid
   */
  static durationHoursToMinutes(hours) {
    if (hours == null || hours === '') return null;
    const h = parseFloat(hours);
    if (Number.isNaN(h) || h < 0) return null;
    return Math.round(h * 60);
  }

  /**
   * Convert duration in minutes to hours (for climate card display).
   * @param {number|null|string} minutes - Duration in minutes
   * @returns {number|null} Hours or null if invalid
   */
  static durationMinutesToHours(minutes) {
    if (minutes == null || minutes === '') return null;
    const m = parseInt(minutes, 10);
    if (Number.isNaN(m) || m < 0) return null;
    return m / 60;
  }

  /**
   * Create slot data structure for add_item service
   * @param {Object} params - Slot parameters
   * @param {string} params.entity_id - Entity ID to control
   * @param {string} params.time - Time in HH:MM format
   * @param {number} params.duration - Duration in minutes (optional for climate)
   * @param {number[]} params.weekdays - Array of weekday numbers (0-6)
   * @param {Object} params.service_start - Service start object with name and value (required)
   * @param {Object} params.service_end - Service end object with name and value (optional)
   * @param {string} params.title - Optional title for the slot
   * @returns {Object} Slot data for add_item service
   */
  static createSlotData({
    entity_id,
    time,
    duration,
    weekdays,
    service_start,
    service_end = null,
    temporary = false,  // If true, slot won't be visible in UI
    title = null  // Optional title for the slot
  }) {
    const slotData = {
      entity_id: entity_id,
      time: time,
      weekdays: weekdays,
      enabled: true,
      service_start: service_start
    };
    
    // Add duration only if specified (required for boiler, optional for climate)
    if (duration !== null && duration !== undefined && duration !== '') {
      const d = parseInt(duration, 10);
      if (!Number.isNaN(d) && d > 0) slotData.duration = d;
    }
    
    // Add service_end only if specified
    if (service_end) {
      slotData.service_end = service_end;
    }
    
    // Add title only if specified
    if (title !== null && title !== undefined && title !== '') {
      slotData.title = title;
    }
    
    // Mark as temporary (hidden from UI)
    if (temporary) {
      slotData.temporary = true;
    }
    
    return slotData;
  }

  /**
   * Create service objects for switch entities (boiler)
   * @param {string} entity_id - Entity ID
   * @returns {Object} Object with service_start and service_end for switches
   */
  static createSwitchServices(entity_id) {
    return {
      service_start: {
        name: "switch.turn_on",
        value: { entity_id: entity_id }
      },
      service_end: {
        name: "switch.turn_off",
        value: { entity_id: entity_id }
      }
    };
  }

  /**
   * Create service objects for climate entities
   * @param {string} entity_id - Entity ID
   * @param {string} hvac_mode - HVAC mode (e.g., "heat", "cool", "auto")
   * @param {Object} [opts] - Optional: { temperature: number, fan_mode: string }
   * @returns {Object} Object with service_start and service_end for climate
   */
  static createClimateServices(entity_id, hvac_mode, opts = {}) {
    const value = {
      entity_id: entity_id,
      hvac_mode: hvac_mode
    };
    if (opts.temperature != null && opts.temperature !== '') {
      const t = Number(opts.temperature);
      if (!Number.isNaN(t)) value.temperature = t;
    }
    if (opts.fan_mode != null && opts.fan_mode !== '') {
      value.fan_mode = opts.fan_mode;
    }
    return {
      service_start: {
        name: "climate.set_hvac_mode",
        value: value
      },
      service_end: {
        name: "climate.set_hvac_mode",
        value: {
          entity_id: entity_id,
          hvac_mode: "off"
        }
      }
    };
  }

  /**
   * Get current time in HH:MM format
   * @returns {string} Current time as HH:MM
   */
  static getCurrentTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * Get all weekdays array [0,1,2,3,4,5,6]
   * @returns {number[]} Array of all weekday numbers
   */
  static getAllWeekdays() {
    return [0, 1, 2, 3, 4, 5, 6];
  }

  /**
   * Force scheduler update after adding item
   * This triggers entity update and re-render
   * @param {Object} context - Context object with hass, bridgeSensor, and optional render callback
   * @param {Object} context.hass - Home Assistant object
   * @param {string} context.bridgeSensor - Bridge sensor entity ID
   * @param {Function} context.onRender - Optional callback for render (receives hass object)
   */
  static async forceSchedulerUpdate({ hass, bridgeSensor, onRender = null }) {
    if (!hass || !bridgeSensor) {
      return;
    }

    // Request entity update from server
    try {
      await hass.callService('homeassistant', 'update_entity', {
        entity_id: bridgeSensor
      });
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) console.warn('ScheduleHelper.forceSchedulerUpdate: update_entity failed', e);
    }

    // Wait for state to update from server, then trigger full re-render
    setTimeout(async () => {
      if (hass) {
        // Request fresh state again
        try {
          await hass.callService('homeassistant', 'update_entity', {
            entity_id: bridgeSensor
          });
        } catch (e) {
          if (typeof console !== 'undefined' && console.warn) console.warn('ScheduleHelper.forceSchedulerUpdate: update_entity (retry) failed', e);
        }

        // Trigger full re-render
        setTimeout(() => {
          if (hass && onRender) {
            // Update hass reference to trigger re-render
            onRender({ ...hass });
          }
        }, 200);
      }
    }, 500);
  }

  /**
   * Add a schedule slot (complete workflow)
   * This is the main method that should be used by all cards
   * @param {Object} params - Parameters
   * @param {Object} params.hass - Home Assistant object
   * @param {Function} params.callService - Function to call service (receives service name and data)
   * @param {Function} params.getBridgeState - Function to get bridge state
   * @param {string} params.entity_id - Entity ID to control
   * @param {string} params.time - Time in HH:MM format (optional, defaults to current time)
   * @param {number} params.duration - Duration in minutes (required for boiler, optional for climate)
   * @param {number[]} params.weekdays - Array of weekday numbers (optional, defaults to all weekdays)
   * @param {Object} params.service_start - Service start object with name and value
   * @param {Object} params.service_end - Service end object with name and value (optional)
   * @param {string} params.title - Optional title for the slot
   * @param {string} params.bridgeSensor - Bridge sensor entity ID (optional, for force update)
   * @param {Function} params.onRender - Optional callback for render (receives hass object)
   * @returns {Promise} Promise that resolves when slot is added
   */
  static async addScheduleSlot({
    hass,
    callService,
    getBridgeState,
    entity_id,
    time = null,
    duration = null,
    weekdays = null,
    service_start,
    service_end = null,
    temporary = false,
    title = null,
    bridgeSensor = null,
    onRender = null
  }) {
    // Ensure integration is enabled
    const bridgeState = getBridgeState ? getBridgeState() : null;
    if (bridgeState?.state !== 'active') {
      await callService('set_enabled', { enabled: true });
    }

    // Create slot data
    const addItemData = this.createSlotData({
      entity_id: entity_id,
      time: time || this.getCurrentTime(),
      duration: duration,
      weekdays: weekdays || this.getAllWeekdays(),
      service_start: service_start,
      service_end: service_end,
      temporary: temporary,
      title: title
    });

    // Add slot
    await callService('add_item', addItemData);

    // Force scheduler update if bridgeSensor provided
    if (bridgeSensor) {
      await this.forceSchedulerUpdate({
        hass: hass,
        bridgeSensor: bridgeSensor,
        onRender: onRender
      });
    }
  }
  };
  
  // Already assigned to window.ScheduleHelper above, no need to reassign
}

// Shared component: selector-duration/selector-duration.js
/**
 * Duration Selector — shared module.
 * Two variants: DurationSelectorMins (boiler, minutes) and DurationSelectorHours (climate, hours).
 * In bundle, boiler loads first and sets window.DurationSelector = Mins; climate uses window.DurationSelectorHours.
 */

// --- Minutes variant (boiler: 15–1440 min, step 15) ---

const DurationSelectorMins = class DurationSelector {
  static computeStep(min, max, preferredStep = 15) {
    const range = max - min;
    if (range <= 0) return 1;
    if (preferredStep >= range) return range;
    const divisors = [];
    for (let i = 1; i <= range; i++) {
      if (range % i === 0) divisors.push(i);
    }
    if (divisors.length === 0) return 1;
    let best = divisors[0];
    for (let j = 0; j < divisors.length; j++) {
      const d = divisors[j];
      if (Math.abs(d - preferredStep) < Math.abs(best - preferredStep)) best = d;
    }
    return best;
  }

  static computeAllowedValues(min, max, stepBase = 5) {
    if (max < min) return [min];
    const list = [];
    let v = Math.ceil(min / stepBase) * stepBase;
    if (v > min) list.push(min);
    while (v <= max) {
      list.push(v);
      v += stepBase;
    }
    if (list.length && list[list.length - 1] < max) list.push(max);
    return list;
  }

  static getSelectedDuration(shadowRoot) {
    let wrapper = null;
    if (shadowRoot && shadowRoot.classList && shadowRoot.classList.contains('duration-selector-wrapper')) {
      wrapper = shadowRoot;
    } else {
      wrapper = shadowRoot.querySelector('.duration-selector-wrapper');
    }
    if (wrapper) {
      const input = wrapper.querySelector('[data-action="update-duration"]');
      if (input) {
        const value = input.value;
        return value && value !== '' ? parseInt(value, 10) : null;
      }
    }
    const input = shadowRoot.querySelector('[data-action="update-duration"]');
    if (!input) return null;
    const value = input.value;
    return value && value !== '' ? parseInt(value, 10) : null;
  }

  static setSelectedDuration(shadowRoot, duration) {
    const wrapper = shadowRoot.classList && shadowRoot.classList.contains('duration-selector-wrapper')
      ? shadowRoot
      : shadowRoot.querySelector('.duration-selector-wrapper');
    const input = (wrapper || shadowRoot).querySelector('[data-action="update-duration"]');
    const slider = (wrapper || shadowRoot).querySelector('[data-action="update-duration-slider"]');
    if (input) {
      input.value = duration != null && duration !== '' ? String(duration) : '';
    }
    if (slider) {
      slider.value = duration != null && duration !== '' ? String(duration) : '';
    }
  }

  static reset(shadowRoot, defaultDuration = 30) {
    this.setSelectedDuration(shadowRoot, defaultDuration);
  }

  static attachEventListeners(shadowRoot) {
    let wrapper = null;
    if (shadowRoot && shadowRoot.classList && shadowRoot.classList.contains('duration-selector-wrapper')) {
      wrapper = shadowRoot;
    } else {
      wrapper = shadowRoot.querySelector('.duration-selector-wrapper');
    }
    if (!wrapper) return;
    const input = wrapper.querySelector('[data-action="update-duration"]');
    const slider = wrapper.querySelector('[data-action="update-duration-slider"]');
    if (!input || !slider) return;
    const newInput = input.cloneNode(true);
    const newSlider = slider.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    slider.parentNode.replaceChild(newSlider, slider);
    const minVal = parseInt(newInput.min, 10) || 0;
    const maxVal = parseInt(newInput.max, 10) || 1440;
    newSlider.min = minVal;
    newSlider.max = maxVal;
    let currentValue = parseInt(newInput.value, 10);
    if (!isNaN(currentValue)) newSlider.value = String(currentValue);
    const sliderInputHandler = (e) => {
      const raw = parseInt(e.target.value, 10);
      currentValue = raw;
      newInput.value = String(currentValue);
      newInput.setAttribute('value', newInput.value);
    };
    newSlider.addEventListener('input', sliderInputHandler);
    newSlider.addEventListener('change', sliderInputHandler);
    const inputChangeHandler = (e) => {
      const value = parseInt(e.target.value, 10);
      if (!isNaN(value)) {
        currentValue = value;
        newSlider.value = String(value);
        newSlider.setAttribute('value', newSlider.value);
      }
    };
    newInput.addEventListener('input', inputChangeHandler);
    newInput.addEventListener('change', inputChangeHandler);
    newInput.addEventListener('click', (e) => e.stopPropagation());
    newSlider.addEventListener('click', (e) => e.stopPropagation());
  }

  static getInputFromSlot(slotCard) {
    return slotCard.querySelector('[data-action="update-duration"]');
  }

  static setDurationInSlot(slotCard, duration, config = null) {
    const wrapper = slotCard.classList && slotCard.classList.contains('duration-selector-wrapper')
      ? slotCard
      : slotCard.querySelector('.duration-selector-wrapper');
    const input = (wrapper || slotCard).querySelector('[data-action="update-duration"]');
    const slider = (wrapper || slotCard).querySelector('[data-action="update-duration-slider"]');
    if (config && (input || slider)) {
      const minDuration = config.min_duration || 15;
      const maxDuration = config.max_duration || 1440;
      if (input) {
        input.min = minDuration;
        input.max = maxDuration;
        input.step = 1;
      }
      if (slider) {
        slider.min = minDuration;
        slider.max = maxDuration;
      }
    }
    if (input) {
      input.value = duration != null && duration !== '' ? String(duration) : '';
    }
    if (slider) {
      slider.value = duration != null && duration !== '' ? String(duration) : '';
    }
  }

  static attachEventListenersInSlot(slotCard, onChangeCallback, config = null) {
    const wrapper = slotCard.classList && slotCard.classList.contains('duration-selector-wrapper')
      ? slotCard
      : slotCard.querySelector('.duration-selector-wrapper');
    const input = (wrapper || slotCard).querySelector('[data-action="update-duration"]');
    const slider = (wrapper || slotCard).querySelector('[data-action="update-duration-slider"]');
    if (config && input && slider) {
      const minDuration = config.min_duration || 15;
      const maxDuration = config.max_duration || 1440;
      input.min = minDuration;
      input.max = maxDuration;
      input.step = 1;
      slider.min = minDuration;
      slider.max = maxDuration;
    }
    if (input && slider) {
      const newInput = input.cloneNode(true);
      const newSlider = slider.cloneNode(true);
      input.parentNode.replaceChild(newInput, input);
      slider.parentNode.replaceChild(newSlider, slider);
      const minVal = parseInt(newInput.min, 10) || 0;
      const maxVal = parseInt(newInput.max, 10) || 1440;
      newSlider.min = minVal;
      newSlider.max = maxVal;
      let currentValue = parseInt(newInput.value, 10);
      if (!isNaN(currentValue)) newSlider.value = String(currentValue);
      const sliderHandler = (e) => {
        const raw = parseInt(e.target.value, 10);
        currentValue = raw;
        newInput.value = String(currentValue);
        newInput.setAttribute('value', newInput.value);
        if (onChangeCallback) onChangeCallback(currentValue);
      };
      const inputHandler = (e) => {
        const value = parseInt(e.target.value, 10);
        if (!isNaN(value)) {
          currentValue = value;
          newSlider.value = String(value);
          newSlider.setAttribute('value', newSlider.value);
        }
      };
      const blurHandler = () => {
        if (!isNaN(currentValue)) {
          newInput.value = String(currentValue);
          newInput.setAttribute('value', newInput.value);
          if (onChangeCallback) onChangeCallback(currentValue);
        }
      };
      newSlider.addEventListener('input', sliderHandler);
      newSlider.addEventListener('change', sliderHandler);
      newInput.addEventListener('input', inputHandler);
      newInput.addEventListener('blur', blurHandler);
      newInput.addEventListener('click', (e) => e.stopPropagation());
      newSlider.addEventListener('click', (e) => e.stopPropagation());
    }
  }
};

// --- Hours variant (climate: 0.5–12 h, step 0.5) ---

const HOURS_MIN = 0.5;
const HOURS_MAX = 12;
const HOURS_STEP = 0.5;

const DurationSelectorHours = class DurationSelector {
  static computeStep(min, max, preferredStep = 0.5) {
    return preferredStep;
  }

  static getSelectedDuration(shadowRoot) {
    let wrapper = null;
    if (shadowRoot && shadowRoot.classList && shadowRoot.classList.contains('duration-selector-wrapper')) {
      wrapper = shadowRoot;
    } else {
      wrapper = shadowRoot.querySelector('.duration-selector-wrapper');
    }
    if (wrapper) {
      const input = wrapper.querySelector('[data-action="update-duration"]');
      if (input) {
        const value = input.value;
        if (value === '' || value == null) return null;
        const h = parseFloat(value);
        return Number.isNaN(h) ? null : h;
      }
    }
    const input = shadowRoot.querySelector('[data-action="update-duration"]');
    if (!input) return null;
    const value = input.value;
    if (value === '' || value == null) return null;
    const h = parseFloat(value);
    return Number.isNaN(h) ? null : h;
  }

  static setSelectedDuration(shadowRoot, duration, config = null) {
    const wrapper = shadowRoot.classList && shadowRoot.classList.contains('duration-selector-wrapper')
      ? shadowRoot
      : shadowRoot.querySelector('.duration-selector-wrapper');
    const input = (wrapper || shadowRoot).querySelector('[data-action="update-duration"]');
    const slider = (wrapper || shadowRoot).querySelector('[data-action="update-duration-slider"]');
    const minH = config?.min_duration ?? HOURS_MIN;
    const maxH = config?.max_duration ?? HOURS_MAX;
    const num = duration != null && duration !== '' ? parseFloat(duration) : NaN;
    const val = Number.isNaN(num) ? '' : Math.max(minH, Math.min(maxH, num));
    if (input) {
      input.value = val !== '' ? String(val) : '';
    }
    if (slider) {
      slider.value = val !== '' ? String(val) : '';
    }
  }

  static reset(shadowRoot, defaultDuration = null) {
    this.setSelectedDuration(shadowRoot, defaultDuration);
  }

  static attachEventListeners(shadowRoot, config = null) {
    let wrapper = null;
    if (shadowRoot && shadowRoot.classList && shadowRoot.classList.contains('duration-selector-wrapper')) {
      wrapper = shadowRoot;
    } else {
      wrapper = shadowRoot.querySelector('.duration-selector-wrapper');
    }
    if (!wrapper) return;
    const input = wrapper.querySelector('[data-action="update-duration"]');
    const slider = wrapper.querySelector('[data-action="update-duration-slider"]');
    if (!input || !slider) return;
    const minH = config?.min_duration ?? HOURS_MIN;
    const maxH = config?.max_duration ?? HOURS_MAX;
    const stepH = config?.duration_step ?? HOURS_STEP;
    const newInput = input.cloneNode(true);
    const newSlider = slider.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    slider.parentNode.replaceChild(newSlider, slider);
    newInput.min = minH;
    newInput.max = maxH;
    newInput.step = String(stepH);
    newSlider.setAttribute('min', String(minH));
    newSlider.setAttribute('max', String(maxH));
    newSlider.setAttribute('step', String(stepH));
    let currentHours = parseFloat(newInput.value);
    if (Number.isNaN(currentHours)) currentHours = minH;
    newSlider.value = String(currentHours);
    const sliderInputHandler = (e) => {
      const val = parseFloat(e.target.value);
      currentHours = Number.isNaN(val) ? minH : Math.max(minH, Math.min(maxH, val));
      newInput.value = String(currentHours);
      newInput.setAttribute('value', newInput.value);
    };
    newSlider.addEventListener('input', sliderInputHandler);
    newSlider.addEventListener('change', sliderInputHandler);
    const inputChangeHandler = (e) => {
      const value = parseFloat(e.target.value);
      if (!isNaN(value)) {
        currentHours = Math.max(minH, Math.min(maxH, value));
        newSlider.value = String(currentHours);
        newInput.setAttribute('value', String(currentHours));
      }
    };
    newInput.addEventListener('input', inputChangeHandler);
    newInput.addEventListener('change', inputChangeHandler);
    newInput.addEventListener('click', (e) => e.stopPropagation());
    newSlider.addEventListener('click', (e) => e.stopPropagation());
  }

  static getInputFromSlot(slotCard) {
    return slotCard.querySelector('[data-action="update-duration"]');
  }

  static setDurationInSlot(slotCard, duration, config = null) {
    const wrapper = slotCard.classList && slotCard.classList.contains('duration-selector-wrapper')
      ? slotCard
      : slotCard.querySelector('.duration-selector-wrapper');
    const input = (wrapper || slotCard).querySelector('[data-action="update-duration"]');
    const slider = (wrapper || slotCard).querySelector('[data-action="update-duration-slider"]');
    const minH = config?.min_duration ?? HOURS_MIN;
    const maxH = config?.max_duration ?? HOURS_MAX;
    const stepH = config?.duration_step ?? HOURS_STEP;
    if (input) {
      input.min = minH;
      input.max = maxH;
      input.step = String(stepH);
    }
    if (slider) {
      slider.setAttribute('min', String(minH));
      slider.setAttribute('max', String(maxH));
      slider.setAttribute('step', String(stepH));
    }
    const num = duration != null && duration !== '' ? parseFloat(duration) : NaN;
    const val = Number.isNaN(num) ? '' : Math.max(minH, Math.min(maxH, num));
    if (input) {
      input.value = val !== '' ? String(val) : '';
    }
    if (slider) {
      slider.value = val !== '' ? String(val) : '';
    }
  }

  static attachEventListenersInSlot(slotCard, onChangeCallback, config = null) {
    const wrapper = slotCard.classList && slotCard.classList.contains('duration-selector-wrapper')
      ? slotCard
      : slotCard.querySelector('.duration-selector-wrapper');
    const input = (wrapper || slotCard).querySelector('[data-action="update-duration"]');
    const slider = (wrapper || slotCard).querySelector('[data-action="update-duration-slider"]');
    const minH = config?.min_duration ?? HOURS_MIN;
    const maxH = config?.max_duration ?? HOURS_MAX;
    const stepH = config?.duration_step ?? HOURS_STEP;
    if (input) {
      input.min = minH;
      input.max = maxH;
      input.step = String(stepH);
    }
    if (slider) {
      slider.setAttribute('min', String(minH));
      slider.setAttribute('max', String(maxH));
      slider.setAttribute('step', String(stepH));
    }
    if (input && slider) {
      const newInput = input.cloneNode(true);
      const newSlider = slider.cloneNode(true);
      input.parentNode.replaceChild(newInput, input);
      slider.parentNode.replaceChild(newSlider, slider);
      newInput.min = minH;
      newInput.max = maxH;
      newInput.step = String(stepH);
      newSlider.setAttribute('min', String(minH));
      newSlider.setAttribute('max', String(maxH));
      newSlider.setAttribute('step', String(stepH));
      let currentHours = parseFloat(newInput.value);
      if (isNaN(currentHours)) currentHours = minH;
      newSlider.value = String(currentHours);
      const sliderHandler = (e) => {
        const val = parseFloat(e.target.value);
        currentHours = Number.isNaN(val) ? minH : Math.max(minH, Math.min(maxH, val));
        newInput.value = String(currentHours);
        newInput.setAttribute('value', newInput.value);
        if (onChangeCallback) onChangeCallback(currentHours);
      };
      const inputHandler = (e) => {
        const value = parseFloat(e.target.value);
        if (!isNaN(value)) {
          currentHours = Math.max(minH, Math.min(maxH, value));
          newSlider.value = String(currentHours);
          newInput.setAttribute('value', newInput.value);
        }
      };
      const blurHandler = () => {
        if (!isNaN(currentHours)) {
          newInput.value = String(currentHours);
          newInput.setAttribute('value', newInput.value);
          if (onChangeCallback) onChangeCallback(currentHours);
        }
      };
      newSlider.addEventListener('input', sliderHandler);
      newSlider.addEventListener('change', sliderHandler);
      newInput.addEventListener('input', inputHandler);
      newInput.addEventListener('blur', blurHandler);
      newInput.addEventListener('click', (e) => e.stopPropagation());
      newSlider.addEventListener('click', (e) => e.stopPropagation());
    }
  }
};

// Globals: boiler uses DurationSelector (mins); climate uses DurationSelectorHours. One script in bundle sets both.
window.DurationSelectorHours = DurationSelectorHours;
window.DurationSelector = DurationSelectorMins;

// Shared component: selector-weekday/weekday-selector.js
/**
 * Weekday Selector Utility
 * 
 * Shared utility for weekday selection with Everyday/Weekdays/Custom modes.
 * Used by both boiler and climate schedule cards.
 */

// Prevent duplicate class declaration when multiple cards are loaded
if (typeof window.WeekdaySelector === 'undefined') {
  window.WeekdaySelector = class WeekdaySelector {
  /**
   * Get selected weekdays based on current mode
   * @param {HTMLElement} shadowRoot - Shadow root of the card
   * @returns {number[]} Array of weekday indices (0-6, where 0=Monday)
   */
  static getSelectedWeekdays(shadowRoot) {
    const activeModeBtn = shadowRoot.querySelector('.weekday-mode-btn.active');
    const mode = activeModeBtn ? activeModeBtn.dataset.mode : 'everyday';
    
    if (mode === 'everyday') {
      return [0, 1, 2, 3, 4, 5, 6]; // All days
    } else if (mode === 'weekdays') {
      return [0, 1, 2, 3, 4]; // Mon-Fri
    } else {
      // Custom mode - get selected days
      return Array.from(shadowRoot.querySelectorAll('.popup-weekday.active'))
        .map(day => parseInt(day.dataset.day));
    }
  }

  /**
   * Format weekdays for display in slot status
   * @param {number[]} weekdays - Array of weekday indices (0-6)
   * @returns {string} Formatted text (e.g., "Everyday", "Weekdays", "Every Mon, Tue, Wed")
   */
  static formatWeekdays(weekdays) {
    const weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const sorted = weekdays.sort((a, b) => a - b);
    
    if (sorted.length === 7) {
      return 'Everyday';
    } else if (sorted.length === 5 && sorted[0] === 0 && sorted[4] === 4) {
      return 'Weekdays';
    } else {
      const activeDays = sorted.map(day => weekdayNames[day]).join(', ');
      return `Every ${activeDays}`;
    }
  }

  /**
   * Reset weekday selector to default state
   * @param {HTMLElement} shadowRoot - Shadow root of the card
   */
  static reset(shadowRoot) {
    // Reset weekday mode selector
    shadowRoot.querySelectorAll('.weekday-mode-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    const everydayBtn = shadowRoot.querySelector('.weekday-mode-btn[data-mode="everyday"]');
    if (everydayBtn) everydayBtn.classList.add('active');

    // Reset weekdays
    shadowRoot.querySelectorAll('.popup-weekday').forEach(day => {
      day.classList.remove('active');
    });

    // Hide custom weekdays selector (everyday is default); use querySelector so scope can be shadowRoot or a container (e.g. add popup form)
    const customWeekdays = shadowRoot.querySelector ? shadowRoot.querySelector('#popup-weekdays-custom') : (shadowRoot.getElementById ? shadowRoot.getElementById('popup-weekdays-custom') : null);
    if (customWeekdays) customWeekdays.classList.add('hidden');
  }

  /**
   * Set selected weekdays from array
   * @param {HTMLElement} shadowRoot - Shadow root of the card
   * @param {number[]} weekdays - Array of weekday indices (0-6, where 0=Monday)
   * @param {HTMLElement} container - Optional container element to scope the search (for slot items)
   */
  static setSelectedWeekdays(shadowRoot, weekdays, container = null) {
    const scope = container || shadowRoot;
    
    // Determine mode based on weekdays
    const sorted = weekdays.sort((a, b) => a - b);
    let mode = 'custom';
    if (sorted.length === 7) {
      mode = 'everyday';
    } else if (sorted.length === 5 && sorted[0] === 0 && sorted[4] === 4) {
      mode = 'weekdays';
    }
    
    // Set mode button
    scope.querySelectorAll('.weekday-mode-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    const modeBtn = scope.querySelector(`.weekday-mode-btn[data-mode="${mode}"]`);
    if (modeBtn) modeBtn.classList.add('active');
    
    // Show/hide custom weekdays
    const customWeekdays = scope.querySelector('#popup-weekdays-custom') || scope.querySelector('.popup-weekdays');
    if (customWeekdays) {
      if (mode === 'custom') {
        customWeekdays.classList.remove('hidden');
      } else {
        customWeekdays.classList.add('hidden');
      }
    }
    
    // Set individual weekday states (only for custom mode)
    if (mode === 'custom') {
      scope.querySelectorAll('.popup-weekday').forEach(dayEl => {
        const day = parseInt(dayEl.dataset.day);
        if (weekdays.includes(day)) {
          dayEl.classList.add('active');
        } else {
          dayEl.classList.remove('active');
        }
      });
    }
  }

  /**
   * Attach event listeners for weekday mode selector
   * @param {HTMLElement} shadowRoot - Shadow root of the card or container element
   */
  static attachEventListeners(shadowRoot) {
    // Weekday mode selector buttons
    shadowRoot.querySelectorAll('.weekday-mode-btn').forEach(btn => {
      // Remove existing listeners by cloning
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      
      newBtn.addEventListener('click', () => {
        // Remove active from all buttons in the same scope
        const scope = newBtn.closest('.slot-card') || shadowRoot;
        scope.querySelectorAll('.weekday-mode-btn').forEach(b => b.classList.remove('active'));
        // Add active to clicked button
        newBtn.classList.add('active');
        
        const mode = newBtn.dataset.mode;
        // Find custom weekdays - search in the same container as the button
        // The button is inside .weekday-mode-selector, which is inside .popup-field
        const popupField = newBtn.closest('.popup-field');
        const slotCard = newBtn.closest('.slot-card');
        const container = popupField || slotCard || shadowRoot;
        
        // Search for the element - it should be a sibling of .weekday-mode-selector
        let customWeekdays = container.querySelector('#popup-weekdays-custom');
        if (!customWeekdays) {
          customWeekdays = container.querySelector('.popup-weekdays');
        }
        // If still not found, search in entire shadowRoot
        if (!customWeekdays) {
          customWeekdays = shadowRoot.querySelector('#popup-weekdays-custom') || shadowRoot.querySelector('.popup-weekdays');
        }
        
        if (mode === 'everyday' || mode === 'weekdays') {
          // Hide custom weekdays selector
          if (customWeekdays) {
            customWeekdays.classList.add('hidden');
          }
        } else {
          // Show custom weekdays selector
          if (customWeekdays) {
            customWeekdays.classList.remove('hidden');
          }
        }
      });
    });
    
    // Custom weekday buttons
    shadowRoot.querySelectorAll('.popup-weekday').forEach(dayEl => {
      // Remove existing listeners by cloning
      const newDayEl = dayEl.cloneNode(true);
      dayEl.parentNode.replaceChild(newDayEl, dayEl);
      
      newDayEl.addEventListener('click', () => {
        newDayEl.classList.toggle('active');
      });
    });
  }
  };
  
  // Already assigned to window.WeekdaySelector above, no need to reassign
}

class HomieClimateScheduleSlotsCard extends HTMLElement {
  static getStubConfig() {
    return { entity: '', title: 'Schedule' };
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = null;
    this._hass = null;
    this._entryId = null;
    this._bridgeSensor = null;
    this._debounceTimer = null;
    this._htmlTemplate = null;
    this._expandedSlots = new Set(); // Track expanded slots by display key (time|weekdays|duration|mode|temp|fan|title)
    this._configError = null; // Store config error message
    this._unsubStateChanged = null; // Unsubscribe function for state_changed events
    this._optimisticBridgeState = null; // Local overlay for optimistic updates (avoids mutating hass.states)
  }

  async _loadTemplate() {
    if (this._htmlTemplate) return this._htmlTemplate;
    
    // Template is embedded in production build
    this._htmlTemplate = `  <!-- Main Header -->\n  <div class="main-header">\n    <div class="header-left">\n      <div class="header-icon {{ENABLED_CLASS}}" data-action="toggle-enabled" title="Toggle scheduler">\n        <ha-icon icon="mdi:calendar-clock"></ha-icon>\n        <!-- <ha-icon icon="{{ICON}}"></ha-icon> -->\n      </div>\n      <div class="header-text">\n        <div class="header-title {{HEADER_TITLE_CLASS}}">\n          {{TITLE}}\n        </div>\n        <div class="header-status">{{STATUS_TEXT}}</div>\n      </div>\n    </div>\n  </div>\n  \n  <!-- Slots List (hidden when 0 slots) -->\n  <div class="slots-container{{SLOTS_CONTAINER_CLASS}}">\n    {{ITEMS_CONTENT}}\n  </div>\n  \n  <!-- Add Slot Button -->\n  <button class="button-outline" data-action="open-add-popup">\n    Add Schedule Slot\n  </button>\n  \n  <!-- Add Slot Popup -->\n  <div class="popup-overlay" id="add-popup" style="display: none;">\n    <div class="popup-content">\n      <div class="popup-header">\n        <ha-icon icon="mdi:power"></ha-icon>\n        <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">\n          <span class="popup-title">Add Schedule Slot</span>\n          <div style="font-size: 12px; color: var(--secondary-text-color, #757575);">\n            for {{ENTITY_NAME}}\n          </div>\n        </div>\n        <button class="popup-close" data-action="close-popup">\n          <ha-icon icon="mdi:close"></ha-icon>\n        </button>\n      </div>\n      \n      <div class="popup-body">\n        <div id="add-popup-error" class="popup-error" style="display: none;" data-slot-form="popup-error"></div>\n        <!-- SHARED:slot-form-fields -->\n<!-- Climate: form fields for Add Slot popup and Edit Slot (same structure, one source of truth) -->\n<div class="slot-form" data-slot-form="root">\n  <div class="slot-form-field" data-slot-form="field-title">\n    <label class="slot-form-label">\n      <ha-icon icon="mdi:label-outline"></ha-icon>\n      <span>Title (optional)</span>\n    </label>\n    <input type="text" class="homie-input slot-form-title-input" data-slot-form="title" data-item-id="{{ITEM_ID}}" value="{{SLOT_TITLE}}" placeholder="e.g. Morning heating">\n  </div>\n\n  <div class="slot-form-field" data-slot-form="field-time">\n    <label class="slot-form-label">\n      <ha-icon icon="mdi:clock-outline"></ha-icon>\n      <span>Start Time</span>\n    </label>\n    <div class="time-selects">\n      <select class="homie-select slot-form-time-hours" data-slot-form="time-hours" data-item-id="{{ITEM_ID}}">\n        <option value="00" {{TIME_HOURS_00}}>00</option>\n        <option value="01" {{TIME_HOURS_01}}>01</option>\n        <option value="02" {{TIME_HOURS_02}}>02</option>\n        <option value="03" {{TIME_HOURS_03}}>03</option>\n        <option value="04" {{TIME_HOURS_04}}>04</option>\n        <option value="05" {{TIME_HOURS_05}}>05</option>\n        <option value="06" {{TIME_HOURS_06}}>06</option>\n        <option value="07" {{TIME_HOURS_07}}>07</option>\n        <option value="08" {{TIME_HOURS_08}}>08</option>\n        <option value="09" {{TIME_HOURS_09}}>09</option>\n        <option value="10" {{TIME_HOURS_10}}>10</option>\n        <option value="11" {{TIME_HOURS_11}}>11</option>\n        <option value="12" {{TIME_HOURS_12}}>12</option>\n        <option value="13" {{TIME_HOURS_13}}>13</option>\n        <option value="14" {{TIME_HOURS_14}}>14</option>\n        <option value="15" {{TIME_HOURS_15}}>15</option>\n        <option value="16" {{TIME_HOURS_16}}>16</option>\n        <option value="17" {{TIME_HOURS_17}}>17</option>\n        <option value="18" {{TIME_HOURS_18}}>18</option>\n        <option value="19" {{TIME_HOURS_19}}>19</option>\n        <option value="20" {{TIME_HOURS_20}}>20</option>\n        <option value="21" {{TIME_HOURS_21}}>21</option>\n        <option value="22" {{TIME_HOURS_22}}>22</option>\n        <option value="23" {{TIME_HOURS_23}}>23</option>\n      </select>\n      <span class="time-separator">:</span>\n      <select class="homie-select slot-form-time-minutes" data-slot-form="time-minutes" data-item-id="{{ITEM_ID}}">\n        <option value="00" {{TIME_MINUTES_00}}>00</option>\n        <option value="05" {{TIME_MINUTES_05}}>05</option>\n        <option value="10" {{TIME_MINUTES_10}}>10</option>\n        <option value="15" {{TIME_MINUTES_15}}>15</option>\n        <option value="20" {{TIME_MINUTES_20}}>20</option>\n        <option value="25" {{TIME_MINUTES_25}}>25</option>\n        <option value="30" {{TIME_MINUTES_30}}>30</option>\n        <option value="35" {{TIME_MINUTES_35}}>35</option>\n        <option value="40" {{TIME_MINUTES_40}}>40</option>\n        <option value="45" {{TIME_MINUTES_45}}>45</option>\n        <option value="50" {{TIME_MINUTES_50}}>50</option>\n        <option value="55" {{TIME_MINUTES_55}}>55</option>\n      </select>\n    </div>\n  </div>\n\n  <div class="slot-form-field slot-form-entities-wrap" data-slot-form="entities-wrap" style="display: none;">\n    <label class="slot-form-label">\n      <ha-icon icon="mdi:format-list-checks"></ha-icon>\n      <span>Apply to entities</span>\n    </label>\n    <div class="slot-form-entities-trigger" data-slot-form="entities-trigger" tabindex="0" role="combobox">\n      <div class="slot-form-entities-chips" data-slot-form="entities-chips"></div>\n      <ha-icon class="slot-form-entities-caret" icon="mdi:chevron-down"></ha-icon>\n    </div>\n    <div class="slot-form-entities-dropdown" data-slot-form="entities-dropdown">\n      <label class="slot-form-entity-row slot-form-entities-select-all-row">\n        <input type="checkbox" class="slot-form-entities-select-all" data-slot-form="entities-select-all">\n        <span class="slot-form-entity-name">Select all</span>\n      </label>\n      <div class="entities-selector-list"></div>\n      <template class="entities-selector-row-tpl">\n        <label class="entities-selector-row">\n          <input type="checkbox" name="entities-selector-entity" value="">\n          <span class="entities-selector-entity-name"></span>\n        </label>\n      </template>\n    </div>\n  </div>\n\n  <div class="slot-form-row slot-form-row-mode-fan-temp">\n    <div class="slot-form-field slot-form-field-mode" data-slot-form="field-mode">\n      <label class="slot-form-label">\n        <ha-icon icon="mdi:thermostat"></ha-icon>\n        <span>Mode</span>\n      </label>\n      <select class="homie-select slot-form-mode-select" data-slot-form="mode" data-action="update-hvac-mode" data-item-id="{{ITEM_ID}}">\n        {{HVAC_MODE_OPTIONS}}\n      </select>\n      <div class="slot-form-mode-warning" data-slot-form="mode-warning"></div>\n    </div>\n    <div class="slot-form-field slot-form-field-fan" data-slot-form="field-fan">\n      <label class="slot-form-label">\n        <ha-icon icon="mdi:fan"></ha-icon>\n        <span>Fan</span>\n      </label>\n      <select class="homie-select slot-form-fan-select" data-slot-form="fan" data-item-id="{{ITEM_ID}}">\n        {{FAN_OPTIONS}}\n      </select>\n    </div>\n    <div class="slot-form-field slot-form-field-temp" data-slot-form="field-temp">\n      <label class="slot-form-label">\n        <ha-icon icon="mdi:thermometer"></ha-icon>\n        <span>Temp °C</span>\n      </label>\n      <input type="number" class="homie-input slot-form-temp-input" data-slot-form="temp" data-item-id="{{ITEM_ID}}" min="{{TEMP_MIN}}" max="{{TEMP_MAX}}" step="0.5" value="{{TEMP_VALUE}}" placeholder="—">\n    </div>\n  </div>\n\n  <div class="slot-form-field" data-slot-form="field-duration">\n    <div class="slot-form-duration-row popup-field-row">\n      <label class="slot-form-field-row-label popup-field-row-label">\n        <ha-icon icon="mdi:timer-outline"></ha-icon>\n        <span>{{DURATION_LABEL}}</span>\n      </label>\n      <ha-switch class="slot-form-duration-enabled" data-slot-form="duration-enabled"></ha-switch>\n    </div>\n    <div class="slot-form-duration-wrapper" data-slot-form="duration-wrapper" style="display: none; margin-top: 8px;">\n      <div class="duration-selector-wrapper">\n        <input type="range" class="duration-slider" data-action="update-duration-slider" data-item-id="{{ITEM_ID}}" min="{{DURATION_MIN}}" max="{{DURATION_MAX}}" step="0.5" value="{{DURATION_VALUE}}" />\n        <input type="number" class="duration-input homie-input" data-action="update-duration" data-item-id="{{ITEM_ID}}" min="{{DURATION_MIN}}" max="{{DURATION_MAX}}" step="0.5" value="{{DURATION_VALUE}}" />\n      </div>\n    </div>\n  </div>\n\n  <div class="slot-form-field" data-slot-form="field-weekdays">\n    <label class="slot-form-label">\n      <ha-icon icon="mdi:calendar"></ha-icon>\n      <span>Days of Week</span>\n    </label>\n    <div class="weekday-mode-selector">\n      <button type="button" class="weekday-mode-btn active" data-mode="everyday">Everyday</button>\n      <button type="button" class="weekday-mode-btn" data-mode="weekdays">Weekdays</button>\n      <button type="button" class="weekday-mode-btn" data-mode="custom">Custom</button>\n    </div>\n    <div class="popup-weekdays hidden" id="popup-weekdays-custom">\n      <div class="popup-weekday" data-day="0">Mon</div>\n      <div class="popup-weekday" data-day="1">Tue</div>\n      <div class="popup-weekday" data-day="2">Wed</div>\n      <div class="popup-weekday" data-day="3">Thu</div>\n      <div class="popup-weekday" data-day="4">Fri</div>\n      <div class="popup-weekday" data-day="5">Sat</div>\n      <div class="popup-weekday" data-day="6">Sun</div>\n    </div>\n  </div>\n</div>\n<!-- END:slot-form-fields -->\n      </div>\n      \n      <div class="popup-footer">\n        <button class="popup-button cancel" data-action="close-popup">Cancel</button>\n        <button class="popup-button save" data-action="save-slot">Save</button>\n      </div>\n    </div>\n  </div>\n\n<!-- Slot Item Template -->\n<template id="slot-item-template">\n  <div class="slot-card {{DISABLED_CLASS}}" data-item-id="{{ITEM_ID}}">\n    <div class="slot-header">\n      <div class="slot-icon {{ICON_CLASS}}" data-action="toggle-item" title="Toggle slot">\n        <ha-icon icon="mdi:power"></ha-icon>\n      </div>\n      <div class="slot-info">\n        <div class="slot-name">{{SLOT_NAME}}</div>\n        <div class="slot-status">{{SLOT_STATUS}}</div>\n      </div>\n    </div>\n    <button class="slot-expand" data-action="toggle-expand" title="Expand/collapse details">\n      <ha-icon icon="mdi:chevron-down"></ha-icon>\n    </button>\n    \n    <div class="slot-expandable">\n      <div class="slot-error-message" data-slot-error style="display: none;"></div>\n      <!-- SHARED:slot-form-fields -->\n<!-- Climate: form fields for Add Slot popup and Edit Slot (same structure, one source of truth) -->\n<div class="slot-form" data-slot-form="root">\n  <div class="slot-form-field" data-slot-form="field-title">\n    <label class="slot-form-label">\n      <ha-icon icon="mdi:label-outline"></ha-icon>\n      <span>Title (optional)</span>\n    </label>\n    <input type="text" class="homie-input slot-form-title-input" data-slot-form="title" data-item-id="{{ITEM_ID}}" value="{{SLOT_TITLE}}" placeholder="e.g. Morning heating">\n  </div>\n\n  <div class="slot-form-field" data-slot-form="field-time">\n    <label class="slot-form-label">\n      <ha-icon icon="mdi:clock-outline"></ha-icon>\n      <span>Start Time</span>\n    </label>\n    <div class="time-selects">\n      <select class="homie-select slot-form-time-hours" data-slot-form="time-hours" data-item-id="{{ITEM_ID}}">\n        <option value="00" {{TIME_HOURS_00}}>00</option>\n        <option value="01" {{TIME_HOURS_01}}>01</option>\n        <option value="02" {{TIME_HOURS_02}}>02</option>\n        <option value="03" {{TIME_HOURS_03}}>03</option>\n        <option value="04" {{TIME_HOURS_04}}>04</option>\n        <option value="05" {{TIME_HOURS_05}}>05</option>\n        <option value="06" {{TIME_HOURS_06}}>06</option>\n        <option value="07" {{TIME_HOURS_07}}>07</option>\n        <option value="08" {{TIME_HOURS_08}}>08</option>\n        <option value="09" {{TIME_HOURS_09}}>09</option>\n        <option value="10" {{TIME_HOURS_10}}>10</option>\n        <option value="11" {{TIME_HOURS_11}}>11</option>\n        <option value="12" {{TIME_HOURS_12}}>12</option>\n        <option value="13" {{TIME_HOURS_13}}>13</option>\n        <option value="14" {{TIME_HOURS_14}}>14</option>\n        <option value="15" {{TIME_HOURS_15}}>15</option>\n        <option value="16" {{TIME_HOURS_16}}>16</option>\n        <option value="17" {{TIME_HOURS_17}}>17</option>\n        <option value="18" {{TIME_HOURS_18}}>18</option>\n        <option value="19" {{TIME_HOURS_19}}>19</option>\n        <option value="20" {{TIME_HOURS_20}}>20</option>\n        <option value="21" {{TIME_HOURS_21}}>21</option>\n        <option value="22" {{TIME_HOURS_22}}>22</option>\n        <option value="23" {{TIME_HOURS_23}}>23</option>\n      </select>\n      <span class="time-separator">:</span>\n      <select class="homie-select slot-form-time-minutes" data-slot-form="time-minutes" data-item-id="{{ITEM_ID}}">\n        <option value="00" {{TIME_MINUTES_00}}>00</option>\n        <option value="05" {{TIME_MINUTES_05}}>05</option>\n        <option value="10" {{TIME_MINUTES_10}}>10</option>\n        <option value="15" {{TIME_MINUTES_15}}>15</option>\n        <option value="20" {{TIME_MINUTES_20}}>20</option>\n        <option value="25" {{TIME_MINUTES_25}}>25</option>\n        <option value="30" {{TIME_MINUTES_30}}>30</option>\n        <option value="35" {{TIME_MINUTES_35}}>35</option>\n        <option value="40" {{TIME_MINUTES_40}}>40</option>\n        <option value="45" {{TIME_MINUTES_45}}>45</option>\n        <option value="50" {{TIME_MINUTES_50}}>50</option>\n        <option value="55" {{TIME_MINUTES_55}}>55</option>\n      </select>\n    </div>\n  </div>\n\n  <div class="slot-form-field slot-form-entities-wrap" data-slot-form="entities-wrap" style="display: none;">\n    <label class="slot-form-label">\n      <ha-icon icon="mdi:format-list-checks"></ha-icon>\n      <span>Apply to entities</span>\n    </label>\n    <div class="slot-form-entities-trigger" data-slot-form="entities-trigger" tabindex="0" role="combobox">\n      <div class="slot-form-entities-chips" data-slot-form="entities-chips"></div>\n      <ha-icon class="slot-form-entities-caret" icon="mdi:chevron-down"></ha-icon>\n    </div>\n    <div class="slot-form-entities-dropdown" data-slot-form="entities-dropdown">\n      <label class="slot-form-entity-row slot-form-entities-select-all-row">\n        <input type="checkbox" class="slot-form-entities-select-all" data-slot-form="entities-select-all">\n        <span class="slot-form-entity-name">Select all</span>\n      </label>\n      <div class="entities-selector-list"></div>\n      <template class="entities-selector-row-tpl">\n        <label class="entities-selector-row">\n          <input type="checkbox" name="entities-selector-entity" value="">\n          <span class="entities-selector-entity-name"></span>\n        </label>\n      </template>\n    </div>\n  </div>\n\n  <div class="slot-form-row slot-form-row-mode-fan-temp">\n    <div class="slot-form-field slot-form-field-mode" data-slot-form="field-mode">\n      <label class="slot-form-label">\n        <ha-icon icon="mdi:thermostat"></ha-icon>\n        <span>Mode</span>\n      </label>\n      <select class="homie-select slot-form-mode-select" data-slot-form="mode" data-action="update-hvac-mode" data-item-id="{{ITEM_ID}}">\n        {{HVAC_MODE_OPTIONS}}\n      </select>\n      <div class="slot-form-mode-warning" data-slot-form="mode-warning"></div>\n    </div>\n    <div class="slot-form-field slot-form-field-fan" data-slot-form="field-fan">\n      <label class="slot-form-label">\n        <ha-icon icon="mdi:fan"></ha-icon>\n        <span>Fan</span>\n      </label>\n      <select class="homie-select slot-form-fan-select" data-slot-form="fan" data-item-id="{{ITEM_ID}}">\n        {{FAN_OPTIONS}}\n      </select>\n    </div>\n    <div class="slot-form-field slot-form-field-temp" data-slot-form="field-temp">\n      <label class="slot-form-label">\n        <ha-icon icon="mdi:thermometer"></ha-icon>\n        <span>Temp °C</span>\n      </label>\n      <input type="number" class="homie-input slot-form-temp-input" data-slot-form="temp" data-item-id="{{ITEM_ID}}" min="{{TEMP_MIN}}" max="{{TEMP_MAX}}" step="0.5" value="{{TEMP_VALUE}}" placeholder="—">\n    </div>\n  </div>\n\n  <div class="slot-form-field" data-slot-form="field-duration">\n    <div class="slot-form-duration-row popup-field-row">\n      <label class="slot-form-field-row-label popup-field-row-label">\n        <ha-icon icon="mdi:timer-outline"></ha-icon>\n        <span>{{DURATION_LABEL}}</span>\n      </label>\n      <ha-switch class="slot-form-duration-enabled" data-slot-form="duration-enabled"></ha-switch>\n    </div>\n    <div class="slot-form-duration-wrapper" data-slot-form="duration-wrapper" style="display: none; margin-top: 8px;">\n      <div class="duration-selector-wrapper">\n        <input type="range" class="duration-slider" data-action="update-duration-slider" data-item-id="{{ITEM_ID}}" min="{{DURATION_MIN}}" max="{{DURATION_MAX}}" step="0.5" value="{{DURATION_VALUE}}" />\n        <input type="number" class="duration-input homie-input" data-action="update-duration" data-item-id="{{ITEM_ID}}" min="{{DURATION_MIN}}" max="{{DURATION_MAX}}" step="0.5" value="{{DURATION_VALUE}}" />\n      </div>\n    </div>\n  </div>\n\n  <div class="slot-form-field" data-slot-form="field-weekdays">\n    <label class="slot-form-label">\n      <ha-icon icon="mdi:calendar"></ha-icon>\n      <span>Days of Week</span>\n    </label>\n    <div class="weekday-mode-selector">\n      <button type="button" class="weekday-mode-btn active" data-mode="everyday">Everyday</button>\n      <button type="button" class="weekday-mode-btn" data-mode="weekdays">Weekdays</button>\n      <button type="button" class="weekday-mode-btn" data-mode="custom">Custom</button>\n    </div>\n    <div class="popup-weekdays hidden" id="popup-weekdays-custom">\n      <div class="popup-weekday" data-day="0">Mon</div>\n      <div class="popup-weekday" data-day="1">Tue</div>\n      <div class="popup-weekday" data-day="2">Wed</div>\n      <div class="popup-weekday" data-day="3">Thu</div>\n      <div class="popup-weekday" data-day="4">Fri</div>\n      <div class="popup-weekday" data-day="5">Sat</div>\n      <div class="popup-weekday" data-day="6">Sun</div>\n    </div>\n  </div>\n</div>\n<!-- END:slot-form-fields -->\n      <button class="slot-delete" data-action="delete-item">\n        <ha-icon icon="mdi:delete"></ha-icon>\n        <span>Remove {{SLOT_NAME_REMOVE}}</span>\n      </button>\n    </div>\n  </div>\n</template>\n`;
    return this._htmlTemplate;
  }


  async _loadSlotTemplate() {
    // Check if slot template is embedded in DOM (for preview.html)
    // First check in embedded-templates div
    const embeddedTemplates = document.getElementById('embedded-templates');
    if (embeddedTemplates) {
      const slotTemplateEl = embeddedTemplates.querySelector('template#slot-item-template');
      if (slotTemplateEl) {
        return slotTemplateEl.innerHTML.trim();
      }
    }
    
    // Also check in document root (fallback)
    const slotTemplateEl = document.getElementById('slot-item-template');
    if (slotTemplateEl) {
      return slotTemplateEl.innerHTML.trim();
    }
    
    // Try to load from main template
    const template = await this._loadTemplate();
    if (!template) {
      return null;
    }
    
    // Extract slot template from main template. Use last </template> after open tag
    // so nested <template> (e.g. entities-selector-row-tpl) does not truncate content (e.g. slot-delete button).
    const openTag = '<template id="slot-item-template">';
    const startIdx = template.indexOf(openTag);
    if (startIdx !== -1) {
      const contentStart = startIdx + openTag.length;
      const closeTag = '</template>';
      let lastClose = -1;
      let pos = contentStart;
      for (;;) {
        const idx = template.indexOf(closeTag, pos);
        if (idx === -1) break;
        lastClose = idx;
        pos = idx + closeTag.length;
      }
      if (lastClose !== -1) {
        return template.substring(contentStart, lastClose).trim();
      }
    }
    
    // Also try to extract from embedded-templates if template loading failed
    if (embeddedTemplates) {
      const embeddedContent = embeddedTemplates.innerHTML;
      const embeddedOpenTag = '<template id="slot-item-template">';
      const embeddedStart = embeddedContent.indexOf(embeddedOpenTag);
      if (embeddedStart !== -1) {
        const embContentStart = embeddedStart + embeddedOpenTag.length;
        const closeTag = '</template>';
        let lastClose = -1;
        let pos = embContentStart;
        for (;;) {
          const idx = embeddedContent.indexOf(closeTag, pos);
          if (idx === -1) break;
          lastClose = idx;
          pos = idx + closeTag.length;
        }
        if (lastClose !== -1) {
          return embeddedContent.substring(embContentStart, lastClose).trim();
        }
      }
    }
    
    return null;
  }

  setConfig(config) {
    try {
      if (!config) {
        this._config = { entities: [], title: config?.title || 'Schedule', icon: config?.icon || 'mdi:toggle-switch-variant-off' };
        return;
      }
      const raw = config.entity;
      const entities = Array.isArray(raw) ? raw.filter(Boolean) : (raw ? [raw] : []);
      if (entities.length === 0) {
        this._config = {
          entity: null,
          entities: [],
          title: config.title || 'Schedule',
          icon: config.icon || 'mdi:toggle-switch-variant-off'
        };
        // Delay error display until shadowRoot is ready
        if (this.shadowRoot) {
          this._showError('Please configure entity in card settings');
        } else {
          // If shadowRoot not ready, will show error in render()
          this._configError = 'Please configure entity in card settings';
        }
        return;
      }
      this._config = {
        ...config,
        entity: entities[0],
        entities,
        icon: config.icon || 'mdi:toggle-switch-variant-off'
      };
      
      this._normalizeDurationConfig(config, this._config);
      this._configError = null;
      if (this._hass && this.shadowRoot) {
        this.render().catch(err => {});
      }
    } catch (err) {
      // Never throw from setConfig - it breaks the editor
      this._config = config ? { ...config } : {};
      this._normalizeDurationConfig(this._config, this._config);
      this._configError = 'Configuration error';
      if (this.shadowRoot) {
        this._showError('Configuration error. Please check card settings.');
      }
    }
  }
  
  _showError(message) {
    if (!this.shadowRoot) {
      try {
        this.attachShadow({ mode: 'open' });
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): attachShadow failed', e);
        return;
      }
    }
    const raw = String(message != null ? message : '');
    const safeMessage = (window.ScheduleHelper && typeof window.ScheduleHelper.escapeHtml === 'function')
      ? window.ScheduleHelper.escapeHtml(raw)
      : raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const errorHtml = `
      <div style="padding: 16px; text-align: center; color: var(--error-color, #f44336);">
        <ha-icon icon="mdi:alert-circle" style="font-size: 48px; margin-bottom: 16px;"></ha-icon>
        <div style="font-size: 16px; font-weight: 500; margin-bottom: 8px;">Configuration Error</div>
        <div style="font-size: 14px; color: var(--secondary-text-color, #888);">${safeMessage}</div>
      </div>
    `;
    this.shadowRoot.innerHTML = errorHtml;
  }

  set hass(hass) {
    try {
      const wasInitialized = !!this._hass;
      const oldBridgeState = this._hass?.states?.[this._bridgeSensor];
      const oldItems = oldBridgeState?.attributes?.items || [];
      const oldState = oldBridgeState?.state;
      const oldNextRun = oldBridgeState?.attributes?.next_run;
      const oldSchedulerSwitchState = this._hass?.states?.[SCHEDULER_SWITCH_ENTITY]?.state;

      this._hass = hass;
      
      // Find bridge sensor on first hass set
      if (!this._bridgeSensor) {
        this._findBridgeSensor();
      }
      
      if (!this._bridgeSensor) {
        // Bridge sensor not found yet, just render if not initialized
        if (!wasInitialized || !this.shadowRoot.innerHTML) {
          this.render().catch(err => {});
        }
        return;
      }
      
      // Subscribe to state_changed for bridge sensor and scheduler switch (toggle must react to switch)
      if (this._hass && this._hass.connection && !this._unsubStateChanged) {
        try {
          this._hass.connection.subscribeEvents(
            (event) => {
              const entityId = event?.data?.entity_id;
              if (!entityId) return;
              if (entityId === SCHEDULER_SWITCH_ENTITY) {
                this.hass = { ...this._hass };
                return;
              }
              if (entityId !== this._bridgeSensor) return;

              if (event.data && this._hass) {
                this._hass.callService('homeassistant', 'update_entity', {
                  entity_id: this._bridgeSensor
                }).catch(() => {});
                const hadTemp = this._optimisticBridgeState?.attributes?.items?.some(i => i?.id?.startsWith?.('temp-'));
                if (hadTemp) {
                  let attempts = 0;
                  const pollClear = () => {
                    if (!this._optimisticBridgeState?.attributes?.items?.some(i => i?.id?.startsWith?.('temp-'))) return;
                    const fromHass = this._hass?.states?.[this._bridgeSensor]?.attributes?.items || [];
                    const ourEntities = new Set(this._getEntities());
                    const tempItems = (this._optimisticBridgeState?.attributes?.items || []).filter(i => i?.id?.startsWith?.('temp-'));
                    const realHasSame = tempItems.some(t => fromHass.some(h =>
              ourEntities.has(h?.entity_id) && h?.time === t?.time &&
              JSON.stringify(h?.weekdays || []) === JSON.stringify(t?.weekdays || []) &&
              !String(h?.id || '').startsWith('temp-')));
                    if (realHasSame) {
                      this._optimisticBridgeState = null;
                      this.hass = { ...this._hass };
                      this.render().catch(() => {});
                    } else if (attempts < 20) {
                      attempts++;
                      setTimeout(pollClear, 500);
                    }
                  };
                  setTimeout(pollClear, 400);
                } else {
                  this._optimisticBridgeState = null;
                  this.hass = { ...this._hass };
                  setTimeout(() => this.hass = { ...this._hass }, 150);
                }
              }
            },
            'state_changed'
          ).then((unsubscribeFn) => {
            // Store the unsubscribe function once Promise resolves
            this._unsubStateChanged = unsubscribeFn;
          }).catch((e) => {
            if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): subscribeStateChanged failed', e);
          });
        } catch (e) {
          if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): subscribeStateChanged setup failed', e);
        }
      }
      
      // Check if bridge sensor state or items changed (for synchronization between multiple cards)
      const newBridgeState = this._hass?.states?.[this._bridgeSensor];
      const newItems = newBridgeState?.attributes?.items || [];
      const newState = newBridgeState?.state;
      const newNextRun = newBridgeState?.attributes?.next_run;
      
      // Check if items structure changed (add/delete)
      const itemsStructureChanged = oldItems.length !== newItems.length || 
        oldItems.some((oldItem, idx) => {
          const newItem = newItems[idx];
          return !newItem || oldItem.id !== newItem.id;
        });
      
      // Check if items content changed (for sync between cards)
      // Compare by item ID, not by index (items might be in different order)
      const ourEntities = new Set(this._getEntities());
      const itemsContentChanged = !itemsStructureChanged && oldItems.some((oldItem) => {
        if (!oldItem || !oldItem.id) return false;
        if (!ourEntities.has(oldItem.entity_id)) return false;
        const newItem = newItems.find(item => item && item.id === oldItem.id);
        if (!newItem) return false;
        return oldItem.enabled !== newItem.enabled ||
               oldItem.time !== newItem.time ||
               oldItem.duration !== newItem.duration ||
               JSON.stringify(oldItem.weekdays || []) !== JSON.stringify(newItem.weekdays || []);
      });
      
      // Check if bridge sensor state changed (enabled/disabled)
      const stateChanged = oldState !== newState;
      const newSchedulerSwitchState = this._hass?.states?.[SCHEDULER_SWITCH_ENTITY]?.state;
      const schedulerSwitchChanged = oldSchedulerSwitchState !== newSchedulerSwitchState;

      // Check if next_run changed
      const nextRunChanged = oldNextRun !== newNextRun;

      // Full render if: first time, no content, structure changed, state changed, switch toggled, or next_run changed
      if (!wasInitialized || !this.shadowRoot.innerHTML || itemsStructureChanged || stateChanged || schedulerSwitchChanged || nextRunChanged) {
        this.render().catch(err => {});
      } else if (itemsContentChanged) {
        // Items content changed - update all slot elements to sync with other cards
        this._syncSlotsFromBridgeSensor();
      } else {
        // Just update header status if needed (for next_run changes)
        this._updateHeaderStatus();
      }
    } catch (err) {
      // Never throw from setter - it breaks the editorthis._hass = hass;
      if (this.shadowRoot && this._configError) {
        this._showError(this._configError);
      }
    }
  }

  _findBridgeSensor() {
    try {
      const entities = this._getEntities();
      if (!this._hass || !this._config || entities.length === 0) return;

      const firstEntity = entities[0];
      let firstBridgeSensor = null; // Fallback: use first bridge sensor found
    
      // Search for bridge sensor that contains this entity in entity_ids or items
      for (const entityId in this._hass.states) {
        if (!entityId.startsWith('sensor.')) continue;
        
        try {
          const state = this._hass.states?.[entityId];
          if (!state) continue;
          
          const attrs = state.attributes || {};
          
          // Use only 'homie_scheduler' integration
          if (
            attrs.integration === 'homie_scheduler' &&
            attrs.entry_id
          ) {
            // Remember first bridge sensor as fallback
            if (!firstBridgeSensor) {
              firstBridgeSensor = { entityId, entryId: attrs.entry_id };
            }
            
            const entityIds = attrs.entity_ids || [];
            const items = attrs.items || [];
            if (entityIds.includes(firstEntity)) {
              this._bridgeSensor = entityId;
              this._entryId = attrs.entry_id;
              return;
            }
            const hasEntityInItems = items.some(item => item && item.entity_id === firstEntity);
            if (hasEntityInItems) {
              this._bridgeSensor = entityId;
              this._entryId = attrs.entry_id;
              return;
            }
          }
        } catch (err) {
          // Skip this entity if there's an error - don't break the loop
          continue;
        }
      }
    
      // If no specific bridge sensor found, use first one (for adding first item)
      if (firstBridgeSensor) {
        this._bridgeSensor = firstBridgeSensor.entityId;
        this._entryId = firstBridgeSensor.entryId;return;
      }
    
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): _resolveBridgeSensor failed', err);
    }
  }

  _getBridgeState() {
    try {
      if (!this._bridgeSensor || !this._hass) return null;
      return this._optimisticBridgeState ?? this._hass.states?.[this._bridgeSensor] ?? null;
    } catch (err) {
      return null;
    }
  }

  _getEntities() {
    const entities = this._config?.entities;
    if (Array.isArray(entities) && entities.length > 0) return entities;
    const e = this._config?.entity;
    return e ? [e] : [];
  }

  /** Display slot key: group in one card when time, weekdays, duration, mode, temperature, fan_mode and title (or no title) match. For mode Off, duration/temperature/fan_mode/title are not used. */
  _slotKeyForItem(item) {
    return (item?.entity_id || '') + '|' + (item?.time || '') + '|' + JSON.stringify(item?.weekdays || []);
  }

  /** Display key: time, weekdays, duration, mode, temp, fan, title. If several items share same (entity_id, time, weekdays) — use item.id so they don't merge (e.g. one with custom title, one without). */
  _getDisplaySlotKey(item, duplicatedSlotKeys) {
    if (!item) return '';
    const mode = item.service_start?.value?.hvac_mode ?? '';
    const isOff = mode === 'off';
    const durationPart = isOff ? '' : (item.duration ?? '');
    const temp = item.service_start?.value?.temperature;
    const tempStr = isOff ? '' : (temp !== undefined && temp !== null ? String(temp) : '');
    const fan = isOff ? '' : (item.service_start?.value?.fan_mode ?? '');
    const slotKey = this._slotKeyForItem(item);
    const isDuplicated = duplicatedSlotKeys && duplicatedSlotKeys.has(slotKey);
    const titlePart = isDuplicated ? (item.id || '') : (item.title || '');
    return (item.time || '') + '|' + JSON.stringify(item.weekdays || []) + '|' + durationPart + '|' + mode + '|' + tempStr + '|' + fan + '|' + titlePart;
  }

  _getItems() {
    try {
      const entities = this._getEntities();
      if (entities.length === 0) return [];
      
      const bridgeState = this._getBridgeState();
      const allItems = bridgeState?.attributes?.items || [];
      
      const entitySet = new Set(entities);
      const filtered = allItems.filter(item => 
        item && 
        entitySet.has(item.entity_id) && 
        item.temporary !== true
      );
      const slotKeyCount = new Map();
      for (const it of filtered) {
        const sk = this._slotKeyForItem(it);
        slotKeyCount.set(sk, (slotKeyCount.get(sk) || 0) + 1);
      }
      const duplicatedSlotKeys = new Set([...slotKeyCount.entries()].filter(([, n]) => n > 1).map(([k]) => k));
      // Dedupe by display key: when both temp and real slot exist, show only one (prefer real)
      const byKey = new Map();
      for (const item of filtered) {
        const key = this._getDisplaySlotKey(item, duplicatedSlotKeys);
        const existing = byKey.get(key);
        const isTemp = item.id && String(item.id).startsWith('temp-');
        if (!existing) {
          byKey.set(key, item);
        } else {
          const existingIsTemp = existing.id && String(existing.id).startsWith('temp-');
          if (isTemp && !existingIsTemp) {
            // keep existing (real)
          } else if (!isTemp && existingIsTemp) {
            byKey.set(key, item);
          }
        }
      }
      return Array.from(byKey.values());
    } catch (err) {
      return [];
    }
  }

  _isEnabled() {
    try {
      if (this._getEntities().length === 0) return false;
      const items = this._getItems();
      
      // If no items at all, card is off
      if (!items || items.length === 0) {
        return false;
      }
      
      // Card is enabled if it has at least one enabled slot for this entity
      // Don't rely on bridge sensor state (which is global for all entities)
      return items.some(item => item && item.enabled === true);
    } catch (err) {
      return false;
    }
  }

  /** True if the scheduler switch is on. Uses switch.homie_scheduler_enabled so the toggle stays in sync. */
  _isSchedulerEnabled() {
    try {
      const state = this._hass?.states?.[SCHEDULER_SWITCH_ENTITY]?.state;
      return state === 'on';
    } catch (err) {
      return true;
    }
  }

  _isEnabledForDisplay() {
    return this._isSchedulerEnabled() && this._isEnabled();
  }

  _getNextRun() {
    // Calculate next_run for THIS entity from its items (not from bridge sensor)
    // Bridge sensor shows next_run for ALL entities, but we need it for specific entity
    try {
      const items = this._getItems(); // Already filtered by entity_id
      if (!items || items.length === 0) return null;
      
      const now = new Date();
      const candidates = [];
      
      // Calculate next start time for each enabled item
      for (const item of items) {
        if (!item || !item.enabled) continue;
        
        const nextStart = this._calculateNextStart(item, now);
        if (nextStart) {
          const duration = item.duration || null; // Use null if duration not specified
          candidates.push({ date: nextStart, duration, item });
        }
      }
      
      if (candidates.length === 0) return null;
      
      // Return earliest start time with its duration and item (for mode extraction)
      const earliest = candidates.reduce((min, candidate) => 
        candidate.date < min.date ? candidate : min
      );
      
      return this._formatNextRun(earliest.date, earliest.duration, earliest.item);
    } catch (e) {
      return null;
    }
  }

  _calculateNextStart(item, now) {
    // Calculate next start time for an item (same logic as Python _calculate_next_start)
    // Returns Date or null
    try {
      const timeStr = item.time;
      const weekdays = item.weekdays || [];
      
      if (!timeStr || !weekdays || weekdays.length === 0) return null;
      
      // Parse time (HH:MM)
      const timeMatch = timeStr.match(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/);
      if (!timeMatch) return null;
      
      const hour = parseInt(timeMatch[1], 10);
      const minute = parseInt(timeMatch[2], 10);
      if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
      
      // Try next 8 days (today + 7 more days)
      for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
        const candidateDt = new Date(now);
        candidateDt.setDate(candidateDt.getDate() + dayOffset);
        candidateDt.setHours(hour, minute, 0, 0);
        
        // Skip if in the past (including if it's exactly now, we want future)
        if (candidateDt <= now) continue;
        
        // Check if weekday matches
        // JavaScript: 0=Sunday, 1=Monday, ..., 6=Saturday
        // Integration: 0=Monday, 1=Tuesday, ..., 6=Sunday
        // Convert JS weekday to integration weekday
        let jsWeekday = candidateDt.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        let integrationWeekday = jsWeekday === 0 ? 6 : jsWeekday - 1; // 0=Mon, 1=Tue, ..., 6=Sun
        
        if (weekdays.includes(integrationWeekday)) {
          return candidateDt;
        }
      }
      
      return null;
    } catch (e) {
      return null;
    }
  }

  _formatDuration(duration) {
    // Format duration: if > 60 min, show in hours
    if (!duration) return '';
    if (duration > 60) {
      const hours = Math.floor(duration / 60);
      const minutes = duration % 60;
      if (minutes === 0) {
        return ` for ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
      } else {
        return ` for ${hours}h ${minutes}min`;
      }
    } else {
      return ` for ${duration} min`;
    }
  }

  _formatNextRun(date, duration, item = null) {
    const now = new Date();
    const diff = date - now;
    
    if (diff < 0) return null;
    
    // Calculate days difference by comparing dates, not milliseconds
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const days = Math.floor((targetDate - nowDate) / (1000 * 60 * 60 * 24));
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    
    // Format time as HH:MM (24-hour format)
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hours}:${mins}`;
    
    // Weekday names (Monday=0, Sunday=6) - matching integration
    // Note: JavaScript getDay() returns 0=Sunday, 6=Saturday
    // But integration uses Python weekday() where 0=Monday, 6=Sunday
    // So we need to adjust: JS Sunday(0) -> Mon(0), JS Monday(1) -> Tue(1), etc.
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    // Get HVAC mode from item for climate entities
    let modePrefix = '';
    if (item && item.service_start && item.service_start.value && item.service_start.value.hvac_mode) {
      const hvacMode = item.service_start.value.hvac_mode;
      modePrefix = `${this._formatHvacModeLabel(hvacMode)}, `;
    }
    
    // Duration suffix (from homie-schedule bridge sensor)
    const durationStr = this._formatDuration(duration);
    
    if (days === 0 && seconds < 3600) {
      // Less than 1 hour
      if (minutes === 0) {
        // Less than 1 minute - show seconds
        return `${modePrefix}in ${seconds}s${durationStr}`;
      }
      return `${modePrefix}in ${minutes}m${durationStr}`;
    } else if (days === 0) {
      // Today
      return `${modePrefix}Today ${timeStr}${durationStr}`;
    } else if (days === 1) {
      // Tomorrow
      return `${modePrefix}Tomorrow ${timeStr}${durationStr}`;
    } else {
      // Future day
      return `${modePrefix}${weekdays[date.getDay()]} ${timeStr}${durationStr}`;
    }
  }

  async _callService(service, data) {
    // Safe checks - don't throw errors
    if (!this._hass) {
      return Promise.resolve(); // Resolve silently, don't throw
    }
    
    if (!this._entryId) {
      // Try to find bridge sensor again
      this._findBridgeSensor();
      if (!this._entryId) {
        return Promise.resolve();
      }
    }
    
    if (!this._config || this._getEntities().length === 0) {
      return Promise.resolve();
    }

    try {
      // Use only 'homie_scheduler' domain
      await this._hass.callService('homie_scheduler', service, {
        entry_id: this._entryId,
        ...data
      });
    } catch (err) {
      // Log more details about the error
      if (err.code) {
      }
      if (err.message) {
      }
      // Show user-friendly error message
      const errorMsg = err.message || 'Service call failed';
      
      // Check if it's a service not found error
      if (err.code === 3 || errorMsg.includes('not found') || errorMsg.includes('Unknown service')) {
        console.warn('Homie Scheduler (climate): Integration service not available.', err.message || err);
      } else {
        let userMsg = errorMsg;
        if (userMsg.includes('for dictionary value')) userMsg = userMsg.split('for dictionary value')[0].trim();
        if (userMsg.includes('[30, 60]')) {
          userMsg = userMsg.replace(/\[30, 60\]/g, '').replace(/value must be one of/, 'Invalid duration value');
        }
        console.warn('Homie Scheduler (climate):', userMsg, err);
      }
    }
  }

  _debounceUpdate(callback, delay = 500) {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }
    this._debounceTimer = setTimeout(callback, delay);
  }

  async _toggleEnabled() {
    const items = this._getItems();
    if (items.length === 0) {
      this._openAddPopup();
      return;
    }
    if (!this._isSchedulerEnabled() && this._hass) {
      const bridgeState = this._getBridgeState();
      if (this._bridgeSensor && bridgeState?.attributes?.items) {
        const allItems = [...bridgeState.attributes.items];
        items.forEach(item => {
          if (item?.id) {
            const idx = allItems.findIndex(i => i && i.id === item.id);
            if (idx !== -1) {
              const updated = { ...allItems[idx], enabled: true };
              allItems[idx] = updated;
              this._updateSlotElement(item.id, updated);
            }
          }
        });
        this._optimisticBridgeState = { ...bridgeState, attributes: { ...bridgeState.attributes, items: allItems } };
        this._updateHeaderStatus();
        this.hass = { ...this._hass };
        this._syncAllCardsForEntity(null, null, this._optimisticBridgeState);
      }
      for (const item of items) {
        if (item?.id) await this._callService('update_item', { id: item.id, enabled: true });
      }
      if (this._bridgeSensor) {
        try {
          await this._hass.callService('homeassistant', 'update_entity', { entity_id: this._bridgeSensor });
        } catch (e) {
          if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): update_entity after enable-all failed', e);
        }
      }
      try {
        await this._hass.callService('switch', 'turn_on', { entity_id: SCHEDULER_SWITCH_ENTITY });
      } catch (e) {
        console.warn('Homie Scheduler: failed to turn on scheduler switch', e);
      }
      setTimeout(() => { if (this._hass) this.hass = { ...this._hass }; }, 300);
      return;
    }
    const hasEnabledSlots = items.some(item => item && item.enabled === true);
    const newEnabledState = !hasEnabledSlots;

    if (this._hass && this._bridgeSensor) {
      const bridgeState = this._getBridgeState();
      if (bridgeState?.attributes?.items) {
        const allItems = [...bridgeState.attributes.items];
        items.forEach(item => {
          if (item && item.id) {
            const idx = allItems.findIndex(i => i && i.id === item.id);
            if (idx !== -1) {
              const updated = { ...allItems[idx], enabled: newEnabledState };
              allItems[idx] = updated;
              this._updateSlotElement(item.id, updated);
            }
          }
        });
        this._optimisticBridgeState = {
          ...bridgeState,
          attributes: { ...bridgeState.attributes, items: allItems }
        };
        this._updateHeaderStatus();
        this.hass = { ...this._hass };
        this._syncAllCardsForEntity(null, null, this._optimisticBridgeState);
      }
    }

    for (const item of items) {
      if (item?.id) {
        await this._callService('update_item', { id: item.id, enabled: newEnabledState });
      }
    }

    if (this._hass && this._bridgeSensor) {
      try {
        await this._hass.callService('homeassistant', 'update_entity', { entity_id: this._bridgeSensor });
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): update_entity after toggle failed', e);
      }
      setTimeout(() => { if (this._hass) this.hass = { ...this._hass }; }, 500);
    }
  }

  /** Form root for Add Slot popup (shared form fragment). */
  _getAddFormRoot() {
    const popup = this.shadowRoot.getElementById('add-popup');
    if (!popup) return null;
    return popup.querySelector('[data-slot-form="root"]') || popup;
  }

  /** Entities wrap in Add Slot popup. */
  _getAddFormEntitiesWrap() {
    return this._getAddFormRoot()?.querySelector('[data-slot-form="entities-wrap"]') || null;
  }

  /** Get selected entity IDs from any entities-wrap (add popup or slot edit). */
  _getSelectedEntityIdsFromWrap(wrap, fallbackIds) {
    if (!wrap) return fallbackIds || [];
    const listEl = wrap.querySelector('.entities-selector-list');
    if (!listEl) return fallbackIds || [];
    const checked = listEl.querySelectorAll('input[name="entities-selector-entity"]:checked');
    return Array.from(checked).map(el => el.value);
  }

  _getPopupSelectedEntityIds() {
    const entities = this._getEntities();
    if (entities.length === 0) return [];
    const wrap = this._getAddFormEntitiesWrap();
    if (wrap && wrap.style.display !== 'none') {
      return this._getSelectedEntityIdsFromWrap(wrap, entities);
    }
    return entities;
  }

  /** Returns intersection of hvac_modes for all given entity ids. */
  _getCommonHvacModes(entityIds) {
    if (!this._hass || !entityIds || entityIds.length === 0) return [];
    let common = null;
    for (const eid of entityIds) {
      const state = this._hass.states[eid];
      const modes = state?.attributes?.hvac_modes;
      if (!Array.isArray(modes) || modes.length === 0) return [];
      const set = new Set(modes);
      if (common === null) common = set;
      else common = new Set([...common].filter(m => set.has(m)));
    }
    return common ? [...common] : [];
  }

  /** Refill Mode dropdown from intersection of hvac_modes of selected entities in wrap (add popup or slot edit). */
  _updateModeOptionsForWrap(wrap, modeSelectEl, opts = {}) {
    if (!modeSelectEl || !this._hass) return;
    const fallback = wrap && wrap.getAttribute('data-slot-form') === 'entities-wrap' ? this._getEntities() : [];
    const selectedIds = this._getSelectedEntityIdsFromWrap(wrap, fallback);
    const commonModes = this._getCommonHvacModes(selectedIds);
    const currentValue = modeSelectEl.value;
    modeSelectEl.innerHTML = '';
    if (commonModes.length === 0) {
      modeSelectEl.appendChild(new Option('Off', 'off'));
      modeSelectEl.value = 'off';
    } else {
      commonModes.forEach(mode => {
        const option = document.createElement('option');
        option.value = mode;
        option.textContent = this._formatHvacModeLabel(mode);
        modeSelectEl.appendChild(option);
      });
      const keepCurrent = commonModes.includes(currentValue);
      modeSelectEl.value = keepCurrent ? currentValue : commonModes[0];
    }
    if (opts.syncDurationVisibility) this._syncPopupDurationVisibility();
  }

  _updatePopupModeOptions() {
    const wrap = this._getAddFormEntitiesWrap();
    const hvacModeSelect = this._getAddFormRoot()?.querySelector('[data-slot-form="mode"]');
    this._updateModeOptionsForWrap(wrap, hvacModeSelect, { syncDurationVisibility: true });
  }

  /** Update mode warning and row states for any entities-wrap (add popup or slot edit). warningEl may be null (slot has no warning). */
  _updateModeWarningForWrap(wrap, modeSelectEl, warningEl) {
    if (!modeSelectEl || !this._hass) return;
    const listEl = wrap ? wrap.querySelector('.entities-selector-list') : null;
    const mode = modeSelectEl.value;
    if (!mode) {
      if (warningEl) warningEl.textContent = '';
      if (listEl) listEl.querySelectorAll('.entities-selector-row').forEach(row => { row.classList.remove('entities-selector-row-unsupported'); const inp = row.querySelector('input'); if (inp) inp.disabled = false; });
      return;
    }
    const entities = this._getEntities();
    const fallback = wrap && wrap.getAttribute('data-slot-form') === 'entities-wrap' ? entities : [];
    const selectedIds = this._getSelectedEntityIdsFromWrap(wrap, fallback);
    const unsupportedIds = new Set();
    entities.forEach(entityId => {
      const state = this._hass.states[entityId];
      const modes = state?.attributes?.hvac_modes;
      if (Array.isArray(modes) && !modes.includes(mode)) unsupportedIds.add(entityId);
    });
    const unsupportedNames = selectedIds
      .filter(eid => unsupportedIds.has(eid))
      .map(eid => this._hass.states[eid]?.attributes?.friendly_name || eid);
    if (listEl) {
      listEl.querySelectorAll('.entities-selector-row').forEach(row => {
        const input = row.querySelector('input[name="entities-selector-entity"]');
        if (!input) return;
        const entityId = input.value;
        const unsupported = unsupportedIds.has(entityId);
        row.classList.toggle('entities-selector-row-unsupported', unsupported);
        input.disabled = unsupported;
        if (unsupported) input.checked = false;
      });
    }
    if (warningEl) {
      warningEl.textContent = unsupportedNames.length === 0 ? '' : (unsupportedNames.length === 1
        ? `This mode is not supported for: ${unsupportedNames[0]}`
        : `This mode is not supported for: ${unsupportedNames.join(', ')}`);
    }
    this._updateEntityChipsForWrap(wrap, { updateSlotTitle: !!wrap?.closest?.('.slot-card') });
    const selectAll = wrap?.querySelector?.('.slot-form-entities-select-all');
    if (listEl && selectAll) {
      const all = listEl.querySelectorAll('.entities-selector-row:not(.entities-selector-row-unsupported) input[name="entities-selector-entity"]');
      const checkedCount = Array.from(all).filter(inp => inp.checked).length;
      selectAll.checked = checkedCount === all.length;
      selectAll.indeterminate = checkedCount > 0 && checkedCount < all.length;
    }
  }

  _updateHvacModeWarning() {
    const root = this._getAddFormRoot();
    const wrap = this._getAddFormEntitiesWrap();
    const hvacModeSelect = root?.querySelector('[data-slot-form="mode"]');
    const warningEl = root?.querySelector('[data-slot-form="mode-warning"]');
    this._updateModeWarningForWrap(wrap, hvacModeSelect, warningEl);
  }

  /** When mode is 'off', hide duration in add-popup and clear it (schedule turn-off only). */
  _syncPopupDurationVisibility() {
    const root = this._getAddFormRoot();
    const hvacModeSelect = root?.querySelector('[data-slot-form="mode"]');
    const durationWrapper = root?.querySelector('[data-slot-form="duration-wrapper"]');
    const durationEnabledCheckbox = root?.querySelector('[data-slot-form="duration-enabled"]');
    if (!hvacModeSelect || !durationWrapper) return;
    const popupDurationField = durationWrapper.closest('.slot-form-field');
    if (!popupDurationField) return;
    if (hvacModeSelect.value === 'off') {
      popupDurationField.style.display = 'none';
      if (durationEnabledCheckbox) durationEnabledCheckbox.checked = false;
      durationWrapper.style.display = 'none';
      if (window.DurationSelector) DurationSelector.reset(this.shadowRoot, null);
    } else {
      popupDurationField.style.display = '';
    }
  }

  /** Update chips (and optional slot title) for any entities-wrap (add popup or slot edit). */
  _updateEntityChipsForWrap(wrap, opts = {}) {
    if (!wrap) return;
    const chipsEl = wrap.querySelector('.slot-form-entities-chips');
    const listEl = wrap.querySelector('.entities-selector-list');
    if (!chipsEl || !listEl) return;
    const checked = listEl.querySelectorAll('input[name="entities-selector-entity"]:checked');
    const names = Array.from(checked).map(input => {
      const row = input.closest('.entities-selector-row');
      const nameEl = row && row.querySelector('.entities-selector-entity-name');
      return nameEl ? nameEl.textContent : input.value;
    });
    chipsEl.innerHTML = '';
    names.forEach(name => {
      const chip = document.createElement('span');
      chip.className = 'popup-entity-chip';
      chip.textContent = name;
      chipsEl.appendChild(chip);
    });
    if (opts.updateSlotTitle) this._updateSlotTitleFromEntities(wrap, names);
  }

  _updateEntitiesChips() {
    this._updateEntityChipsForWrap(this._getAddFormEntitiesWrap());
  }

  _updateSlotEntitiesChips(slotEntitiesWrap) {
    this._updateEntityChipsForWrap(slotEntitiesWrap, { updateSlotTitle: true });
  }

  /** Update slot header name and remove button text only when entity list changes; clear first to avoid duplication. */
  _updateSlotTitleFromEntities(slotEntitiesWrap, entityNames) {
    if (!slotEntitiesWrap) return;
    const slotCard = slotEntitiesWrap.closest('.slot-card');
    if (!slotCard) return;
    const nameEl = slotCard.querySelector('.slot-name');
    const removeSpan = slotCard.querySelector('.slot-delete span');
    if (nameEl) nameEl.textContent = '';
    if (removeSpan) removeSpan.textContent = '';
    const slotCards = this.shadowRoot.querySelectorAll('.slot-card');
    const slotNumber = slotCards.length ? Array.from(slotCards).indexOf(slotCard) + 1 : 1;
    const entityLabel = (entityNames && entityNames.length > 0) ? entityNames.join(', ') : '';
    const titleInput = slotCard.querySelector('[data-slot-form="title"]');
    const baseName = (titleInput && titleInput.value.trim()) || `Slot ${slotNumber}`;
    const slotName = baseName + (entityLabel ? ` (${entityLabel})` : '');
    if (nameEl) nameEl.textContent = slotName;
    if (removeSpan) removeSpan.textContent = 'Remove ' + baseName;
  }

  /** Slot edit: delegate to shared mode warning (row states + chips + selectAll). */
  _updateSlotEntitiesForMode(slotEntitiesWrap, itemEl) {
    const hvacSelect = itemEl?.querySelector?.('[data-slot-form="mode"]');
    this._updateModeWarningForWrap(slotEntitiesWrap, hvacSelect, null);
  }

  _entitiesDropdownCloseOnOutside(e) {
    const wrap = this._getAddFormEntitiesWrap();
    const dropdown = wrap?.querySelector('[data-slot-form="entities-dropdown"]');
    const trigger = wrap?.querySelector('[data-slot-form="entities-trigger"]');
    if (!dropdown || !trigger) return;
    if (dropdown.contains(e.target) || trigger.contains(e.target)) return;
    dropdown.classList.remove('open');
    trigger.classList.remove('open');
    document.removeEventListener('click', this._boundEntitiesCloseOnOutside);
  }

  _attachEntitiesDropdownListeners() {
    const wrap = this._getAddFormEntitiesWrap();
    const trigger = wrap?.querySelector('[data-slot-form="entities-trigger"]');
    const dropdown = wrap?.querySelector('[data-slot-form="entities-dropdown"]');
    const selectAll = wrap?.querySelector('[data-slot-form="entities-select-all"]');
    const listEl = dropdown ? dropdown.querySelector('.entities-selector-list') : null;
    if (!trigger || !dropdown) return;

    trigger.onclick = () => {
      const isOpen = dropdown.classList.toggle('open');
      trigger.classList.toggle('open', isOpen);
      if (isOpen) {
        this._updateEntitiesChips();
        this._boundEntitiesCloseOnOutside = this._entitiesDropdownCloseOnOutside.bind(this);
        setTimeout(() => document.addEventListener('click', this._boundEntitiesCloseOnOutside), 0);
      } else {
        document.removeEventListener('click', this._boundEntitiesCloseOnOutside);
      }
    };

    if (!dropdown._entitiesClickStopped) {
      dropdown.addEventListener('click', (e) => e.stopPropagation());
      dropdown._entitiesClickStopped = true;
    }
    if (selectAll && listEl) {
      selectAll.closest('label').onclick = (e) => e.stopPropagation();
      selectAll.onchange = () => {
        const checked = selectAll.checked;
        listEl.querySelectorAll('.entities-selector-row input[name="entities-selector-entity"]:not([disabled])').forEach(inp => { inp.checked = checked; });
        this._updateEntitiesChips();
        this._updatePopupModeOptions();
        this._updateHvacModeWarning();
      };
    }
    if (listEl) {
      listEl.querySelectorAll('input[name="entities-selector-entity"]').forEach(input => {
        input.addEventListener('change', () => {
          const all = listEl.querySelectorAll('.entities-selector-row input[name="entities-selector-entity"]');
          const checkedCount = Array.from(all).filter(inp => inp.checked).length;
          if (selectAll) {
            selectAll.checked = checkedCount === all.length;
            selectAll.indeterminate = checkedCount > 0 && checkedCount < all.length;
          }
          this._updateEntitiesChips();
          this._updatePopupModeOptions();
          this._updateHvacModeWarning();
        });
      });
    }
  }

  _openAddPopup() {
    const popup = this.shadowRoot.getElementById('add-popup');
    const root = this._getAddFormRoot();
    if (popup && root) {
      this._clearAddPopupError();
      popup.style.display = 'flex';
      const hoursSelect = root.querySelector('[data-slot-form="time-hours"]');
      const minutesSelect = root.querySelector('[data-slot-form="time-minutes"]');
      const hvacModeSelect = root.querySelector('[data-slot-form="mode"]');
      const durationEnabledCheckbox = root.querySelector('[data-slot-form="duration-enabled"]');
      const durationWrapper = root.querySelector('[data-slot-form="duration-wrapper"]');
      const entitiesWrap = root.querySelector('[data-slot-form="entities-wrap"]');
      const titleInput = root.querySelector('[data-slot-form="title"]');
      if (titleInput) titleInput.value = '';
      const now = new Date();
      const hour = String(now.getHours()).padStart(2, '0');
      const minute = String(Math.round(now.getMinutes() / 5) * 5).padStart(2, '0');
      if (hoursSelect) hoursSelect.value = hour;
      if (minutesSelect) minutesSelect.value = minute;
      if (durationEnabledCheckbox) durationEnabledCheckbox.checked = false;
      if (durationWrapper) durationWrapper.style.display = 'none';
      DurationSelector.reset(this.shadowRoot, null);

      const entities = this._getEntities();
      const dropdown = entitiesWrap?.querySelector('[data-slot-form="entities-dropdown"]');
      if (dropdown && entities.length > 1) {
        entitiesWrap.style.display = '';
        const trigger = entitiesWrap.querySelector('[data-slot-form="entities-trigger"]');
        if (trigger) trigger.classList.remove('open');
        dropdown.classList.remove('open');
        const selectAllInput = entitiesWrap.querySelector('[data-slot-form="entities-select-all"]');
        if (selectAllInput) { selectAllInput.checked = true; selectAllInput.indeterminate = false; }
        const isEntityDisabled = (entityId) => {
          if (!hvacModeSelect || !hvacModeSelect.value || !this._hass) return false;
          const state = this._hass.states[entityId];
          const modes = state?.attributes?.hvac_modes;
          return Array.isArray(modes) && !modes.includes(hvacModeSelect.value);
        };
        if (window.EntitiesSelector && window.EntitiesSelector.attachEntitiesList) {
          window.EntitiesSelector.attachEntitiesList(dropdown, {
            entities,
            checkedEntityIds: entities,
            hass: this._hass,
            onCheck: () => { this._updateEntitiesChips(); this._updatePopupModeOptions(); this._updateHvacModeWarning(); this._updateAddPopupFanAndTemp(); },
            onUncheck: () => { this._updateEntitiesChips(); this._updatePopupModeOptions(); this._updateHvacModeWarning(); this._updateAddPopupFanAndTemp(); },
            isEntityDisabled
          });
        }
        this._updateEntitiesChips();
        this._updateHvacModeWarning();
        this._attachEntitiesDropdownListeners();
      } else if (entitiesWrap) {
        entitiesWrap.style.display = 'none';
      }

      this._updatePopupModeOptions();
      this._updateHvacModeWarning();
      this._updateAddPopupFanAndTemp();
      this._syncPopupDurationVisibility();
      requestAnimationFrame(() => {
        this._updateAddPopupFanAndTemp();
        this._syncPopupDurationVisibility();
      });
    }
  }

  _updateAddPopupFanAndTemp() {
    const root = this._getAddFormRoot();
    if (!root || !this._hass) return;
    const hvacModeSelect = root.querySelector('[data-slot-form="mode"]');
    const fanSelect = root.querySelector('[data-slot-form="fan"]');
    const tempInput = root.querySelector('[data-slot-form="temp"]');
    const isOff = hvacModeSelect && String(hvacModeSelect.value || '').trim().toLowerCase() === 'off';
    if (isOff) {
      if (tempInput) {
        tempInput.value = '';
        tempInput.placeholder = '—';
        tempInput.disabled = true;
        tempInput.setAttribute('disabled', '');
      }
      if (fanSelect) {
        fanSelect.innerHTML = '<option value="">—</option>';
        fanSelect.value = '';
        fanSelect.disabled = true;
        fanSelect.setAttribute('disabled', '');
      }
      return;
    }
    const selectedIds = this._getPopupSelectedEntityIds();
    const entityId = selectedIds.length ? selectedIds[0] : this._getEntities()[0];
    if (!entityId) {
      if (fanSelect) { fanSelect.innerHTML = '<option value="">—</option>'; fanSelect.value = ''; fanSelect.disabled = false; fanSelect.removeAttribute('disabled'); }
      if (tempInput) { tempInput.min = 5; tempInput.max = 35; tempInput.value = 21; tempInput.placeholder = '—'; tempInput.disabled = false; tempInput.removeAttribute('disabled'); }
      return;
    }
    const state = this._hass.states[entityId];
    const attrs = state?.attributes || {};
    if (fanSelect) {
      const fanModes = attrs.fan_modes;
      const escape = (window.ScheduleHelper && typeof window.ScheduleHelper.escapeHtml === 'function') ? (s) => window.ScheduleHelper.escapeHtml(s) : (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      if (Array.isArray(fanModes) && fanModes.length) {
        fanSelect.innerHTML = fanModes.map(fm => {
          const label = (fm || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          return `<option value="${escape(fm)}">${escape(label)}</option>`;
        }).join('');
        fanSelect.value = fanModes[0];
      } else {
        fanSelect.innerHTML = '<option value="">—</option>';
        fanSelect.value = '';
      }
    }
    if (tempInput) {
      const min = attrs.min_temp != null ? attrs.min_temp : 5;
      const max = attrs.max_temp != null ? attrs.max_temp : 35;
      const val = attrs.temperature != null ? attrs.temperature : 21;
      tempInput.min = min;
      tempInput.max = max;
      tempInput.step = attrs.target_temp_step ?? 0.5;
      tempInput.value = Math.max(min, Math.min(max, val));
      tempInput.placeholder = '—';
      tempInput.disabled = false;
      tempInput.removeAttribute('disabled');
    }
    if (fanSelect) { fanSelect.disabled = false; fanSelect.removeAttribute('disabled'); }
  }

  _showAddPopupError(message) {
    const popup = this.shadowRoot?.getElementById('add-popup');
    const errEl = popup?.querySelector('[data-slot-form="popup-error"]');
    if (errEl) {
      errEl.textContent = message;
      errEl.style.display = '';
    }
  }

  _clearAddPopupError() {
    const popup = this.shadowRoot?.getElementById('add-popup');
    const errEl = popup?.querySelector('[data-slot-form="popup-error"]');
    if (errEl) {
      errEl.textContent = '';
      errEl.style.display = 'none';
    }
  }

  /** True if two weekday arrays share at least one day. */
  _weekdaysOverlap(a, b) {
    const setA = new Set(a || []);
    return (b || []).some(d => setA.has(d));
  }

  /** Content key for conflict detection: time, weekdays, mode, temp, fan, duration, title. */
  _slotContentKey(data) {
    const mode = data.service_start?.value?.hvac_mode ?? data.hvac_mode ?? '';
    const isOff = mode === 'off';
    const dur = isOff ? '' : (data.duration ?? '');
    const temp = data.service_start?.value?.temperature ?? data.temperature;
    const tempStr = isOff ? '' : (temp != null ? String(temp) : '');
    const fan = isOff ? '' : (data.service_start?.value?.fan_mode ?? data.fan_mode ?? '');
    const slotTitle = data.title ?? '';
    return (data.time || '') + '|' + JSON.stringify(data.weekdays || []) + '|' + dur + '|' + mode + '|' + tempStr + '|' + fan + '|' + slotTitle;
  }

  /** True if a slot with same content (time, weekdays, mode, temp, fan, duration, title) already exists for any selected entity. */
  _hasAddSlotConflict(bridgeState, time, weekdays, selectedEntityIds, newSlotData) {
    const allItems = bridgeState?.attributes?.items || [];
    const entitySet = new Set(selectedEntityIds);
    if (!newSlotData) {
      return allItems.some(i =>
        i && !i.temporary && entitySet.has(i.entity_id) &&
        i.time === time && this._weekdaysOverlap(weekdays, i.weekdays)
      );
    }
    const newKey = this._slotContentKey({ ...newSlotData, time, weekdays });
    return allItems.some(i =>
      i && !i.temporary && entitySet.has(i.entity_id) &&
      i.time === time && this._weekdaysOverlap(weekdays, i.weekdays) &&
      this._slotContentKey(i) === newKey
    );
  }

  _closeAddPopup() {
    const popup = this.shadowRoot.getElementById('add-popup');
    if (popup) popup.style.display = 'none';
    const wrap = this._getAddFormEntitiesWrap();
    const trigger = wrap?.querySelector('[data-slot-form="entities-trigger"]');
    const dropdown = wrap?.querySelector('[data-slot-form="entities-dropdown"]');
    if (trigger) trigger.classList.remove('open');
    if (dropdown) dropdown.classList.remove('open');
    if (this._boundEntitiesCloseOnOutside) {
      document.removeEventListener('click', this._boundEntitiesCloseOnOutside);
      this._boundEntitiesCloseOnOutside = null;
    }
  }


  async _saveSlot() {
    const popup = this.shadowRoot.getElementById('add-popup');
    const root = popup?.querySelector('[data-slot-form="root"]') || popup;
    if (!root) return;
    const hoursSelect = root.querySelector('[data-slot-form="time-hours"]');
    const minutesSelect = root.querySelector('[data-slot-form="time-minutes"]');
    const hvacModeSelect = root.querySelector('[data-slot-form="mode"]');
    const titleInput = root.querySelector('[data-slot-form="title"]');
    const durationEnabledCheckbox = root.querySelector('[data-slot-form="duration-enabled"]');
    const durationWrapper = root.querySelector('[data-slot-form="duration-wrapper"]');
    const selectedDays = root ? WeekdaySelector.getSelectedWeekdays(root) : [];
    
    let duration = null;
    if (durationEnabledCheckbox && durationEnabledCheckbox.checked && durationWrapper) {
      duration = DurationSelector.getSelectedDuration(durationWrapper);
    }

    if (!hoursSelect || !minutesSelect) return;
    if (selectedDays.length === 0) {
      console.warn('Homie Scheduler (climate): Please select at least one day');
      return;
    }
    
    if (!hvacModeSelect || !hvacModeSelect.value) {
      console.warn('Homie Scheduler (climate): Please select an HVAC mode');
      return;
    }

    const time = `${hoursSelect.value}:${minutesSelect.value}`;
    const hvacMode = hvacModeSelect.value;
    const title = titleInput?.value?.trim() || null;
    // Duration from selector is in hours; API expects minutes
    const durationValue = (hvacMode === 'off') ? null : (ScheduleHelper && ScheduleHelper.durationHoursToMinutes ? ScheduleHelper.durationHoursToMinutes(duration) : (duration != null && duration !== '' ? (() => { const h = parseFloat(duration); return Number.isNaN(h) ? null : Math.round(h * 60); })() : null));

    const entities = this._getEntities();
    if (!this._config || entities.length === 0) return;

    const selectedEntityIds = this._getPopupSelectedEntityIds();
    if (selectedEntityIds.length === 0) {
      console.warn('Homie Scheduler (climate): Please select at least one entity for this slot');
      return;
    }

    this._clearAddPopupError();

    const fanSelect = root.querySelector('[data-slot-form="fan"]');
    const tempInput = root.querySelector('[data-slot-form="temp"]');
    const fanMode = fanSelect?.value || undefined;
    let temperature = undefined;
    if (tempInput && tempInput.value !== '' && !Number.isNaN(Number(tempInput.value))) {
      temperature = parseFloat(tempInput.value);
    }

    const bridgeState = this._getBridgeState();
    const newSlotData = { time, weekdays: selectedDays, duration: durationValue, hvac_mode: hvacMode, temperature, fan_mode: fanMode, title };
    if (this._hasAddSlotConflict(bridgeState, time, selectedDays, selectedEntityIds, newSlotData)) {
      this._showAddPopupError('A slot with the same time, days, mode, and title already exists.');
      return;
    }

    const climateServicesByEntity = {};
    selectedEntityIds.forEach(eid => {
      climateServicesByEntity[eid] = ScheduleHelper.createClimateServices(eid, hvacMode, { temperature, fan_mode: fanMode });
    });

    try {
      for (const entity_id of selectedEntityIds) {
        const climateServices = climateServicesByEntity[entity_id];
        await ScheduleHelper.addScheduleSlot({
          hass: this._hass,
          callService: async (service, data) => this._callService(service, data),
          getBridgeState: () => this._getBridgeState(),
          entity_id,
          time,
          duration: durationValue,
          weekdays: selectedDays,
          title,
          service_start: climateServices.service_start,
          service_end: durationValue ? climateServices.service_end : null,
          bridgeSensor: this._bridgeSensor,
          onRender: () => {
            this.hass = { ...this._hass };
            this.render().catch(() => {});
          }
        });
      }

      const bridgeState = this._getBridgeState();
      if (bridgeState && bridgeState.attributes) {
        const currentItems = bridgeState.attributes.items || [];
        const alreadyAll = selectedEntityIds.every(eid =>
          currentItems.some(i => i && i.entity_id === eid && i.time === time)
        );
        if (!alreadyAll) {
          const newItems = [...currentItems];
          selectedEntityIds.forEach((eid, idx) => {
            newItems.push({
              id: 'temp-' + Date.now() + '-' + idx,
              entity_id: eid,
              time,
              duration: durationValue,
              weekdays: selectedDays,
              enabled: true,
              service_start: climateServicesByEntity[eid].service_start,
              service_end: durationValue ? climateServicesByEntity[eid].service_end : null,
              ...(title ? { title } : {})
            });
          });
          this._optimisticBridgeState = {
            ...bridgeState,
            attributes: { ...bridgeState.attributes, items: newItems }
          };
          this.hass = { ...this._hass };
          this._syncAllCardsForEntity(null, null, this._optimisticBridgeState);
          await this.render();
          let attempts = 0;
          const pollClear = () => {
            if (!this._optimisticBridgeState?.attributes?.items?.some(i => i?.id?.startsWith?.('temp-'))) return;
            const fromHass = this._hass?.states?.[this._bridgeSensor]?.attributes?.items || [];
            const tempItems = (this._optimisticBridgeState?.attributes?.items || []).filter(i => i?.id?.startsWith?.('temp-'));
            const realHasSame = tempItems.every(t => fromHass.some(h =>
              h?.entity_id === t?.entity_id && h?.time === t?.time &&
              JSON.stringify(h?.weekdays || []) === JSON.stringify(t?.weekdays || []) &&
              !String(h?.id || '').startsWith('temp-')));
            if (realHasSame) {
              this._optimisticBridgeState = null;
              this.hass = { ...this._hass };
              this.render().catch(() => {});
            } else if (attempts < 20) {
              attempts++;
              setTimeout(pollClear, 500);
            }
          };
          setTimeout(pollClear, 500);
        }
      }
    } catch (err) {
      console.warn('Homie Scheduler (climate): Failed to add slot', err.message || err, err);
      return;
    }

    this._closeAddPopup();
  }

  /** Climate duration defaults (hours); actual values come from card config min_duration/max_duration/duration_step. */
  static get CLIMATE_DURATION_MIN() { return 0.5; }
  static get CLIMATE_DURATION_MAX() { return 12; }
  static get CLIMATE_DURATION_STEP() { return 0.5; }

  /** Normalize duration_range or min_duration/max_duration into target (climate: hours). Clamped to 0.5–12. */
  _normalizeDurationConfig(source, target) {
    if (!source || !target) return;
    const minH = this.constructor.CLIMATE_DURATION_MIN;
    const maxH = this.constructor.CLIMATE_DURATION_MAX;
    if (source.duration_range && Array.isArray(source.duration_range) && source.duration_range.length === 2) {
      target.min_duration = Math.max(minH, Number(source.duration_range[0]) || minH);
      target.max_duration = Math.min(maxH, Number(source.duration_range[1]) || maxH);
    } else {
      target.min_duration = Math.max(minH, source.min_duration ?? minH);
      target.max_duration = Math.min(maxH, source.max_duration ?? maxH);
    }
    target.duration_step = source.duration_step ?? this.constructor.CLIMATE_DURATION_STEP;
  }

  /** Duration config in hours: from card config (min_duration, max_duration, duration_step), same mechanism as boiler. */
  _getDurationConfig() {
    const minDuration = this._config?.min_duration ?? this.constructor.CLIMATE_DURATION_MIN;
    const maxDuration = this._config?.max_duration ?? this.constructor.CLIMATE_DURATION_MAX;
    const durationStep = this._config?.duration_step ?? this.constructor.CLIMATE_DURATION_STEP;
    return { minDuration, maxDuration, durationStep };
  }

  /** Display label for HVAC mode: Heat_cool -> Auto, Fan_only -> Fan Only, other_with_underscore -> space + title case */
  _formatHvacModeLabel(mode) {
    if (!mode || typeof mode !== 'string') return mode || '';
    const m = mode.toLowerCase();
    if (m === 'heat_cool') return 'Auto';
    if (mode.includes('_')) {
      return mode.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    }
    return mode.charAt(0).toUpperCase() + mode.slice(1);
  }

  _formatTime(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return '';
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours, 10);
    if (Number.isNaN(h)) return timeStr;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes || '00'} ${ampm}`;
  }

  async _addItem() {
    // Legacy method - now opens popup
    this._openAddPopup();
  }

  _updateHeaderStatus() {
    // Update header status without full re-render (respect scheduler on/off)
    try {
      const enabled = this._isEnabledForDisplay();
      let statusText = enabled ? 'On' : 'Off';
      let needsSecondsTimer = false;
      
      if (enabled) {
        const nextRun = this._getNextRun();
        if (nextRun) {
          statusText = `Next run: ${nextRun}`;
          
          // Run countdown timer whenever we show relative time ("in 2m", "in 45s") so it updates without reload
          if (nextRun.includes('in ')) {
            needsSecondsTimer = true;
          }
        }
      }
      
      const headerStatus = this.shadowRoot.querySelector('.header-status');
      if (headerStatus) {
        headerStatus.textContent = statusText;
      }
      
      // Update header icon enabled/disabled class
      const headerIcon = this.shadowRoot.querySelector('.header-icon');
      if (headerIcon) {
        if (enabled) {
          headerIcon.classList.add('enabled');
          headerIcon.classList.remove('disabled');
        } else {
          headerIcon.classList.add('disabled');
          headerIcon.classList.remove('enabled');
        }
      }
      
      // Manage seconds countdown timer
      if (needsSecondsTimer && !this._secondsTimer) {
        // Start timer to update every second
        this._secondsTimer = setInterval(() => {
          this._updateHeaderStatus();
        }, 1000);
      } else if (!needsSecondsTimer && this._secondsTimer) {
        // Stop timer if we don't need it anymore
        clearInterval(this._secondsTimer);
        this._secondsTimer = null;
      }
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): _updateHeaderStatus failed', err);
    }
  }

  _syncSlotsFromBridgeSensor() {
    // Sync all slots from bridge sensor (for synchronization between multiple cards)
    try {
      const items = this._getItems();
      if (!items || items.length === 0) return;
      
      // Get fresh items from bridge sensor to ensure we have latest state
      const bridgeState = this._getBridgeState();
      const allItems = bridgeState?.attributes?.items || [];
      
      items.forEach(item => {
        if (item && item.id) {
          // Find the item in allItems to get the latest state
          const latestItem = allItems.find(i => i && i.id === item.id);
          if (latestItem) {
            this._updateSlotElement(item.id, latestItem);
          } else {
            // Fallback to item from filtered list
            this._updateSlotElement(item.id, item);
          }
        }
      });
      
      // Also update header status
      this._updateHeaderStatus();
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): _syncSlotsFromBridgeSensor failed', err);
    }
  }
  
  _syncAllCardsForEntity(itemId = null, updatedItem = null, optimisticBridgeState = null) {
    if (!window._homieScheduleCards || !this._hass || this._getEntities().length === 0) return;
    const ourEntities = new Set(this._getEntities());
    
    window._homieScheduleCards.forEach(card => {
      if (card === this) return;
      const cardEntities = new Set(card._getEntities?.() || []);
      const shouldSync = optimisticBridgeState
        ? ourEntities.size > 0 && [...ourEntities].some(e => cardEntities.has(e))
        : (updatedItem && cardEntities.has(updatedItem.entity_id)) || (!updatedItem && [...ourEntities].some(e => cardEntities.has(e)));
      if (!shouldSync || !card._hass) return;
        if (optimisticBridgeState) {
          card._optimisticBridgeState = optimisticBridgeState;
        }
        
        if (itemId && updatedItem && card._updateSlotElement) {
          card._updateSlotElement(itemId, updatedItem);
          card._updateHeaderStatus();
        } else {
          if (card._syncSlotsFromBridgeSensor) {
            card._syncSlotsFromBridgeSensor();
          }
          if (card.render) {
            card.render().catch(() => {});
          }
        }
        
        card.hass = { ...card._hass };
    });
  }

  _updateSlotElement(itemId, updatedItem) {
    // Update only the changed slot element without full re-render
    const slotCard = this.shadowRoot.querySelector(`[data-item-id="${itemId}"]`);
    if (!slotCard) return;

    // Set flag to prevent event handlers from firing during programmatic updates
    slotCard.dataset.updating = 'true';

    // Update slot status text
    const statusEl = slotCard.querySelector('.slot-status');
    if (statusEl) {
      const daysText = WeekdaySelector.formatWeekdays(updatedItem.weekdays);
      
      // Get HVAC mode from service_start for climate entities
      let statusPrefix = updatedItem.enabled ? 'On' : 'Off';
      if (updatedItem.service_start && updatedItem.service_start.value && updatedItem.service_start.value.hvac_mode) {
        const hvacMode = updatedItem.service_start.value.hvac_mode;
        statusPrefix = updatedItem.enabled ? this._formatHvacModeLabel(hvacMode) : 'Off';
      }
      
      const showDuration = updatedItem.service_start?.value?.hvac_mode !== 'off';
      const durationStr = showDuration ? this._formatDuration(updatedItem.duration) : '';
      const slotStatus = `${statusPrefix}, ${daysText} on ${updatedItem.time}${durationStr}`;
      statusEl.textContent = slotStatus;
    }

    // Update time selects
    const [hours, minutes] = updatedItem.time.split(':');
    const minsNum = parseInt(minutes, 10);
    const roundedMinutes = String((Number.isNaN(minsNum) ? 0 : Math.round(minsNum / 5) * 5)).padStart(2, '0');
    const hoursSelect = slotCard.querySelector('[data-slot-form="time-hours"]');
    const minutesSelect = slotCard.querySelector('[data-slot-form="time-minutes"]');
    if (hoursSelect && hoursSelect.value !== hours) {
      hoursSelect.value = hours;
    }
    if (minutesSelect && minutesSelect.value !== roundedMinutes) {
      minutesSelect.value = roundedMinutes;
    }

    // Duration: keep switch and wrapper in sync with item (only update when not focused in duration input)
    const durationWrapper = slotCard.querySelector('[data-slot-form="duration-wrapper"]');
    const durationEnabledSwitch = slotCard.querySelector('[data-slot-form="duration-enabled"]');
    const currentHvacMode = updatedItem.service_start?.value?.hvac_mode;
    const hasDuration = currentHvacMode !== 'off' && updatedItem.duration != null;
    // Avoid unnecessary programmatic updates that can emit change on ha-switch.
    if (durationEnabledSwitch && durationEnabledSwitch.checked !== !!hasDuration) {
      durationEnabledSwitch.checked = !!hasDuration;
    }
    if (durationWrapper) {
      durationWrapper.style.display = hasDuration ? 'block' : 'none';
      if (hasDuration) {
        const durationInput = durationWrapper.querySelector('[data-action="update-duration"]');
        const activeEl = this.shadowRoot && this.shadowRoot.activeElement;
        if (!durationInput || activeEl !== durationInput) {
          DurationSelector.setDurationInSlot(slotCard, updatedItem.duration != null ? (ScheduleHelper && ScheduleHelper.durationMinutesToHours ? ScheduleHelper.durationMinutesToHours(updatedItem.duration) : updatedItem.duration / 60) : null, this._config);
        }
      }
    }

    // Update HVAC mode select - use data-action selector to match template
    const hvacModeSelect = slotCard.querySelector('[data-slot-form="mode"]');
    if (hvacModeSelect) {
      const currentHvacMode = updatedItem.service_start?.value?.hvac_mode;
      if (currentHvacMode && hvacModeSelect.value !== currentHvacMode) {
        hvacModeSelect.value = currentHvacMode;
        hvacModeSelect.dispatchEvent(new Event('input', { bubbles: false }));
      }
    }

    // Update Fan and Temp from service_start (when mode is Off: show — and disabled)
    const currentHvacModeSync = updatedItem.service_start?.value?.hvac_mode;
    const fanSelect = slotCard.querySelector('[data-slot-form="fan"]');
    const tempInput = slotCard.querySelector('[data-slot-form="temp"]');
    if (currentHvacModeSync === 'off') {
      if (tempInput) {
        tempInput.value = '';
        tempInput.placeholder = '—';
        tempInput.disabled = true;
        tempInput.setAttribute('disabled', '');
      }
      if (fanSelect) {
        if (!fanSelect.querySelector('option[value=""]')) {
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = '—';
          fanSelect.insertBefore(opt, fanSelect.firstChild);
        }
        fanSelect.value = '';
        fanSelect.disabled = true;
        fanSelect.setAttribute('disabled', '');
      }
    } else {
      if (tempInput) {
        tempInput.disabled = false;
        tempInput.removeAttribute('disabled');
        if (updatedItem.service_start?.value?.temperature != null) {
          const t = Number(updatedItem.service_start.value.temperature);
          if (!Number.isNaN(t)) tempInput.value = t;
        }
      }
      if (fanSelect) {
        fanSelect.disabled = false;
        fanSelect.removeAttribute('disabled');
        if (updatedItem.service_start?.value?.fan_mode != null && fanSelect.querySelector(`option[value="${updatedItem.service_start.value.fan_mode}"]`)) {
          fanSelect.value = updatedItem.service_start.value.fan_mode;
        }
      }
    }

    // Update weekday selector state
    WeekdaySelector.setSelectedWeekdays(this.shadowRoot, updatedItem.weekdays, slotCard);

    // Do not update slot title input from state here — leave whatever the user typed (including trailing space) so editing is not interrupted by trim

    // Update icon and card classes (scheduler must be on for slot to show as enabled)
    const schedulerOn = this._isSchedulerEnabled();
    const showEnabled = schedulerOn && updatedItem.enabled;
    const iconEl = slotCard.querySelector('.slot-icon');
    if (iconEl) {
      iconEl.className = `slot-icon ${showEnabled ? 'enabled' : 'disabled'}`;
    }
    
    if (showEnabled) {
      slotCard.classList.remove('disabled');
    } else {
      slotCard.classList.add('disabled');
    }

    // Clear update flag after a short delay
    setTimeout(() => {
      delete slotCard.dataset.updating;
    }, 0);
  }

  /** All item IDs in the same slot (same time + weekdays) for our entities. Used so time/duration/weekdays change applies to all entities in the slot. */
  _getSameSlotItemIds(bridgeState, itemId) {
    const allItems = bridgeState?.attributes?.items || [];
    const item = allItems.find(i => i && i.id === itemId);
    if (!item) return [itemId];
    const entitySet = new Set(this._getEntities());
    const sameSlot = allItems.filter(i =>
      i && i.temporary !== true && entitySet.has(i.entity_id) &&
      i.time === item.time && JSON.stringify(i.weekdays || []) === JSON.stringify(item.weekdays || [])
    );
    return sameSlot.map(i => i.id).filter(Boolean);
  }

  /** True if another slot (different items) exists at (newTime) for the same entity with at least one weekday overlapping. */
  _hasSlotConflictForEdit(bridgeState, itemId, newTime, newWeekdays) {
    const allItems = bridgeState?.attributes?.items || [];
    if (!allItems.length) return false;
    const itemIdsInThisSlot = this._getSameSlotItemIds(bridgeState, itemId);
    const entityIdsInThisSlot = new Set(
      allItems.filter(i => i && itemIdsInThisSlot.includes(i.id)).map(i => i.entity_id).filter(Boolean)
    );
    const hasOtherSlot = allItems.some(i =>
      i && !i.temporary && entityIdsInThisSlot.has(i.entity_id) &&
      i.time === newTime && this._weekdaysOverlap(newWeekdays, i.weekdays) &&
      !itemIdsInThisSlot.includes(i.id)
    );
    return hasOtherSlot;
  }

  _showSlotError(itemId, message) {
    const slotCard = this.shadowRoot?.querySelector(`[data-item-id="${itemId}"]`);
    const errEl = slotCard?.querySelector('[data-slot-error]');
    if (errEl) {
      errEl.textContent = message;
      errEl.style.display = '';
    }
  }

  _clearSlotError(itemId) {
    const slotCard = this.shadowRoot?.querySelector(`[data-item-id="${itemId}"]`);
    const errEl = slotCard?.querySelector('[data-slot-error]');
    if (errEl) {
      errEl.textContent = '';
      errEl.style.display = 'none';
    }
  }

  async _updateItem(itemId, updates) {
    const bridgeState = this._getBridgeState();
    const isSlotWideUpdate = bridgeState && (
      updates.time !== undefined ||
      updates.duration !== undefined ||
      updates.weekdays !== undefined ||
      updates.title !== undefined ||
      updates.enabled !== undefined ||
      updates.service_start !== undefined ||
      updates.service_end !== undefined
    );
    // Title-only update: match by display key (so slots with different titles stay separate).
    // Other slot-wide updates (time/weekdays/duration/mode/enabled): match by time+weekdays (all entities in that position).
    const isTitleOnlyUpdate = isSlotWideUpdate && updates.title !== undefined &&
      updates.time === undefined && updates.duration === undefined && updates.weekdays === undefined &&
      updates.enabled === undefined && updates.service_start === undefined && updates.service_end === undefined;
    let itemIdsToUpdate;
    if (!isSlotWideUpdate || !bridgeState) {
      itemIdsToUpdate = [itemId];
    } else if (isTitleOnlyUpdate) {
      itemIdsToUpdate = this._getSameDisplaySlotItemIds(bridgeState, itemId);
    } else {
      itemIdsToUpdate = this._getSameSlotItemIds(bridgeState, itemId);
    }

    // When editing time or weekdays: if another slot already exists at that time for these entities, show error and do not save
    if (bridgeState?.attributes?.items && (updates.time !== undefined || updates.weekdays !== undefined)) {
      const currentItem = bridgeState.attributes.items.find(i => i && i.id === itemId);
      if (currentItem) {
        const newTime = updates.time !== undefined ? updates.time : currentItem.time;
        const newWeekdays = updates.weekdays !== undefined ? updates.weekdays : currentItem.weekdays;
        if (this._hasSlotConflictForEdit(bridgeState, itemId, newTime, newWeekdays)) {
          this._showSlotError(itemId, 'A slot already exists at this time and days for the selected entities.');
          return;
        }
        const oldKey = this._getDisplaySlotKey(currentItem);
        const newKey = this._getDisplaySlotKey({ ...currentItem, time: newTime, weekdays: newWeekdays });
        if (oldKey !== newKey && this._expandedSlots.has(oldKey)) {
          this._expandedSlots.delete(oldKey);
          this._expandedSlots.add(newKey);
        }
      }
    }

    this._clearSlotError(itemId);

    // Optimistically update (using overlay, no hass mutation)
    if (this._hass && this._bridgeSensor && bridgeState?.attributes?.items) {
      const items = [...bridgeState.attributes.items];
      let anyUpdated = false;
      for (const id of itemIdsToUpdate) {
        const itemIndex = items.findIndex(item => item && item.id === id);
        if (itemIndex === -1) continue;
        const currentItem = items[itemIndex];
        const effectiveUpdates = { ...updates };
        // For slot-wide mode updates, bind service payload entity_id to each item's entity.
        if (effectiveUpdates.service_start && effectiveUpdates.service_start.value && currentItem?.entity_id) {
          effectiveUpdates.service_start = {
            ...effectiveUpdates.service_start,
            value: {
              ...effectiveUpdates.service_start.value,
              entity_id: currentItem.entity_id
            }
          };
        }
        if (effectiveUpdates.service_end && effectiveUpdates.service_end.value && currentItem?.entity_id) {
          effectiveUpdates.service_end = {
            ...effectiveUpdates.service_end,
            value: {
              ...effectiveUpdates.service_end.value,
              entity_id: currentItem.entity_id
            }
          };
        }
        const updatedItem = { ...currentItem };
        if (effectiveUpdates.service_start) {
          updatedItem.service_start = effectiveUpdates.service_start;
        }
        if (effectiveUpdates.clear_duration) {
          delete updatedItem.duration;
          delete updatedItem.service_end;
        } else {
          if (effectiveUpdates.service_end !== undefined) {
            if (effectiveUpdates.service_end === null) {
              delete updatedItem.service_end;
            } else {
              updatedItem.service_end = effectiveUpdates.service_end;
            }
          }
        }
        Object.keys(effectiveUpdates).forEach(key => {
          if (key !== 'service_start' && key !== 'service_end' && key !== 'clear_duration') {
            updatedItem[key] = effectiveUpdates[key];
          }
        });
        items[itemIndex] = updatedItem;
        anyUpdated = true;
      }
      if (anyUpdated) {
        this._optimisticBridgeState = {
          ...bridgeState,
          attributes: {
            ...bridgeState.attributes,
            items: items
          }
        };
        // Update all slot cards in the same slot (multi-entity slots have multiple cards)
        const firstUpdated = items.find(i => i && i.id === itemId) || items.find(i => i && itemIdsToUpdate.includes(i.id));
        for (const id of itemIdsToUpdate) {
          const updated = items.find(i => i && i.id === id);
          if (updated) this._updateSlotElement(id, updated);
        }
        this._updateHeaderStatus();
        this.hass = { ...this._hass };
        this._syncAllCardsForEntity(itemId, firstUpdated || bridgeState.attributes.items.find(i => i && i.id === itemId), this._optimisticBridgeState);
      }
    }

    for (const id of itemIdsToUpdate) {
      const current = bridgeState?.attributes?.items?.find(i => i && i.id === id);
      const effectiveUpdates = { ...updates };
      if (effectiveUpdates.service_start && effectiveUpdates.service_start.value && current?.entity_id) {
        effectiveUpdates.service_start = {
          ...effectiveUpdates.service_start,
          value: {
            ...effectiveUpdates.service_start.value,
            entity_id: current.entity_id
          }
        };
      }
      if (effectiveUpdates.service_end && effectiveUpdates.service_end.value && current?.entity_id) {
        effectiveUpdates.service_end = {
          ...effectiveUpdates.service_end,
          value: {
            ...effectiveUpdates.service_end.value,
            entity_id: current.entity_id
          }
        };
      }
      const serviceData = { id, ...effectiveUpdates };
      if (serviceData.duration !== undefined && serviceData.duration !== null && typeof serviceData.duration !== 'number') {
        const d = parseInt(serviceData.duration, 10);
        if (!Number.isNaN(d) && d >= 0) serviceData.duration = d;
      }
      // Integration expects service_end to be a dict when present; omit key when null to avoid schema error
      if (serviceData.service_end === null || serviceData.service_end === undefined) {
        delete serviceData.service_end;
      } else if (typeof serviceData.service_end !== 'object' || serviceData.service_end === null || !('name' in serviceData.service_end) || !('value' in serviceData.service_end)) {
        delete serviceData.service_end;
      }
      await this._callService('update_item', serviceData);
    }
    
    if (this._hass && this._bridgeSensor) {
      try {
        await this._hass.callService('homeassistant', 'update_entity', {
          entity_id: this._bridgeSensor
        });
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): update_entity after _updateItem failed', e);
      }
      
      setTimeout(() => {
        if (this._hass) {
          this._optimisticBridgeState = null;
          this.hass = { ...this._hass };
        }
      }, 100);
      
      setTimeout(() => {
        if (this._hass) {
          this._optimisticBridgeState = null;
          this.hass = { ...this._hass };
          // Skip full re-render if user is typing in a duration input (would steal focus; focus is inside shadow DOM)
          const activeEl = this.shadowRoot && this.shadowRoot.activeElement;
          const isDurationInput = activeEl && activeEl.getAttribute && activeEl.getAttribute('data-action') === 'update-duration';
          if (!isDurationInput) {
            this.render().catch(() => {});
          }
        }
      }, 500);
    }
  }

  _getDuplicatedSlotKeys(filteredItems) {
    const m = new Map();
    for (const it of filteredItems) {
      const sk = this._slotKeyForItem(it);
      m.set(sk, (m.get(sk) || 0) + 1);
    }
    return new Set([...m.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  }

  /** IDs of items in the same *display* slot (same display key). Used for Remove so only the current card's records are deleted. */
  _getSameDisplaySlotItemIds(bridgeState, itemId) {
    const allItems = bridgeState?.attributes?.items || [];
    const item = allItems.find(i => i && i.id === itemId);
    if (!item) return [itemId];
    const entitySet = new Set(this._getEntities());
    const filtered = allItems.filter(i => i && i.temporary !== true && entitySet.has(i.entity_id));
    const dupKeys = this._getDuplicatedSlotKeys(filtered);
    const displayKey = this._getDisplaySlotKey(item, dupKeys);
    const same = filtered.filter(i => this._getDisplaySlotKey(i, dupKeys) === displayKey);
    return same.map(i => i.id).filter(Boolean);
  }

  /** Delete only items in the current (display) slot — same time, weekdays, duration, mode, temp, fan, title. */
  async _deleteSlot(itemId) {
    const bridgeState = this._getBridgeState();
    const itemIdsToDelete = bridgeState ? this._getSameDisplaySlotItemIds(bridgeState, itemId) : [itemId];
    for (const id of itemIdsToDelete) {
      await this._callService('delete_item', { id });
    }
    if (this._hass && this._bridgeSensor) {
      try {
        await this._hass.callService('homeassistant', 'update_entity', {
          entity_id: this._bridgeSensor
        });
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): update_entity after _deleteSlot failed', e);
      }
      setTimeout(() => {
        if (this._hass) {
          try {
            this._hass.callService('homeassistant', 'update_entity', {
              entity_id: this._bridgeSensor
            });
          } catch (e) {
            if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): update_entity (delayed after _deleteSlot) failed', e);
          }
          setTimeout(() => {
            if (this._hass) {
              this._optimisticBridgeState = null;
              this.hass = { ...this._hass };
              this.render().catch(() => {});
              setTimeout(() => this._syncAllCardsForEntity(), 100);
            }
          }, 200);
        }
      }, 500);
    }
  }

  /** Delete a single item (e.g. when user unchecks one entity in the slot). Does not delete the whole slot. */
  async _deleteItem(itemId) {
    await this._callService('delete_item', { id: itemId });
    if (this._hass && this._bridgeSensor) {
      try {
        await this._hass.callService('homeassistant', 'update_entity', {
          entity_id: this._bridgeSensor
        });
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): update_entity after _deleteItem failed', e);
      }
      setTimeout(() => {
        if (this._hass) {
          try {
            this._hass.callService('homeassistant', 'update_entity', {
              entity_id: this._bridgeSensor
            });
          } catch (e) {
            if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): update_entity (delayed after _deleteItem) failed', e);
          }
          setTimeout(() => {
            if (this._hass) {
              this._optimisticBridgeState = null;
              this.hass = { ...this._hass };
              this.render().catch(() => {});
              setTimeout(() => this._syncAllCardsForEntity(), 100);
            }
          }, 200);
        }
      }, 500);
    }
  }

  _toggleWeekday(item, day) {
    const weekdays = [...item.weekdays];
    const index = weekdays.indexOf(day);
    
    if (index > -1) {
      if (weekdays.length > 1) {
        weekdays.splice(index, 1);
      } else {
        return; // Don't allow empty weekdays
      }
    } else {
      weekdays.push(day);
      weekdays.sort((a, b) => a - b);
    }
    
    this._updateItem(item.id, { weekdays });
  }

  async render() {
    try {
      if (!this._config || this._getEntities().length === 0) {
        const errorMsg = this._configError || 'Please configure entity in card settings';
        if (this.shadowRoot) {
          this._showError(errorMsg);
        }
        return;
      }
      
      if (!this._hass) {
        // If no hass yet, show placeholder
        if (this.shadowRoot) {
          const placeholderHtml = `
            <div style="padding: 16px; text-align: center; color: var(--secondary-text-color, #888);">
              <ha-icon icon="mdi:loading" style="font-size: 48px; margin-bottom: 16px; animation: spin 1s linear infinite;"></ha-icon>
              <div style="font-size: 14px;">Loading...</div>
            </div>
            <style>
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            </style>
          `;
          this.shadowRoot.innerHTML = placeholderHtml;
        }
        return;
      }

      const items = this._getItems();
    const enabled = this._isEnabledForDisplay();
    const title = this._config?.title ?? '';
    const headerTitleClass = title ? '' : 'header-title--hidden';
    const enabledClass = enabled ? 'enabled' : 'disabled';
    
    // Build status text
    // Use homie-schedule bridge sensor for next run information
    let statusText = enabled ? 'On' : 'Off';
    if (enabled) {
      const nextRun = this._getNextRun();
      if (nextRun) {
        statusText = `Next run: ${nextRun}`;
      }
    }

    // Load styles and MDI font (for dev/preview only)
    // In production, HA provides ha-icon component with built-in MDI support
    const styleContent = `/**\n * Shared styles for slot-form-fields.html (Add Slot popup + Edit Slot).\n * Uses :host CSS variables from the card (--_accent, --_text, etc.).\n */\n\n.popup-field { margin-bottom: 20px; }\n.popup-field:last-child { margin-bottom: 0; }\n\n/* Shared form (add popup + edit slot) - one structure, same styles */\n.slot-form .slot-form-field { margin-bottom: 20px; }\n.slot-form .slot-form-field:last-child { margin-bottom: 0; }\n.slot-form .slot-form-label {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 14px;\n  font-weight: 500;\n  color: var(--_text);\n  margin-bottom: 8px;\n}\n.slot-form .slot-form-label ha-icon { --mdc-icon-size: 22px; color: var(--_accent); }\n\n/* Mode, Fan, Temp in one row */\n.slot-form-row {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 12px 16px;\n  align-items: flex-end;\n  margin-bottom: 20px;\n}\n.slot-form-row .slot-form-field {\n  flex: 1;\n  min-width: 0;\n  margin-bottom: 0;\n}\n.slot-form-row-mode-fan-temp .slot-form-field-mode,\n.slot-form-row-mode-fan-temp .slot-form-field-fan,\n.slot-form-row-mode-fan-temp .slot-form-field-temp {\n  flex: 1 1 0;\n  min-width: 0;\n}\n/* stretch selects and inputs to full column width */\n.slot-form-row-mode-fan-temp .slot-form-field select,\n.slot-form-row-mode-fan-temp .slot-form-field input[type="number"] {\n  width: 100%;\n  box-sizing: border-box;\n  display: block;\n}\n\n.slot-form-field-mode .slot-form-mode-select { width: 100%; box-sizing: border-box; }\n.slot-form-mode-warning {\n  margin-top: 8px;\n  font-size: 12px;\n  color: var(--_error-color);\n  line-height: 1.4;\n}\n.slot-form-mode-warning:empty { display: none; }\n\n.slot-form-entities-wrap { position: relative; }\n.slot-form-entities-trigger {\n  margin-top: 8px;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-height: 40px;\n  padding: 6px 12px;\n  border-radius: var(--_radius-medium);\n  border: 1px solid var(--_divider);\n  background: var(--_bg-select);\n  cursor: pointer;\n  transition: border-color 0.2s, box-shadow 0.2s;\n}\n.slot-form-entities-trigger:hover,\n.slot-form-entities-trigger.open {\n  border-color: var(--_accent);\n  box-shadow: var(--_focus-ring);\n}\n.slot-form-entities-chips {\n  flex: 1;\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  align-items: center;\n  min-height: 24px;\n}\n.popup-entity-chip {\n  display: inline-flex;\n  align-items: center;\n  padding: 2px 8px;\n  border-radius: var(--_radius-small);\n  background: var(--_secondary-bg);\n  border: 1px solid var(--_divider);\n  font-size: 12px;\n  color: var(--_text);\n  white-space: nowrap;\n}\n.slot-form-entities-caret {\n  --mdc-icon-size: 20px;\n  color: var(--_text-secondary);\n  flex-shrink: 0;\n  transition: transform 0.2s;\n}\n.slot-form-entities-trigger.open .slot-form-entities-caret {\n  transform: rotate(180deg);\n}\n.slot-form-entities-dropdown {\n  display: none;\n  position: absolute;\n  left: 0;\n  right: 0;\n  top: 100%;\n  margin-top: 4px;\n  z-index: 10;\n  flex-direction: column;\n  border-radius: var(--_radius-medium);\n  border: 1px solid var(--_divider);\n  background: var(--_popup-bg);\n  box-shadow: var(--_popup-box-shadow);\n  max-height: 220px;\n  overflow: hidden;\n}\n.slot-form-entities-dropdown.open {\n  display: flex;\n}\n.slot-form-entities-select-all-row {\n  border-bottom: 1px solid var(--_divider);\n  flex-shrink: 0;\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 10px 16px;\n  cursor: pointer;\n  min-height: 44px;\n  box-sizing: border-box;\n}\n.slot-form-entity-row:hover {\n  background: var(--_secondary-bg);\n}\n.entities-selector-row.entities-selector-row-unsupported {\n  opacity: 0.5;\n  pointer-events: none;\n}\n.entities-selector-row.entities-selector-row-unsupported .entities-selector-entity-name::after {\n  content: ' (not supported for this mode)';\n  font-size: 11px;\n  color: var(--_text-secondary);\n  font-weight: 400;\n}\n.slot-form-entities-dropdown .entities-selector-list {\n  overflow-y: auto;\n  overflow-x: hidden;\n  display: flex;\n  flex-direction: column;\n  flex: 1;\n  min-height: 0;\n}\n.slot-form-entities-dropdown .entities-selector-row {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  padding: 10px 16px;\n  cursor: pointer;\n  border-bottom: 1px solid var(--_divider);\n  transition: background 0.2s;\n  min-height: 44px;\n  box-sizing: border-box;\n}\n.popup-entities-dropdown .entities-selector-row:last-child {\n  border-bottom: none;\n}\n.popup-entities-dropdown .entities-selector-row:hover {\n  background: var(--_secondary-bg);\n}\n.popup-entities-dropdown .entities-selector-row.hidden {\n  display: none;\n}\n.popup-entities-dropdown .entities-selector-row-unsupported {\n  opacity: 0.5;\n  pointer-events: none;\n}\n.popup-entities-dropdown .entities-selector-row-unsupported .entities-selector-entity-name::after {\n  content: ' (not supported for this mode)';\n  font-size: 11px;\n  color: var(--_text-secondary);\n  font-weight: 400;\n}\n.popup-entity-row input[type="checkbox"] {\n  width: 18px;\n  height: 18px;\n  margin: 0;\n  cursor: pointer;\n  accent-color: var(--_accent);\n  flex-shrink: 0;\n}\n.popup-entity-row ha-icon {\n  --mdc-icon-size: 22px;\n  color: var(--_text-secondary);\n  flex-shrink: 0;\n}\n.popup-entity-name {\n  flex: 1;\n  font-size: 14px;\n  font-weight: 500;\n  color: var(--_text);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.popup-entities-list label {\n  cursor: pointer;\n}\n.popup-field label {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin-bottom: 8px;\n  font-size: 14px;\n  font-weight: 500;\n  color: var(--_text);\n}\n.popup-field label ha-icon { --mdc-icon-size: 24px; color: var(--_accent); }\n\n/* HA-style row: label left, control (e.g. ha-switch) right */\n.popup-field-row {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 8px 0;\n  gap: 16px;\n  cursor: pointer;\n}\n.popup-field-row-label {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 14px;\n  font-weight: 500;\n  color: var(--_text);\n  cursor: pointer;\n  margin: 0;\n  flex: 1;\n}\n.popup-field-row-label ha-icon {\n  --mdc-icon-size: 24px;\n  color: var(--_accent);\n}\n.popup-duration-row ha-switch,\n.slot-form-duration-enabled {\n  flex-shrink: 0;\n}\n.slot-form-duration-row {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 8px 0;\n  gap: 16px;\n  cursor: pointer;\n}\n.slot-form-field-row-label {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 14px;\n  font-weight: 500;\n  color: var(--_text);\n  cursor: pointer;\n  margin: 0;\n  flex: 1;\n}\n.slot-form-field-row-label ha-icon {\n  --mdc-icon-size: 24px;\n  color: var(--_accent);\n}\n/* Slot edit: same vertical layout as add (label on new line, then control) */\n.slot-expandable .slot-form .slot-form-field {\n  display: block;\n  font-size: 14px;\n}\n.slot-expandable .slot-form-title-input {\n  width: 100%;\n  box-sizing: border-box;\n}\n\n/**\n * Climate Scheduler Card - Styles\n * All variables in :host; common/slot/popup/duration use them (overridable via --homie-slots-*).\n */\n\n:host {\n  display: block;\n  padding: 0;\n  overflow: visible;\n  background: transparent;\n  --circular-button-size: var(--mdc-icon-button-size, 40px);\n\n  /* Card (header, slot card) */\n  --_accent: var(--homie-slots-accent, var(--primary-color, #03a9f4));\n  --_bg: var(--homie-slots-bg, var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9))));\n  --_radius: var(--homie-slots-radius, var(--ha-card-border-radius, 8px));\n  --_shadow: var(--homie-slots-shadow, var(--ha-card-box-shadow, 0 2px 8px rgba(0, 0, 0, 0.1)));\n  --_text: var(--homie-slots-text, var(--primary-text-color, #212121));\n  --_text-secondary: var(--homie-slots-text-secondary, var(--secondary-text-color, #757575));\n  --_text-on-accent: var(--homie-slots-text-on-accent, var(--text-primary-on-background, #ffffff));\n  --_disabled-color: var(--homie-slots-disabled, var(--disabled-color, var(--disabled-text-color, #9e9e9e)));\n\n  /* Select */\n  --_bg-select: var(--homie-slots-bg-select, var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9))));\n  --_divider-select: var(--homie-slots-divider-select, var(--divider-color, rgba(0, 0, 0, 0.12)));\n  --_text-select: var(--homie-slots-text-select, var(--primary-text-color, #212121));\n  --_radius-select: var(--homie-slots-radius-select, var(--mdc-shape-small, 4px));\n  --_focus-ring: var(--homie-slots-focus-ring, 0 0 0 2px rgba(3, 169, 244, 0.1));\n\n  /* Input, buttons, slot, weekday, duration */\n  --_padding-input-vertical: var(--homie-slots-padding-input-vertical, var(--mdc-shape-small, 4px));\n  --_padding-input-horizontal: var(--homie-slots-padding-input-horizontal, var(--mdc-shape-small, 8px));\n  --_border-input: var(--homie-slots-border-input, 1px solid var(--_divider));\n  --_radius-input: var(--homie-slots-radius-input, var(--_radius-small));\n  --_divider: var(--homie-slots-divider, var(--divider-color, rgba(0, 0, 0, 0.12)));\n  --_radius-small: var(--homie-slots-radius-small, var(--mdc-shape-small, 4px));\n  --_radius-medium: var(--homie-slots-radius-medium, var(--mdc-shape-medium, 8px));\n  --_secondary-bg: var(--homie-slots-secondary-bg, var(--secondary-background-color, #f5f5f5));\n  --_error-color: var(--homie-slots-error-color, var(--error-color, #f44336));\n\n  /* Button outline */\n  --_button-outline-padding: var(--homie-slots-button-outline-padding, var(--mdc-button-horizontal-padding, 16px));\n  --_button-outline-margin-top: var(--homie-slots-button-outline-margin-top, var(--mdc-layout-grid-gutter, 12px));\n  --_button-outline-radius: var(--homie-slots-button-outline-radius, var(--_radius-medium));\n  --_button-outline-bg: var(--homie-slots-button-outline-bg, transparent);\n  --_button-outline-border: var(--homie-slots-button-outline-border, 2px solid var(--_accent));\n  --_button-outline-color: var(--homie-slots-button-outline-color, var(--_accent));\n  --_button-outline-font-size: var(--homie-slots-button-outline-font-size, var(--mdc-typography-button-font-size, 14px));\n  --_button-outline-font-weight: var(--homie-slots-button-outline-font-weight, var(--mdc-typography-button-font-weight, 900));\n  --_button-outline-letter-spacing: var(--homie-slots-button-outline-letter-spacing, var(--mdc-typography-button-letter-spacing, 0em));\n  --_button-outline-min-height: var(--homie-slots-button-outline-min-height, var(--mdc-button-height, 36px));\n  --_button-outline-hover-shadow: var(--homie-slots-button-outline-hover-shadow, 0 2px 8px rgba(3, 169, 244, 0.3));\n  --_button-outline-active-transform: var(--homie-slots-button-outline-active-transform, scale(0.98));\n  --_button-outline-active-shadow: var(--homie-slots-button-outline-active-shadow, 0 1px 4px rgba(3, 169, 244, 0.2));\n\n  /* Popup */\n  --_popup-bg: var(--homie-slots-popup-background, var(--ha-dialog-background, var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9)))));\n  --_popup-color: var(--homie-slots-popup-color, var(--primary-text-color, #212121));\n  --_popup-backdrop-filter: var(--homie-slots-popup-backdrop-filter, var(--ha-card-backdrop-filter, none));\n  --_popup-box-shadow: var(--homie-slots-popup-box-shadow, var(--ha-card-box-shadow, none));\n  --_popup-border-radius: var(--homie-slots-popup-border-radius, var(--ha-card-border-radius, 16px));\n  --_popup-width: var(--mdc-dialog-width, 90%);\n  --_popup-max-width: var(--mdc-dialog-max-width, 400px);\n  --_popup-min-width: var(--mdc-dialog-min-width, 0px);\n  --_popup-max-height: var(--mdc-dialog-max-height, 90vh);\n\n  color: var(--_text);\n}\n\n/* === Common / slot / popup / duration (use :host vars above) === */\n.homie-select {\n  background: var(--_bg-select);\n  border: 1px solid var(--_divider-select);\n  border-radius: var(--_radius-select);\n  color: var(--_text-select);\n  font-size: 14px;\n  font-family: inherit;\n  cursor: pointer;\n  appearance: none;\n  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23999999' d='M6 9L1 4h10z'/%3E%3C/svg%3E");\n  background-repeat: no-repeat;\n  background-position: right var(--mdc-shape-small, 6px) center;\n  background-size: 12px;\n  transition: border-color 0.2s, box-shadow 0.2s;\n  padding: var(--_padding-input-vertical) var(--_padding-input-horizontal);\n  padding-right: calc(var(--_padding-input-horizontal) * 2 + 12px);\n}\n@media (prefers-color-scheme: dark) {\n  .homie-select {\n    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E");\n  }\n}\n.homie-select:focus {\n  outline: none;\n  border-color: var(--_accent);\n  box-shadow: var(--_focus-ring);\n}\n.homie-select option {\n  background: var(--_bg-select);\n  color: var(--_text-select);\n}\n.homie-input {\n  width: 100%;\n  background: var(--_bg);\n  border: var(--_border-input);\n  border-radius: var(--_radius-input);\n  color: var(--_text);\n  font-size: 14px;\n  font-family: inherit;\n  padding: var(--_padding-input-vertical) var(--_padding-input-horizontal);\n  transition: border-color 0.2s, box-shadow 0.2s;\n  box-sizing: border-box;\n}\n.homie-input:focus {\n  outline: none;\n  border-color: var(--_accent);\n  box-shadow: var(--_focus-ring);\n}\n.homie-input::placeholder {\n  color: var(--_text-secondary);\n  opacity: 0.7;\n}\n.button-outline {\n  width: 100%;\n  padding: var(--_button-outline-padding) var(--_button-outline-padding);\n  margin-top: var(--_button-outline-margin-top);\n  border-radius: var(--_button-outline-radius);\n  background: var(--_button-outline-bg);\n  border: var(--_button-outline-border);\n  color: var(--_button-outline-color);\n  font-size: var(--_button-outline-font-size);\n  font-weight: var(--_button-outline-font-weight);\n  letter-spacing: var(--_button-outline-letter-spacing);\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: all 0.2s;\n  -webkit-tap-highlight-color: transparent;\n  min-height: var(--_button-outline-min-height);\n}\n.button-outline:hover {\n  background: var(--_accent);\n  color: var(--_text-on-accent);\n  box-shadow: var(--_button-outline-hover-shadow);\n}\n.button-outline:active {\n  transform: var(--_button-outline-active-transform);\n  box-shadow: var(--_button-outline-active-shadow);\n}\n.slot-expandable {\n  max-height: 0;\n  overflow: hidden;\n  transition: max-height 0.3s ease-out;\n}\n.slot-card.expanded .slot-expandable {\n  max-height: 75vh;\n  overflow-y: auto;\n  overflow-x: visible;\n  transition: max-height 0.3s ease-in;\n  padding: var(--ha-card-header-padding, 16px) 0;\n  display: flex;\n  flex-direction: column;\n  gap: var(--mdc-layout-grid-gutter, 12px);\n}\n.slot-details {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 16px);\n  margin-bottom: var(--mdc-layout-grid-gutter, 12px);\n  flex-wrap: wrap;\n}\n.slot-time, .slot-duration {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 6px);\n  font-size: 14px;\n}\n.slot-time ha-icon, .slot-duration ha-icon {\n  --mdc-icon-size: 22px;\n  opacity: 0.9;\n}\n.slot-time .time-picker-separator {\n  color: var(--_text);\n}\n.slot-delete {\n  width: 100%;\n  padding: var(--mdc-shape-small, 10px);\n  margin-top: var(--mdc-layout-grid-gutter, 12px);\n  border-radius: var(--_radius-medium);\n  background: var(--_secondary-bg);\n  border: 1px solid var(--_divider);\n  color: var(--_error-color);\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: var(--mdc-layout-grid-gutter, 8px);\n  transition: all 0.2s;\n  font-size: 14px;\n  font-weight: 500;\n  font-family: inherit;\n  flex-shrink: 0;\n}\n.slot-delete:active { transform: scale(0.98); }\n.slot-delete ha-icon { --mdc-icon-size: 22px; }\n.empty-state {\n  text-align: center;\n  padding: 48px 16px;\n  color: var(--_text-secondary);\n}\n.empty-state ha-icon { --mdc-icon-size: 48px; opacity: 0.3; margin-bottom: 16px; }\n.empty-text { font-size: 14px; line-height: 20px; }\n.popup-overlay {\n  position: fixed;\n  top: 0; left: 0; right: 0; bottom: 0;\n  background: rgba(0, 0, 0, 0.5);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  z-index: 1000;\n  animation: fadeIn 0.2s;\n}\n@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }\n.popup-header {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 12px);\n  padding: var(--ha-card-header-padding, 20px);\n  border-bottom: 1px solid var(--_divider);\n}\n.popup-header ha-icon { --mdc-icon-size: 28px; color: var(--_accent); }\n.popup-title { flex: 1; font-size: 18px; font-weight: 500; color: var(--_text); }\n.popup-close {\n  width: var(--circular-button-size, var(--mdc-icon-button-size, 40px));\n  height: var(--circular-button-size, var(--mdc-icon-button-size, 40px));\n  min-width: var(--circular-button-size, var(--mdc-icon-button-size, 40px));\n  min-height: var(--circular-button-size, var(--mdc-icon-button-size, 40px));\n  border-radius: 50%;\n  background: transparent;\n  border: none;\n  color: var(--_text-secondary);\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: all 0.2s;\n}\n.popup-close ha-icon { --mdc-icon-size: 24px; }\n.popup-body { padding: var(--ha-card-header-padding, 20px); }\n.popup-error {\n  color: var(--error-color, #b00020);\n  font-size: 13px;\n  margin-bottom: 12px;\n  display: block;\n}\n.slot-error-message {\n  color: var(--error-color, #b00020);\n  font-size: 13px;\n  margin-bottom: 8px;\n}\n/* Shared form styles moved to shared/climate/slot-form-fields/slot-form-fields.css (inlined at build time) */\n\n.popup-footer {\n  display: flex;\n  gap: var(--mdc-layout-grid-gutter, 12px);\n  padding: var(--ha-card-header-padding, 20px);\n  border-top: 1px solid var(--_divider);\n}\n.popup-button {\n  flex: 1;\n  padding: var(--mdc-shape-small, 12px) var(--mdc-shape-medium, 24px);\n  border: none;\n  border-radius: var(--_radius-medium);\n  font-size: 14px;\n  font-weight: 500;\n  cursor: pointer;\n  transition: all 0.2s;\n  font-family: inherit;\n}\n.popup-button.cancel { background: var(--_secondary-bg); color: var(--_text); }\n.popup-button.save { background: var(--_accent); color: var(--_text-on-accent); }\n.popup-button:active { transform: scale(0.98); }\n.time-selects { display: flex; align-items: center; gap: 8px; width: 100%; }\n.popup-time-hours, .popup-time-minutes { flex: 1; }\n.time-separator { font-size: 18px; font-weight: 500; color: var(--_text-secondary); user-select: none; }\n.slot-time .time-selects { display: flex; align-items: center; gap: 6px; width: auto; }\n.slot-time .time-separator { font-size: 14px; color: var(--_text); }\n.weekday-mode-selector { display: flex; gap: 8px; margin-bottom: 12px; }\n.weekday-mode-btn {\n  flex: 1;\n  padding: var(--mdc-shape-small, 10px);\n  border: 2px solid var(--_divider);\n  border-radius: var(--_radius-medium);\n  background: var(--_secondary-bg);\n  color: var(--_text-secondary);\n  text-align: center;\n  font-size: 13px;\n  font-weight: 500;\n  cursor: pointer;\n  transition: all 0.2s;\n  user-select: none;\n  font-family: inherit;\n}\n.weekday-mode-btn.active, .weekday-mode-btn:hover {\n  background: var(--_accent);\n  border-color: var(--_accent);\n  color: var(--_text-on-accent);\n}\n.weekday-mode-btn:hover { opacity: 0.8; }\n.popup-weekdays { display: flex; gap: 8px; flex-wrap: wrap; }\n.popup-weekdays.hidden { display: none; }\n.popup-weekday {\n  flex: 1;\n  min-width: 40px;\n  padding: var(--mdc-shape-small, 10px);\n  border: 2px solid var(--_divider);\n  border-radius: var(--_radius-medium);\n  background: var(--_secondary-bg);\n  color: var(--_text-secondary);\n  text-align: center;\n  font-size: 13px;\n  font-weight: 500;\n  cursor: pointer;\n  transition: all 0.2s;\n  user-select: none;\n}\n.popup-weekday.active {\n  background: var(--_accent);\n  border-color: var(--_accent);\n  color: var(--_text-on-accent);\n}\n@media (max-width: 480px) {\n  .popup-weekday { min-width: 35px; padding: 8px; font-size: 12px; }\n}\n.duration-selector-wrapper {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 12px);\n  width: 100%;\n}\n.duration-slider {\n  flex: 1;\n  height: 4px;\n  border-radius: 2px;\n  background: var(--_divider);\n  outline: none;\n  -webkit-appearance: none;\n  appearance: none;\n}\n.duration-slider::-webkit-slider-thumb {\n  -webkit-appearance: none;\n  appearance: none;\n  width: 20px;\n  height: 20px;\n  border-radius: 50%;\n  background: var(--_accent);\n  cursor: pointer;\n  border: 2px solid var(--_bg);\n  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);\n  transition: all 0.2s;\n}\n.duration-slider::-webkit-slider-thumb:hover {\n  transform: scale(1.1);\n  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);\n}\n.duration-slider::-moz-range-thumb {\n  width: 20px;\n  height: 20px;\n  border-radius: 50%;\n  background: var(--_accent);\n  cursor: pointer;\n  border: 2px solid var(--_bg);\n  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);\n  transition: all 0.2s;\n}\n.duration-slider::-moz-range-thumb:hover {\n  transform: scale(1.1);\n  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);\n}\n.duration-input {\n  width: 80px;\n  min-width: 80px;\n  text-align: center;\n}\n\n/* ========================================\n   MAIN HEADER\n   ======================================== */\n\n.main-header {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  padding: var(--ha-card-header-padding, 16px);\n  background: var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9)));\n  border-radius: var(--ha-card-border-radius, var(--mdc-shape-medium, 8px));\n  box-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0, 0, 0, 0.1));\n  backdrop-filter: var(--ha-card-backdrop-filter, blur(10px));\n}\n\n.main-header:not(:last-child) {\n  margin-bottom: var(--mdc-layout-grid-gutter, 12px);\n}\n\n.header-left {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  flex: 1;\n}\n\n.header-icon {\n  width: var(--circular-button-size);\n  height: var(--circular-button-size);\n  min-width: var(--circular-button-size);\n  min-height: var(--circular-button-size);\n  border-radius: 50%;\n  background: var(--primary-color, #03a9f4);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  color: var(--text-primary-on-background, #ffffff);\n  cursor: pointer;\n  transition: all 0.2s;\n  -webkit-tap-highlight-color: transparent;\n}\n\n.header-icon:active {\n  transform: scale(0.95);\n}\n\n.header-icon.disabled {\n  opacity: 0.5;\n  background: var(--disabled-color, var(--disabled-text-color));\n}\n\n.header-icon.enabled {\n  background: var(--primary-color, #03a9f4);\n  opacity: 1;\n}\n\n.header-icon ha-icon {\n  --mdc-icon-size: 28px;\n}\n\n.header-text {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n\n.header-title {\n  font-size: 18px;\n  font-weight: 500;\n  color: var(--primary-text-color, #212121);\n  line-height: 24px;\n}\n\n.header-title--hidden {\n  display: none;\n}\n\n.header-status {\n  font-size: 14px;\n  color: var(--secondary-text-color, #757575);\n  line-height: 20px;\n}\n\n.add-button {\n  width: var(--circular-button-size);\n  height: var(--circular-button-size);\n  min-width: var(--circular-button-size);\n  min-height: var(--circular-button-size);\n  border-radius: 50%;\n  background: var(--primary-color, #03a9f4);\n  border: none;\n  color: var(--text-primary-on-background, #ffffff);\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: all 0.2s;\n  -webkit-tap-highlight-color: transparent;\n}\n\n.add-button:active {\n  transform: scale(0.95);\n}\n\n.add-button ha-icon {\n  --mdc-icon-size: 28px;\n}\n\n/* ========================================\n   ADD SLOT BUTTON\n   ======================================== */\n\n/* Button outline style moved to shared/assets/homie-css.css */\n\n/* ========================================\n   SLOTS CONTAINER\n   ======================================== */\n\n.slots-container {\n  display: flex;\n  flex-direction: column;\n  gap: var(--mdc-layout-grid-gutter, 12px);\n}\n\n.slots-container--empty {\n  display: none;\n}\n\n/* ========================================\n   SLOT CARD (Blue Card Design)\n   ======================================== */\n\n.slot-card {\n  background: var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9)));\n  border-radius: var(--ha-card-border-radius, var(--mdc-shape-medium, 8px));\n  padding: var(--ha-card-header-padding, 16px) var(--ha-card-header-padding, 16px) 0 var(--ha-card-header-padding, 16px);\n  color: var(--primary-text-color, #212121);\n  position: relative;\n  box-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0, 0, 0, 0.1));\n  transition: transform 0.2s, box-shadow 0.2s, background 0.2s;\n  backdrop-filter: var(--ha-card-backdrop-filter, blur(10px));\n}\n\n/* Active slot (enabled) - same background as header */\n.slot-card:not(.disabled) {\n  background: var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9)));\n}\n\n.slot-card.disabled {\n  opacity: 0.6;\n  background: var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.5)));\n}\n\n.slot-header {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 12px);\n  margin-bottom: 0;\n}\n\n.slot-icon {\n  width: var(--circular-button-size);\n  height: var(--circular-button-size);\n  min-width: var(--circular-button-size);\n  min-height: var(--circular-button-size);\n  border-radius: 50%;\n  background: var(--primary-color, #03a9f4);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  cursor: pointer;\n  transition: all 0.2s;\n  -webkit-tap-highlight-color: transparent;\n  color: var(--text-primary-on-background, #ffffff);\n}\n\n.slot-icon:active {\n  transform: scale(0.95);\n}\n\n.slot-icon.enabled {\n  background: var(--primary-color, #03a9f4);\n  opacity: 1;\n}\n\n.slot-icon.disabled {\n  background: var(--disabled-color, var(--disabled-text-color, #9e9e9e));\n  opacity: 0.6;\n}\n\n.slot-icon ha-icon {\n  --mdc-icon-size: 24px;\n}\n\n.slot-info {\n  flex: 1;\n}\n\n.slot-name {\n  font-size: 16px;\n  font-weight: 500;\n  margin-bottom: 4px;\n}\n\n.slot-status {\n  font-size: 14px;\n  color: var(--secondary-text-color, #757575);\n}\n\n.slot-expand {\n  width: 100%;\n  padding: 8px 0;\n  margin-top: var(--mdc-layout-grid-gutter, 12px);\n  border-radius: 0;\n  background: transparent;\n  border: none;\n  border-top: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));\n  color: var(--primary-text-color, #212121);\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: all 0.2s;\n  -webkit-tap-highlight-color: transparent;\n}\n\n.slot-expand ha-icon {\n  --mdc-icon-size: 20px;\n  transition: transform 0.2s;\n}\n\n.slot-card.expanded .slot-expand ha-icon {\n  transform: rotate(180deg);\n}\n\n/* Slot expandable, slot-details styles moved to shared/assets/homie-css.css */\n\n.slot-title {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 6px);\n  font-size: 14px;\n  width: 100%;\n  flex-basis: 100%;\n  margin-bottom: var(--mdc-layout-grid-gutter, 8px);\n}\n.slot-title ha-icon {\n  --mdc-icon-size: 22px;\n  opacity: 0.9;\n}\n.slot-title .slot-title-input {\n  flex: 1;\n  min-width: 0;\n  box-sizing: border-box;\n}\n\n.slot-time,\n.slot-duration,\n.slot-hvac-mode {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 6px);\n  font-size: 14px;\n}\n\n.slot-time ha-icon,\n.slot-duration ha-icon,\n.slot-hvac-mode ha-icon {\n  --mdc-icon-size: 22px;\n  opacity: 0.9;\n}\n\n.slot-entities-wrap {\n  margin-top: 12px;\n  padding-top: 12px;\n  border-top: 1px solid var(--_divider);\n  position: relative;\n}\n.slot-entities-label {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 14px;\n  font-weight: 500;\n  color: var(--_text);\n  margin-bottom: 8px;\n}\n.slot-entities-label ha-icon {\n  --mdc-icon-size: 22px;\n  color: var(--_accent);\n}\n/* Slot entities dropdown (same UX as popup) */\n.slot-entities-trigger {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-height: 40px;\n  padding: 6px 12px;\n  border-radius: var(--_radius-medium);\n  border: 1px solid var(--_divider);\n  background: var(--_bg-select);\n  cursor: pointer;\n  transition: border-color 0.2s, box-shadow 0.2s;\n}\n.slot-entities-trigger:hover,\n.slot-entities-trigger.open {\n  border-color: var(--_accent);\n  box-shadow: var(--_focus-ring);\n}\n.slot-entities-chips {\n  flex: 1;\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  align-items: center;\n  min-height: 24px;\n}\n.slot-entities-chips .popup-entity-chip {\n  display: inline-flex;\n  align-items: center;\n  padding: 2px 8px;\n  border-radius: var(--_radius-small);\n  background: var(--_secondary-bg);\n  border: 1px solid var(--_divider);\n  font-size: 12px;\n  color: var(--_text);\n  white-space: nowrap;\n}\n.slot-entities-caret {\n  --mdc-icon-size: 20px;\n  color: var(--_text-secondary);\n  flex-shrink: 0;\n  transition: transform 0.2s;\n}\n.slot-entities-trigger.open .slot-entities-caret {\n  transform: rotate(180deg);\n}\n.slot-entities-dropdown {\n  display: none;\n  position: absolute;\n  left: 0;\n  right: 0;\n  top: 100%;\n  margin-top: 4px;\n  z-index: 10;\n  flex-direction: column;\n  border-radius: var(--_radius-medium);\n  border: 1px solid var(--_divider);\n  background: var(--_popup-bg);\n  box-shadow: var(--_popup-box-shadow);\n  max-height: 220px;\n  overflow: hidden;\n}\n.slot-entities-wrap .slot-entities-dropdown.open {\n  display: flex;\n}\n.slot-entity-select-all {\n  border-bottom: 1px solid var(--_divider);\n  flex-shrink: 0;\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 10px 16px;\n  cursor: pointer;\n  min-height: 44px;\n  box-sizing: border-box;\n}\n.slot-entity-select-all input {\n  width: 18px;\n  height: 18px;\n  margin: 0;\n  accent-color: var(--_accent);\n  flex-shrink: 0;\n}\n.slot-entities-list {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n.slot-entity-row {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 8px 0;\n  cursor: pointer;\n  font-size: 14px;\n}\n.slot-entity-row input[type="checkbox"] {\n  width: 18px;\n  height: 18px;\n  margin: 0;\n  accent-color: var(--_accent);\n  flex-shrink: 0;\n}\n.slot-entity-row ha-icon {\n  --mdc-icon-size: 20px;\n  color: var(--_text-secondary);\n  flex-shrink: 0;\n}\n.slot-entity-name {\n  flex: 1;\n  color: var(--_text);\n}\n/* Shared entities-selector inside slot */\n.slot-entities-wrap .entities-selector-list {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n.slot-entities-wrap .entities-selector-row {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 8px 0;\n  cursor: pointer;\n  font-size: 14px;\n}\n.slot-entities-wrap .entities-selector-row input[type="checkbox"] {\n  width: 18px;\n  height: 18px;\n  margin: 0;\n  accent-color: var(--_accent);\n  flex-shrink: 0;\n}\n.slot-entities-wrap .entities-selector-row ha-icon {\n  --mdc-icon-size: 20px;\n  color: var(--_text-secondary);\n  flex-shrink: 0;\n}\n.slot-entities-wrap .entities-selector-entity-name {\n  flex: 1;\n  color: var(--_text);\n}\n.slot-entities-wrap .slot-entities-dropdown .entities-selector-list {\n  overflow-y: auto;\n  overflow-x: hidden;\n  flex: 1;\n  min-height: 0;\n}\n.slot-entities-wrap .slot-entities-dropdown .entities-selector-row {\n  padding: 10px 16px;\n  border-bottom: 1px solid var(--_divider);\n  gap: 12px;\n}\n.slot-entities-wrap .slot-entities-dropdown .entities-selector-row:last-child {\n  border-bottom: none;\n}\n.slot-entities-wrap .slot-entities-dropdown .entities-selector-row:hover {\n  background: var(--_secondary-bg);\n}\n.slot-entities-wrap .entities-selector-row-unsupported {\n  opacity: 0.5;\n  pointer-events: none;\n}\n.slot-entities-wrap .entities-selector-row-unsupported .entities-selector-entity-name::after {\n  content: ' (not supported for this mode)';\n  font-size: 11px;\n  color: var(--_text-secondary);\n  font-weight: 400;\n}\n.slot-hvac-mode select {\n  flex: 1;\n  min-width: 0;\n  box-sizing: border-box;\n}\n\n/* Time picker styles are now in shared/homie-select/homie-select.css */\n\n.slot-time .time-picker-separator {\n  color: var(--primary-text-color, #212121);\n}\n\n/* Select styles are now in shared/homie-select.css */\n\n.slot-weekdays-wrapper {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 6px);\n}\n\n.slot-weekdays-icon {\n  --mdc-icon-size: 22px;\n  opacity: 0.9;\n  flex-shrink: 0;\n}\n\n.slot-weekdays {\n  display: flex;\n  gap: var(--mdc-layout-grid-gutter, 6px);\n  flex-wrap: wrap;\n  flex: 1;\n  justify-content: flex-start;\n}\n\n.slot-weekday {\n  padding: var(--mdc-shape-small, 6px) var(--mdc-shape-small, 8px);\n  border-radius: var(--ha-card-border-radius, var(--mdc-shape-small, 4px));\n  background: var(--secondary-background-color, #f5f5f5);\n  border: 2px solid var(--divider-color, rgba(0, 0, 0, 0.12));\n  color: var(--primary-text-color, #212121);\n  font-size: 12px;\n  font-weight: 400;\n  cursor: pointer;\n  transition: all 0.2s;\n  user-select: none;\n  flex-shrink: 0;\n  min-width: fit-content;\n  flex: 1;\n  text-align: center;\n  min-width: 0;\n}\n\n.slot-weekday.active {\n  background: var(--primary-color, #03a9f4);\n  color: var(--text-primary-on-background, #ffffff);\n  font-weight: 600;\n  border-color: var(--primary-color, #03a9f4);\n}\n\n/* Slot delete, empty state styles moved to shared/assets/homie-css.css */\n\n/* Popup overlay, popup-header, popup-body, popup-field styles moved to shared/assets/homie-css.css */\n\n/* Popup content (defaults, override via --homie-slots-popup-*) */\n.popup-content {\n  background: var(--_popup-bg);\n  color: var(--_popup-color);\n  -webkit-backdrop-filter: var(--_popup-backdrop-filter);\n  backdrop-filter: var(--_popup-backdrop-filter);\n  box-shadow: var(--_popup-box-shadow);\n  border-radius: var(--_popup-border-radius);\n  width: var(--_popup-width);\n  max-width: var(--_popup-max-width);\n  min-width: var(--_popup-min-width);\n  max-height: var(--_popup-max-height);\n  overflow-y: auto;\n  animation: slideUp 0.3s;\n}\n\n@keyframes slideUp {\n  from {\n    transform: translateY(20px);\n    opacity: 0;\n  }\n  to {\n    transform: translateY(0);\n    opacity: 1;\n  }\n}\n\n/* Popup select styles are now in shared/homie-select.css */\n\n/* Slot time selects */\n.slot-time .time-selects {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  width: auto;\n}\n\n/* Slot time select styles are now in shared/homie-select.css */\n\n.slot-time .time-separator {\n  font-size: 14px;\n  color: var(--primary-text-color, #212121);\n}\n\n/* Time selects, weekday selector, popup footer/button styles moved to shared/assets/homie-css.css */\n\n/* ========================================\n   RESPONSIVE\n   ======================================== */\n\n@media (max-width: 480px) {\n  .main-header {\n    padding: var(--mdc-shape-small, 12px);\n  }\n  \n  .header-title {\n    font-size: 16px;\n  }\n  \n  .slot-card {\n    padding: var(--mdc-shape-small, 12px);\n  }\n  \n  :host {\n    --_popup-width: var(--mdc-dialog-width, 95%);\n    --_popup-max-height: var(--mdc-dialog-max-height, 85vh);\n  }\n}\n\n/* ========================================\n   DARK THEME SUPPORT\n   ======================================== */\n\n/* Dark theme adjustments are handled by HA CSS variables */\n/* No additional dark theme styles needed */\n`;
    const mdiFontLink = `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@mdi/font@latest/css/materialdesignicons.min.css">`;

    // Prepare template data
    const itemsContentPromises = items.map(item => this._renderItem(item));
    const itemsContent = await Promise.all(itemsContentPromises);
    const itemsContentHtml = itemsContent.join('');
    
    // Load HTML template
    const template = await this._loadTemplate();
    if (!template) {
      this._showError('Failed to load card template. Please refresh the page.');
      return;
    }
    
    // Get HVAC modes for popup (include 'off' so user can schedule turn-off)
    let hvacModesOptions = '';
    if (this._config && this._config.entity && this._hass) {
      const entityState = this._hass.states[this._config.entity];
      if (entityState && entityState.attributes && entityState.attributes.hvac_modes) {
        const hvacModes = [...entityState.attributes.hvac_modes];
        hvacModesOptions = hvacModes.map(mode => 
          `<option value="${mode}">${this._formatHvacModeLabel(mode)}</option>`
        ).join('');
      }
    }
    if (!hvacModesOptions) {
      // Fallback if entity not found or no modes available
      hvacModesOptions = '<option value="off">Off</option><option value="cool">Cool</option>';
    }
    
    const { minDuration, maxDuration } = this._getDurationConfig();
    const defaultDurationHours = 1;
    let processedTemplate = template
      .replace(/\{\{DURATION_LABEL\}\}/g, 'Duration (hours)')
      .replace(/\{\{DURATION_MIN\}\}/g, minDuration)
      .replace(/\{\{DURATION_MAX\}\}/g, maxDuration)
      .replace(/\{\{DURATION_VALUE\}\}/g, defaultDurationHours)
      .replace(/\{\{ITEM_ID\}\}/g, ''); // Empty for popup
    
    const entities = this._getEntities();
    const entityDisplayName = entities.length > 1
      ? (this._config?.title || `${entities.length} entities`)
      : (this._hass?.states?.[entities[0]]?.attributes?.friendly_name || entities[0] || 'entity');
    
    // Replace placeholders (icon is now fixed in template)
    const htmlContent = processedTemplate
      .replace(/\{\{TITLE\}\}/g, title)
      .replace(/\{\{HEADER_TITLE_CLASS\}\}/g, headerTitleClass)
      .replace(/\{\{STATUS_TEXT\}\}/g, statusText)
      .replace(/\{\{ENABLED_CLASS\}\}/g, enabledClass)
      .replace(/\{\{SLOTS_CONTAINER_CLASS\}\}/g, items.length === 0 ? ' slots-container--empty' : '')
      .replace(/\{\{ITEMS_CONTENT\}\}/g, itemsContentHtml)
      .replace(/\{\{HVAC_MODES_OPTIONS\}\}/g, hvacModesOptions)
      .replace(/\{\{ENTITY_NAME\}\}/g, entityDisplayName);

    // Load MDI font only in dev mode (when running from file:// or localhost)
    // In production (HA), ha-icon component handles icons automatically
    const isDevMode = window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const fontLink = isDevMode ? mdiFontLink : '';
    
      this.shadowRoot.innerHTML = `${fontLink}<style>${styleContent}</style>${htmlContent}`;

      // Attach event listeners
      this._attachEventListeners();
    } catch (err) {
      // Never throw from render - it breaks the editor
      if (this.shadowRoot) {
        this._showError('Error rendering card. Please check configuration.');
      }
    }
  }

  async _renderItem(item) {
    const slotEnabled = this._isSchedulerEnabled();
    const slotNumber = this._getItems().indexOf(item) + 1;
    
    // Load slot template
    const template = await this._loadSlotTemplate();
    if (!template) {
      // Return empty string to prevent breaking the entire card
      return '';
    }
    
    const entities = this._getEntities();
    const bridgeState = this._getBridgeState();
    const allItems = bridgeState?.attributes?.items || [];
    const entitySet = new Set(entities);
    const filtered = allItems.filter(i => i && i.temporary !== true && entitySet.has(i.entity_id));
    const dupKeys = this._getDuplicatedSlotKeys(filtered);
    const displayKey = this._getDisplaySlotKey(item, dupKeys);
    const sameSlotItems = entities.length > 1 ? filtered.filter(i => this._getDisplaySlotKey(i, dupKeys) === displayKey) : [];
    let entityLabel = '';
    if (entities.length > 1) {
      const names = sameSlotItems.map(i => this._hass?.states?.[i.entity_id]?.attributes?.friendly_name || i.entity_id);
      entityLabel = names.length > 0 ? names.join(', ') : (this._hass?.states?.[item.entity_id]?.attributes?.friendly_name || item.entity_id);
    }
    const slotTitle = item.title || '';
    const baseName = slotTitle || `Slot ${slotNumber}`;
    const slotName = baseName + (entityLabel ? ` (${entityLabel})` : '');
    
    // Format slot status
    const daysText = WeekdaySelector.formatWeekdays(item.weekdays);
    
    // Get HVAC mode from service_start for climate entities
    let statusPrefix = item.enabled ? 'On' : 'Off';
    let currentHvacMode = null;
    if (item.service_start && item.service_start.value && item.service_start.value.hvac_mode) {
      currentHvacMode = item.service_start.value.hvac_mode;
      statusPrefix = item.enabled ? this._formatHvacModeLabel(currentHvacMode) : 'Off';
    }
    
    const entityForMode = item.entity_id || this._config?.entity;
    let hvacModeOptions = '';
    if (this._config && entityForMode && this._hass) {
      const entityState = this._hass.states[entityForMode];
      if (entityState && entityState.attributes && entityState.attributes.hvac_modes) {
        let hvacModes = [...entityState.attributes.hvac_modes]; // include 'off' to allow schedule turn-off
        if (currentHvacMode && !hvacModes.includes(currentHvacMode)) {
          hvacModes = [currentHvacMode, ...hvacModes];
        }
        hvacModeOptions = hvacModes.map(mode => {
          const selected = currentHvacMode === mode ? 'selected' : '';
          const label = this._formatHvacModeLabel(mode);
          return `<option value="${mode}" ${selected}>${label}</option>`;
        }).join('');
      }
    }
    if (!hvacModeOptions) {
      // Fallback if entity not found or no modes available
      const offSelected = currentHvacMode === 'off' ? 'selected' : '';
      const coolSelected = currentHvacMode === 'cool' ? 'selected' : '';
      hvacModeOptions = `<option value="off" ${offSelected}>Off</option><option value="cool" ${coolSelected}>Cool</option>`;
    }

    // Fan options from entity fan_modes
    let fanOptions = '<option value="">—</option>';
    const currentFanMode = item.service_start?.value?.fan_mode ?? '';
    if (entityForMode && this._hass) {
      const entityState = this._hass.states[entityForMode];
      const fanModes = entityState?.attributes?.fan_modes;
      if (Array.isArray(fanModes) && fanModes.length) {
        fanOptions = fanModes.map(fm => {
          const sel = currentFanMode === fm ? 'selected' : '';
          const label = (fm || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          return `<option value="${fm}" ${sel}>${label}</option>`;
        }).join('');
        if (currentFanMode && !fanModes.includes(currentFanMode)) {
          fanOptions = `<option value="${currentFanMode}" selected>${currentFanMode}</option>` + fanOptions;
        }
      }
    }

    // Temp min/max/value from entity
    let tempMin = 5, tempMax = 35, tempValue = 21;
    if (entityForMode && this._hass) {
      const entityState = this._hass.states[entityForMode];
      const attrs = entityState?.attributes || {};
      if (attrs.min_temp != null) tempMin = attrs.min_temp;
      if (attrs.max_temp != null) tempMax = attrs.max_temp;
      const savedTemp = item.service_start?.value?.temperature;
      if (savedTemp != null && savedTemp !== '') {
        tempValue = Number(savedTemp);
        if (Number.isNaN(tempValue)) tempValue = attrs.temperature ?? 21;
      } else if (attrs.temperature != null) {
        tempValue = attrs.temperature;
      }
      tempValue = Math.max(tempMin, Math.min(tempMax, tempValue));
    }
    
    const showDuration = currentHvacMode !== 'off';
    const durationStr = showDuration ? this._formatDuration(item.duration) : '';
    const slotStatus = `${statusPrefix}, ${daysText} on ${item.time}${durationStr}`;

    if (currentHvacMode === 'off') {
      tempValue = '';
      fanOptions = '<option value="">—</option>';
    }
    
    // Prepare time placeholders
    const [hours, minutes] = item.time.split(':');
    const minsVal = parseInt(minutes, 10); const roundedMinutes = String((Number.isNaN(minsVal) ? 0 : Math.round(minsVal / 5) * 5)).padStart(2, '0');
    const timeHoursPlaceholders = {};
    const timeMinutesPlaceholders = {};
    for (let i = 0; i < 24; i++) {
      const hourStr = String(i).padStart(2, '0');
      timeHoursPlaceholders[`TIME_HOURS_${hourStr}`] = hourStr === hours ? 'selected' : '';
    }
    for (let i = 0; i < 60; i += 5) {
      const minuteStr = String(i).padStart(2, '0');
      timeMinutesPlaceholders[`TIME_MINUTES_${minuteStr}`] = minuteStr === roundedMinutes ? 'selected' : '';
    }

    const { minDuration, maxDuration } = this._getDurationConfig();
    const durationValueHours = item.duration != null ? (ScheduleHelper && ScheduleHelper.durationMinutesToHours ? ScheduleHelper.durationMinutesToHours(item.duration) : item.duration / 60) : '';
    
    // Replace placeholders
    let result = template
      .replace(/\{\{ITEM_ID\}\}/g, item.id)
      .replace(/\{\{SLOT_NUMBER\}\}/g, slotNumber)
      .replace(/\{\{SLOT_NAME\}\}/g, slotName)
      .replace(/\{\{SLOT_NAME_REMOVE\}\}/g, baseName)
      .replace(/\{\{SLOT_TITLE\}\}/g, slotTitle)
      .replace(/\{\{DISABLED_CLASS\}\}/g, (slotEnabled && item.enabled) ? '' : 'disabled')
      .replace(/\{\{ICON_CLASS\}\}/g, (slotEnabled && item.enabled) ? 'enabled' : 'disabled')
      .replace(/\{\{SLOT_STATUS\}\}/g, slotStatus)
      .replace(/\{\{ITEM_TIME\}\}/g, item.time)
      .replace(/\{\{DURATION_LABEL\}\}/g, 'Duration (hours)')
      .replace(/\{\{DURATION_MIN\}\}/g, minDuration)
      .replace(/\{\{DURATION_MAX\}\}/g, maxDuration)
      .replace(/\{\{DURATION_VALUE\}\}/g, durationValueHours)
      .replace(/\{\{HVAC_MODE_OPTIONS\}\}/g, hvacModeOptions)
      .replace(/\{\{FAN_OPTIONS\}\}/g, fanOptions)
      .replace(/\{\{TEMP_MIN\}\}/g, tempMin)
      .replace(/\{\{TEMP_MAX\}\}/g, tempMax)
      .replace(/\{\{TEMP_VALUE\}\}/g, tempValue);
    
    // Replace time hour placeholders
    for (let i = 0; i < 24; i++) {
      const hourStr = String(i).padStart(2, '0');
      result = result.replace(new RegExp(`\\{\\{TIME_HOURS_${hourStr}\\}\\}`, 'g'), timeHoursPlaceholders[`TIME_HOURS_${hourStr}`]);
    }
    
    // Replace time minute placeholders
    for (let i = 0; i < 60; i += 5) {
      const minuteStr = String(i).padStart(2, '0');
      result = result.replace(new RegExp(`\\{\\{TIME_MINUTES_${minuteStr}\\}\\}`, 'g'), timeMinutesPlaceholders[`TIME_MINUTES_${minuteStr}`]);
    }
    
    // Create a temporary DOM element to set weekday selector state and verify HVAC mode select
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = result;
    const slotCard = tempDiv.querySelector(`[data-item-id="${item.id}"]`);
    if (slotCard) {
      WeekdaySelector.setSelectedWeekdays(tempDiv, item.weekdays, slotCard);
      
      // Hide duration when mode is 'off' or duration not set
      const durationEl = slotCard.querySelector('[data-slot-form="duration-wrapper"]');
      if (durationEl) {
        if (showDuration && item.duration) {
          durationEl.style.display = '';
        } else {
          durationEl.style.display = 'none';
        }
      }
      
      // Verify and set HVAC mode select value explicitly
      const hvacModeSelect = slotCard.querySelector('[data-slot-form="mode"]');
      if (hvacModeSelect && currentHvacMode) {
        hvacModeSelect.value = currentHvacMode;
      }
      const fanSelect = slotCard.querySelector('[data-slot-form="fan"]');
      if (fanSelect && currentFanMode !== undefined) {
        const opt = Array.from(fanSelect.querySelectorAll('option')).find(o => o.value === currentFanMode);
        if (opt) fanSelect.value = opt.value;
      }
      const tempInput = slotCard.querySelector('[data-slot-form="temp"]');
      if (tempInput) {
        tempInput.value = tempValue;
        if (currentHvacMode === 'off') {
          tempInput.placeholder = '—';
          tempInput.disabled = true;
          tempInput.setAttribute('disabled', '');
        }
      }
      if (currentHvacMode === 'off') {
        const fanSelectOff = slotCard.querySelector('[data-slot-form="fan"]');
        if (fanSelectOff) {
          fanSelectOff.value = '';
          fanSelectOff.disabled = true;
          fanSelectOff.setAttribute('disabled', '');
        }
      }
      
      result = tempDiv.innerHTML;
    }
    
    return result;
  }

  _attachEventListeners() {
    // Toggle enabled - click on header icon
    const toggleButton = this.shadowRoot.querySelector('[data-action="toggle-enabled"]');
    if (toggleButton) {
      toggleButton.addEventListener('click', () => this._toggleEnabled());
      toggleButton.style.cursor = 'pointer';
    }

    // Add button - open popup
    const addButton = this.shadowRoot.querySelector('[data-action="open-add-popup"]');
    if (addButton) {
      addButton.addEventListener('click', () => this._openAddPopup());
    }

    // Popup close buttons
    this.shadowRoot.querySelectorAll('[data-action="close-popup"]').forEach(btn => {
      btn.addEventListener('click', () => this._closeAddPopup());
    });

    // Popup overlay click to close
    const popupOverlay = this.shadowRoot.getElementById('add-popup');
    if (popupOverlay) {
      popupOverlay.addEventListener('click', (e) => {
        if (e.target === popupOverlay) {
          this._closeAddPopup();
    }
      });
    }

    // Popup save button
    const saveButton = this.shadowRoot.querySelector('[data-action="save-slot"]');
    if (saveButton) {
      saveButton.addEventListener('click', () => this._saveSlot());
    }

    // Popup weekday selection - scope to add form only so Custom opens in popup, not in a slot
    const addRoot = this._getAddFormRoot();
    if (addRoot) WeekdaySelector.attachEventListeners(addRoot);
    
    // Popup duration selection - attach listeners only when wrapper is visible
    // (will be attached when checkbox is checked)
    
    // Duration enabled (ha-switch) - show/hide duration selector (addRoot already from weekday block above)
    const durationEnabledCheckbox = addRoot?.querySelector('[data-slot-form="duration-enabled"]');
    const durationWrapper = addRoot?.querySelector('[data-slot-form="duration-wrapper"]');
    const durationRow = addRoot?.querySelector('.slot-form-duration-row');
    if (durationEnabledCheckbox && durationWrapper) {
      const syncDurationWrapper = () => {
        if (durationEnabledCheckbox.checked) {
          durationWrapper.style.display = 'block';
          const durationInput = durationWrapper.querySelector('[data-action="update-duration"]');
          const durationSlider = durationWrapper.querySelector('[data-action="update-duration-slider"]');
          const { minDuration, maxDuration, durationStep } = this._getDurationConfig();
          if (durationInput) {
            durationInput.min = minDuration;
            durationInput.max = maxDuration;
            durationInput.step = String(durationStep);
          }
          if (durationSlider) {
            durationSlider.setAttribute('min', String(minDuration));
            durationSlider.setAttribute('max', String(maxDuration));
            durationSlider.setAttribute('step', String(durationStep));
          }
          DurationSelector.setSelectedDuration(durationWrapper, minDuration, this._config);
          DurationSelector.attachEventListeners(durationWrapper, this._config);
        } else {
          durationWrapper.style.display = 'none';
          DurationSelector.reset(durationWrapper, null);
        }
      };
      durationEnabledCheckbox.addEventListener('change', () => syncDurationWrapper());
      if (durationRow) {
        durationRow.addEventListener('click', (e) => {
          if (e.target.closest('ha-switch')) return;
          e.preventDefault();
          durationEnabledCheckbox.checked = !durationEnabledCheckbox.checked;
          durationEnabledCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }
    }

    const hvacModeSelect = addRoot?.querySelector('[data-slot-form="mode"]');
    if (hvacModeSelect) {
      const syncPopupModeDependent = () => {
        this._updateHvacModeWarning();
        this._syncPopupDurationVisibility();
        this._updateAddPopupFanAndTemp();
      };
      hvacModeSelect.addEventListener('change', syncPopupModeDependent);
      hvacModeSelect.addEventListener('input', syncPopupModeDependent);
    }
    this._syncPopupDurationVisibility();
    
    // Ensure Everyday is active in popup after attaching listeners (reset only popup form, not slots)
    const popup = this.shadowRoot.getElementById('add-popup');
    if (popup && popup.style.display !== 'none' && addRoot) {
      requestAnimationFrame(() => {
        WeekdaySelector.reset(addRoot);
      });
    }

    // Item actions
    const _bridgeState = this._getBridgeState();
    const _allItems = _bridgeState?.attributes?.items || [];
    const _entitySet = new Set(this._getEntities());
    const _filtered = _allItems.filter(i => i && i.temporary !== true && _entitySet.has(i.entity_id));
    const _dupKeys = this._getDuplicatedSlotKeys(_filtered);
    this.shadowRoot.querySelectorAll('.slot-card').forEach(itemEl => {
      const itemId = itemEl.dataset.itemId;
      const items = this._getItems();
      const item = items.find(i => i.id === itemId);
      if (!item) return;

      // Toggle item enabled (via icon) - save immediately
      const itemIcon = itemEl.querySelector('.slot-icon[data-action="toggle-item"]');
      if (itemIcon) {
        itemIcon.addEventListener('click', () => {
          const currentItems = this._getItems();
          const currentItem = currentItems.find(i => i.id === itemId);
          if (currentItem) this._updateItem(itemId, { enabled: !currentItem.enabled });
        });
      }

      const slotKey = this._getDisplaySlotKey(item, _dupKeys);

      // Toggle expand/collapse
      const expandBtn = itemEl.querySelector('[data-action="toggle-expand"]');
      if (expandBtn) {
        expandBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isExpanded = itemEl.classList.contains('expanded');
          if (isExpanded) {
            itemEl.classList.remove('expanded');
            this._expandedSlots.delete(slotKey);
          } else {
            itemEl.classList.add('expanded');
            this._expandedSlots.add(slotKey);
          }
          const icon = expandBtn.querySelector('ha-icon');
          if (icon) {
            icon.setAttribute('icon', itemEl.classList.contains('expanded') ? 'mdi:chevron-up' : 'mdi:chevron-down');
          }
        });
      }

      // Restore expanded state if this slot was expanded before (by display key)
      if (this._expandedSlots.has(slotKey)) {
        itemEl.classList.add('expanded');
        const icon = expandBtn?.querySelector('ha-icon');
        if (icon) {
          icon.setAttribute('icon', 'mdi:chevron-up');
        }
      }

      // Prevent clicks inside expandable from closing it
      const expandable = itemEl.querySelector('.slot-expandable');
      if (expandable) {
        expandable.addEventListener('click', (e) => {
          e.stopPropagation();
        });
      }

      // Delete item
      const deleteBtn = itemEl.querySelector('[data-action="delete-item"]');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._deleteSlot(itemId);
        });
      }

      // Slot title input - save on blur
      const titleInput = itemEl.querySelector('[data-slot-form="title"]');
      if (titleInput) {
        const saveTitle = () => {
          if (itemEl.dataset.updating === 'true') return;
          const newTitle = titleInput.value.trim() || null;
          this._updateItem(itemId, { title: newTitle });
        };
        titleInput.addEventListener('blur', saveTitle);
        titleInput.addEventListener('click', (e) => e.stopPropagation());
      }

      // Time selects - save on change (blur equivalent for select)
      const hoursSelect = itemEl.querySelector('[data-slot-form="time-hours"]');
      const minutesSelect = itemEl.querySelector('[data-slot-form="time-minutes"]');
      if (hoursSelect) {
        const newHoursSelect = hoursSelect.cloneNode(true);
        hoursSelect.parentNode.replaceChild(newHoursSelect, hoursSelect);
        newHoursSelect.addEventListener('change', () => {
          if (itemEl.dataset.updating === 'true') return;
          const currentItems = this._getItems();
          const currentItem = currentItems.find(i => i.id === itemId);
          if (!currentItem) return;
          const [, oldMinutes] = currentItem.time.split(':');
          const newTime = `${newHoursSelect.value}:${oldMinutes}`;
          this._updateItem(itemId, { time: newTime });
        });
        newHoursSelect.addEventListener('click', (e) => e.stopPropagation());
        const [hours] = item.time.split(':');
        newHoursSelect.value = hours;
      }
      if (minutesSelect) {
        const newMinutesSelect = minutesSelect.cloneNode(true);
        minutesSelect.parentNode.replaceChild(newMinutesSelect, minutesSelect);
        newMinutesSelect.addEventListener('change', () => {
          if (itemEl.dataset.updating === 'true') return;
          const currentItems = this._getItems();
          const currentItem = currentItems.find(i => i.id === itemId);
          if (!currentItem) return;
          const [oldHours] = currentItem.time.split(':');
          const newTime = `${oldHours}:${newMinutesSelect.value}`;
          this._updateItem(itemId, { time: newTime });
        });
        newMinutesSelect.addEventListener('click', (e) => e.stopPropagation());
        const [, minutes] = item.time.split(':');
        const minsVal = parseInt(minutes, 10); const roundedMinutes = String((Number.isNaN(minsVal) ? 0 : Math.round(minsVal / 5) * 5)).padStart(2, '0');
        newMinutesSelect.value = roundedMinutes;
      }

      // Duration - save on blur (DurationSelector calls callback on blur). Only touched when user changes it or mode=off.
      const durationWrapper = itemEl.querySelector('[data-slot-form="duration-wrapper"]');
      const durationEnabledSwitch = itemEl.querySelector('[data-slot-form="duration-enabled"]');
      const durationRow = itemEl.querySelector('.slot-form-duration-row');
      const slotHvacMode = item.service_start?.value?.hvac_mode;
      const hasDuration = slotHvacMode !== 'off' && item.duration != null;
      if (durationEnabledSwitch) durationEnabledSwitch.checked = !!hasDuration;
      if (durationWrapper) {
        durationWrapper.style.display = hasDuration ? 'block' : 'none';
        if (hasDuration) {
          DurationSelector.setDurationInSlot(itemEl, item.duration != null ? (ScheduleHelper && ScheduleHelper.durationMinutesToHours ? ScheduleHelper.durationMinutesToHours(item.duration) : item.duration / 60) : null, this._config);
          DurationSelector.attachEventListenersInSlot(itemEl, (durationHours) => {
            if (itemEl.dataset.updating === 'true') return;
            const modeSelect = itemEl.querySelector('[data-slot-form="mode"]');
            if (modeSelect?.value === 'off') return;
            const currentItems = this._getItems();
            const currentItem = currentItems.find(i => i.id === itemId);
            const hvacMode = modeSelect?.value || 'heat';
            const durationMins = (ScheduleHelper && ScheduleHelper.durationHoursToMinutes) ? ScheduleHelper.durationHoursToMinutes(durationHours) : (durationHours != null ? Math.round(Number(durationHours) * 60) : null);
            const serviceEnd = durationMins ? ScheduleHelper.createClimateServices(currentItem?.entity_id || this._config?.entity, hvacMode).service_end : null;
            this._updateItem(itemId, { duration: durationMins, service_end: serviceEnd });
          }, this._config);
        }
      }
      if (durationEnabledSwitch && durationWrapper) {
        const syncSlotDurationUI = () => {
          const checked = !!durationEnabledSwitch.checked;
          if (checked) {
            durationWrapper.style.display = 'block';
            const { minDuration } = this._getDurationConfig();
            const currentItems = this._getItems();
            const currentItem = currentItems.find(i => i.id === itemId);
            const keepDuration = currentItem?.service_start?.value?.hvac_mode !== 'off' && currentItem?.duration != null;
            const durationValHours = keepDuration ? (ScheduleHelper && ScheduleHelper.durationMinutesToHours ? ScheduleHelper.durationMinutesToHours(currentItem.duration) : currentItem.duration / 60) : minDuration;
            DurationSelector.setSelectedDuration(durationWrapper, durationValHours);
            DurationSelector.attachEventListenersInSlot(itemEl, (durationHours) => {
              if (itemEl.dataset.updating === 'true') return;
              const modeSelect = itemEl.querySelector('[data-slot-form="mode"]');
              if (modeSelect?.value === 'off') return;
              const hvacMode = modeSelect?.value || 'heat';
              const durationMins = (ScheduleHelper && ScheduleHelper.durationHoursToMinutes) ? ScheduleHelper.durationHoursToMinutes(durationHours) : (durationHours != null ? Math.round(Number(durationHours) * 60) : null);
              const serviceEnd = durationMins ? ScheduleHelper.createClimateServices(currentItem?.entity_id || this._config?.entity, hvacMode).service_end : null;
              this._updateItem(itemId, { duration: durationMins, service_end: serviceEnd });
            }, this._config);
            const hvacMode = currentItem?.service_start?.value?.hvac_mode || 'heat';
            const serviceEnd = ScheduleHelper.createClimateServices(currentItem?.entity_id || this._config?.entity, hvacMode).service_end;
            const durationMinsVal = (ScheduleHelper && ScheduleHelper.durationHoursToMinutes) ? ScheduleHelper.durationHoursToMinutes(durationValHours) : (durationValHours != null ? Math.round(Number(durationValHours) * 60) : null);
            this._updateItem(itemId, { duration: durationMinsVal, service_end: serviceEnd });
          } else {
            durationWrapper.style.display = 'none';
            DurationSelector.reset(itemEl, null);
            this._updateItem(itemId, { clear_duration: true });
          }
        };
        durationEnabledSwitch.addEventListener('change', () => syncSlotDurationUI());
        durationEnabledSwitch.addEventListener('click', (e) => e.stopPropagation());
        if (durationRow) {
          durationRow.addEventListener('click', (e) => {
            const path = e.composedPath && e.composedPath();
            if (path && path.some(el => el && el.tagName && el.tagName.toLowerCase() === 'ha-switch')) return;
            e.stopPropagation();
            e.preventDefault();
            durationEnabledSwitch.checked = !durationEnabledSwitch.checked;
            syncSlotDurationUI();
          });
        }
      }

      // Build service_start from slot form (mode, fan, temp)
      const getServiceStartFromSlotForm = () => {
        const currentItems = this._getItems();
        const currentItem = currentItems.find(i => i.id === itemId);
        if (!currentItem) return null;
        const modeSelect = itemEl.querySelector('[data-slot-form="mode"]');
        const fanSelect = itemEl.querySelector('[data-slot-form="fan"]');
        const tempInput = itemEl.querySelector('[data-slot-form="temp"]');
        const hvacMode = modeSelect?.value || currentItem.service_start?.value?.hvac_mode || 'heat';
        const value = { entity_id: currentItem.entity_id, hvac_mode: hvacMode };
        if (fanSelect?.value) value.fan_mode = fanSelect.value;
        if (tempInput && tempInput.value !== '' && !Number.isNaN(Number(tempInput.value))) {
          value.temperature = parseFloat(tempInput.value);
        }
        return { name: 'climate.set_hvac_mode', value };
      };

      // HVAC mode - save on change. When off: clear duration. When heat/cool: keep duration, never reset it.
      const hvacModeSelect = itemEl.querySelector('[data-slot-form="mode"]');
      if (hvacModeSelect) {
        const hvacModeHandler = (e) => {
          if (itemEl.dataset.updating === 'true') return;
          e.stopPropagation();
          const newHvacMode = e.target.value;
          const currentItems = this._getItems();
          const currentItem = currentItems.find(i => i.id === itemId);
          if (!currentItem) return;
          const durationWrapper = itemEl.querySelector('[data-slot-form="duration-wrapper"]');
          const durationEnabledSwitch = itemEl.querySelector('[data-slot-form="duration-enabled"]');
          if (newHvacMode === 'off') {
            if (durationEnabledSwitch) durationEnabledSwitch.checked = false;
            if (durationWrapper) {
              durationWrapper.style.display = 'none';
              DurationSelector.reset(itemEl, null);
            }
            const tempInputSlot = itemEl.querySelector('[data-slot-form="temp"]');
            const fanSelectSlot = itemEl.querySelector('[data-slot-form="fan"]');
            if (tempInputSlot) {
              tempInputSlot.value = '';
              tempInputSlot.placeholder = '—';
              tempInputSlot.disabled = true;
              tempInputSlot.setAttribute('disabled', '');
            }
            if (fanSelectSlot) {
              if (!fanSelectSlot.querySelector('option[value=""]')) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = '—';
                fanSelectSlot.insertBefore(opt, fanSelectSlot.firstChild);
              }
              fanSelectSlot.value = '';
              fanSelectSlot.disabled = true;
              fanSelectSlot.setAttribute('disabled', '');
            }
            const serviceStart = { name: 'climate.set_hvac_mode', value: { entity_id: currentItem.entity_id, hvac_mode: 'off' } };
            this._updateItem(itemId, { service_start: serviceStart, clear_duration: true });
          } else {
            if (durationEnabledSwitch) durationEnabledSwitch.checked = true;
            const tempInputSlot = itemEl.querySelector('[data-slot-form="temp"]');
            const fanSelectSlot = itemEl.querySelector('[data-slot-form="fan"]');
            if (tempInputSlot) { tempInputSlot.disabled = false; tempInputSlot.removeAttribute('disabled'); }
            if (fanSelectSlot) { fanSelectSlot.disabled = false; fanSelectSlot.removeAttribute('disabled'); }
            if (durationWrapper) {
              durationWrapper.style.display = 'block';
              const { minDuration } = this._getDurationConfig();
              const hadDuration = currentItem.service_start?.value?.hvac_mode !== 'off' && currentItem.duration != null;
              DurationSelector.setDurationInSlot(itemEl, hadDuration ? (ScheduleHelper && ScheduleHelper.durationMinutesToHours ? ScheduleHelper.durationMinutesToHours(currentItem.duration) : currentItem.duration / 60) : minDuration, this._config);
              DurationSelector.attachEventListenersInSlot(itemEl, (durationHours) => {
                if (itemEl.dataset.updating === 'true') return;
                const durationMins = (ScheduleHelper && ScheduleHelper.durationHoursToMinutes) ? ScheduleHelper.durationHoursToMinutes(durationHours) : (durationHours != null ? Math.round(Number(durationHours) * 60) : null);
                this._updateItem(itemId, { duration: durationMins });
              }, this._config);
            }
            const serviceStart = getServiceStartFromSlotForm();
            if (serviceStart) {
              const updates = { service_start: serviceStart };
              if (currentItem.duration != null) {
                updates.service_end = ScheduleHelper.createClimateServices(currentItem.entity_id, newHvacMode).service_end;
              }
              this._updateItem(itemId, updates);
            }
          }
          const wrap = itemEl.querySelector('[data-slot-form="entities-wrap"]');
          if (wrap) this._updateSlotEntitiesForMode(wrap, itemEl);
        };
        const newHvacModeSelect = hvacModeSelect.cloneNode(true);
        hvacModeSelect.parentNode.replaceChild(newHvacModeSelect, hvacModeSelect);
        newHvacModeSelect.addEventListener('change', hvacModeHandler);
        newHvacModeSelect.addEventListener('click', (e) => e.stopPropagation());
      }

      // Fan - save on change
      const fanSelect = itemEl.querySelector('[data-slot-form="fan"]');
      if (fanSelect) {
        const newFanSelect = fanSelect.cloneNode(true);
        fanSelect.parentNode.replaceChild(newFanSelect, fanSelect);
        newFanSelect.addEventListener('change', () => {
          if (itemEl.dataset.updating === 'true') return;
          const serviceStart = getServiceStartFromSlotForm();
          if (serviceStart) this._updateItem(itemId, { service_start: serviceStart });
        });
        newFanSelect.addEventListener('click', (e) => e.stopPropagation());
      }

      // Temp - save on blur
      const tempInput = itemEl.querySelector('[data-slot-form="temp"]');
      if (tempInput) {
        const saveTemp = () => {
          if (itemEl.dataset.updating === 'true') return;
          const serviceStart = getServiceStartFromSlotForm();
          if (serviceStart) this._updateItem(itemId, { service_start: serviceStart });
        };
        tempInput.addEventListener('change', saveTemp);
        tempInput.addEventListener('blur', saveTemp);
        tempInput.addEventListener('click', (e) => e.stopPropagation());
      }

      const slotEntitiesWrap = itemEl.querySelector('[data-slot-form="entities-wrap"]');
      if (slotEntitiesWrap) {
        const entities = this._getEntities();
        slotEntitiesWrap.style.display = '';
        if (window.EntitiesSelector && window.EntitiesSelector.attachEntitiesList && entities.length >= 1) {
          const bridgeState = this._getBridgeState();
          const allItems = bridgeState?.attributes?.items || [];
          const entitySet = new Set(entities);
          const filteredForSlot = allItems.filter(i => i && i.temporary !== true && entitySet.has(i.entity_id));
          const dupKeysSlot = this._getDuplicatedSlotKeys(filteredForSlot);
          const displayKeyForSlot = this._getDisplaySlotKey(item, dupKeysSlot);
          const sameSlotItems = filteredForSlot.filter(i => this._getDisplaySlotKey(i, dupKeysSlot) === displayKeyForSlot);
          const entityIdsToItemIds = {};
          sameSlotItems.forEach(i => { entityIdsToItemIds[i.entity_id] = i.id; });
          slotEntitiesWrap.dataset.slotEntityIds = JSON.stringify(entityIdsToItemIds);
          const slotHvacSelect = itemEl.querySelector('[data-slot-form="mode"]');
          const isEntityDisabled = (entityId) => {
            if (!slotHvacSelect || !slotHvacSelect.value || !this._hass) return false;
            const state = this._hass.states[entityId];
            const modes = state?.attributes?.hvac_modes;
            return Array.isArray(modes) && !modes.includes(slotHvacSelect.value);
          };
          window.EntitiesSelector.attachEntitiesList(slotEntitiesWrap, {
            entities,
            checkedEntityIds: sameSlotItems.map(i => i.entity_id),
            hass: this._hass,
            isEntityDisabled,
            onCheck: () => { /* API and render only when dropdown is closed */ },
            onUncheck: () => { /* API and render only when dropdown is closed */ }
          });
          this._updateModeOptionsForWrap(slotEntitiesWrap, slotHvacSelect);
          this._updateModeWarningForWrap(slotEntitiesWrap, slotHvacSelect, null);
          const trigger = slotEntitiesWrap.querySelector('[data-slot-form="entities-trigger"]');
          const dropdown = slotEntitiesWrap.querySelector('[data-slot-form="entities-dropdown"]');
          const selectAllInput = slotEntitiesWrap.querySelector('[data-slot-form="entities-select-all"]');
          if (trigger && dropdown) {
            if (!dropdown._slotClickStopped) {
              dropdown.addEventListener('click', (e) => e.stopPropagation());
              dropdown._slotClickStopped = true;
            }
            trigger.addEventListener('click', (e) => {
              e.stopPropagation();
              e.preventDefault();
              const open = dropdown.classList.toggle('open');
              trigger.classList.toggle('open', open);
              if (open) {
                const bridgeState = this._getBridgeState();
                const allItems = bridgeState?.attributes?.items || [];
                const filteredNow = allItems.filter(i => i && i.temporary !== true && entitySet.has(i.entity_id));
                const dupKeysNow = this._getDuplicatedSlotKeys(filteredNow);
                const displayKeyForSlot = this._getDisplaySlotKey(item, dupKeysNow);
                const sameSlotItemsNow = filteredNow.filter(i => this._getDisplaySlotKey(i, dupKeysNow) === displayKeyForSlot);
                const initialChecked = new Set(sameSlotItemsNow.map(i => i.entity_id));
                const initialIds = {};
                sameSlotItemsNow.forEach(i => { initialIds[i.entity_id] = i.id; });
                const close = async (ev) => {
                  const path = ev.composedPath && ev.composedPath();
                  const inside = path && path.some(el => el === slotEntitiesWrap || el === dropdown || (el && el.nodeType === 1 && (slotEntitiesWrap.contains(el) || dropdown.contains(el))));
                  if (inside) return;
                  document.removeEventListener('mousedown', close);
                  dropdown.classList.remove('open');
                  trigger.classList.remove('open');
                  const listEl = slotEntitiesWrap.querySelector('.entities-selector-list');
                  const checkedInputs = listEl ? listEl.querySelectorAll('input[name="entities-selector-entity"]:checked') : [];
                  const currentChecked = new Set(Array.from(checkedInputs).map(inp => inp.value));
                  const toRemove = [...initialChecked].filter(eid => !currentChecked.has(eid));
                  const toAdd = [...currentChecked].filter(eid => !initialChecked.has(eid));
                  for (const entityId of toRemove) {
                    const itemId = initialIds[entityId];
                    if (itemId) await this._deleteItem(itemId);
                  }
                  const timeHours = itemEl.querySelector('[data-slot-form="time-hours"]');
                  const timeMinutes = itemEl.querySelector('[data-slot-form="time-minutes"]');
                  const time = (timeHours && timeMinutes) ? `${timeHours.value}:${timeMinutes.value}` : item.time;
                  const selectedWeekdays = WeekdaySelector.getSelectedWeekdays(itemEl);
                  const weekdays = selectedWeekdays.length > 0 ? selectedWeekdays : item.weekdays;
                  const hvacSelect = itemEl.querySelector('[data-slot-form="mode"]');
                  const fanSelect = itemEl.querySelector('[data-slot-form="fan"]');
                  const tempInput = itemEl.querySelector('[data-slot-form="temp"]');
                  const hvacMode = hvacSelect && hvacSelect.value ? hvacSelect.value : (item.service_start?.value?.hvac_mode || 'heat');
                  const fanMode = fanSelect?.value || undefined;
                  let temperature = undefined;
                  if (tempInput && tempInput.value !== '' && !Number.isNaN(Number(tempInput.value))) {
                    temperature = parseFloat(tempInput.value);
                  }
                  let durationHours = null;
                  if (hvacMode !== 'off' && window.DurationSelector) {
                    const wrapper = itemEl.querySelector('.duration-selector-wrapper');
                    if (wrapper) durationHours = DurationSelector.getSelectedDuration(itemEl);
                  }
                  const durationMins = (ScheduleHelper && ScheduleHelper.durationHoursToMinutes) ? ScheduleHelper.durationHoursToMinutes(durationHours) : (durationHours != null ? Math.round(Number(durationHours) * 60) : null);
                  for (const entityId of toAdd) {
                    const service_start = ScheduleHelper.createClimateServices(entityId, hvacMode, { temperature, fan_mode: fanMode }).service_start;
                    const service_end = (hvacMode !== 'off' && durationMins) ? ScheduleHelper.createClimateServices(entityId, hvacMode).service_end : null;
                    await ScheduleHelper.addScheduleSlot({
                      hass: this._hass,
                      callService: async (service, data) => this._callService(service, data),
                      getBridgeState: () => this._getBridgeState(),
                      entity_id: entityId,
                      time,
                      duration: durationMins || undefined,
                      weekdays,
                      service_start,
                      service_end,
                      bridgeSensor: this._bridgeSensor,
                      onRender: () => {}
                    });
                  }
                  if (toAdd.length > 0 || toRemove.length > 0) {
                    this._optimisticBridgeState = null;
                    this.hass = { ...this._hass };
                    await this.render();
                  }
                };
                setTimeout(() => document.addEventListener('mousedown', close), 0);
              }
            });
          }
          if (selectAllInput) {
            const listEl = slotEntitiesWrap.querySelector('.entities-selector-list');
            selectAllInput.addEventListener('change', () => {
              if (!listEl) return;
              const inputs = listEl.querySelectorAll('input[name="entities-selector-entity"]:not(:disabled)');
              inputs.forEach(inp => { inp.checked = selectAllInput.checked; });
              this._updateEntityChipsForWrap(slotEntitiesWrap, { updateSlotTitle: true });
              this._updateModeOptionsForWrap(slotEntitiesWrap, slotHvacSelect);
              this._updateModeWarningForWrap(slotEntitiesWrap, slotHvacSelect, null);
            });
          }
          const listElForSync = slotEntitiesWrap.querySelector('.entities-selector-list');
          if (listElForSync && selectAllInput) {
            listElForSync.addEventListener('change', () => {
              this._updateEntityChipsForWrap(slotEntitiesWrap, { updateSlotTitle: true });
              this._updateModeOptionsForWrap(slotEntitiesWrap, slotHvacSelect);
              this._updateModeWarningForWrap(slotEntitiesWrap, slotHvacSelect, null);
              const all = listElForSync.querySelectorAll('input[name="entities-selector-entity"]:not(:disabled)');
              const checkedCount = Array.from(all).filter(inp => inp.checked).length;
              selectAllInput.checked = checkedCount === all.length;
              selectAllInput.indeterminate = checkedCount > 0 && checkedCount < all.length;
            });
          }
        }
      }

      // Weekday selector - use shared component
      // First, set the initial weekdays value
      WeekdaySelector.setSelectedWeekdays(this.shadowRoot, item.weekdays, itemEl);
      // Attach event listeners for this specific slot's weekday selector
      // NOTE: In slots, weekday selector is NOT wrapped in .popup-field (unlike in popup)
      
      // Check if weekday selector exists BEFORE attachEventListeners
      const modeBtnsBefore = itemEl.querySelectorAll('.weekday-mode-btn');
      const weekdayBtnsBefore = itemEl.querySelectorAll('.popup-weekday');
      
      // In slots, weekday selector is directly in itemEl, not in .popup-field
      if (modeBtnsBefore.length > 0 || weekdayBtnsBefore.length > 0) {
        const updateWeekdays = () => {
          if (itemEl.dataset.updating === 'true') return;
          const selectedWeekdays = WeekdaySelector.getSelectedWeekdays(itemEl);
          if (selectedWeekdays.length === 0) {
            const currentItems = this._getItems();
            const currentItem = currentItems.find(i => i.id === itemId);
            if (currentItem) WeekdaySelector.setSelectedWeekdays(this.shadowRoot, currentItem.weekdays, itemEl);
            return;
          }
          this._updateItem(itemId, { weekdays: selectedWeekdays });
        };
        
        // Attach shared component listeners (handles mode switch + show/hide custom weekdays)
        WeekdaySelector.attachEventListeners(itemEl);
        
        // Add only updateWeekdays and Custom-mode day sync; do NOT clone (cloning removed shared handler → first-click glitch)
        const addWeekdayHandlers = () => {
          const modeBtns = itemEl.querySelectorAll('.weekday-mode-btn');
          const weekdayBtns = itemEl.querySelectorAll('.popup-weekday');
          if (modeBtns.length === 0 && weekdayBtns.length === 0) {
            setTimeout(addWeekdayHandlers, 50);
            return;
          }
          modeBtns.forEach((btn) => {
            btn.addEventListener('click', () => {
              if (btn.dataset.mode === 'custom') {
                requestAnimationFrame(() => {
                  const slotCard = btn.closest('.slot-card') || itemEl;
                  const customWeekdays = slotCard.querySelector('#popup-weekdays-custom') || slotCard.querySelector('.popup-weekdays');
                  if (customWeekdays) {
                    const currentItems = this._getItems();
                    const currentItem = currentItems.find(i => i.id === itemId);
                    if (currentItem && currentItem.weekdays) {
                      slotCard.querySelectorAll('.popup-weekday').forEach(dayEl => {
                        const day = parseInt(dayEl.dataset.day, 10);
                        dayEl.classList.toggle('active', !Number.isNaN(day) && currentItem.weekdays.includes(day));
                      });
                    }
                  }
                });
                return;
              }
              setTimeout(updateWeekdays, 100);
            });
          });
          weekdayBtns.forEach((dayEl) => {
            dayEl.addEventListener('click', () => setTimeout(updateWeekdays, 100));
          });
        };
        setTimeout(addWeekdayHandlers, 0);
      } else {}
    });
  }

  getCardSize() {
    return 3;
  }
  
  connectedCallback() {
    // Register this card instance for cross-card sync
    if (!window._homieScheduleCards) {
      window._homieScheduleCards = new Set();
    }
    window._homieScheduleCards.add(this);
  }
  
  disconnectedCallback() {
    // Card disconnected from DOM - cleanup subscriptions
    if (this._unsubStateChanged) {
      try {
        if (typeof this._unsubStateChanged === 'function') {
          this._unsubStateChanged();
        }
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): unsubscribe in disconnectedCallback failed', e);
      }
      this._unsubStateChanged = null;
    }
    
    // Unregister this card instance
    if (window._homieScheduleCards) {
      window._homieScheduleCards.delete(this);
    }
    
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    
    // Clear seconds countdown timer
    if (this._secondsTimer) {
      clearInterval(this._secondsTimer);
      this._secondsTimer = null;
    }
  }
}

// Register custom element (safe: skip if already defined)
if (typeof customElements !== 'undefined' && !customElements.get('homie-scheduler-climate-slots')) {
  customElements.define('homie-scheduler-climate-slots', HomieClimateScheduleSlotsCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'custom:homie-scheduler-climate-slots',
    name: 'Homie Scheduler Climate',
    description: 'Climate schedule slots card',
    icon: 'https://brands.home-assistant.io/custom_integrations/homie_scheduler/icon.png',
    preview: false
  });
  window.logCardInfo('climate-slots-card');
}
