/**
 * Scheduler Climate Slots Card
 * Last build: 2026-02-16T07:28:09.850Z
 * Version: 1.0.6
 */
window.__HOMIE_SCHEDULER_CARDS_VERSION = '1.0.6';

const SCHEDULER_SWITCH_ENTITY = 'switch.homie_scheduler_enabled';

// Shared Components (auto-included from shared/)
// Shared component: card-console-info/card-console-info.js
/**
 * Shared console info for Homie Scheduler cards.
 * Logs branded card name and release version (set at build time).
 * Uses window.logCardInfo so the bundle can include this file multiple times (one per card) without redeclaration error.
 */
if (typeof window.logCardInfo === 'undefined') {
  window.logCardInfo = function (cardName) {
    var version = typeof window.__HOMIE_SCHEDULER_CARDS_VERSION !== 'undefined'
      ? window.__HOMIE_SCHEDULER_CARDS_VERSION
      : 'dev';
    var label = cardName + ' v' + version;
    console.info(
      '%c Homie Scheduler %c ' + label,
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
      slotData.duration = parseInt(duration);
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
   * @returns {Object} Object with service_start and service_end for climate
   */
  static createClimateServices(entity_id, hvac_mode) {
    return {
      service_start: {
        name: "climate.set_hvac_mode",
        value: {
          entity_id: entity_id,
          hvac_mode: hvac_mode
        }
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
      // Ignore errors
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
          // Ignore errors
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

// Shared component: selector-duration/duration-selector.js
/**
 * Duration Selector Utility
 * 
 * Shared utility for duration selection with slider and number input.
 * Used by both boiler and climate schedule cards.
 */

// Prevent duplicate class declaration when multiple cards are loaded
if (typeof window.DurationSelector === 'undefined') {
  window.DurationSelector = class DurationSelector {
  /**
   * Compute step so the slider can reach max (step must divide range).
   * Picks a divisor of (max - min) closest to preferredStep.
   */
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

  /**
   * Build list of allowed duration values: multiples of stepBase (5) from min up to max,
   * plus max itself if it's not a multiple of 5 (e.g. 66, 69, 63).
   * Example: min=5, max=66 → [5,10,15,...,60,65,66]; max=63 → [5,10,...,60,63].
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @param {number} stepBase - Base step for "nice" values (default 5)
   * @returns {number[]} Allowed values; slider will use index into this array
   */
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

  /**
   * Get selected duration value
   * @param {HTMLElement} shadowRoot - Shadow root of the card or container element
   * @returns {number|null} Duration in minutes, or null if no duration
   */
  static getSelectedDuration(shadowRoot) {
    // Check if shadowRoot itself is the wrapper (when called with wrapper element directly)
    let wrapper = null;
    if (shadowRoot && shadowRoot.classList && shadowRoot.classList.contains('duration-selector-wrapper')) {
      wrapper = shadowRoot;
    } else {
      // Find wrapper inside shadowRoot
      wrapper = shadowRoot.querySelector('.duration-selector-wrapper');
    }
    
    if (wrapper) {
      // Find input in the same wrapper as slider (they are siblings)
      const input = wrapper.querySelector('[data-action="update-duration"]');
      if (input) {
        const value = input.value;
        return value && value !== '' ? parseInt(value) : null;
      }
    }
    // Fallback: search in shadowRoot
    const input = shadowRoot.querySelector('[data-action="update-duration"]');
    if (!input) return null;
    const value = input.value;
    return value && value !== '' ? parseInt(value) : null;
  }

  /**
   * Set duration value (syncs both slider and input)
   * @param {HTMLElement} shadowRoot - Shadow root of the card or container element
   * @param {number|null} duration - Duration in minutes, or null to clear
   */
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
      const valuesStr = wrapper && wrapper.dataset.durationValues;
      const allowedValues = valuesStr ? valuesStr.split(',').map(Number) : null;
      if (allowedValues && allowedValues.length && duration != null && duration !== '') {
        const d = parseInt(duration, 10);
        let idx = allowedValues.indexOf(d);
        if (idx < 0) {
          idx = allowedValues.reduce((best, _, i) =>
            Math.abs(allowedValues[i] - d) < Math.abs(allowedValues[best] - d) ? i : best, 0);
        }
        slider.value = String(idx);
      } else {
        slider.value = duration != null && duration !== '' ? String(duration) : '';
      }
    }
  }

  /**
   * Reset duration selector to default value
   * @param {HTMLElement} shadowRoot - Shadow root of the card
   * @param {number|null} defaultDuration - Default duration (30 for boiler, null for climate)
   */
  static reset(shadowRoot, defaultDuration = 30) {
    this.setSelectedDuration(shadowRoot, defaultDuration);
  }

  /**
   * Attach event listeners to sync slider and input
   * @param {HTMLElement} shadowRoot - Shadow root of the card or container element
   */
  static attachEventListeners(shadowRoot) {
    // Check if shadowRoot itself is the wrapper (when called with wrapper element directly)
    let wrapper = null;
    if (shadowRoot && shadowRoot.classList && shadowRoot.classList.contains('duration-selector-wrapper')) {
      wrapper = shadowRoot;
    } else {
      // Find wrapper inside shadowRoot
      wrapper = shadowRoot.querySelector('.duration-selector-wrapper');
    }
    
    if (!wrapper) return;
    
    // Find input and slider in the same wrapper (they are siblings)
    const input = wrapper.querySelector('[data-action="update-duration"]');
    const slider = wrapper.querySelector('[data-action="update-duration-slider"]');
    
    if (!input || !slider) return;
    
    const newInput = input.cloneNode(true);
    const newSlider = slider.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    slider.parentNode.replaceChild(newSlider, slider);
    
    const valuesStr = wrapper.dataset.durationValues;
    const allowedValues = valuesStr ? valuesStr.split(',').map(Number) : null;
    let currentValue = parseInt(newInput.value, 10);
    if (isNaN(currentValue) && allowedValues && allowedValues.length) currentValue = allowedValues[0];
    if (allowedValues && allowedValues.length) {
      let idx = allowedValues.indexOf(currentValue);
      if (idx < 0) idx = allowedValues.reduce((best, _, i) =>
        Math.abs(allowedValues[i] - currentValue) < Math.abs(allowedValues[best] - currentValue) ? i : best, 0);
      newSlider.value = String(idx);
      newInput.value = String(allowedValues[idx]);
    }
    
    const sliderInputHandler = (e) => {
      const raw = parseInt(e.target.value, 10);
      if (allowedValues && allowedValues.length) {
        currentValue = allowedValues[Math.min(raw, allowedValues.length - 1)];
        newInput.value = String(currentValue);
      } else {
        currentValue = raw;
        newInput.value = String(currentValue);
      }
      newInput.setAttribute('value', newInput.value);
    };
    newSlider.addEventListener('input', sliderInputHandler);
    newSlider.addEventListener('change', sliderInputHandler);
    
    const inputChangeHandler = (e) => {
      const value = parseInt(e.target.value, 10);
      const min = parseInt(newInput.min, 10) || 0;
      const max = parseInt(newInput.max, 10) || 1440;
      if (!isNaN(value)) {
        const clamped = Math.max(min, Math.min(max, value));
        currentValue = clamped;
        newInput.value = String(clamped);
        newInput.setAttribute('value', String(clamped));
        if (allowedValues && allowedValues.length) {
          let idx = allowedValues.indexOf(clamped);
          if (idx < 0) idx = allowedValues.reduce((best, _, i) =>
            Math.abs(allowedValues[i] - clamped) < Math.abs(allowedValues[best] - clamped) ? i : best, 0);
          newSlider.value = String(idx);
        } else {
          newSlider.value = String(clamped);
        }
        newSlider.setAttribute('value', newSlider.value);
      }
    };
    newInput.addEventListener('input', inputChangeHandler);
    newInput.addEventListener('change', inputChangeHandler);
    newInput.addEventListener('click', (e) => e.stopPropagation());
    newSlider.addEventListener('click', (e) => e.stopPropagation());
  }

  /**
   * Get duration select element from a slot card
   * @param {HTMLElement} slotCard - The slot card element
   * @returns {HTMLElement|null} The duration input element
   */
  static getInputFromSlot(slotCard) {
    return slotCard.querySelector('[data-action="update-duration"]');
  }

  /**
   * Set duration value in a slot card
   * @param {HTMLElement} slotCard - The slot card element
   * @param {number|null} duration - Duration in minutes, or null
   * @param {Object} config - Optional config with min_duration, max_duration, duration_step
   */
  static setDurationInSlot(slotCard, duration, config = null) {
    const wrapper = slotCard.classList && slotCard.classList.contains('duration-selector-wrapper')
      ? slotCard
      : slotCard.querySelector('.duration-selector-wrapper');
    const input = (wrapper || slotCard).querySelector('[data-action="update-duration"]');
    const slider = (wrapper || slotCard).querySelector('[data-action="update-duration-slider"]');
    
    if (config && (input || slider)) {
      const minDuration = config.min_duration || 15;
      const maxDuration = config.max_duration || 1440;
      const allowedValues = this.computeAllowedValues(minDuration, maxDuration, 5);
      if (wrapper) wrapper.dataset.durationValues = allowedValues.join(',');
      if (input) {
        input.min = minDuration;
        input.max = maxDuration;
        input.step = 1;
      }
      if (slider) {
        slider.min = 0;
        slider.max = Math.max(0, allowedValues.length - 1);
        slider.step = 1;
      }
    }
    
    if (input) {
      input.value = duration != null && duration !== '' ? String(duration) : '';
    }
    if (slider && wrapper && wrapper.dataset.durationValues) {
      const allowedValues = wrapper.dataset.durationValues.split(',').map(Number);
      const d = parseInt(duration, 10);
      if (!isNaN(d)) {
        let idx = allowedValues.indexOf(d);
        if (idx < 0) idx = allowedValues.reduce((best, _, i) =>
          Math.abs(allowedValues[i] - d) < Math.abs(allowedValues[best] - d) ? i : best, 0);
        slider.value = String(idx);
      } else {
        slider.value = '0';
      }
    } else if (slider) {
      slider.value = duration != null && duration !== '' ? String(duration) : '';
    }
  }

  /**
   * Attach event listeners for duration selector in a slot card
   * @param {HTMLElement} slotCard - The slot card element
   * @param {Function} onChangeCallback - Callback function when duration changes (receives duration value)
   * @param {Object} config - Optional config with min_duration, max_duration, duration_step
   */
  static attachEventListenersInSlot(slotCard, onChangeCallback, config = null) {
    const wrapper = slotCard.classList && slotCard.classList.contains('duration-selector-wrapper')
      ? slotCard
      : slotCard.querySelector('.duration-selector-wrapper');
    const input = (wrapper || slotCard).querySelector('[data-action="update-duration"]');
    const slider = (wrapper || slotCard).querySelector('[data-action="update-duration-slider"]');
    
    if (config && input && slider) {
      const minDuration = config.min_duration || 15;
      const maxDuration = config.max_duration || 1440;
      const allowedValues = this.computeAllowedValues(minDuration, maxDuration, 5);
      if (wrapper) wrapper.dataset.durationValues = allowedValues.join(',');
      input.min = minDuration;
      input.max = maxDuration;
      input.step = 1;
      slider.min = 0;
      slider.max = Math.max(0, allowedValues.length - 1);
      slider.step = 1;
    }
    
    if (input && slider) {
      const newInput = input.cloneNode(true);
      const newSlider = slider.cloneNode(true);
      input.parentNode.replaceChild(newInput, input);
      slider.parentNode.replaceChild(newSlider, slider);
      
      const valuesStr = wrapper && wrapper.dataset.durationValues;
      const allowedValues = valuesStr ? valuesStr.split(',').map(Number) : null;
      let currentValue = parseInt(newInput.value, 10);
      if (isNaN(currentValue) && allowedValues && allowedValues.length) currentValue = allowedValues[0];
      if (allowedValues && allowedValues.length) {
        let idx = allowedValues.indexOf(currentValue);
        if (idx < 0) idx = allowedValues.reduce((best, _, i) =>
          Math.abs(allowedValues[i] - currentValue) < Math.abs(allowedValues[best] - currentValue) ? i : best, 0);
        newSlider.value = String(idx);
        newInput.value = String(allowedValues[idx]);
      }
      
      const sliderHandler = (e) => {
        const raw = parseInt(e.target.value, 10);
        if (allowedValues && allowedValues.length) {
          currentValue = allowedValues[Math.min(raw, allowedValues.length - 1)];
          newInput.value = String(currentValue);
        } else {
          currentValue = raw;
          newInput.value = String(currentValue);
        }
        newInput.setAttribute('value', newInput.value);
        if (onChangeCallback) onChangeCallback(currentValue);
      };
      
      const inputHandler = (e) => {
        const value = parseInt(e.target.value, 10);
        const min = parseInt(newInput.min, 10) || 0;
        const max = parseInt(newInput.max, 10) || 1440;
        if (!isNaN(value)) {
          const clamped = Math.max(min, Math.min(max, value));
          currentValue = clamped;
          newInput.value = String(clamped);
          newInput.setAttribute('value', String(clamped));
          if (allowedValues && allowedValues.length) {
            let idx = allowedValues.indexOf(clamped);
            if (idx < 0) idx = allowedValues.reduce((best, _, i) =>
              Math.abs(allowedValues[i] - clamped) < Math.abs(allowedValues[best] - clamped) ? i : best, 0);
            newSlider.value = String(idx);
          } else {
            newSlider.value = String(clamped);
          }
          newSlider.setAttribute('value', newSlider.value);
          if (onChangeCallback) onChangeCallback(currentValue);
        } else if (e.target.value === '') {
          if (onChangeCallback) onChangeCallback(null);
        }
      };
      
      newSlider.addEventListener('input', sliderHandler);
      newSlider.addEventListener('change', sliderHandler);
      newInput.addEventListener('input', inputHandler);
      newInput.addEventListener('change', inputHandler);
      newInput.addEventListener('click', (e) => e.stopPropagation());
      newSlider.addEventListener('click', (e) => e.stopPropagation());
    }
  }
  };
  
  // Already assigned to window.DurationSelector above, no need to reassign
}

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

    // Hide custom weekdays selector (everyday is default)
    const customWeekdays = shadowRoot.getElementById('popup-weekdays-custom');
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
    this._expandedSlots = new Set(); // Track expanded slots by key (time|weekdays) so adding/removing entities doesn't collapse
    this._configError = null; // Store config error message
    this._unsubStateChanged = null; // Unsubscribe function for state_changed events
    this._optimisticBridgeState = null; // Local overlay for optimistic updates (avoids mutating hass.states)
  }

  async _loadTemplate() {
    if (this._htmlTemplate) return this._htmlTemplate;
    
    // Template is embedded in production build
    this._htmlTemplate = `  <!-- Main Header -->\n  <div class="main-header">\n    <div class="header-left">\n      <div class="header-icon {{ENABLED_CLASS}}" data-action="toggle-enabled" title="Toggle scheduler">\n        <ha-icon icon="mdi:calendar-clock"></ha-icon>\n        <!-- <ha-icon icon="{{ICON}}"></ha-icon> -->\n      </div>\n      <div class="header-text">\n        <div class="header-title {{HEADER_TITLE_CLASS}}">\n          {{TITLE}}\n        </div>\n        <div class="header-status">{{STATUS_TEXT}}</div>\n      </div>\n    </div>\n  </div>\n  \n  <!-- Slots List (hidden when 0 slots) -->\n  <div class="slots-container{{SLOTS_CONTAINER_CLASS}}">\n    {{ITEMS_CONTENT}}\n  </div>\n  \n  <!-- Add Slot Button -->\n  <button class="button-outline" data-action="open-add-popup">\n    Add Schedule Slot\n  </button>\n  \n  <!-- Add Slot Popup -->\n  <div class="popup-overlay" id="add-popup" style="display: none;">\n    <div class="popup-content">\n      <div class="popup-header">\n        <ha-icon icon="mdi:power"></ha-icon>\n        <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">\n          <span class="popup-title">Add Schedule Slot</span>\n          <div style="font-size: 12px; color: var(--secondary-text-color, #757575);">\n            for {{ENTITY_NAME}}\n          </div>\n        </div>\n        <button class="popup-close" data-action="close-popup">\n          <ha-icon icon="mdi:close"></ha-icon>\n        </button>\n      </div>\n      \n      <div class="popup-body">\n        <!-- Title Input -->\n        <div class="popup-field">\n          <label>\n            <ha-icon icon="mdi:label-outline"></ha-icon>\n            <span>Title (optional)</span>\n          </label>\n          <input type="text" class="homie-input" id="popup-title" placeholder="e.g. Morning heating">\n        </div>\n        \n        <!-- Time Input -->\n        <div class="popup-field">\n          <label>\n            <ha-icon icon="mdi:clock-outline"></ha-icon>\n            <span>Start Time</span>\n          </label>\n          <div class="time-selects">\n            <select class="homie-select popup-time-hours" id="popup-time-hours">\n              <option value="00">00</option>\n              <option value="01">01</option>\n              <option value="02">02</option>\n              <option value="03">03</option>\n              <option value="04">04</option>\n              <option value="05">05</option>\n              <option value="06">06</option>\n              <option value="07">07</option>\n              <option value="08" selected>08</option>\n              <option value="09">09</option>\n              <option value="10">10</option>\n              <option value="11">11</option>\n              <option value="12">12</option>\n              <option value="13">13</option>\n              <option value="14">14</option>\n              <option value="15">15</option>\n              <option value="16">16</option>\n              <option value="17">17</option>\n              <option value="18">18</option>\n              <option value="19">19</option>\n              <option value="20">20</option>\n              <option value="21">21</option>\n              <option value="22">22</option>\n              <option value="23">23</option>\n            </select>\n            <span class="time-separator">:</span>\n            <select class="homie-select popup-time-minutes" id="popup-time-minutes">\n              <option value="00" selected>00</option>\n              <option value="05">05</option>\n              <option value="10">10</option>\n              <option value="15">15</option>\n              <option value="20">20</option>\n              <option value="25">25</option>\n              <option value="30">30</option>\n              <option value="35">35</option>\n              <option value="40">40</option>\n              <option value="45">45</option>\n              <option value="50">50</option>\n              <option value="55">55</option>\n            </select>\n          </div>\n        </div>\n        \n        <!-- Entities to apply (dropdown multi-select when card has multiple entities) -->\n        <div class="popup-field popup-entities-wrap" id="popup-entities-container" style="display: none;">\n          <label>\n            <ha-icon icon="mdi:format-list-checks"></ha-icon>\n            <span>Apply to entities</span>\n          </label>\n          <div class="popup-entities-trigger" id="popup-entities-trigger" tabindex="0" role="combobox">\n            <div class="popup-entities-chips" id="popup-entities-chips"></div>\n            <ha-icon class="popup-entities-caret" icon="mdi:chevron-down"></ha-icon>\n          </div>\n          <div class="popup-entities-dropdown" id="popup-entities-dropdown">\n            <label class="popup-entity-row popup-entity-select-all">\n              <input type="checkbox" id="popup-entities-select-all">\n              <span class="popup-entity-name">Select all</span>\n            </label>\n            <!-- SHARED:entities-selector -->\n<div class="entities-selector-list"></div>\n<template class="entities-selector-row-tpl">\n  <label class="entities-selector-row">\n    <input type="checkbox" name="entities-selector-entity" value="">\n    <span class="entities-selector-entity-name"></span>\n  </label>\n</template>\n<!-- END:entities-selector -->\n          </div>\n        </div>\n        \n        <!-- HVAC Mode Select (full width) -->\n        <div class="popup-field popup-field-mode">\n          <label>\n            <ha-icon icon="mdi:thermostat"></ha-icon>\n            <span>HVAC Mode</span>\n          </label>\n          <select class="homie-select popup-mode-select" id="popup-hvac-mode">\n            {{HVAC_MODES_OPTIONS}}\n          </select>\n          <div class="popup-hvac-mode-warning" id="popup-hvac-mode-warning"></div>\n        </div>\n        \n        <!-- Duration Selector (HA-style row: label + ha-switch) -->\n        <div class="popup-field">\n          <div class="popup-field-row popup-duration-row">\n            <label class="popup-field-row-label">\n              <ha-icon icon="mdi:timer-outline"></ha-icon>\n              <span>Duration (minutes)</span>\n            </label>\n            <ha-switch id="popup-duration-enabled"></ha-switch>\n          </div>\n          <div id="popup-duration-wrapper" style="display: none; margin-top: 8px;">\n            <!-- SHARED:duration-selector -->\n<!-- Duration Selector Component (universal - for popup and slot) -->\n<div class="duration-selector-wrapper">\n  <input \n    type="range" \n    class="duration-slider" \n    data-action="update-duration-slider"\n    data-item-id="{{ITEM_ID}}"\n    min="{{DURATION_MIN}}"\n    max="{{DURATION_MAX}}"\n    step="{{DURATION_STEP}}"\n    value="{{DURATION_VALUE}}"\n  />\n  <input \n    type="number" \n    class="duration-input homie-input" \n    data-action="update-duration"\n    data-item-id="{{ITEM_ID}}"\n    min="{{DURATION_MIN}}"\n    max="{{DURATION_MAX}}"\n    step="{{DURATION_STEP}}"\n    value="{{DURATION_VALUE}}"\n  />\n</div>\n<!-- END:duration-selector -->\n          </div>\n        </div>\n        \n        <!-- Weekday Selector -->\n        <div class="popup-field">\n          <label>\n            <ha-icon icon="mdi:calendar"></ha-icon>\n            <span>Days of Week</span>\n          </label>\n          <!-- SHARED:weekday-selector -->\n<!-- Weekday Selection Component (universal - without popup-field) -->\n<div class="weekday-mode-selector">\n  <button type="button" class="weekday-mode-btn active" data-mode="everyday">Everyday</button>\n  <button type="button" class="weekday-mode-btn" data-mode="weekdays">Weekdays</button>\n  <button type="button" class="weekday-mode-btn" data-mode="custom">Custom</button>\n</div>\n<div class="popup-weekdays hidden" id="popup-weekdays-custom">\n  <div class="popup-weekday" data-day="0">Mon</div>\n  <div class="popup-weekday" data-day="1">Tue</div>\n  <div class="popup-weekday" data-day="2">Wed</div>\n  <div class="popup-weekday" data-day="3">Thu</div>\n  <div class="popup-weekday" data-day="4">Fri</div>\n  <div class="popup-weekday" data-day="5">Sat</div>\n  <div class="popup-weekday" data-day="6">Sun</div>\n</div>\n<!-- END:weekday-selector -->\n        </div>\n      </div>\n      \n      <div class="popup-footer">\n        <button class="popup-button cancel" data-action="close-popup">Cancel</button>\n        <button class="popup-button save" data-action="save-slot">Save</button>\n      </div>\n    </div>\n  </div>\n\n<!-- Slot Item Template -->\n<template id="slot-item-template">\n  <div class="slot-card {{DISABLED_CLASS}}" data-item-id="{{ITEM_ID}}">\n    <div class="slot-header">\n      <div class="slot-icon {{ICON_CLASS}}" data-action="toggle-item" title="Toggle slot">\n        <ha-icon icon="mdi:power"></ha-icon>\n      </div>\n      <div class="slot-info">\n        <div class="slot-name">{{SLOT_NAME}}</div>\n        <div class="slot-status">{{SLOT_STATUS}}</div>\n      </div>\n    </div>\n    <button class="slot-expand" data-action="toggle-expand" title="Expand/collapse details">\n      <ha-icon icon="mdi:chevron-down"></ha-icon>\n    </button>\n    \n    <div class="slot-expandable">\n      <div class="slot-details">\n        <div class="slot-title">\n          <ha-icon icon="mdi:label-outline"></ha-icon>\n          <input type="text" class="homie-input slot-title-input" data-action="update-slot-title" data-item-id="{{ITEM_ID}}" value="{{SLOT_TITLE}}" placeholder="Slot name">\n        </div>\n        <div class="slot-time">\n          <ha-icon icon="mdi:clock-outline"></ha-icon>\n          <div class="time-selects">\n            <select class="homie-select slot-time-hours" data-action="update-time-hours" data-item-id="{{ITEM_ID}}">\n              <option value="00" {{TIME_HOURS_00}}>00</option>\n              <option value="01" {{TIME_HOURS_01}}>01</option>\n              <option value="02" {{TIME_HOURS_02}}>02</option>\n              <option value="03" {{TIME_HOURS_03}}>03</option>\n              <option value="04" {{TIME_HOURS_04}}>04</option>\n              <option value="05" {{TIME_HOURS_05}}>05</option>\n              <option value="06" {{TIME_HOURS_06}}>06</option>\n              <option value="07" {{TIME_HOURS_07}}>07</option>\n              <option value="08" {{TIME_HOURS_08}}>08</option>\n              <option value="09" {{TIME_HOURS_09}}>09</option>\n              <option value="10" {{TIME_HOURS_10}}>10</option>\n              <option value="11" {{TIME_HOURS_11}}>11</option>\n              <option value="12" {{TIME_HOURS_12}}>12</option>\n              <option value="13" {{TIME_HOURS_13}}>13</option>\n              <option value="14" {{TIME_HOURS_14}}>14</option>\n              <option value="15" {{TIME_HOURS_15}}>15</option>\n              <option value="16" {{TIME_HOURS_16}}>16</option>\n              <option value="17" {{TIME_HOURS_17}}>17</option>\n              <option value="18" {{TIME_HOURS_18}}>18</option>\n              <option value="19" {{TIME_HOURS_19}}>19</option>\n              <option value="20" {{TIME_HOURS_20}}>20</option>\n              <option value="21" {{TIME_HOURS_21}}>21</option>\n              <option value="22" {{TIME_HOURS_22}}>22</option>\n              <option value="23" {{TIME_HOURS_23}}>23</option>\n            </select>\n            <span class="time-separator">:</span>\n            <select class="homie-select slot-time-minutes" data-action="update-time-minutes" data-item-id="{{ITEM_ID}}">\n              <option value="00" {{TIME_MINUTES_00}}>00</option>\n              <option value="05" {{TIME_MINUTES_05}}>05</option>\n              <option value="10" {{TIME_MINUTES_10}}>10</option>\n              <option value="15" {{TIME_MINUTES_15}}>15</option>\n              <option value="20" {{TIME_MINUTES_20}}>20</option>\n              <option value="25" {{TIME_MINUTES_25}}>25</option>\n              <option value="30" {{TIME_MINUTES_30}}>30</option>\n              <option value="35" {{TIME_MINUTES_35}}>35</option>\n              <option value="40" {{TIME_MINUTES_40}}>40</option>\n              <option value="45" {{TIME_MINUTES_45}}>45</option>\n              <option value="50" {{TIME_MINUTES_50}}>50</option>\n              <option value="55" {{TIME_MINUTES_55}}>55</option>\n            </select>\n          </div>\n        </div>\n      </div>\n      <div class="slot-duration">\n        <ha-icon icon="mdi:timer-outline"></ha-icon>\n        <!-- SHARED:duration-selector -->\n<!-- Duration Selector Component (universal - for popup and slot) -->\n<div class="duration-selector-wrapper">\n  <input \n    type="range" \n    class="duration-slider" \n    data-action="update-duration-slider"\n    data-item-id="{{ITEM_ID}}"\n    min="{{DURATION_MIN}}"\n    max="{{DURATION_MAX}}"\n    step="{{DURATION_STEP}}"\n    value="{{DURATION_VALUE}}"\n  />\n  <input \n    type="number" \n    class="duration-input homie-input" \n    data-action="update-duration"\n    data-item-id="{{ITEM_ID}}"\n    min="{{DURATION_MIN}}"\n    max="{{DURATION_MAX}}"\n    step="{{DURATION_STEP}}"\n    value="{{DURATION_VALUE}}"\n  />\n</div>\n<!-- END:duration-selector -->\n      </div>\n      <div class="slot-hvac-mode">\n        <ha-icon icon="mdi:thermostat"></ha-icon>\n        <select class="homie-select" data-action="update-hvac-mode" data-item-id="{{ITEM_ID}}">\n          {{HVAC_MODE_OPTIONS}}\n        </select>\n      </div>\n      \n      <!-- Apply to entities (when card has multiple entities) - same dropdown as in Add Slot popup -->\n      <div class="slot-entities-wrap">\n        <div class="slot-entities-label">\n          <ha-icon icon="mdi:format-list-checks"></ha-icon>\n          <span>Apply to entities</span>\n        </div>\n        <div class="slot-entities-trigger" tabindex="0" role="combobox">\n          <div class="slot-entities-chips"></div>\n          <ha-icon class="slot-entities-caret" icon="mdi:chevron-down"></ha-icon>\n        </div>\n        <div class="slot-entities-dropdown">\n          <label class="slot-entity-row slot-entity-select-all">\n            <input type="checkbox" class="slot-entities-select-all-input">\n            <span class="slot-entity-name">Select all</span>\n          </label>\n          <!-- SHARED:entities-selector -->\n<div class="entities-selector-list"></div>\n<template class="entities-selector-row-tpl">\n  <label class="entities-selector-row">\n    <input type="checkbox" name="entities-selector-entity" value="">\n    <span class="entities-selector-entity-name"></span>\n  </label>\n</template>\n<!-- END:entities-selector -->\n        </div>\n      </div>\n      \n      <!-- SHARED:weekday-selector -->\n<!-- Weekday Selection Component (universal - without popup-field) -->\n<div class="weekday-mode-selector">\n  <button type="button" class="weekday-mode-btn active" data-mode="everyday">Everyday</button>\n  <button type="button" class="weekday-mode-btn" data-mode="weekdays">Weekdays</button>\n  <button type="button" class="weekday-mode-btn" data-mode="custom">Custom</button>\n</div>\n<div class="popup-weekdays hidden" id="popup-weekdays-custom">\n  <div class="popup-weekday" data-day="0">Mon</div>\n  <div class="popup-weekday" data-day="1">Tue</div>\n  <div class="popup-weekday" data-day="2">Wed</div>\n  <div class="popup-weekday" data-day="3">Thu</div>\n  <div class="popup-weekday" data-day="4">Fri</div>\n  <div class="popup-weekday" data-day="5">Sat</div>\n  <div class="popup-weekday" data-day="6">Sun</div>\n</div>\n<!-- END:weekday-selector -->\n      \n      <button class="slot-delete" data-action="delete-item">\n        <ha-icon icon="mdi:delete"></ha-icon>\n        <span>Remove {{SLOT_NAME_REMOVE}}</span>\n      </button>\n    </div>\n  </div>\n</template>\n`;
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
      
      // Normalize duration configuration
      // Support both duration_range: [min, max] and separate min_duration/max_duration
      // Duration is optional for climate cards, but if specified, normalize it
      if (config.duration_range && Array.isArray(config.duration_range) && config.duration_range.length === 2) {
        this._config.min_duration = config.duration_range[0];
        this._config.max_duration = config.duration_range[1];
      } else {
        // Fallback to defaults if not specified
        this._config.min_duration = config.min_duration || 15;
        this._config.max_duration = config.max_duration || 1440;
      }
      // duration_step fallback
      this._config.duration_step = config.duration_step || 15;
      
      this._configError = null;
      if (this._hass && this.shadowRoot) {
        this.render().catch(err => {});
      }
    } catch (err) {
      // Never throw from setConfig - it breaks the editor
      this._config = config || {};
      // Duration configuration defaults with fallback
      if (config?.duration_range && Array.isArray(config.duration_range) && config.duration_range.length === 2) {
        this._config.min_duration = config.duration_range[0];
        this._config.max_duration = config.duration_range[1];
      } else {
        this._config.min_duration = this._config.min_duration || 15;
        this._config.max_duration = this._config.max_duration || 1440;
      }
      this._config.duration_step = this._config.duration_step || 15;
      this._configError = 'Configuration error';
      if (this.shadowRoot) {
        this._showError('Configuration error. Please check card settings.');
      }
    }
  }
  
  _showError(message) {
    // Ensure shadowRoot exists (should be created in constructor, but check anyway)
    if (!this.shadowRoot) {
      try {
        this.attachShadow({ mode: 'open' });
      } catch (e) {
        return;
      }
    }
    
    const errorHtml = `
      <div style="padding: 16px; text-align: center; color: var(--error-color, #f44336);">
        <ha-icon icon="mdi:alert-circle" style="font-size: 48px; margin-bottom: 16px;"></ha-icon>
        <div style="font-size: 16px; font-weight: 500; margin-bottom: 8px;">Configuration Error</div>
        <div style="font-size: 14px; color: var(--secondary-text-color, #888);">${message}</div>
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
          });
        } catch (e) {
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
    
    } catch (err) {}
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
      // Dedupe by (time, weekdays): when both temp and real slot exist, show only one (prefer real)
      const byKey = new Map();
      for (const item of filtered) {
        const key = (item.time || '') + '|' + JSON.stringify(item.weekdays || []);
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
      modePrefix = `${hvacMode.charAt(0).toUpperCase() + hvacMode.slice(1)}, `;
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
        alert('Integration service not available. Please check:\n1. Integration is installed\n2. Integration is enabled\n3. Home Assistant is restarted after integration installation');
      } else {
        // Extract user-friendly error message
        let userMsg = errorMsg;
        // Remove technical details if present
        if (userMsg.includes('for dictionary value')) {
          userMsg = userMsg.split('for dictionary value')[0].trim();
        }
        // Remove old validation messages
        if (userMsg.includes('[30, 60]')) {
          userMsg = userMsg.replace(/\[30, 60\]/g, '');
          userMsg = userMsg.replace(/value must be one of/, 'Invalid duration value');
        }
        alert(`Error: ${userMsg}`);
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
        } catch (e) {}
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
      } catch (e) {}
      setTimeout(() => { if (this._hass) this.hass = { ...this._hass }; }, 500);
    }
  }

  _getPopupSelectedEntityIds() {
    const entities = this._getEntities();
    if (entities.length === 0) return [];
    const container = this.shadowRoot.getElementById('popup-entities-container');
    if (container && container.style.display !== 'none') {
      const listEl = container.querySelector('.entities-selector-list');
      if (listEl) {
        const checked = listEl.querySelectorAll('input[name="entities-selector-entity"]:checked');
        return Array.from(checked).map(el => el.value);
      }
    }
    return entities;
  }

  _updateHvacModeWarning() {
    const warningEl = this.shadowRoot.getElementById('popup-hvac-mode-warning');
    const hvacModeSelect = this.shadowRoot.getElementById('popup-hvac-mode');
    const container = this.shadowRoot.getElementById('popup-entities-container');
    const listEl = container ? container.querySelector('.entities-selector-list') : null;
    if (!warningEl || !hvacModeSelect || !this._hass) return;
    const mode = hvacModeSelect.value;
    if (!mode) {
      warningEl.textContent = '';
      if (listEl) listEl.querySelectorAll('.entities-selector-row').forEach(row => { row.classList.remove('entities-selector-row-unsupported'); const inp = row.querySelector('input'); if (inp) inp.disabled = false; });
      return;
    }
    const entities = this._getEntities();
    const unsupportedNames = [];
    const unsupportedIds = new Set();
    entities.forEach(entityId => {
      const state = this._hass.states[entityId];
      const modes = state?.attributes?.hvac_modes;
      if (Array.isArray(modes) && !modes.includes(mode)) {
        unsupportedIds.add(entityId);
        const name = state?.attributes?.friendly_name || entityId;
        unsupportedNames.push(name);
      }
    });
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
    if (unsupportedNames.length === 0) {
      warningEl.textContent = '';
    } else {
      warningEl.textContent = unsupportedNames.length === 1
        ? `This mode is not supported for: ${unsupportedNames[0]}`
        : `This mode is not supported for: ${unsupportedNames.join(', ')}`;
    }
    this._updateEntitiesChips();
    const selectAll = this.shadowRoot.getElementById('popup-entities-select-all');
    if (listEl && selectAll) {
      const all = listEl.querySelectorAll('.entities-selector-row:not(.entities-selector-row-unsupported) input[name="entities-selector-entity"]');
      const checkedCount = Array.from(all).filter(inp => inp.checked).length;
      selectAll.checked = checkedCount === all.length;
      selectAll.indeterminate = checkedCount > 0 && checkedCount < all.length;
    }
  }

  _updateEntitiesChips() {
    const chipsEl = this.shadowRoot.getElementById('popup-entities-chips');
    if (!chipsEl) return;
    const container = this.shadowRoot.getElementById('popup-entities-container');
    const listEl = container ? container.querySelector('.entities-selector-list') : null;
    if (!listEl) return;
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
  }

  _updateSlotEntitiesChips(slotEntitiesWrap) {
    if (!slotEntitiesWrap) return;
    const chipsEl = slotEntitiesWrap.querySelector('.slot-entities-chips');
    const listEl = slotEntitiesWrap.querySelector('.entities-selector-list');
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
    this._updateSlotTitleFromEntities(slotEntitiesWrap, names);
  }

  /** Update slot header name and remove button text to match current entity selection and optional custom title. */
  _updateSlotTitleFromEntities(slotEntitiesWrap, entityNames) {
    if (!slotEntitiesWrap) return;
    const slotCard = slotEntitiesWrap.closest('.slot-card');
    if (!slotCard) return;
    const slotCards = this.shadowRoot.querySelectorAll('.slot-card');
    const slotNumber = slotCards.length ? Array.from(slotCards).indexOf(slotCard) + 1 : 1;
    const entityLabel = (entityNames && entityNames.length > 0) ? entityNames.join(', ') : '';
    const titleInput = slotCard.querySelector('.slot-title-input');
    const baseName = (titleInput && titleInput.value.trim()) || `Slot ${slotNumber}`;
    const slotName = baseName + (entityLabel ? ` (${entityLabel})` : '');
    const nameEl = slotCard.querySelector('.slot-name');
    if (nameEl) nameEl.textContent = slotName;
    const removeSpan = slotCard.querySelector('.slot-delete span');
    if (removeSpan) removeSpan.textContent = 'Remove ' + baseName;
  }

  _updateSlotEntitiesForMode(slotEntitiesWrap, itemEl) {
    if (!slotEntitiesWrap || !this._hass) return;
    const listEl = slotEntitiesWrap.querySelector('.entities-selector-list');
    const hvacSelect = itemEl.querySelector('[data-action="update-hvac-mode"]');
    const mode = hvacSelect && hvacSelect.value ? hvacSelect.value : null;
    if (!listEl || !mode) return;
    listEl.querySelectorAll('.entities-selector-row').forEach(row => {
      const input = row.querySelector('input[name="entities-selector-entity"]');
      if (!input) return;
      const entityId = input.value;
      const state = this._hass.states[entityId];
      const modes = state?.attributes?.hvac_modes;
      const unsupported = Array.isArray(modes) && !modes.includes(mode);
      row.classList.toggle('entities-selector-row-unsupported', unsupported);
      input.disabled = !!unsupported;
      if (unsupported) input.checked = false;
    });
    this._updateSlotEntitiesChips(slotEntitiesWrap);
    const selectAllInput = slotEntitiesWrap.querySelector('.slot-entities-select-all-input');
    if (selectAllInput && listEl) {
      const all = listEl.querySelectorAll('input[name="entities-selector-entity"]:not(:disabled)');
      const checkedCount = Array.from(all).filter(inp => inp.checked).length;
      selectAllInput.checked = all.length > 0 && checkedCount === all.length;
      selectAllInput.indeterminate = checkedCount > 0 && checkedCount < all.length;
    }
  }

  _entitiesDropdownCloseOnOutside(e) {
    const container = this.shadowRoot.getElementById('popup-entities-container');
    const dropdown = this.shadowRoot.getElementById('popup-entities-dropdown');
    const trigger = this.shadowRoot.getElementById('popup-entities-trigger');
    if (!container || !dropdown || !trigger) return;
    if (container.contains(e.target)) return;
    dropdown.classList.remove('open');
    trigger.classList.remove('open');
    document.removeEventListener('click', this._boundEntitiesCloseOnOutside);
  }

  _attachEntitiesDropdownListeners() {
    const trigger = this.shadowRoot.getElementById('popup-entities-trigger');
    const dropdown = this.shadowRoot.getElementById('popup-entities-dropdown');
    const selectAll = this.shadowRoot.getElementById('popup-entities-select-all');
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

    if (selectAll && listEl) {
      selectAll.closest('label').onclick = (e) => e.stopPropagation();
      selectAll.onchange = () => {
        const checked = selectAll.checked;
        listEl.querySelectorAll('.entities-selector-row input[name="entities-selector-entity"]:not([disabled])').forEach(inp => { inp.checked = checked; });
        this._updateEntitiesChips();
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
          this._updateHvacModeWarning();
        });
      });
    }
  }

  _openAddPopup() {
    const popup = this.shadowRoot.getElementById('add-popup');
    if (popup) {
      popup.style.display = 'flex';
      const hoursSelect = this.shadowRoot.getElementById('popup-time-hours');
      const minutesSelect = this.shadowRoot.getElementById('popup-time-minutes');
      const hvacModeSelect = this.shadowRoot.getElementById('popup-hvac-mode');
      const durationEnabledCheckbox = this.shadowRoot.getElementById('popup-duration-enabled');
      const durationWrapper = this.shadowRoot.getElementById('popup-duration-wrapper');
      const entitiesContainer = this.shadowRoot.getElementById('popup-entities-container');
      const entitiesList = this.shadowRoot.getElementById('popup-entities');
      const now = new Date();
      const hour = String(now.getHours()).padStart(2, '0');
      const minute = String(Math.round(now.getMinutes() / 5) * 5).padStart(2, '0');
      if (hoursSelect) hoursSelect.value = hour;
      if (minutesSelect) minutesSelect.value = minute;
      if (durationEnabledCheckbox) durationEnabledCheckbox.checked = false;
      if (durationWrapper) durationWrapper.style.display = 'none';
      DurationSelector.reset(this.shadowRoot, null);

      const entities = this._getEntities();
      const dropdown = this.shadowRoot.getElementById('popup-entities-dropdown');
      if (dropdown && entities.length > 1) {
        entitiesContainer.style.display = '';
        const trigger = this.shadowRoot.getElementById('popup-entities-trigger');
        if (trigger) trigger.classList.remove('open');
        dropdown.classList.remove('open');
        const selectAllInput = this.shadowRoot.getElementById('popup-entities-select-all');
        if (selectAllInput) { selectAllInput.checked = true; selectAllInput.indeterminate = false; }
        const hvacModeSelect = this.shadowRoot.getElementById('popup-hvac-mode');
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
            onCheck: () => { this._updateEntitiesChips(); this._updateHvacModeWarning(); },
            onUncheck: () => { this._updateEntitiesChips(); this._updateHvacModeWarning(); },
            isEntityDisabled
          });
        }
        this._updateEntitiesChips();
        this._updateHvacModeWarning();
        this._attachEntitiesDropdownListeners();
      } else if (entitiesContainer) {
        entitiesContainer.style.display = 'none';
      }

      if (hvacModeSelect && this._config?.entity && this._hass) {
        const entityState = this._hass.states[this._config.entity];
        if (entityState?.attributes?.hvac_modes) {
          const hvacModes = entityState.attributes.hvac_modes.filter(mode => mode !== 'off');
          hvacModeSelect.innerHTML = '';
          hvacModes.forEach(mode => {
            const option = document.createElement('option');
            option.value = mode;
            option.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
            hvacModeSelect.appendChild(option);
          });
          if (hvacModes.length > 0) hvacModeSelect.value = hvacModes[0];
        }
      }
      this._updateHvacModeWarning();
    }
  }

  _closeAddPopup() {
    const popup = this.shadowRoot.getElementById('add-popup');
    if (popup) {
      popup.style.display = 'none';
    }
    const trigger = this.shadowRoot.getElementById('popup-entities-trigger');
    const dropdown = this.shadowRoot.getElementById('popup-entities-dropdown');
    if (trigger) trigger.classList.remove('open');
    if (dropdown) dropdown.classList.remove('open');
    if (this._boundEntitiesCloseOnOutside) {
      document.removeEventListener('click', this._boundEntitiesCloseOnOutside);
      this._boundEntitiesCloseOnOutside = null;
    }
  }


  async _saveSlot() {
    const hoursSelect = this.shadowRoot.getElementById('popup-time-hours');
    const minutesSelect = this.shadowRoot.getElementById('popup-time-minutes');
    const hvacModeSelect = this.shadowRoot.getElementById('popup-hvac-mode');
    const titleInput = this.shadowRoot.getElementById('popup-title');
    const durationEnabledCheckbox = this.shadowRoot.getElementById('popup-duration-enabled');
    const durationWrapper = this.shadowRoot.getElementById('popup-duration-wrapper');
    const selectedDays = WeekdaySelector.getSelectedWeekdays(this.shadowRoot);
    
    // Get duration only if checkbox is enabled
    let duration = null;
    if (durationEnabledCheckbox && durationEnabledCheckbox.checked && durationWrapper) {
      duration = DurationSelector.getSelectedDuration(durationWrapper);
    }

    if (!hoursSelect || !minutesSelect) return;
    if (selectedDays.length === 0) {
      alert('Please select at least one day');
      return;
    }
    
    if (!hvacModeSelect || !hvacModeSelect.value) {
      alert('Please select an HVAC mode');
      return;
    }

    const time = `${hoursSelect.value}:${minutesSelect.value}`;
    const hvacMode = hvacModeSelect.value;
    const title = titleInput?.value?.trim() || null;

    const entities = this._getEntities();
    if (!this._config || entities.length === 0) return;

    const selectedEntityIds = this._getPopupSelectedEntityIds();
    if (selectedEntityIds.length === 0) {
      alert('Select at least one entity for this slot.');
      return;
    }

    const durationValue = duration && duration !== '' ? parseInt(duration) : null;
    const climateServicesByEntity = {};
    selectedEntityIds.forEach(eid => {
      climateServicesByEntity[eid] = ScheduleHelper.createClimateServices(eid, hvacMode);
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
      alert('Failed to add slot: ' + (err.message || err));
      return;
    }

    this._closeAddPopup();
  }

  _formatTime(timeStr) {
    // Convert 24h to 12h format for display
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
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
          
          // Check if we need to start seconds countdown timer
          // If nextRun contains "in Xs" (seconds), we need to update every second
          if (nextRun.includes('in ') && nextRun.includes('s')) {
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
    } catch (err) {}
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
    } catch (err) {}
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
        statusPrefix = updatedItem.enabled ? hvacMode.charAt(0).toUpperCase() + hvacMode.slice(1) : 'Off';
      }
      
      const durationStr = this._formatDuration(updatedItem.duration);
      const slotStatus = `${statusPrefix}, ${daysText} on ${updatedItem.time}${durationStr}`;
      statusEl.textContent = slotStatus;
    }

    // Update time selects
    const [hours, minutes] = updatedItem.time.split(':');
    const roundedMinutes = String(Math.round(parseInt(minutes || 0) / 5) * 5).padStart(2, '0');
    const hoursSelect = slotCard.querySelector('.slot-time-hours');
    const minutesSelect = slotCard.querySelector('.slot-time-minutes');
    if (hoursSelect && hoursSelect.value !== hours) {
      hoursSelect.value = hours;
    }
    if (minutesSelect && minutesSelect.value !== roundedMinutes) {
      minutesSelect.value = roundedMinutes;
    }

    // Update duration select (only if duration is set)
    const durationEl = slotCard.querySelector('.slot-duration');
    if (durationEl) {
      if (updatedItem.duration) {
        durationEl.style.display = '';
        DurationSelector.setDurationInSlot(slotCard, updatedItem.duration, this._config);
      } else {
        durationEl.style.display = 'none';
      }
    }

    // Update HVAC mode select - use data-action selector to match template
    const hvacModeSelect = slotCard.querySelector('[data-action="update-hvac-mode"]');
    if (hvacModeSelect) {
      const currentHvacMode = updatedItem.service_start?.value?.hvac_mode;
      if (currentHvacMode && hvacModeSelect.value !== currentHvacMode) {
        hvacModeSelect.value = currentHvacMode;
        // Trigger input event for visual update without change event
        hvacModeSelect.dispatchEvent(new Event('input', { bubbles: false }));
      }
    }

    // Update weekday selector state
    WeekdaySelector.setSelectedWeekdays(this.shadowRoot, updatedItem.weekdays, slotCard);

    // Update slot title input and slot name in header
    const titleInput = slotCard.querySelector('.slot-title-input');
    if (titleInput && titleInput.value !== (updatedItem.title || '')) {
      titleInput.value = updatedItem.title || '';
    }
    const slotNameEl = slotCard.querySelector('.slot-name');
    const removeSpan = slotCard.querySelector('.slot-delete span');
    if (slotNameEl || removeSpan) {
      const entities = this._getEntities();
      const bridgeState = this._getBridgeState();
      const allItems = bridgeState?.attributes?.items || [];
      const entitySet = new Set(entities);
      const sameSlotItems = allItems.filter(i =>
        i && i.temporary !== true && entitySet.has(i.entity_id) &&
        i.time === updatedItem.time && JSON.stringify(i.weekdays || []) === JSON.stringify(updatedItem.weekdays || [])
      );
      const entityLabel = sameSlotItems.length > 0
        ? sameSlotItems.map(i => this._hass?.states?.[i.entity_id]?.attributes?.friendly_name || i.entity_id).join(', ')
        : '';
      const slotNumber = Array.from(this.shadowRoot.querySelectorAll('.slot-card')).indexOf(slotCard) + 1;
      const baseName = updatedItem.title || `Slot ${slotNumber}`;
      const slotName = baseName + (entityLabel ? ` (${entityLabel})` : '');
      if (slotNameEl) slotNameEl.textContent = slotName;
      if (removeSpan) removeSpan.textContent = 'Remove ' + baseName;
    }

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

  async _updateItem(itemId, updates) {
    const bridgeState = this._getBridgeState();
    const isSlotWideUpdate = bridgeState && (updates.time !== undefined || updates.duration !== undefined || updates.weekdays !== undefined || updates.title !== undefined);
    const itemIdsToUpdate = isSlotWideUpdate && bridgeState ? this._getSameSlotItemIds(bridgeState, itemId) : [itemId];

    // Optimistically update (using overlay, no hass mutation)
    if (this._hass && this._bridgeSensor && bridgeState?.attributes?.items) {
      const items = [...bridgeState.attributes.items];
      let anyUpdated = false;
      for (const id of itemIdsToUpdate) {
        const itemIndex = items.findIndex(item => item && item.id === id);
        if (itemIndex === -1) continue;
        const currentItem = items[itemIndex];
        const updatedItem = { ...currentItem };
        if (updates.service_start) {
          updatedItem.service_start = updates.service_start;
        }
        if (updates.service_end !== undefined) {
          if (updates.service_end === null) {
            delete updatedItem.service_end;
          } else {
            updatedItem.service_end = updates.service_end;
          }
        }
        Object.keys(updates).forEach(key => {
          if (key !== 'service_start' && key !== 'service_end') {
            updatedItem[key] = updates[key];
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
        const firstUpdated = items.find(i => i && itemIdsToUpdate.includes(i.id));
        if (firstUpdated) {
          this._updateSlotElement(itemId, firstUpdated);
        }
        this._updateHeaderStatus();
        this.hass = { ...this._hass };
        this._syncAllCardsForEntity(itemId, firstUpdated || bridgeState.attributes.items.find(i => i && i.id === itemId), this._optimisticBridgeState);
      }
    }

    for (const id of itemIdsToUpdate) {
      const serviceData = { id, ...updates };
      await this._callService('update_item', serviceData);
    }
    
    if (this._hass && this._bridgeSensor) {
      try {
        await this._hass.callService('homeassistant', 'update_entity', {
          entity_id: this._bridgeSensor
        });
      } catch (e) {
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
          this.render().catch(() => {});
        }
      }, 500);
    }
  }

  /** Delete all items in the same slot (same time + weekdays) so the whole slot is removed. */
  async _deleteSlot(itemId) {
    const bridgeState = this._getBridgeState();
    const itemIdsToDelete = bridgeState ? this._getSameSlotItemIds(bridgeState, itemId) : [itemId];
    for (const id of itemIdsToDelete) {
      await this._callService('delete_item', { id });
    }
    if (this._hass && this._bridgeSensor) {
      try {
        await this._hass.callService('homeassistant', 'update_entity', {
          entity_id: this._bridgeSensor
        });
      } catch (e) {
      }
      setTimeout(() => {
        if (this._hass) {
          try {
            this._hass.callService('homeassistant', 'update_entity', {
              entity_id: this._bridgeSensor
            });
          } catch (e) {
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
      }
      setTimeout(() => {
        if (this._hass) {
          try {
            this._hass.callService('homeassistant', 'update_entity', {
              entity_id: this._bridgeSensor
            });
          } catch (e) {
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
    const styleContent = `/**\n * Climate Scheduler Card - Styles\n * All variables in :host; common/slot/popup/duration use them (overridable via --homie-slots-*).\n */\n\n:host {\n  display: block;\n  padding: 0;\n  overflow: visible;\n  background: transparent;\n  --circular-button-size: var(--mdc-icon-button-size, 40px);\n\n  /* Card (header, slot card) */\n  --_accent: var(--homie-slots-accent, var(--primary-color, #03a9f4));\n  --_bg: var(--homie-slots-bg, var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9))));\n  --_radius: var(--homie-slots-radius, var(--ha-card-border-radius, 8px));\n  --_shadow: var(--homie-slots-shadow, var(--ha-card-box-shadow, 0 2px 8px rgba(0, 0, 0, 0.1)));\n  --_text: var(--homie-slots-text, var(--primary-text-color, #212121));\n  --_text-secondary: var(--homie-slots-text-secondary, var(--secondary-text-color, #757575));\n  --_text-on-accent: var(--homie-slots-text-on-accent, var(--text-primary-on-background, #ffffff));\n  --_disabled-color: var(--homie-slots-disabled, var(--disabled-color, var(--disabled-text-color, #9e9e9e)));\n\n  /* Select */\n  --_bg-select: var(--homie-slots-bg-select, var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9))));\n  --_divider-select: var(--homie-slots-divider-select, var(--divider-color, rgba(0, 0, 0, 0.12)));\n  --_text-select: var(--homie-slots-text-select, var(--primary-text-color, #212121));\n  --_radius-select: var(--homie-slots-radius-select, var(--mdc-shape-small, 4px));\n  --_focus-ring: var(--homie-slots-focus-ring, 0 0 0 2px rgba(3, 169, 244, 0.1));\n\n  /* Input, buttons, slot, weekday, duration */\n  --_padding-input-vertical: var(--homie-slots-padding-input-vertical, var(--mdc-shape-small, 4px));\n  --_padding-input-horizontal: var(--homie-slots-padding-input-horizontal, var(--mdc-shape-small, 8px));\n  --_border-input: var(--homie-slots-border-input, 1px solid var(--_divider));\n  --_radius-input: var(--homie-slots-radius-input, var(--_radius-small));\n  --_divider: var(--homie-slots-divider, var(--divider-color, rgba(0, 0, 0, 0.12)));\n  --_radius-small: var(--homie-slots-radius-small, var(--mdc-shape-small, 4px));\n  --_radius-medium: var(--homie-slots-radius-medium, var(--mdc-shape-medium, 8px));\n  --_secondary-bg: var(--homie-slots-secondary-bg, var(--secondary-background-color, #f5f5f5));\n  --_error-color: var(--homie-slots-error-color, var(--error-color, #f44336));\n\n  /* Button outline */\n  --_button-outline-padding: var(--homie-slots-button-outline-padding, var(--mdc-button-horizontal-padding, 16px));\n  --_button-outline-margin-top: var(--homie-slots-button-outline-margin-top, var(--mdc-layout-grid-gutter, 12px));\n  --_button-outline-radius: var(--homie-slots-button-outline-radius, var(--_radius-medium));\n  --_button-outline-bg: var(--homie-slots-button-outline-bg, transparent);\n  --_button-outline-border: var(--homie-slots-button-outline-border, 2px solid var(--_accent));\n  --_button-outline-color: var(--homie-slots-button-outline-color, var(--_accent));\n  --_button-outline-font-size: var(--homie-slots-button-outline-font-size, var(--mdc-typography-button-font-size, 14px));\n  --_button-outline-font-weight: var(--homie-slots-button-outline-font-weight, var(--mdc-typography-button-font-weight, 900));\n  --_button-outline-letter-spacing: var(--homie-slots-button-outline-letter-spacing, var(--mdc-typography-button-letter-spacing, 0em));\n  --_button-outline-min-height: var(--homie-slots-button-outline-min-height, var(--mdc-button-height, 36px));\n  --_button-outline-hover-shadow: var(--homie-slots-button-outline-hover-shadow, 0 2px 8px rgba(3, 169, 244, 0.3));\n  --_button-outline-active-transform: var(--homie-slots-button-outline-active-transform, scale(0.98));\n  --_button-outline-active-shadow: var(--homie-slots-button-outline-active-shadow, 0 1px 4px rgba(3, 169, 244, 0.2));\n\n  /* Popup */\n  --_popup-bg: var(--homie-slots-popup-background, var(--ha-dialog-background, var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9)))));\n  --_popup-color: var(--homie-slots-popup-color, var(--primary-text-color, #212121));\n  --_popup-backdrop-filter: var(--homie-slots-popup-backdrop-filter, var(--ha-card-backdrop-filter, none));\n  --_popup-box-shadow: var(--homie-slots-popup-box-shadow, var(--ha-card-box-shadow, none));\n  --_popup-border-radius: var(--homie-slots-popup-border-radius, var(--ha-card-border-radius, 16px));\n  --_popup-width: var(--mdc-dialog-width, 90%);\n  --_popup-max-width: var(--mdc-dialog-max-width, 400px);\n  --_popup-min-width: var(--mdc-dialog-min-width, 0px);\n  --_popup-max-height: var(--mdc-dialog-max-height, 90vh);\n\n  color: var(--_text);\n}\n\n/* === Common / slot / popup / duration (use :host vars above) === */\n.homie-select {\n  background: var(--_bg-select);\n  border: 1px solid var(--_divider-select);\n  border-radius: var(--_radius-select);\n  color: var(--_text-select);\n  font-size: 14px;\n  font-family: inherit;\n  cursor: pointer;\n  appearance: none;\n  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23999999' d='M6 9L1 4h10z'/%3E%3C/svg%3E");\n  background-repeat: no-repeat;\n  background-position: right var(--mdc-shape-small, 6px) center;\n  background-size: 12px;\n  transition: border-color 0.2s, box-shadow 0.2s;\n  padding: var(--_padding-input-vertical) var(--_padding-input-horizontal);\n  padding-right: calc(var(--_padding-input-horizontal) * 2 + 12px);\n}\n@media (prefers-color-scheme: dark) {\n  .homie-select {\n    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E");\n  }\n}\n.homie-select:focus {\n  outline: none;\n  border-color: var(--_accent);\n  box-shadow: var(--_focus-ring);\n}\n.homie-select option {\n  background: var(--_bg-select);\n  color: var(--_text-select);\n}\n.homie-input {\n  width: 100%;\n  background: var(--_bg);\n  border: var(--_border-input);\n  border-radius: var(--_radius-input);\n  color: var(--_text);\n  font-size: 14px;\n  font-family: inherit;\n  padding: var(--_padding-input-vertical) var(--_padding-input-horizontal);\n  transition: border-color 0.2s, box-shadow 0.2s;\n  box-sizing: border-box;\n}\n.homie-input:focus {\n  outline: none;\n  border-color: var(--_accent);\n  box-shadow: var(--_focus-ring);\n}\n.homie-input::placeholder {\n  color: var(--_text-secondary);\n  opacity: 0.7;\n}\n.button-outline {\n  width: 100%;\n  padding: var(--_button-outline-padding) var(--_button-outline-padding);\n  margin-top: var(--_button-outline-margin-top);\n  border-radius: var(--_button-outline-radius);\n  background: var(--_button-outline-bg);\n  border: var(--_button-outline-border);\n  color: var(--_button-outline-color);\n  font-size: var(--_button-outline-font-size);\n  font-weight: var(--_button-outline-font-weight);\n  letter-spacing: var(--_button-outline-letter-spacing);\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: all 0.2s;\n  -webkit-tap-highlight-color: transparent;\n  min-height: var(--_button-outline-min-height);\n}\n.button-outline:hover {\n  background: var(--_accent);\n  color: var(--_text-on-accent);\n  box-shadow: var(--_button-outline-hover-shadow);\n}\n.button-outline:active {\n  transform: var(--_button-outline-active-transform);\n  box-shadow: var(--_button-outline-active-shadow);\n}\n.slot-expandable {\n  max-height: 0;\n  overflow: hidden;\n  transition: max-height 0.3s ease-out;\n}\n.slot-card.expanded .slot-expandable {\n  max-height: 75vh;\n  overflow-y: auto;\n  overflow-x: visible;\n  transition: max-height 0.3s ease-in;\n  padding: var(--ha-card-header-padding, 16px) 0;\n  display: flex;\n  flex-direction: column;\n  gap: var(--mdc-layout-grid-gutter, 12px);\n}\n.slot-details {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 16px);\n  margin-bottom: var(--mdc-layout-grid-gutter, 12px);\n  flex-wrap: wrap;\n}\n.slot-time, .slot-duration {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 6px);\n  font-size: 14px;\n}\n.slot-time ha-icon, .slot-duration ha-icon {\n  --mdc-icon-size: 22px;\n  opacity: 0.9;\n}\n.slot-time .time-picker-separator {\n  color: var(--_text);\n}\n.slot-delete {\n  width: 100%;\n  padding: var(--mdc-shape-small, 10px);\n  margin-top: var(--mdc-layout-grid-gutter, 12px);\n  border-radius: var(--_radius-medium);\n  background: var(--_secondary-bg);\n  border: 1px solid var(--_divider);\n  color: var(--_error-color);\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: var(--mdc-layout-grid-gutter, 8px);\n  transition: all 0.2s;\n  font-size: 14px;\n  font-weight: 500;\n  font-family: inherit;\n  flex-shrink: 0;\n}\n.slot-delete:active { transform: scale(0.98); }\n.slot-delete ha-icon { --mdc-icon-size: 22px; }\n.empty-state {\n  text-align: center;\n  padding: 48px 16px;\n  color: var(--_text-secondary);\n}\n.empty-state ha-icon { --mdc-icon-size: 48px; opacity: 0.3; margin-bottom: 16px; }\n.empty-text { font-size: 14px; line-height: 20px; }\n.popup-overlay {\n  position: fixed;\n  top: 0; left: 0; right: 0; bottom: 0;\n  background: rgba(0, 0, 0, 0.5);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  z-index: 1000;\n  animation: fadeIn 0.2s;\n}\n@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }\n.popup-header {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 12px);\n  padding: var(--ha-card-header-padding, 20px);\n  border-bottom: 1px solid var(--_divider);\n}\n.popup-header ha-icon { --mdc-icon-size: 28px; color: var(--_accent); }\n.popup-title { flex: 1; font-size: 18px; font-weight: 500; color: var(--_text); }\n.popup-close {\n  width: var(--circular-button-size, var(--mdc-icon-button-size, 40px));\n  height: var(--circular-button-size, var(--mdc-icon-button-size, 40px));\n  min-width: var(--circular-button-size, var(--mdc-icon-button-size, 40px));\n  min-height: var(--circular-button-size, var(--mdc-icon-button-size, 40px));\n  border-radius: 50%;\n  background: transparent;\n  border: none;\n  color: var(--_text-secondary);\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: all 0.2s;\n}\n.popup-close ha-icon { --mdc-icon-size: 24px; }\n.popup-body { padding: var(--ha-card-header-padding, 20px); }\n.popup-field { margin-bottom: 20px; }\n.popup-field:last-child { margin-bottom: 0; }\n.popup-field-mode .popup-mode-select,\n#popup-hvac-mode {\n  width: 100%;\n  box-sizing: border-box;\n}\n.popup-hvac-mode-warning {\n  margin-top: 8px;\n  font-size: 12px;\n  color: var(--_error-color);\n  line-height: 1.4;\n}\n.popup-hvac-mode-warning:empty { display: none; }\n/* Entities multi-select: compact trigger + dropdown */\n.popup-entities-wrap {\n  position: relative;\n}\n.popup-entities-trigger {\n  margin-top: 8px;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-height: 40px;\n  padding: 6px 12px;\n  border-radius: var(--_radius-medium);\n  border: 1px solid var(--_divider);\n  background: var(--_bg-select);\n  cursor: pointer;\n  transition: border-color 0.2s, box-shadow 0.2s;\n}\n.popup-entities-trigger:hover,\n.popup-entities-trigger.open {\n  border-color: var(--_accent);\n  box-shadow: var(--_focus-ring);\n}\n.popup-entities-chips {\n  flex: 1;\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  align-items: center;\n  min-height: 24px;\n}\n.popup-entity-chip {\n  display: inline-flex;\n  align-items: center;\n  padding: 2px 8px;\n  border-radius: var(--_radius-small);\n  background: var(--_secondary-bg);\n  border: 1px solid var(--_divider);\n  font-size: 12px;\n  color: var(--_text);\n  white-space: nowrap;\n}\n.popup-entities-caret {\n  --mdc-icon-size: 20px;\n  color: var(--_text-secondary);\n  flex-shrink: 0;\n  transition: transform 0.2s;\n}\n.popup-entities-trigger.open .popup-entities-caret {\n  transform: rotate(180deg);\n}\n.popup-entities-dropdown {\n  display: none;\n  position: absolute;\n  left: 0;\n  right: 0;\n  top: 100%;\n  margin-top: 4px;\n  z-index: 10;\n  flex-direction: column;\n  border-radius: var(--_radius-medium);\n  border: 1px solid var(--_divider);\n  background: var(--_popup-bg);\n  box-shadow: var(--_popup-box-shadow);\n  max-height: 220px;\n  overflow: hidden;\n}\n.popup-entities-dropdown.open {\n  display: flex;\n}\n.popup-entity-select-all {\n  border-bottom: 1px solid var(--_divider);\n  flex-shrink: 0;\n}\n.popup-entities-list {\n  overflow-y: auto;\n  overflow-x: hidden;\n  display: flex;\n  flex-direction: column;\n  flex: 1;\n  min-height: 0;\n}\n.popup-entity-row {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  padding: 10px 16px;\n  cursor: pointer;\n  border-bottom: 1px solid var(--_divider);\n  transition: background 0.2s;\n  min-height: 44px;\n  box-sizing: border-box;\n}\n.popup-entity-row:last-child {\n  border-bottom: none;\n}\n.popup-entity-row:hover {\n  background: var(--_secondary-bg);\n}\n.popup-entity-row.hidden {\n  display: none;\n}\n.popup-entity-row-unsupported {\n  opacity: 0.5;\n  pointer-events: none;\n}\n.popup-entity-row-unsupported .popup-entity-name::after {\n  content: ' (not supported for this mode)';\n  font-size: 11px;\n  color: var(--_text-secondary);\n  font-weight: 400;\n}\n/* Shared entities-selector inside popup dropdown */\n.popup-entities-dropdown .entities-selector-list {\n  overflow-y: auto;\n  overflow-x: hidden;\n  display: flex;\n  flex-direction: column;\n  flex: 1;\n  min-height: 0;\n}\n.popup-entities-dropdown .entities-selector-row {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  padding: 10px 16px;\n  cursor: pointer;\n  border-bottom: 1px solid var(--_divider);\n  transition: background 0.2s;\n  min-height: 44px;\n  box-sizing: border-box;\n}\n.popup-entities-dropdown .entities-selector-row:last-child {\n  border-bottom: none;\n}\n.popup-entities-dropdown .entities-selector-row:hover {\n  background: var(--_secondary-bg);\n}\n.popup-entities-dropdown .entities-selector-row.hidden {\n  display: none;\n}\n.popup-entities-dropdown .entities-selector-row-unsupported {\n  opacity: 0.5;\n  pointer-events: none;\n}\n.popup-entities-dropdown .entities-selector-row-unsupported .entities-selector-entity-name::after {\n  content: ' (not supported for this mode)';\n  font-size: 11px;\n  color: var(--_text-secondary);\n  font-weight: 400;\n}\n.popup-entity-row input[type="checkbox"] {\n  width: 18px;\n  height: 18px;\n  margin: 0;\n  cursor: pointer;\n  accent-color: var(--_accent);\n  flex-shrink: 0;\n}\n.popup-entity-row ha-icon {\n  --mdc-icon-size: 22px;\n  color: var(--_text-secondary);\n  flex-shrink: 0;\n}\n.popup-entity-name {\n  flex: 1;\n  font-size: 14px;\n  font-weight: 500;\n  color: var(--_text);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.popup-entities-list label {\n  cursor: pointer;\n}\n.popup-field label {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin-bottom: 8px;\n  font-size: 14px;\n  font-weight: 500;\n  color: var(--_text);\n}\n.popup-field label ha-icon { --mdc-icon-size: 24px; color: var(--_accent); }\n\n/* HA-style row: label left, control (e.g. ha-switch) right */\n.popup-field-row {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 8px 0;\n  gap: 16px;\n  cursor: pointer;\n}\n.popup-field-row-label {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 14px;\n  font-weight: 500;\n  color: var(--_text);\n  cursor: pointer;\n  margin: 0;\n  flex: 1;\n}\n.popup-field-row-label ha-icon {\n  --mdc-icon-size: 24px;\n  color: var(--_accent);\n}\n.popup-duration-row ha-switch {\n  flex-shrink: 0;\n}\n.popup-footer {\n  display: flex;\n  gap: var(--mdc-layout-grid-gutter, 12px);\n  padding: var(--ha-card-header-padding, 20px);\n  border-top: 1px solid var(--_divider);\n}\n.popup-button {\n  flex: 1;\n  padding: var(--mdc-shape-small, 12px) var(--mdc-shape-medium, 24px);\n  border: none;\n  border-radius: var(--_radius-medium);\n  font-size: 14px;\n  font-weight: 500;\n  cursor: pointer;\n  transition: all 0.2s;\n  font-family: inherit;\n}\n.popup-button.cancel { background: var(--_secondary-bg); color: var(--_text); }\n.popup-button.save { background: var(--_accent); color: var(--_text-on-accent); }\n.popup-button:active { transform: scale(0.98); }\n.time-selects { display: flex; align-items: center; gap: 8px; width: 100%; }\n.popup-time-hours, .popup-time-minutes { flex: 1; }\n.time-separator { font-size: 18px; font-weight: 500; color: var(--_text-secondary); user-select: none; }\n.slot-time .time-selects { display: flex; align-items: center; gap: 6px; width: auto; }\n.slot-time .time-separator { font-size: 14px; color: var(--_text); }\n.weekday-mode-selector { display: flex; gap: 8px; margin-bottom: 12px; }\n.weekday-mode-btn {\n  flex: 1;\n  padding: var(--mdc-shape-small, 10px);\n  border: 2px solid var(--_divider);\n  border-radius: var(--_radius-medium);\n  background: var(--_secondary-bg);\n  color: var(--_text-secondary);\n  text-align: center;\n  font-size: 13px;\n  font-weight: 500;\n  cursor: pointer;\n  transition: all 0.2s;\n  user-select: none;\n  font-family: inherit;\n}\n.weekday-mode-btn.active, .weekday-mode-btn:hover {\n  background: var(--_accent);\n  border-color: var(--_accent);\n  color: var(--_text-on-accent);\n}\n.weekday-mode-btn:hover { opacity: 0.8; }\n.popup-weekdays { display: flex; gap: 8px; flex-wrap: wrap; }\n.popup-weekdays.hidden { display: none; }\n.popup-weekday {\n  flex: 1;\n  min-width: 40px;\n  padding: var(--mdc-shape-small, 10px);\n  border: 2px solid var(--_divider);\n  border-radius: var(--_radius-medium);\n  background: var(--_secondary-bg);\n  color: var(--_text-secondary);\n  text-align: center;\n  font-size: 13px;\n  font-weight: 500;\n  cursor: pointer;\n  transition: all 0.2s;\n  user-select: none;\n}\n.popup-weekday.active {\n  background: var(--_accent);\n  border-color: var(--_accent);\n  color: var(--_text-on-accent);\n}\n@media (max-width: 480px) {\n  .popup-weekday { min-width: 35px; padding: 8px; font-size: 12px; }\n}\n.duration-selector-wrapper {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 12px);\n  width: 100%;\n}\n.duration-slider {\n  flex: 1;\n  height: 4px;\n  border-radius: 2px;\n  background: var(--_divider);\n  outline: none;\n  -webkit-appearance: none;\n  appearance: none;\n}\n.duration-slider::-webkit-slider-thumb {\n  -webkit-appearance: none;\n  appearance: none;\n  width: 20px;\n  height: 20px;\n  border-radius: 50%;\n  background: var(--_accent);\n  cursor: pointer;\n  border: 2px solid var(--_bg);\n  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);\n  transition: all 0.2s;\n}\n.duration-slider::-webkit-slider-thumb:hover {\n  transform: scale(1.1);\n  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);\n}\n.duration-slider::-moz-range-thumb {\n  width: 20px;\n  height: 20px;\n  border-radius: 50%;\n  background: var(--_accent);\n  cursor: pointer;\n  border: 2px solid var(--_bg);\n  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);\n  transition: all 0.2s;\n}\n.duration-slider::-moz-range-thumb:hover {\n  transform: scale(1.1);\n  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);\n}\n.duration-input {\n  width: 80px;\n  min-width: 80px;\n  text-align: center;\n}\n\n/* ========================================\n   MAIN HEADER\n   ======================================== */\n\n.main-header {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  padding: var(--ha-card-header-padding, 16px);\n  background: var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9)));\n  border-radius: var(--ha-card-border-radius, var(--mdc-shape-medium, 8px));\n  box-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0, 0, 0, 0.1));\n  backdrop-filter: var(--ha-card-backdrop-filter, blur(10px));\n}\n\n.main-header:not(:last-child) {\n  margin-bottom: var(--mdc-layout-grid-gutter, 12px);\n}\n\n.header-left {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  flex: 1;\n}\n\n.header-icon {\n  width: var(--circular-button-size);\n  height: var(--circular-button-size);\n  min-width: var(--circular-button-size);\n  min-height: var(--circular-button-size);\n  border-radius: 50%;\n  background: var(--primary-color, #03a9f4);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  color: var(--text-primary-on-background, #ffffff);\n  cursor: pointer;\n  transition: all 0.2s;\n  -webkit-tap-highlight-color: transparent;\n}\n\n.header-icon:active {\n  transform: scale(0.95);\n}\n\n.header-icon.disabled {\n  opacity: 0.5;\n  background: var(--disabled-color, var(--disabled-text-color));\n}\n\n.header-icon.enabled {\n  background: var(--primary-color, #03a9f4);\n  opacity: 1;\n}\n\n.header-icon ha-icon {\n  --mdc-icon-size: 28px;\n}\n\n.header-text {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n\n.header-title {\n  font-size: 18px;\n  font-weight: 500;\n  color: var(--primary-text-color, #212121);\n  line-height: 24px;\n}\n\n.header-title--hidden {\n  display: none;\n}\n\n.header-status {\n  font-size: 14px;\n  color: var(--secondary-text-color, #757575);\n  line-height: 20px;\n}\n\n.add-button {\n  width: var(--circular-button-size);\n  height: var(--circular-button-size);\n  min-width: var(--circular-button-size);\n  min-height: var(--circular-button-size);\n  border-radius: 50%;\n  background: var(--primary-color, #03a9f4);\n  border: none;\n  color: var(--text-primary-on-background, #ffffff);\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: all 0.2s;\n  -webkit-tap-highlight-color: transparent;\n}\n\n.add-button:active {\n  transform: scale(0.95);\n}\n\n.add-button ha-icon {\n  --mdc-icon-size: 28px;\n}\n\n/* ========================================\n   ADD SLOT BUTTON\n   ======================================== */\n\n/* Button outline style moved to shared/assets/homie-css.css */\n\n/* ========================================\n   SLOTS CONTAINER\n   ======================================== */\n\n.slots-container {\n  display: flex;\n  flex-direction: column;\n  gap: var(--mdc-layout-grid-gutter, 12px);\n}\n\n.slots-container--empty {\n  display: none;\n}\n\n/* ========================================\n   SLOT CARD (Blue Card Design)\n   ======================================== */\n\n.slot-card {\n  background: var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9)));\n  border-radius: var(--ha-card-border-radius, var(--mdc-shape-medium, 8px));\n  padding: var(--ha-card-header-padding, 16px) var(--ha-card-header-padding, 16px) 0 var(--ha-card-header-padding, 16px);\n  color: var(--primary-text-color, #212121);\n  position: relative;\n  box-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0, 0, 0, 0.1));\n  transition: transform 0.2s, box-shadow 0.2s, background 0.2s;\n  backdrop-filter: var(--ha-card-backdrop-filter, blur(10px));\n}\n\n/* Active slot (enabled) - same background as header */\n.slot-card:not(.disabled) {\n  background: var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9)));\n}\n\n.slot-card.disabled {\n  opacity: 0.6;\n  background: var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.5)));\n}\n\n.slot-header {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 12px);\n  margin-bottom: 0;\n}\n\n.slot-icon {\n  width: var(--circular-button-size);\n  height: var(--circular-button-size);\n  min-width: var(--circular-button-size);\n  min-height: var(--circular-button-size);\n  border-radius: 50%;\n  background: var(--primary-color, #03a9f4);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  cursor: pointer;\n  transition: all 0.2s;\n  -webkit-tap-highlight-color: transparent;\n  color: var(--text-primary-on-background, #ffffff);\n}\n\n.slot-icon:active {\n  transform: scale(0.95);\n}\n\n.slot-icon.enabled {\n  background: var(--primary-color, #03a9f4);\n  opacity: 1;\n}\n\n.slot-icon.disabled {\n  background: var(--disabled-color, var(--disabled-text-color, #9e9e9e));\n  opacity: 0.6;\n}\n\n.slot-icon ha-icon {\n  --mdc-icon-size: 24px;\n}\n\n.slot-info {\n  flex: 1;\n}\n\n.slot-name {\n  font-size: 16px;\n  font-weight: 500;\n  margin-bottom: 4px;\n}\n\n.slot-status {\n  font-size: 14px;\n  color: var(--secondary-text-color, #757575);\n}\n\n.slot-expand {\n  width: 100%;\n  padding: 8px 0;\n  margin-top: var(--mdc-layout-grid-gutter, 12px);\n  border-radius: 0;\n  background: transparent;\n  border: none;\n  border-top: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));\n  color: var(--primary-text-color, #212121);\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: all 0.2s;\n  -webkit-tap-highlight-color: transparent;\n}\n\n.slot-expand ha-icon {\n  --mdc-icon-size: 20px;\n  transition: transform 0.2s;\n}\n\n.slot-card.expanded .slot-expand ha-icon {\n  transform: rotate(180deg);\n}\n\n/* Slot expandable, slot-details styles moved to shared/assets/homie-css.css */\n\n.slot-title {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 6px);\n  font-size: 14px;\n  width: 100%;\n  flex-basis: 100%;\n  margin-bottom: var(--mdc-layout-grid-gutter, 8px);\n}\n.slot-title ha-icon {\n  --mdc-icon-size: 22px;\n  opacity: 0.9;\n}\n.slot-title .slot-title-input {\n  flex: 1;\n  min-width: 0;\n  box-sizing: border-box;\n}\n\n.slot-time,\n.slot-duration,\n.slot-hvac-mode {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 6px);\n  font-size: 14px;\n}\n\n.slot-time ha-icon,\n.slot-duration ha-icon,\n.slot-hvac-mode ha-icon {\n  --mdc-icon-size: 22px;\n  opacity: 0.9;\n}\n\n.slot-entities-wrap {\n  margin-top: 12px;\n  padding-top: 12px;\n  border-top: 1px solid var(--_divider);\n  position: relative;\n}\n.slot-entities-label {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 14px;\n  font-weight: 500;\n  color: var(--_text);\n  margin-bottom: 8px;\n}\n.slot-entities-label ha-icon {\n  --mdc-icon-size: 22px;\n  color: var(--_accent);\n}\n/* Slot entities dropdown (same UX as popup) */\n.slot-entities-trigger {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-height: 40px;\n  padding: 6px 12px;\n  border-radius: var(--_radius-medium);\n  border: 1px solid var(--_divider);\n  background: var(--_bg-select);\n  cursor: pointer;\n  transition: border-color 0.2s, box-shadow 0.2s;\n}\n.slot-entities-trigger:hover,\n.slot-entities-trigger.open {\n  border-color: var(--_accent);\n  box-shadow: var(--_focus-ring);\n}\n.slot-entities-chips {\n  flex: 1;\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  align-items: center;\n  min-height: 24px;\n}\n.slot-entities-chips .popup-entity-chip {\n  display: inline-flex;\n  align-items: center;\n  padding: 2px 8px;\n  border-radius: var(--_radius-small);\n  background: var(--_secondary-bg);\n  border: 1px solid var(--_divider);\n  font-size: 12px;\n  color: var(--_text);\n  white-space: nowrap;\n}\n.slot-entities-caret {\n  --mdc-icon-size: 20px;\n  color: var(--_text-secondary);\n  flex-shrink: 0;\n  transition: transform 0.2s;\n}\n.slot-entities-trigger.open .slot-entities-caret {\n  transform: rotate(180deg);\n}\n.slot-entities-dropdown {\n  display: none;\n  position: absolute;\n  left: 0;\n  right: 0;\n  top: 100%;\n  margin-top: 4px;\n  z-index: 10;\n  flex-direction: column;\n  border-radius: var(--_radius-medium);\n  border: 1px solid var(--_divider);\n  background: var(--_popup-bg);\n  box-shadow: var(--_popup-box-shadow);\n  max-height: 220px;\n  overflow: hidden;\n}\n.slot-entities-wrap .slot-entities-dropdown.open {\n  display: flex;\n}\n.slot-entity-select-all {\n  border-bottom: 1px solid var(--_divider);\n  flex-shrink: 0;\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 10px 16px;\n  cursor: pointer;\n  min-height: 44px;\n  box-sizing: border-box;\n}\n.slot-entity-select-all input {\n  width: 18px;\n  height: 18px;\n  margin: 0;\n  accent-color: var(--_accent);\n  flex-shrink: 0;\n}\n.slot-entities-list {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n.slot-entity-row {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 8px 0;\n  cursor: pointer;\n  font-size: 14px;\n}\n.slot-entity-row input[type="checkbox"] {\n  width: 18px;\n  height: 18px;\n  margin: 0;\n  accent-color: var(--_accent);\n  flex-shrink: 0;\n}\n.slot-entity-row ha-icon {\n  --mdc-icon-size: 20px;\n  color: var(--_text-secondary);\n  flex-shrink: 0;\n}\n.slot-entity-name {\n  flex: 1;\n  color: var(--_text);\n}\n/* Shared entities-selector inside slot */\n.slot-entities-wrap .entities-selector-list {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n.slot-entities-wrap .entities-selector-row {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 8px 0;\n  cursor: pointer;\n  font-size: 14px;\n}\n.slot-entities-wrap .entities-selector-row input[type="checkbox"] {\n  width: 18px;\n  height: 18px;\n  margin: 0;\n  accent-color: var(--_accent);\n  flex-shrink: 0;\n}\n.slot-entities-wrap .entities-selector-row ha-icon {\n  --mdc-icon-size: 20px;\n  color: var(--_text-secondary);\n  flex-shrink: 0;\n}\n.slot-entities-wrap .entities-selector-entity-name {\n  flex: 1;\n  color: var(--_text);\n}\n.slot-entities-wrap .slot-entities-dropdown .entities-selector-list {\n  overflow-y: auto;\n  overflow-x: hidden;\n  flex: 1;\n  min-height: 0;\n}\n.slot-entities-wrap .slot-entities-dropdown .entities-selector-row {\n  padding: 10px 16px;\n  border-bottom: 1px solid var(--_divider);\n  gap: 12px;\n}\n.slot-entities-wrap .slot-entities-dropdown .entities-selector-row:last-child {\n  border-bottom: none;\n}\n.slot-entities-wrap .slot-entities-dropdown .entities-selector-row:hover {\n  background: var(--_secondary-bg);\n}\n.slot-entities-wrap .entities-selector-row-unsupported {\n  opacity: 0.5;\n  pointer-events: none;\n}\n.slot-entities-wrap .entities-selector-row-unsupported .entities-selector-entity-name::after {\n  content: ' (not supported for this mode)';\n  font-size: 11px;\n  color: var(--_text-secondary);\n  font-weight: 400;\n}\n.slot-hvac-mode select {\n  flex: 1;\n  min-width: 0;\n  box-sizing: border-box;\n}\n\n/* Time picker styles are now in shared/homie-select/homie-select.css */\n\n.slot-time .time-picker-separator {\n  color: var(--primary-text-color, #212121);\n}\n\n/* Select styles are now in shared/homie-select.css */\n\n.slot-weekdays-wrapper {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 6px);\n}\n\n.slot-weekdays-icon {\n  --mdc-icon-size: 22px;\n  opacity: 0.9;\n  flex-shrink: 0;\n}\n\n.slot-weekdays {\n  display: flex;\n  gap: var(--mdc-layout-grid-gutter, 6px);\n  flex-wrap: wrap;\n  flex: 1;\n  justify-content: flex-start;\n}\n\n.slot-weekday {\n  padding: var(--mdc-shape-small, 6px) var(--mdc-shape-small, 8px);\n  border-radius: var(--ha-card-border-radius, var(--mdc-shape-small, 4px));\n  background: var(--secondary-background-color, #f5f5f5);\n  border: 2px solid var(--divider-color, rgba(0, 0, 0, 0.12));\n  color: var(--primary-text-color, #212121);\n  font-size: 12px;\n  font-weight: 400;\n  cursor: pointer;\n  transition: all 0.2s;\n  user-select: none;\n  flex-shrink: 0;\n  min-width: fit-content;\n  flex: 1;\n  text-align: center;\n  min-width: 0;\n}\n\n.slot-weekday.active {\n  background: var(--primary-color, #03a9f4);\n  color: var(--text-primary-on-background, #ffffff);\n  font-weight: 600;\n  border-color: var(--primary-color, #03a9f4);\n}\n\n/* Slot delete, empty state styles moved to shared/assets/homie-css.css */\n\n/* Popup overlay, popup-header, popup-body, popup-field styles moved to shared/assets/homie-css.css */\n\n/* Popup content (defaults, override via --homie-slots-popup-*) */\n.popup-content {\n  background: var(--_popup-bg);\n  color: var(--_popup-color);\n  -webkit-backdrop-filter: var(--_popup-backdrop-filter);\n  backdrop-filter: var(--_popup-backdrop-filter);\n  box-shadow: var(--_popup-box-shadow);\n  border-radius: var(--_popup-border-radius);\n  width: var(--_popup-width);\n  max-width: var(--_popup-max-width);\n  min-width: var(--_popup-min-width);\n  max-height: var(--_popup-max-height);\n  overflow-y: auto;\n  animation: slideUp 0.3s;\n}\n\n@keyframes slideUp {\n  from {\n    transform: translateY(20px);\n    opacity: 0;\n  }\n  to {\n    transform: translateY(0);\n    opacity: 1;\n  }\n}\n\n/* Popup select styles are now in shared/homie-select.css */\n\n/* Slot time selects */\n.slot-time .time-selects {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  width: auto;\n}\n\n/* Slot time select styles are now in shared/homie-select.css */\n\n.slot-time .time-separator {\n  font-size: 14px;\n  color: var(--primary-text-color, #212121);\n}\n\n/* Time selects, weekday selector, popup footer/button styles moved to shared/assets/homie-css.css */\n\n/* ========================================\n   RESPONSIVE\n   ======================================== */\n\n@media (max-width: 480px) {\n  .main-header {\n    padding: var(--mdc-shape-small, 12px);\n  }\n  \n  .header-title {\n    font-size: 16px;\n  }\n  \n  .slot-card {\n    padding: var(--mdc-shape-small, 12px);\n  }\n  \n  :host {\n    --_popup-width: var(--mdc-dialog-width, 95%);\n    --_popup-max-height: var(--mdc-dialog-max-height, 85vh);\n  }\n}\n\n/* ========================================\n   DARK THEME SUPPORT\n   ======================================== */\n\n/* Dark theme adjustments are handled by HA CSS variables */\n/* No additional dark theme styles needed */\n`;
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
    
    // Get HVAC modes for popup (exclude 'off')
    let hvacModesOptions = '';
    if (this._config && this._config.entity && this._hass) {
      const entityState = this._hass.states[this._config.entity];
      if (entityState && entityState.attributes && entityState.attributes.hvac_modes) {
        const hvacModes = entityState.attributes.hvac_modes.filter(mode => mode !== 'off');
        hvacModesOptions = hvacModes.map(mode => 
          `<option value="${mode}">${mode.charAt(0).toUpperCase() + mode.slice(1)}</option>`
        ).join('');
      }
    }
    if (!hvacModesOptions) {
      // Fallback if entity not found or no modes available
      hvacModesOptions = '<option value="heat">Heat</option><option value="cool">Cool</option>';
    }
    
    // Replace duration placeholders (step computed so slider can reach max)
    const minDuration = this._config.min_duration || 15;
    const maxDuration = this._config.max_duration || 1440;
    const durationStep = window.DurationSelector && typeof window.DurationSelector.computeStep === 'function'
      ? window.DurationSelector.computeStep(minDuration, maxDuration, this._config.duration_step || 15)
      : (this._config.duration_step || 15);
    // For climate, default duration is null (empty)
    const defaultDuration = '';
    
    let processedTemplate = template
      .replace(/\{\{DURATION_MIN\}\}/g, minDuration)
      .replace(/\{\{DURATION_MAX\}\}/g, maxDuration)
      .replace(/\{\{DURATION_STEP\}\}/g, durationStep)
      .replace(/\{\{DURATION_VALUE\}\}/g, defaultDuration)
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
    const sameSlotItems = entities.length > 1 ? allItems.filter(i =>
      i && i.temporary !== true && entitySet.has(i.entity_id) &&
      i.time === item.time && JSON.stringify(i.weekdays || []) === JSON.stringify(item.weekdays || [])
    ) : [];
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
      statusPrefix = item.enabled ? currentHvacMode.charAt(0).toUpperCase() + currentHvacMode.slice(1) : 'Off';
    }
    
    const entityForMode = item.entity_id || this._config?.entity;
    let hvacModeOptions = '';
    if (this._config && entityForMode && this._hass) {
      const entityState = this._hass.states[entityForMode];
      if (entityState && entityState.attributes && entityState.attributes.hvac_modes) {
        let hvacModes = entityState.attributes.hvac_modes.filter(mode => mode !== 'off');
        if (currentHvacMode && !hvacModes.includes(currentHvacMode)) {
          hvacModes = [currentHvacMode, ...hvacModes];
        }
        hvacModeOptions = hvacModes.map(mode => {
          const selected = currentHvacMode === mode ? 'selected' : '';
          const label = mode.charAt(0).toUpperCase() + mode.slice(1);
          return `<option value="${mode}" ${selected}>${label}</option>`;
        }).join('');
      }
    }
    if (!hvacModeOptions) {
      // Fallback if entity not found or no modes available
      const heatSelected = currentHvacMode === 'heat' ? 'selected' : '';
      const coolSelected = currentHvacMode === 'cool' ? 'selected' : '';
      hvacModeOptions = `<option value="heat" ${heatSelected}>Heat</option><option value="cool" ${coolSelected}>Cool</option>`;
    }
    
    //     
    const durationStr = this._formatDuration(item.duration);
    const slotStatus = `${statusPrefix}, ${daysText} on ${item.time}${durationStr}`;
    
    // Prepare time placeholders
    const [hours, minutes] = item.time.split(':');
    const roundedMinutes = String(Math.round(parseInt(minutes || 0) / 5) * 5).padStart(2, '0');
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

    // Replace duration placeholders (step computed so slider can reach max)
    const minDuration = this._config.min_duration || 15;
    const maxDuration = this._config.max_duration || 1440;
    const durationStep = window.DurationSelector && typeof window.DurationSelector.computeStep === 'function'
      ? window.DurationSelector.computeStep(minDuration, maxDuration, this._config.duration_step || 15)
      : (this._config.duration_step || 15);
    const durationValue = item.duration || '';
    
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
      .replace(/\{\{DURATION_MIN\}\}/g, minDuration)
      .replace(/\{\{DURATION_MAX\}\}/g, maxDuration)
      .replace(/\{\{DURATION_STEP\}\}/g, durationStep)
      .replace(/\{\{DURATION_VALUE\}\}/g, durationValue)
      .replace(/\{\{HVAC_MODE_OPTIONS\}\}/g, hvacModeOptions);
    
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
      
      // Hide duration selector if duration is not set
      const durationEl = slotCard.querySelector('.slot-duration');
      if (durationEl) {
        if (item.duration) {
          durationEl.style.display = '';
        } else {
          durationEl.style.display = 'none';
        }
      }
      
      // Verify and set HVAC mode select value explicitly
      const hvacModeSelect = slotCard.querySelector('[data-action="update-hvac-mode"]');
      if (hvacModeSelect && currentHvacMode) {
        hvacModeSelect.value = currentHvacMode;
      } else if (hvacModeSelect) {
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

    // Popup weekday selection - use shared component
    // Note: attachEventListeners will fix the active state if Custom is selected
    WeekdaySelector.attachEventListeners(this.shadowRoot);
    
    // Popup duration selection - attach listeners only when wrapper is visible
    // (will be attached when checkbox is checked)
    
    // Duration enabled (ha-switch) - show/hide duration selector
    const durationEnabledCheckbox = this.shadowRoot.getElementById('popup-duration-enabled');
    const durationWrapper = this.shadowRoot.getElementById('popup-duration-wrapper');
    const durationRow = this.shadowRoot.querySelector('.popup-duration-row');
    if (durationEnabledCheckbox && durationWrapper) {
      const syncDurationWrapper = () => {
        if (durationEnabledCheckbox.checked) {
          durationWrapper.style.display = 'block';
          const durationInput = durationWrapper.querySelector('[data-action="update-duration"]');
          const durationSlider = durationWrapper.querySelector('[data-action="update-duration-slider"]');
          const minDuration = this._config.min_duration || 15;
          const maxDuration = this._config.max_duration || 1440;
          const allowedValues = window.DurationSelector && typeof window.DurationSelector.computeAllowedValues === 'function'
            ? window.DurationSelector.computeAllowedValues(minDuration, maxDuration, 5)
            : (() => { const a = []; for (let i = minDuration; i <= maxDuration; i += 5) a.push(i); if (a[a.length - 1] < maxDuration) a.push(maxDuration); return a; })();
          durationWrapper.dataset.durationValues = allowedValues.join(',');
          if (durationInput) {
            durationInput.min = minDuration;
            durationInput.max = maxDuration;
            durationInput.step = 1;
          }
          if (durationSlider) {
            durationSlider.min = 0;
            durationSlider.max = Math.max(0, allowedValues.length - 1);
            durationSlider.step = 1;
          }
          DurationSelector.setSelectedDuration(durationWrapper, minDuration);
          DurationSelector.attachEventListeners(durationWrapper);
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

    const hvacModeSelect = this.shadowRoot.getElementById('popup-hvac-mode');
    if (hvacModeSelect) {
      hvacModeSelect.addEventListener('change', () => this._updateHvacModeWarning());
    }
    
    // Ensure Everyday is active after attaching listeners (in case popup is already open)
    const popup = this.shadowRoot.getElementById('add-popup');
    if (popup && popup.style.display !== 'none') {
      requestAnimationFrame(() => {
        WeekdaySelector.reset(this.shadowRoot);
      });
    }

    // Item actions
    this.shadowRoot.querySelectorAll('.slot-card').forEach(itemEl => {
      const itemId = itemEl.dataset.itemId;
      const items = this._getItems();
      const item = items.find(i => i.id === itemId);
      if (!item) return;

      // Toggle item enabled (via icon)
      const itemIcon = itemEl.querySelector('.slot-icon[data-action="toggle-item"]');
      if (itemIcon) {
        itemIcon.addEventListener('click', () => {
          // Get fresh item data on each click to ensure we have current state
          const currentItems = this._getItems();
          const currentItem = currentItems.find(i => i.id === itemId);
          if (currentItem) {
            this._updateItem(itemId, { enabled: !currentItem.enabled });
          }
        });
      }

      const slotKey = (item.time || '') + '|' + JSON.stringify(item.weekdays || []);

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

      // Restore expanded state if this slot was expanded before (by time+weekdays so it survives entity add/remove)
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

      // Slot title input - same pattern as boiler slots; update display on input, save on blur/debounce
      const titleInput = itemEl.querySelector('.slot-title-input');
      if (titleInput) {
        let titleDebounce = null;
        const applyTitle = () => {
          if (itemEl.dataset.updating === 'true') return;
          const newTitle = titleInput.value.trim() || null;
          this._updateItem(itemId, { title: newTitle });
        };
        const refreshSlotNameDisplay = () => {
          const slotEntitiesWrap = itemEl.querySelector('.slot-entities-wrap');
          const listEl = slotEntitiesWrap?.querySelector('.entities-selector-list');
          const names = listEl ? Array.from(listEl.querySelectorAll('input[name="entities-selector-entity"]:checked')).map(inp => {
            const row = inp.closest('.entities-selector-row');
            const nameEl = row?.querySelector('.entities-selector-entity-name');
            return nameEl ? nameEl.textContent : inp.value;
          }) : [];
          const slotNumber = Array.from(this.shadowRoot.querySelectorAll('.slot-card')).indexOf(itemEl) + 1;
          const baseName = titleInput.value.trim() || `Slot ${slotNumber}`;
          const entityLabel = names.length > 0 ? names.join(', ') : '';
          const slotName = baseName + (entityLabel ? ` (${entityLabel})` : '');
          const nameEl = itemEl.querySelector('.slot-name');
          if (nameEl) nameEl.textContent = slotName;
          const removeSpan = itemEl.querySelector('.slot-delete span');
          if (removeSpan) removeSpan.textContent = 'Remove ' + baseName;
        };
        titleInput.addEventListener('blur', () => {
          clearTimeout(titleDebounce);
          applyTitle();
        });
        titleInput.addEventListener('input', () => {
          refreshSlotNameDisplay();
          clearTimeout(titleDebounce);
          titleDebounce = setTimeout(applyTitle, 500);
        });
        titleInput.addEventListener('click', (e) => e.stopPropagation());
      }

      // Update time - hours and minutes selects
      const hoursSelect = itemEl.querySelector('.slot-time-hours');
      const minutesSelect = itemEl.querySelector('.slot-time-minutes');
      
      if (hoursSelect) {
        const hoursHandler = (e) => {
          if (itemEl.dataset.updating === 'true') return;
          e.stopPropagation();
          const currentItems = this._getItems();
          const currentItem = currentItems.find(i => i.id === itemId);
          if (!currentItem) return;
          const [oldHours, oldMinutes] = currentItem.time.split(':');
          const newTime = `${e.target.value}:${oldMinutes}`;
          this._updateItem(itemId, { time: newTime });
        };
        const newHoursSelect = hoursSelect.cloneNode(true);
        hoursSelect.parentNode.replaceChild(newHoursSelect, hoursSelect);
        newHoursSelect.addEventListener('change', hoursHandler);
        newHoursSelect.addEventListener('click', (e) => {
          e.stopPropagation();
        });
        const [hours] = item.time.split(':');
        newHoursSelect.value = hours;
      }
      
      if (minutesSelect) {
        const minutesHandler = (e) => {
          if (itemEl.dataset.updating === 'true') return;
          e.stopPropagation();
          const currentItems = this._getItems();
          const currentItem = currentItems.find(i => i.id === itemId);
          if (!currentItem) return;
          const [oldHours, oldMinutes] = currentItem.time.split(':');
          const newTime = `${oldHours}:${e.target.value}`;
          this._updateItem(itemId, { time: newTime });
        };
        const newMinutesSelect = minutesSelect.cloneNode(true);
        minutesSelect.parentNode.replaceChild(newMinutesSelect, minutesSelect);
        newMinutesSelect.addEventListener('change', minutesHandler);
        newMinutesSelect.addEventListener('click', (e) => {
          e.stopPropagation();
        });
        const [, minutes] = item.time.split(':');
        const roundedMinutes = String(Math.round(parseInt(minutes || 0) / 5) * 5).padStart(2, '0');
        newMinutesSelect.value = roundedMinutes;
      }

      // Update duration - use shared component (only if duration is set)
      const durationEl = itemEl.querySelector('.slot-duration');
      if (durationEl) {
        if (item.duration) {
          durationEl.style.display = '';
          // First, set the initial duration value
          DurationSelector.setDurationInSlot(itemEl, item.duration, this._config);
          // Then attach event listeners
          DurationSelector.attachEventListenersInSlot(itemEl, (duration) => {
            if (itemEl.dataset.updating === 'true') return;
            this._updateItem(itemId, { duration });
          }, this._config);
        } else {
          durationEl.style.display = 'none';
        }
      }

      // Update HVAC mode - use data-action selector to match template
      const hvacModeSelect = itemEl.querySelector('[data-action="update-hvac-mode"]');
      if (hvacModeSelect) {
        const hvacModeHandler = (e) => {
          if (itemEl.dataset.updating === 'true') return;
          e.stopPropagation();
          const currentItems = this._getItems();
          const currentItem = currentItems.find(i => i.id === itemId);
          if (!currentItem) {
            return;
          }
          
          const newHvacMode = e.target.value;
          
          const serviceStart = {
            name: 'climate.set_hvac_mode',
            value: {
              entity_id: currentItem.entity_id,
              hvac_mode: newHvacMode
            }
          };
          
          // If item has duration and service_end, keep service_end as is
          const updates = { service_start: serviceStart };
          if (currentItem.duration && currentItem.service_end) {
            // Keep service_end as is (it should be 'off' mode)
            updates.service_end = currentItem.service_end;
          }
          
          this._updateItem(itemId, updates);
          const wrap = itemEl.querySelector('.slot-entities-wrap');
          if (wrap) this._updateSlotEntitiesForMode(wrap, itemEl);
        };
        // Clone node to remove all event listeners
        const newHvacModeSelect = hvacModeSelect.cloneNode(true);
        hvacModeSelect.parentNode.replaceChild(newHvacModeSelect, hvacModeSelect);
        newHvacModeSelect.addEventListener('change', hvacModeHandler);
        newHvacModeSelect.addEventListener('click', (e) => {
          e.stopPropagation();
        });
      }

      const slotEntitiesWrap = itemEl.querySelector('.slot-entities-wrap');
      if (slotEntitiesWrap) {
        const entities = this._getEntities();
        if (entities.length <= 1) {
          slotEntitiesWrap.style.display = 'none';
        } else {
          slotEntitiesWrap.style.display = '';
        }
        if (window.EntitiesSelector && window.EntitiesSelector.attachEntitiesList && entities.length > 1) {
          const bridgeState = this._getBridgeState();
          const allItems = bridgeState?.attributes?.items || [];
          const entitySet = new Set(entities);
          const sameSlotItems = allItems.filter(i =>
            i && i.temporary !== true && entitySet.has(i.entity_id) &&
            i.time === item.time && JSON.stringify(i.weekdays || []) === JSON.stringify(item.weekdays || [])
          );
          const entityIdsToItemIds = {};
          sameSlotItems.forEach(i => { entityIdsToItemIds[i.entity_id] = i.id; });
          slotEntitiesWrap.dataset.slotEntityIds = JSON.stringify(entityIdsToItemIds);
          const slotHvacSelect = itemEl.querySelector('[data-action="update-hvac-mode"]');
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
            onCheck: async (entityId) => {
              const timeHours = itemEl.querySelector('[data-action="update-time-hours"]');
              const timeMinutes = itemEl.querySelector('[data-action="update-time-minutes"]');
              const time = (timeHours && timeMinutes) ? `${timeHours.value}:${timeMinutes.value}` : item.time;
              const selectedWeekdays = WeekdaySelector.getSelectedWeekdays(itemEl);
              const weekdays = selectedWeekdays.length > 0 ? selectedWeekdays : item.weekdays;
              const hvacSelect = itemEl.querySelector('[data-action="update-hvac-mode"]');
              const hvacMode = hvacSelect && hvacSelect.value ? hvacSelect.value : (item.service_start?.value?.hvac_mode || 'heat');
              let duration = null;
              if (window.DurationSelector) {
                const wrapper = itemEl.querySelector('.duration-selector-wrapper');
                if (wrapper) duration = DurationSelector.getSelectedDuration(itemEl);
              }
              const service_start = ScheduleHelper.createClimateServices(entityId, hvacMode).service_start;
              const service_end = duration ? ScheduleHelper.createClimateServices(entityId, hvacMode).service_end : null;
              await ScheduleHelper.addScheduleSlot({
                hass: this._hass,
                callService: async (service, data) => this._callService(service, data),
                getBridgeState: () => this._getBridgeState(),
                entity_id: entityId,
                time,
                duration: duration || undefined,
                weekdays,
                service_start,
                service_end,
                bridgeSensor: this._bridgeSensor,
                onRender: () => { this.hass = { ...this._hass }; this.render().catch(() => {}); }
              });
              this._optimisticBridgeState = null;
              this.hass = { ...this._hass };
              await this.render();
            },
            onUncheck: async (entityId) => {
              const ids = JSON.parse(slotEntitiesWrap.dataset.slotEntityIds || '{}');
              const itemIdToDelete = ids[entityId];
              if (itemIdToDelete) await this._deleteItem(itemIdToDelete);
            }
          });
          this._updateSlotEntitiesChips(slotEntitiesWrap);
          const trigger = slotEntitiesWrap.querySelector('.slot-entities-trigger');
          const dropdown = slotEntitiesWrap.querySelector('.slot-entities-dropdown');
          const selectAllInput = slotEntitiesWrap.querySelector('.slot-entities-select-all-input');
          if (trigger && dropdown) {
            trigger.addEventListener('click', (e) => {
              e.stopPropagation();
              const open = dropdown.classList.toggle('open');
              trigger.classList.toggle('open', open);
              if (open) {
                const close = (ev) => {
                  if (slotEntitiesWrap.contains(ev.target)) return;
                  document.removeEventListener('click', close);
                  dropdown.classList.remove('open');
                  trigger.classList.remove('open');
                };
                setTimeout(() => document.addEventListener('click', close), 0);
              }
            });
          }
          if (selectAllInput) {
            const listEl = slotEntitiesWrap.querySelector('.entities-selector-list');
            selectAllInput.addEventListener('change', () => {
              if (!listEl) return;
              const inputs = listEl.querySelectorAll('input[name="entities-selector-entity"]:not(:disabled)');
              inputs.forEach(inp => { inp.checked = selectAllInput.checked; });
              this._updateSlotEntitiesChips(slotEntitiesWrap);
            });
          }
          const listElForSync = slotEntitiesWrap.querySelector('.entities-selector-list');
          if (listElForSync && selectAllInput) {
            listElForSync.addEventListener('change', () => {
              this._updateSlotEntitiesChips(slotEntitiesWrap);
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
        // Function to update weekdays
        const updateWeekdays = () => {
          if (itemEl.dataset.updating === 'true') {
            return;
          }
          
          const currentItems = this._getItems();
          const currentItem = currentItems.find(i => i.id === itemId);
          if (!currentItem) {
            return;
          }
          
          // Query weekday selector state
          const selectedWeekdays = WeekdaySelector.getSelectedWeekdays(itemEl);
          
          if (selectedWeekdays.length === 0) {
            // Don't allow empty weekdays - restore previous state
            WeekdaySelector.setSelectedWeekdays(this.shadowRoot, currentItem.weekdays, itemEl);
            return;
          }
          
          // Only update if weekdays actually changed
          const currentWeekdaysSorted = (currentItem.weekdays || []).slice().sort();
          const selectedWeekdaysSorted = selectedWeekdays.slice().sort();
          const weekdaysChanged = JSON.stringify(selectedWeekdaysSorted) !== JSON.stringify(currentWeekdaysSorted);
          
          if (weekdaysChanged) {
            this._updateItem(itemId, { weekdays: selectedWeekdays });
          } else {
          }
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
                        const day = parseInt(dayEl.dataset.day);
                        dayEl.classList.toggle('active', currentItem.weekdays.includes(day));
                      });
                    }
                  }
                });
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
        // Check if it's a function before calling
        if (typeof this._unsubStateChanged === 'function') {
          this._unsubStateChanged();
        } else {
        }
      } catch (e) {
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
