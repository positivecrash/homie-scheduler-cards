/**
 * Homie Scheduler Cards - All-in-one bundle
 * Contains: boiler-button, boiler-status, boiler-slots, climate-slots
 * Version: 1.0.5
 */
window.__HOMIE_SCHEDULER_CARDS_VERSION = '1.0.5';

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

// Shared Components will be auto-included by build script
// DO NOT include ScheduleHelper, DurationSelector, or WeekdaySelector here - they will be added during build


class HomieBoilerScheduleButtonCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = null;
    this._hass = null;
    this._entryId = null;
    this._bridgeSensor = null;
    this._htmlTemplate = null;
    this._unsubStateChanged = null;
    this._turnOffTimer = null;  // Timer for scheduled turn-off
    this._buttonId = null;  // Unique ID for this button instance (entity + duration)
    this._updateInterval = null;  // Interval for updating time display
    this._countdownTimeout = null; // Timeout for next countdown update (1s or 60s)
    this._weJustTurnedOn = false;  // True while we are handling our own turn_on (to ignore in state_changed)
    this._externalRecirculationTimerSet = false;  // True when we set recirculation timer for current "on" (external or fallback)
  }

  async _loadTemplate() {
    if (this._htmlTemplate) return this._htmlTemplate;
    
    // Template is embedded in production build
    this._htmlTemplate = `<button class="{{NORMAL_BUTTON_CLASS}}" data-action="run-schedule">\n  <span class="button-label">\n    <ha-icon icon="mdi:timer-play-outline" class="label-icon"></ha-icon>\n    {{LABEL_TEXT}}\n  </span>\n  <span class="button-duration">\n    <span class="duration-number">{{DURATION_NUMBER}}</span>\n    <span class="duration-unit">{{DURATION_UNIT}}</span>\n  </span>\n</button>\n\n<button class="{{RECIRCULATION_BUTTON_CLASS}}" data-action="run-schedule">\n  <span class="recirculation-label-top">{{RECIRCULATION_LABEL_TOP}}</span>\n  <ha-icon icon="mdi:reload" class="recirculation-icon"></ha-icon>\n  <span class="recirculation-label-bottom">{{RECIRCULATION_LABEL_BOTTOM}}</span>\n</button>\n`;
    return this._htmlTemplate;
  }

  set hass(hass) {
    try {
      const wasInitialized = !!this._hass;
      this._hass = hass;
      
      // Find bridge sensor on first hass set
      if (!this._bridgeSensor) {
        this._findBridgeSensor();
      }
      
      if (!this._bridgeSensor) {
        if (!wasInitialized || !this.shadowRoot.innerHTML) {
          this.render().catch(err => {});
        }
        return;
      }
      
      // Subscribe to state_changed events for bridge sensor and entity
      if (this._hass && this._hass.connection && !this._unsubStateChanged) {
        try {
          this._hass.connection.subscribeEvents(
            (event) => {
              const entityId = event?.data?.entity_id;
              const watched = [this._bridgeSensor, this._config?.entity].filter(Boolean);
              if (!entityId || !watched.includes(entityId)) return;

              if (event.data) {
                const newState = event.data.new_state;
                const oldState = event.data.old_state;

                // Handle entity turned off — clear active button marker and reset external-timer flag
                if (entityId === this._config?.entity && oldState?.state === 'on' && newState?.state === 'off') {
                  this._externalRecirculationTimerSet = false;
                  if (this._config.entity && this._entryId) {
                    setTimeout(async () => {
                      try {
                        await this._callService('clear_active_button', {
                          entity_id: this._config.entity
                        });
                      } catch (e) {
                        // Ignore errors
                      }
                    }, 0);
                  }
                }

                // Recirculation only: entity turned ON from outside (e.g. physical button, another toggle) — set timer for duration
                if (entityId === this._config?.entity && this._config?.mode === 'recirculation' &&
                    oldState?.state !== 'on' && newState?.state === 'on' && !this._weJustTurnedOn) {
                  this._externalRecirculationTimerSet = true;
                  setTimeout(() => this._applyRecirculationTimerFromExternal(), 150);
                }

                // Rely on HA to update hass.states — request refresh and trigger re-render
                if (this._hass) {
                  this._hass.callService('homeassistant', 'update_entity', {
                    entity_id: entityId
                  }).catch(() => {});
                  this.hass = { ...this._hass };
                  setTimeout(() => this.render().catch(() => {}), 100);
                }
              }
            },
            'state_changed'
          ).then((unsubscribeFn) => {
            this._unsubStateChanged = unsubscribeFn;
          }).catch((e) => {
          });
        } catch (e) {
        }
      }
      
      // Re-render on state changes
      this.render().catch(err => {});
    } catch (err) {}
  }

  get hass() {
    return this._hass;
  }

  setConfig(config) {
    if (!config) {
      throw new Error('Invalid configuration');
    }
    
    if (!config.entity) {
      throw new Error('Entity is required');
    }
    
    const mode = config.mode || 'normal'; // 'normal' or 'recirculation'
    
    // For recirculation mode, default to 1 minute, but allow override via config
    // For normal mode, use config duration or default to 60 minutes
    let duration;
    if (mode === 'recirculation') {
      duration = config.duration !== undefined ? parseInt(config.duration) : 1;
      if (isNaN(duration)) duration = 1; // Fallback to 1 if invalid
    } else {
      duration = config.duration || 60;
    }
    
    this._config = {
      entity: config.entity,
      duration: duration,
      mode: mode,
      title: config.title || null
    };
    
    // Generate unique button ID based on entity and duration
    this._buttonId = `${config.entity}_${this._config.duration}_${this._config.mode}`;
    
    // If hass is already set, trigger render
    if (this._hass) {
      this.render().catch(err => {});
    }
  }

  async connectedCallback() {
    // Check if there's a pending timer in integration and restore it
    if (this._buttonId && this._config?.entity && this._entryId) {
      try {
        const bridgeState = this._getBridgeState();
        const activeButtons = bridgeState?.attributes?.active_buttons || {};
        const activeButton = activeButtons[this._config.entity];
        
        if (activeButton && activeButton.button_id === this._buttonId) {
          const timerEndTime = parseInt(activeButton.timer_end);
          const now = Date.now();
          const remainingMs = timerEndTime - now;
          
          if (remainingMs > 0 && remainingMs < 24 * 60 * 60 * 1000) { // Less than 24 hours
            
            // Clear any existing timer
            if (this._turnOffTimer) {
              clearTimeout(this._turnOffTimer);
            }
            
            // Restore timer
            this._turnOffTimer = setTimeout(async () => {
              try {
                if (this._hass && this._config && this._config.entity) {
                  await this._hass.callService('switch', 'turn_off', {
                    entity_id: this._config.entity
                  });
                  
                  // Clear active button in integration
                  if (this._entryId) {
                    try {
                      await this._callService('clear_active_button', {
                        entity_id: this._config.entity
                      });
                    } catch (e) {
                      // Ignore errors
                    }
                  }
                  
                  setTimeout(() => {
                    if (this._hass && this._config && this._config.entity) {
                      this._hass.callService('homeassistant', 'update_entity', {
                        entity_id: this._config.entity
                      }).catch(() => {});
                      this.hass = { ...this._hass };
                    }
                  }, 100);
                }
              } catch (err) {
                // Ignore errors
              } finally {
                this._turnOffTimer = null;
              }
            }, remainingMs);
          } else if (remainingMs <= 0) {
            // Timer already expired, clean up
            if (this._entryId) {
              try {
                await this._callService('clear_active_button', {
                  entity_id: this._config.entity
                });
              } catch (e) {
                // Ignore errors
              }
            }
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }
    
    await this.render();
    this._scheduleCountdownUpdate();
  }

  _scheduleCountdownUpdate() {
    if (this._countdownTimeout) {
      clearTimeout(this._countdownTimeout);
      this._countdownTimeout = null;
    }
    const target = this._getTurnOffTime();
    if (!target) return;
    const diffMs = target.getTime() - Date.now();
    if (diffMs <= 0) return;
    const intervalMs = diffMs < 60 * 1000 ? 1000 : 60000;
    this._countdownTimeout = setTimeout(() => {
      this._countdownTimeout = null;
      this.render().catch(() => {}).finally(() => this._scheduleCountdownUpdate());
    }, intervalMs);
  }

  disconnectedCallback() {
    // Clear turn-off timer if component is removed
    if (this._turnOffTimer) {
      clearTimeout(this._turnOffTimer);
      this._turnOffTimer = null;
    }
    
    // Clear update interval and countdown timeout
    if (this._updateInterval) {
      clearInterval(this._updateInterval);
      this._updateInterval = null;
    }
    if (this._countdownTimeout) {
      clearTimeout(this._countdownTimeout);
      this._countdownTimeout = null;
    }
    
    if (this._unsubStateChanged) {
      try {
        this._unsubStateChanged();
      } catch (e) {
      }
      this._unsubStateChanged = null;
    }
  }

  _findBridgeSensor() {
    try {
      if (!this._hass || !this._config || !this._config.entity) return;

      const switchEntity = this._config.entity;
      let firstBridgeSensor = null;
    
      for (const entityId in this._hass.states) {
        if (!entityId.startsWith('sensor.')) continue;
        
        try {
          const state = this._hass.states?.[entityId];
          if (!state) continue;
          
          const attrs = state.attributes || {};
          
          if (
            attrs.integration === 'homie_scheduler' &&
            attrs.entry_id
          ) {
            if (!firstBridgeSensor) {
              firstBridgeSensor = { entityId, entryId: attrs.entry_id };
            }
            
            const entityIds = attrs.entity_ids || [];
            const items = attrs.items || [];
            
            if (entityIds.includes(switchEntity)) {
              this._bridgeSensor = entityId;
              this._entryId = attrs.entry_id;
              return;
            }
            
            const hasEntityInItems = items.some(item => item && item.entity_id === switchEntity);
            if (hasEntityInItems) {
              this._bridgeSensor = entityId;
              this._entryId = attrs.entry_id;
              return;
            }
          }
        } catch (err) {
          continue;
        }
      }
    
      if (firstBridgeSensor) {
        this._bridgeSensor = firstBridgeSensor.entityId;
        this._entryId = firstBridgeSensor.entryId;
        return;
      }
    } catch (err) {}
  }

  _getBridgeState() {
    try {
      if (!this._bridgeSensor || !this._hass) return null;
      return this._hass.states?.[this._bridgeSensor] || null;
    } catch (err) {
      return null;
    }
  }

  _getEntityState() {
    try {
      if (!this._config || !this._config.entity || !this._hass) return null;
      return this._hass.states?.[this._config.entity] || null;
    } catch (err) {
      return null;
    }
  }

  _isEntityOn() {
    const entityState = this._getEntityState();
    return entityState?.state === 'on';
  }

  _hasActiveSchedule() {
    try {
      if (!this._config || !this._config.entity) return false;
      
      const bridgeState = this._getBridgeState();
      if (!bridgeState) return false;
      
      const items = bridgeState.attributes?.items || [];
      const entityItems = items.filter(item => item && item.entity_id === this._config.entity);
      
      if (entityItems.length === 0) return false;
      
      // Check if any item is currently active (simplified check)
      // In a real implementation, we'd check against current time
      // For now, we'll check if integration is active and entity is on
      const isIntegrationActive = bridgeState.state === 'active';
      const isEntityOn = this._isEntityOn();
      
      // If entity is on and integration is active, likely there's an active schedule
      return isIntegrationActive && isEntityOn;
    } catch (err) {
      return false;
    }
  }

  /** Check if entity is currently inside an active schedule slot (overlapping with button run). */
  _isInsideActiveSlot() {
    try {
      const bridgeState = this._getBridgeState();
      if (!bridgeState) return false;
      const entityId = this._config?.entity;
      if (!entityId) return false;

      const items = bridgeState.attributes?.items || [];
      const now = new Date();
      const jsDay = now.getDay();
      const intWeekday = jsDay === 0 ? 6 : jsDay - 1;

      for (const item of items) {
        if (!item || item.entity_id !== entityId || !item.enabled) continue;
        const timeStr = item.time;
        const duration = parseInt(item.duration, 10) || 30;
        const weekdays = item.weekdays || [];
        if (!timeStr || !weekdays.length) continue;

        const m = timeStr.match(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/);
        if (!m) continue;
        const hour = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);

        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, min, 0, 0);
        const end = new Date(start.getTime() + duration * 60 * 1000);
        if (weekdays.includes(intWeekday) && start <= now && now < end) return true;

        const startYesterday = new Date(start);
        startYesterday.setDate(startYesterday.getDate() - 1);
        const endYesterday = new Date(startYesterday.getTime() + duration * 60 * 1000);
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayIntWeekday = yesterday.getDay() === 0 ? 6 : yesterday.getDay() - 1;
        if (weekdays.includes(yesterdayIntWeekday) && startYesterday <= now && now < endYesterday) return true;
      }
      return false;
    } catch (err) {
      return false;
    }
  }

  _formatDuration(minutes) {
    if (!minutes || minutes < 1) return { number: '0', unit: 'min' };
    
    if (minutes < 60) {
      return { number: String(minutes), unit: 'min' };
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (remainingMinutes === 0) {
      return { number: String(hours), unit: hours === 1 ? 'hour' : 'hours' };
    }
    
    return { number: `${hours}h ${remainingMinutes}`, unit: 'min' };
  }

  _getTurnOffTime() {
    try {
      const bridgeState = this._getBridgeState();
      if (!bridgeState) return null;
      
      const activeButtons = bridgeState.attributes?.active_buttons || {};
      const activeButton = activeButtons[this._config?.entity];
      
      if (!activeButton || !activeButton.timer_end) return null;
      
      const timerEnd = parseInt(activeButton.timer_end);
      if (isNaN(timerEnd)) return null;
      
      return new Date(timerEnd);
    } catch (err) {
      return null;
    }
  }

  /** Recirculation only: entity was turned ON from outside — set timer for duration (same as if user pressed the button). */
  async _applyRecirculationTimerFromExternal() {
    if (this._config?.mode !== 'recirculation' || !this._config?.entity || !this._hass) return;
    const durationMinutes = parseInt(this._config.duration) || 1;
    const durationMs = durationMinutes * 60 * 1000;
    const timerEndTime = Date.now() + durationMs;

    if (this._turnOffTimer) {
      clearTimeout(this._turnOffTimer);
      this._turnOffTimer = null;
    }

    if (this._buttonId && this._entryId) {
      try {
        await this._callService('set_active_button', {
          entity_id: this._config.entity,
          button_id: this._buttonId,
          timer_end: timerEndTime,
          duration: durationMinutes
        });
      } catch (e) {
        // Ignore errors
      }
    }

    this._turnOffTimer = setTimeout(async () => {
      try {
        if (this._hass && this._config?.entity) {
          if (this._isInsideActiveSlot()) {
            if (this._entryId) {
              try {
                await this._callService('clear_active_button', { entity_id: this._config.entity });
              } catch (e) {}
            }
            this._turnOffTimer = null;
            this.render().catch(() => {});
            return;
          }
          await this._hass.callService('switch', 'turn_off', { entity_id: this._config.entity });
          if (this._entryId) {
            try {
              await this._callService('clear_active_button', { entity_id: this._config.entity });
            } catch (e) {}
          }
          setTimeout(() => {
            if (this._hass && this._config?.entity) {
              this._hass.callService('homeassistant', 'update_entity', { entity_id: this._config.entity }).catch(() => {});
              this.hass = { ...this._hass };
            }
          }, 100);
        }
      } catch (err) {
      } finally {
        this._turnOffTimer = null;
      }
      this.render().catch(() => {});
    }, durationMs);

    this.render().catch(() => {});
  }

  _formatDateTime(date) {
    if (!date) return '';
    
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const timeStr = `${hours}:${minutes}`;
      
      if (dateOnly.getTime() === today.getTime()) {
        return `Today, ${timeStr}`;
      }
      
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (dateOnly.getTime() === tomorrow.getTime()) {
        return `Tomorrow, ${timeStr}`;
      }
      
      // For other dates, show date
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      return `${day}.${month} ${timeStr}`;
    } catch (err) {
      return '';
    }
  }

  _formatTimeUntil(date) {
    if (!date) return '';
    
    try {
      const now = Date.now();
      const targetTime = date.getTime();
      const diffMs = targetTime - now;
      
      if (diffMs <= 0) return 'now';
      
      const diffMinutes = Math.floor(diffMs / (60 * 1000));
      const hours = Math.floor(diffMinutes / 60);
      const minutes = diffMinutes % 60;
      
      if (diffMs < 60 * 1000) {
        const seconds = Math.floor(diffMs / 1000);
        return `${seconds}s`;
      }
      if (hours === 0) {
        return `${minutes}m`;
      } else if (minutes === 0) {
        return `${hours}h`;
      } else {
        return `${hours}h ${minutes}m`;
      }
    } catch (err) {
      return '';
    }
  }

  _getRunsSinceText() {
    try {
      const entityState = this._getEntityState();
      if (!entityState || !entityState.last_changed) return '';
      
      const lastChanged = new Date(entityState.last_changed);
      const now = new Date();
      const diffMs = now - lastChanged;
      const diffMinutes = Math.floor(diffMs / 60000);
      
      if (diffMinutes < 1) {
        return 'just now';
      }
      
      const hours = String(lastChanged.getHours()).padStart(2, '0');
      const minutes = String(lastChanged.getMinutes()).padStart(2, '0');
      const timeStr = `${hours}:${minutes}`;
      
      if (diffMinutes < 60) {
        return `since ${timeStr} (${diffMinutes} min ago)`;
      } else {
        const hrs = Math.floor(diffMinutes / 60);
        const mins = diffMinutes % 60;
        if (mins === 0) {
          return `since ${timeStr} (${hrs}h ago)`;
        }
        return `since ${timeStr} (${hrs}h ${mins}min ago)`;
      }
    } catch (e) {
      return '';
    }
  }

  async _callService(service, data) {
    if (!this._hass) {
      return Promise.resolve();
    }
    
    if (!this._entryId) {
      this._findBridgeSensor();
      if (!this._entryId) {
        const msg = 'Homie Scheduler: bridge sensor not found. Check integration is installed and sensor "Scheduler Info" exists.';
        console.warn(msg);
        if (typeof alert === 'function') alert(msg);
        return Promise.resolve();
      }
    }
    
    if (!this._config || !this._config.entity) {
      return Promise.resolve();
    }

    try {
      const serviceData = { entry_id: this._entryId, ...data };
      const result = await this._hass.callService('homie_scheduler', service, serviceData);
      return result;
    } catch (err) {
      const msg = 'Homie Scheduler: ' + (err?.message || String(err));
      console.error(msg, err);
      if (typeof alert === 'function') alert(msg);
      throw err;
    }
  }

  async _runSchedule() {
    const isOn = this._isEntityOn();
    
    // Check if this specific button is the active one
    let isThisButtonActive = false;
    if (this._buttonId) {
      try {
        const bridgeState = this._getBridgeState();
        const activeButtons = bridgeState?.attributes?.active_buttons || {};
        const activeButton = activeButtons[this._config.entity];
        if (activeButton && activeButton.button_id === this._buttonId) {
          isThisButtonActive = true;
        }
      } catch (e) {
        // Ignore errors
      }
    }
    
    // If entity is on AND this button activated it - turn off
    if (isOn && isThisButtonActive) {
      try {
        // Clear turn-off timer
        if (this._turnOffTimer) {
          clearTimeout(this._turnOffTimer);
          this._turnOffTimer = null;
        }
        
        // Clear active button marker in integration
        if (this._config.entity && this._entryId) {
          try {
            await this._callService('clear_active_button', {
              entity_id: this._config.entity
            });
          } catch (e) {
            // Ignore errors
          }
        }
        
        // Turn off entity
        await this._hass.callService('switch', 'turn_off', {
          entity_id: this._config.entity
        });
        
        // Update entity state
        setTimeout(() => {
          if (this._hass && this._config && this._config.entity) {
            this._hass.callService('homeassistant', 'update_entity', {
              entity_id: this._config.entity
            }).catch(() => {});
            this.hass = { ...this._hass };
          }
        }, 100);
        
        return;
      } catch (err) {
        alert('Failed to turn off: ' + (err.message || err));
        return;
      }
    }
    
    // If entity is on but another button activated it - switch to this button
    // (turn off, then turn on with this button's duration)
    if (isOn && !isThisButtonActive) {
      try {
        // Turn off first
        await this._hass.callService('switch', 'turn_off', {
          entity_id: this._config.entity
        });
        
        // Wait a bit for state to update
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Then continue to turn on with new duration (fall through to normal logic)
      } catch (err) {
        alert('Failed to switch: ' + (err.message || err));
        return;
      }
    }

    try {
      // Step 1: Turn on boiler immediately (for instant response)
      if (this._config?.mode === 'recirculation') this._weJustTurnedOn = true;
      try {
        await this._hass.callService('switch', 'turn_on', {
          entity_id: this._config.entity
        });
        
        // Update entity state immediately so button shows disabled state
        try {
          await this._hass.callService('homeassistant', 'update_entity', {
            entity_id: this._config.entity
          });
        } catch (e) {
          // Ignore update errors, state will update eventually
        }
        
        // Force update hass state to reflect entity change
        setTimeout(() => {
          if (this._hass && this._config && this._config.entity) {
            // Request fresh state
            this._hass.callService('homeassistant', 'update_entity', {
              entity_id: this._config.entity
            }).catch(() => {});
            
            // Update hass reference to trigger re-render
            this.hass = { ...this._hass };
          }
        }, 100);
      } catch (err) {
        alert('Failed to turn on boiler: ' + (err.message || err));
        return;
      }

      // Step 2: Schedule automatic turn-off using setTimeout (no slot creation needed)
      const durationMinutes = parseInt(this._config.duration) || 60;
      const durationMs = durationMinutes * 60 * 1000;
      
      // Clear any existing turn-off timer for this entity
      if (this._turnOffTimer) {
        clearTimeout(this._turnOffTimer);
        this._turnOffTimer = null;
      }
      
      // Calculate timer end time
      const timerStartTime = Date.now();
      const timerEndTime = timerStartTime + durationMs;
      
      // Step 3: Mark this button as active in integration (via service)
      if (this._buttonId && this._entryId) {
        try {
          await this._callService('set_active_button', {
            entity_id: this._config.entity,
            button_id: this._buttonId,
            timer_end: timerEndTime,
            duration: durationMinutes
          });
        } catch (e) {
          // Ignore errors
        }
      }
      if (this._config?.mode === 'recirculation') {
        setTimeout(() => { this._weJustTurnedOn = false; }, 500);
      }

      // Schedule turn-off after duration
      this._turnOffTimer = setTimeout(async () => {
        try {
          if (this._hass && this._config && this._config.entity) {
            // If a schedule slot has started and overlaps — let scheduler control turn-off (respects max_runtime)
            if (this._isInsideActiveSlot()) {
              if (this._config.entity && this._entryId) {
                try {
                  await this._callService('clear_active_button', {
                    entity_id: this._config.entity
                  });
                } catch (e) {
                  // Ignore errors
                }
              }
              this._turnOffTimer = null;
              this.render().catch(() => {});
              return;
            }
            await this._hass.callService('switch', 'turn_off', {
              entity_id: this._config.entity
            });
            // Clear active button marker in integration
            if (this._config.entity && this._entryId) {
              try {
                await this._callService('clear_active_button', {
                  entity_id: this._config.entity
                });
              } catch (e) {
                // Ignore errors
              }
            }
            
            // Update entity state to reflect turn-off
            setTimeout(() => {
              if (this._hass && this._config && this._config.entity) {
                this._hass.callService('homeassistant', 'update_entity', {
                  entity_id: this._config.entity
                }).catch(() => {});
                this.hass = { ...this._hass };
              }
            }, 100);
          } else {
          }
        } catch (err) {
          // Ignore errors
        } finally {
          this._turnOffTimer = null;
        }
      }, durationMs);
      
      // Trigger re-render to show active state
      setTimeout(() => {
        this.render().catch(() => {});
      }, 150);
    } catch (err) {
      alert('Failed to run schedule: ' + (err.message || err));
    }
  }

  _attachEventListeners() {
    // Find all buttons with data-action (both normal and recirculation)
    const buttons = this.shadowRoot.querySelectorAll('[data-action="run-schedule"]');
    
    buttons.forEach(button => {
      // Skip hidden buttons
      if (button.classList.contains('hidden')) {
        return;
      }
      
      // Remove old listeners by cloning
      const newButton = button.cloneNode(true);
      button.parentNode.replaceChild(newButton, button);
      
      newButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (newButton.classList.contains('disabled')) return;
        this._runSchedule().catch(err => {
        });
      });
    });
  }

  _showError(message) {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = `
      <div style="padding: 16px; color: var(--error-color, #f44336);">
        ${message}
      </div>
    `;
  }

  async render() {
    if (!this.shadowRoot) return;
    
    if (!this._config || !this._config.entity) {
      this._showError('Please configure entity in card settings');
      return;
    }

    try {
      const template = await this._loadTemplate();
      
      // Check mode - use the mode that was set in setConfig
      const isRecirculation = this._config?.mode === 'recirculation';
      
      const isEntityOn = this._isEntityOn();
      const hasActiveSchedule = this._hasActiveSchedule();
      
      // Check if this specific button is the active one (from integration)
      let isThisButtonActive = false;
      if (this._buttonId) {
        try {
          const bridgeState = this._getBridgeState();
          const activeButtons = bridgeState?.attributes?.active_buttons || {};
          const activeButton = activeButtons[this._config.entity];
          if (activeButton && activeButton.button_id === this._buttonId) {
            isThisButtonActive = true;
          }
        } catch (e) {
          // Ignore errors
        }
      }

      // Recirculation fallback: entity is ON but we have no timer (e.g. turned on from outside, or we missed state_changed)
      if (isRecirculation && isEntityOn && !isThisButtonActive && !this._externalRecirculationTimerSet && !this._weJustTurnedOn) {
        this._externalRecirculationTimerSet = true;
        setTimeout(() => this._applyRecirculationTimerFromExternal(), 0);
      }
      
      // Build classes for both buttons
      let normalButtonClass = 'schedule-button';
      let recirculationButtonClass = 'schedule-button recirculation';
      
      if (isEntityOn) {
        if (isThisButtonActive) {
          // This button activated the entity - show active (allow turn-off)
          normalButtonClass += ' active';
          recirculationButtonClass += ' active';
        } else {
          // Entity is on from another button/source - show disabled
          normalButtonClass += ' disabled';
          // Recirculation mode must never look/act disabled (user request)
        }
      } else if (hasActiveSchedule) {
        normalButtonClass += ' active';
        recirculationButtonClass += ' active';
      }

      // Recirculation UX: if entity is ON, always show active color (even if started elsewhere),
      // but never disable the recirculation button.
      if (isRecirculation && isEntityOn && !recirculationButtonClass.includes(' active')) {
        recirculationButtonClass += ' active';
      }
      
      // Build content for normal button
      const durationParts = this._formatDuration(this._config.duration);
      let labelText = 'Run for';
      let durationNumber = durationParts.number;
      let durationUnit = durationParts.unit;
      
      if (isEntityOn) {
        // Active button shows "Runs for", others show "Run for"
        labelText = isThisButtonActive ? 'Runs for' : 'Run for';
      } else if (hasActiveSchedule) {
        labelText = 'Run for';
        durationNumber = 'Heating';
        durationUnit = '';
      }
      
      // Build recirculation labels
      let recirculationLabelTop = 'Recirculation';
      let recirculationLabelBottom = '';
      
      if (isRecirculation) {
        if (isEntityOn && isThisButtonActive) {
          // Recirculation is running from this button
          recirculationLabelTop = 'Recirculation';
          
          // Get turn-off time
          const turnOffTime = this._getTurnOffTime();
          let targetTime = turnOffTime;
          
          if (!targetTime) {
            // Fallback if no timer_end - calculate expected time
            targetTime = new Date(Date.now() + (this._config.duration * 60 * 1000));
          }
          
          const timeUntil = this._formatTimeUntil(targetTime);
          recirculationLabelBottom = `will be off in ${timeUntil}`;
        } else if (isEntityOn && !isThisButtonActive) {
          // Entity is on, but not from this button (manual or other source)
          recirculationLabelTop = 'Already running';
          const runsSinceText = this._getRunsSinceText();
          recirculationLabelBottom = runsSinceText || '';
        } else {
          // Recirculation is off
          recirculationLabelTop = 'Recirculation';
          const durationParts = this._formatDuration(this._config.duration);
          recirculationLabelBottom = `for ${durationParts.number} ${durationParts.unit}`;
        }
      }
      
      // Replace placeholders in template
      let html = template
        .replace(/\{\{NORMAL_BUTTON_CLASS\}\}/g, normalButtonClass)
        .replace(/\{\{LABEL_TEXT\}\}/g, labelText)
        .replace(/\{\{DURATION_NUMBER\}\}/g, durationNumber)
        .replace(/\{\{DURATION_UNIT\}\}/g, durationUnit)
        .replace(/\{\{RECIRCULATION_BUTTON_CLASS\}\}/g, recirculationButtonClass)
        .replace(/\{\{RECIRCULATION_LABEL_TOP\}\}/g, recirculationLabelTop)
        .replace(/\{\{RECIRCULATION_LABEL_BOTTOM\}\}/g, recirculationLabelBottom);
      
      // Hide the button that doesn't match the current mode
      if (isRecirculation) {
        // Hide normal button (first button), show recirculation (second button)
        html = html.replace(
          /<button class="([^"]*)" data-action="run-schedule">\s*<span class="button-label">/,
          '<button class="$1 hidden" data-action="run-schedule"><span class="button-label">'
        );
      } else {
        // Hide recirculation button (second button), show normal (first button)
        html = html.replace(
          /<button class="([^"]*recirculation[^"]*)" data-action="run-schedule">/,
          '<button class="$1 hidden" data-action="run-schedule">'
        );
      }
      
      const styleContent = `/**\n * Boiler Schedule Button Card - Simplified Styles\n * \n * Simple HA-style button\n */\n\n:host {\n  display: block;\n  margin: 0 !important;\n  \n  /* Button design tokens - паттерн как в Mushroom cards */\n  /* Кнопка = карточка, поэтому использует фон и тени карточки */\n  --_bg: var(--ha-card-background, var(--card-background-color, #1c1c1c));\n  --_radius: var(--ha-card-border-radius, 12px);\n  --_shadow: var(--ha-card-box-shadow, none);\n  --_backdrop-filter: var(--ha-card-backdrop-filter, none);\n  --_border-color: var(--divider-color, rgba(255, 255, 255, 0.12));\n  \n  --_text: var(--primary-text-color, #fff);\n  --_text-secondary: var(--secondary-text-color, rgba(255,255,255,0.7));\n  \n  --_accent: var(--homie-button-accent, var(--primary-color, #03a9f4));\n  --_disabled-opacity: 0.5;\n  \n  /* Inactive = обычный фон карточки, Active = акцентный цвет */\n  /* С возможностью переопределения через --homie-button-* переменные */\n  --_button-bg-inactive: var(--homie-button-bg-inactive, var(--_bg));\n  --_button-bg-active: var(--homie-button-bg-active, var(--_accent));\n  --_button-bg-disabled: var(--homie-button-bg-disabled, var(--_bg));\n  \n  /* Текст на inactive кнопке = акцентный цвет (primary-color, обычно синий) */\n  --_button-text-inactive: var(--homie-button-text-inactive, var(--primary-color, #03a9f4));\n  --_button-text-active: var(--homie-button-text-active, var(--text-primary-color, #fff));\n  --_button-text-disabled: var(--homie-button-text-disabled, var(--disabled-text-color, rgba(255,255,255,0.5)));\n  \n  --_button-radius: var(--homie-button-radius, var(--_radius));\n  --_button-shadow: var(--homie-button-shadow, var(--_shadow));\n  --_button-shadow-active: var(--homie-button-shadow-active, var(--_shadow));\n  --_button-backdrop-filter: var(--homie-button-backdrop-filter, var(--_backdrop-filter));\n  --_button-border-color: var(--homie-button-border-color, var(--_border-color));\n}\n\n.schedule-button {\n  width: 100%;\n  height: 100%;\n  padding: 12px 16px;\n  border-radius: var(--_button-radius);\n  background: var(--_button-bg-inactive);\n  border: 1px solid var(--_button-border-color);\n  color: var(--_button-text-inactive);\n  box-shadow: var(--_button-shadow);\n  -webkit-backdrop-filter: var(--_button-backdrop-filter);\n  backdrop-filter: var(--_button-backdrop-filter);\n  cursor: pointer;\n  font-size: 14px;\n  font-weight: 500;\n  text-align: center;\n  transition: all 0.2s ease-in-out;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  gap: 4px;\n}\n\n.hidden {\n  display: none !important;\n}\n\n.button-label {\n  font-size: 12px;\n  font-weight: 400;\n  opacity: 0.9;\n  text-transform: uppercase;\n  letter-spacing: 0.5px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 8px;\n}\n\n.label-icon {\n  width: 14px;\n  height: 14px;\n  opacity: 0.9;\n  flex-shrink: 0;  /* Prevent icon from shrinking */\n  margin-right: 4px;  /* Additional spacing */\n}\n\n.button-duration {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  line-height: 1.2;\n}\n\n.duration-number {\n  font-size: 40px;\n  font-weight: 600;\n}\n\n.duration-unit {\n  font-size: 18px;\n  font-weight: 600;\n  opacity: 0.9;\n}\n\n.schedule-button.active {\n  background: var(--_button-bg-active);\n  color: var(--_button-text-active);\n  box-shadow: var(--_button-shadow-active);\n}\n\n.schedule-button.disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n  pointer-events: none;\n  background: var(--_button-bg-disabled);\n  color: var(--_button-text-disabled);\n  box-shadow: none;\n}\n\n/* Active button that is also disabled - keep active color but make it non-clickable */\n.schedule-button.active.disabled {\n  background: var(--_button-bg-active);\n  color: var(--_button-text-active);\n  opacity: 1;  /* Keep full opacity for active button */\n  cursor: not-allowed;\n  pointer-events: none;\n  box-shadow: var(--_button-shadow-active);\n}\n\n/* Recirculation mode styles */\n.schedule-button.recirculation {\n  flex-direction: column;\n  gap: 8px;\n  padding: 16px;\n}\n\n.recirculation-icon {\n  opacity: 1 !important; /* Override parent opacity */\n  color: inherit; /* Inherit text color from button */\n  --mdc-icon-size: 50px;\n  transition: transform 0.3s ease, opacity 0.2s ease;\n  display: block;\n}\n\n\n/* Hover effect for icon - removed for recirculation */\n\n/* Active state for icon */\n.schedule-button.recirculation.active .recirculation-icon {\n  opacity: 1 !important;\n  animation: pulse 2s ease-in-out infinite;\n}\n\n@keyframes pulse {\n  0%, 100% {\n    opacity: 1;\n  }\n  50% {\n    opacity: 0.8;\n  }\n}\n\n.recirculation-label-top,\n.recirculation-label-bottom {\n  font-size: 12px;\n  font-weight: 300; /* Thin text */\n  text-transform: uppercase;\n  letter-spacing: 0.3px;\n  opacity: 0.9;\n  line-height: 1.2;\n}\n\n.recirculation-label-top {\n  margin-bottom: 4px;\n}\n\n.recirculation-label-bottom {\n  margin-top: 4px;\n}\n\n/* ============================================\n * Кастомизация через CSS переменные\n * ============================================\n * \n * Можно переопределить в themes.yaml или через card-mod:\n * \n * homie-scheduler-boiler-button {\n *   --homie-button-bg-inactive: #2c2c2c;\n *   --homie-button-bg-active: #4caf50;\n *   --homie-button-bg-disabled: #1a1a1a;\n *   \n *   --homie-button-text-inactive: #ffffff;\n *   --homie-button-text-active: #ffffff;\n *   --homie-button-text-disabled: rgba(255,255,255,0.3);\n * \n *   --homie-button-backdrop-filter: var(--ha-card-backdrop-filter, none);\n *   --homie-button-border-color: var(--divider-color, rgba(255, 255, 255, 0.12));\n *   \n *   --homie-button-radius: 16px;\n *   --homie-button-shadow: 0 2px 4px rgba(0,0,0,0.1);\n *   --homie-button-shadow-active: 0 4px 12px rgba(76,175,80,0.4);\n * }\n */\n`;
      
      this.shadowRoot.innerHTML = `<style>${styleContent}</style>${html}`;
      
      this._attachEventListeners();
      this._scheduleCountdownUpdate();
    } catch (err) {
      this._showError('Failed to render card: ' + (err.message || err));
    }
  }
}

// Register custom element (safe: skip if already defined)
if (typeof customElements !== 'undefined' && !customElements.get('homie-scheduler-boiler-button')) {
  customElements.define('homie-scheduler-boiler-button', HomieBoilerScheduleButtonCard);
  window.logCardInfo('boiler-button-card');
}

class HomieBoilerStatusCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = null;
    this._hass = null;
    this._entryId = null;
    this._bridgeSensor = null;
    this._htmlTemplate = null;
    this._unsubStateChanged = null;
    this._turnOffTimer = null;  // Timer for scheduled turn-off
    this._updateInterval = null;  // Interval for updating countdown (every minute)
    this._countdownTimeout = null; // Timeout for next countdown update (1s or 60s)
    this._refreshTimeout = null;   // One-time refresh when bridge may be stale (e.g. after slot start)
    this._bridgePollTimer = null;  // Poll bridge when entity turns on (bridge updates async)
    this._bridgePollCount = 0;
    this._bridgeStateOverride = null;  // Fresh bridge state from state_changed event (hass may be stale)
    this._registeredForLastRun = false;  // So integration tracks this entity for Latest activity (incl. external turn-on)
    this._bridgeRefreshWhenShownTimer = null;  // One-time refresh of bridge when dashboard is shown (catch toggle-from-elsewhere)
  }

  async _loadTemplate() {
    if (this._htmlTemplate) return this._htmlTemplate;
    
    // Template is embedded in production build
    this._htmlTemplate = `<div class="status-card">\n  <button class="icon-button {{ICON_BUTTON_CLASS}}" data-action="toggle">\n    <div class="icon-circle">\n      <ha-icon icon="mdi:water-thermometer-outline" class="status-icon"></ha-icon>\n    </div>\n  </button>\n  <div class="content">\n    <div class="title">{{TITLE}} <span class="entity-status">{{ENTITY_STATUS}}</span></div>\n    <div class="subtitle max-time {{MAX_TIME_HIDDEN_CLASS}}">\n      Max run time: {{MAX_WORKING_TIME}}\n    </div>\n    <div class="subtitle last-run {{LAST_RUN_HIDDEN_CLASS}}">\n      Latest activity: {{LAST_RUN_TEXT}}\n    </div>\n    <div class="subtitle">{{SUBTITLE}}</div>\n  </div>\n</div>\n`;
    return this._htmlTemplate;
  }

  set hass(hass) {
    try {
      const wasInitialized = !!this._hass;
      this._hass = hass;
      
      // Find bridge sensor on first hass set
      if (!this._bridgeSensor) {
        this._findBridgeSensor();
      }

      // When dashboard is shown, refresh bridge once so Latest activity is current (e.g. if user toggled from elsewhere)
      if (this._bridgeSensor && this._hass?.callService) {
        if (this._bridgeRefreshWhenShownTimer) clearTimeout(this._bridgeRefreshWhenShownTimer);
        this._bridgeRefreshWhenShownTimer = setTimeout(() => {
          this._bridgeRefreshWhenShownTimer = null;
          if (this._hass) {
            this._hass.callService('homeassistant', 'update_entity', { entity_id: this._bridgeSensor }).catch(() => {});
            this.hass = { ...this._hass };
            this.render().catch(() => {});
          }
        }, 2000);
      }

      // Register entity for Latest activity tracking (so external turn-on is recorded when app is closed)
      if (this._entryId && this._config?.entity && !this._registeredForLastRun && this._hass?.callService) {
        this._registeredForLastRun = true;
        this._hass.callService('homie_scheduler', 'register_entity_for_last_run', {
          entry_id: this._entryId,
          entity_id: this._config.entity
        }).catch(() => {});
      }
      
      // Subscribe to state_changed events for bridge sensor and entity
      if (this._hass && this._hass.connection && !this._unsubStateChanged) {
        try {
          this._hass.connection.subscribeEvents(
            (event) => {
              const entityId = event?.data?.entity_id;
              const watched = [this._bridgeSensor, this._config?.entity].filter(Boolean);
              if (!entityId || !watched.includes(entityId)) return;

              if (event.data) {
                if (this._hass) {
                  // Use new_state from event directly — hass.states may not be updated yet
                  const newState = event.data.new_state;
                  if (entityId === this._bridgeSensor && newState) {
                    this._bridgeStateOverride = newState;
                    this.hass = { ...this._hass };
                    setTimeout(() => this.render().catch(() => {}), 0);
                  }
                  this._hass.callService('homeassistant', 'update_entity', {
                    entity_id: entityId
                  }).catch(() => {});
                  if (entityId !== this._bridgeSensor) {
                    this.hass = { ...this._hass };
                    setTimeout(() => this.render().catch(() => {}), 50);
                  }
                  if (entityId === this._config?.entity) {
                    setTimeout(() => this.render().catch(() => {}), 200);
                    setTimeout(() => this.render().catch(() => {}), 400);
                    this._startBridgePoll();
                    // When entity turned OFF (from anywhere): refresh bridge so Latest activity updates (integration updates on same state_changed)
                    const isOff = newState && String(newState.state).toLowerCase() === 'off';
                    if (isOff && this._bridgeSensor) {
                      const refreshBridgeAndRender = () => {
                        if (!this._hass) return;
                        this._hass.callService('homeassistant', 'update_entity', { entity_id: this._bridgeSensor })
                          .then(() => {
                            if (this._hass) {
                              this.hass = { ...this._hass };
                              this.render().catch(() => {});
                            }
                          })
                          .catch(() => {});
                      };
                      [300, 800, 5000, 15000, 25000].forEach((ms) => {
                        setTimeout(refreshBridgeAndRender, ms);
                      });
                    }
                  }
                  if (entityId === this._bridgeSensor) {
                    this._startBridgePoll();
                  }
                }
              }
            },
            'state_changed'
          ).then((unsubscribeFn) => {
            this._unsubStateChanged = unsubscribeFn;
          }).catch((e) => {
          });
        } catch (e) {
        }
      }
      
      // Re-render on state changes
      this.render().catch(err => {});
    } catch (err) {}
  }

  get hass() {
    return this._hass;
  }

  setConfig(config) {
    if (!config) {
      throw new Error('Invalid configuration');
    }
    
    if (!config.entity) {
      throw new Error('Entity is required');
    }
    
    this._config = {
      entity: config.entity,
      title: config.title || null
    };
    
    // If hass is already set, trigger render
    if (this._hass) {
      this.render().catch(err => {});
    }
  }

  async connectedCallback() {
    // Check if there's a pending timer in integration and restore it
    if (this._config?.entity && this._entryId) {
      try {
        const bridgeState = this._getBridgeState();
        const activeButtons = bridgeState?.attributes?.active_buttons || {};
        const activeButton = activeButtons[this._config.entity];
        
        if (activeButton && activeButton.timer_end) {
          const timerEndTime = parseInt(activeButton.timer_end);
          const now = Date.now();
          const remainingMs = timerEndTime - now;
          
          if (remainingMs > 0 && remainingMs < 24 * 60 * 60 * 1000) { // Less than 24 hours
            // Clear any existing timer
            if (this._turnOffTimer) {
              clearTimeout(this._turnOffTimer);
            }
            
            // Restore timer
            this._turnOffTimer = setTimeout(async () => {
              try {
                if (this._hass && this._config && this._config.entity) {
                  await this._hass.callService('switch', 'turn_off', {
                    entity_id: this._config.entity
                  });
                  
                  // Clear active button in integration
                  if (this._entryId) {
                    try {
                      await this._callService('clear_active_button', {
                        entity_id: this._config.entity
                      });
                    } catch (e) {
                      // Ignore errors
                    }
                  }
                  
                  setTimeout(() => {
                    if (this._hass && this._config && this._config.entity) {
                      this._hass.callService('homeassistant', 'update_entity', {
                        entity_id: this._config.entity
                      }).catch(() => {});
                      this.hass = { ...this._hass };
                    }
                  }, 100);
                }
              } catch (err) {
                // Ignore errors
              } finally {
                this._turnOffTimer = null;
              }
            }, remainingMs);
          } else if (remainingMs <= 0) {
            // Timer already expired, clean up
            if (this._entryId) {
              try {
                await this._callService('clear_active_button', {
                  entity_id: this._config.entity
                });
              } catch (e) {
                // Ignore errors
              }
            }
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }
    
    await this.render();
    this._scheduleCountdownUpdate();
  }

  _scheduleCountdownUpdate() {
    if (this._countdownTimeout) {
      clearTimeout(this._countdownTimeout);
      this._countdownTimeout = null;
    }
    const isOn = this._isEntityOn();
    const turnOffTime = this._getTurnOffTime();
    const nextRun = this._getNextRunTime();
    let target = null;
    if (isOn && turnOffTime) target = turnOffTime;
    else if (nextRun) target = nextRun;
    if (!target) return;
    const diffMs = target.getTime() - Date.now();
    if (diffMs <= 0) return;
    // Always update every second when showing countdown (we display minutes and seconds)
    const intervalMs = 1000;
    this._countdownTimeout = setTimeout(() => {
      this._countdownTimeout = null;
      this.render().catch(() => {}).finally(() => this._scheduleCountdownUpdate());
    }, intervalMs);
  }

  /** Schedule a one-time re-render to pick up fresh bridge state (e.g. after slot start). */
  _scheduleCountdownRefresh() {
    if (this._refreshTimeout) return;
    this._refreshTimeout = setTimeout(() => {
      this._refreshTimeout = null;
      this.render().catch(() => {}).finally(() => {
        if (this._isEntityOn() && this._getTurnOffTime()) this._scheduleCountdownUpdate();
      });
    }, 800);
  }

  /** Poll bridge sensor when entity is on — bridge updates async after slot start. */
  _startBridgePoll() {
    if (this._bridgePollTimer) return;
    this._bridgePollCount = 0;
    const poll = () => {
      if (!this._bridgeSensor || !this._hass || !this._isEntityOn()) {
        this._bridgePollTimer = null;
        return;
      }
      if (this._bridgePollCount >= 10) {
        this._bridgePollTimer = null;
        return;
      }
      this._bridgePollCount++;
      this._hass.callService('homeassistant', 'update_entity', {
        entity_id: this._bridgeSensor
      }).catch(() => {});
      this.hass = { ...this._hass };
      this.render().catch(() => {});
      this._bridgePollTimer = setTimeout(poll, 2000);
    };
    this._bridgePollTimer = setTimeout(poll, 500);
  }

  _stopBridgePoll() {
    if (this._bridgePollTimer) {
      clearTimeout(this._bridgePollTimer);
      this._bridgePollTimer = null;
    }
  }

  disconnectedCallback() {
    // Clear turn-off timer if component is removed
    if (this._turnOffTimer) {
      clearTimeout(this._turnOffTimer);
      this._turnOffTimer = null;
    }
    
    // Clear update interval and countdown timeout
    if (this._updateInterval) {
      clearInterval(this._updateInterval);
      this._updateInterval = null;
    }
    if (this._countdownTimeout) {
      clearTimeout(this._countdownTimeout);
      this._countdownTimeout = null;
    }
    if (this._refreshTimeout) {
      clearTimeout(this._refreshTimeout);
      this._refreshTimeout = null;
    }
    if (this._bridgeRefreshWhenShownTimer) {
      clearTimeout(this._bridgeRefreshWhenShownTimer);
      this._bridgeRefreshWhenShownTimer = null;
    }
    this._stopBridgePoll();
    
    if (this._unsubStateChanged) {
      try {
        this._unsubStateChanged();
      } catch (e) {
      }
      this._unsubStateChanged = null;
    }
  }

  _findBridgeSensor() {
    try {
      if (!this._hass || !this._config || !this._config.entity) return;

      const switchEntity = this._config.entity;
      let firstBridgeSensor = null;
    
      for (const entityId in this._hass.states) {
        if (!entityId.startsWith('sensor.')) continue;
        
        try {
          const state = this._hass.states?.[entityId];
          if (!state) continue;
          
          const attrs = state.attributes || {};
          
          if (
            attrs.integration === 'homie_scheduler' &&
            attrs.entry_id
          ) {
            if (!firstBridgeSensor) {
              firstBridgeSensor = { entityId, entryId: attrs.entry_id };
            }
            
            const entityIds = attrs.entity_ids || [];
            const items = attrs.items || [];
            
            if (entityIds.includes(switchEntity)) {
              this._bridgeSensor = entityId;
              this._entryId = attrs.entry_id;
              return;
            }
            
            const hasEntityInItems = items.some(item => item && item.entity_id === switchEntity);
            if (hasEntityInItems) {
              this._bridgeSensor = entityId;
              this._entryId = attrs.entry_id;
              return;
            }
          }
        } catch (err) {
          continue;
        }
      }
    
      if (firstBridgeSensor) {
        this._bridgeSensor = firstBridgeSensor.entityId;
        this._entryId = firstBridgeSensor.entryId;
        return;
      }
    } catch (err) {}
  }

  _getBridgeState() {
    try {
      if (!this._bridgeSensor || !this._hass) return null;
      // Prefer fresh state from state_changed event (hass.states may be stale)
      if (this._bridgeStateOverride) return this._bridgeStateOverride;
      return this._hass.states?.[this._bridgeSensor] || null;
    } catch (err) {
      return null;
    }
  }

  _getEntityState() {
    try {
      if (!this._config || !this._config.entity || !this._hass) return null;
      return this._hass.states?.[this._config.entity] || null;
    } catch (err) {
      return null;
    }
  }

  _isEntityOn() {
    const entityState = this._getEntityState();
    return entityState?.state === 'on';
  }

  _getTitle() {
    // Use config title if provided
    if (this._config?.title) {
      return this._config.title;
    }
    
    // Fallback to friendly_name or entity_id
    const entityState = this._getEntityState();
    if (entityState?.attributes?.friendly_name) {
      return entityState.attributes.friendly_name;
    }
    
    // Fallback to entity_id
    return this._config?.entity || 'Boiler';
  }

  _getNextRunTime() {
    try {
      const bridgeState = this._getBridgeState();
      if (!bridgeState) return null;
      
      const entityId = this._config?.entity;
      if (!entityId) return null;
      
      // Priority 1: entity_next_runs — next slot START (when boiler will turn on)
      // Use this first: entity_next_transitions can be slot END when boiler is off during active slot
      const entityNextRuns = bridgeState.attributes?.entity_next_runs || {};
      const entityData = entityNextRuns[entityId];
      if (entityData && entityData.next_run) {
        const nextRunDate = new Date(entityData.next_run);
        if (!isNaN(nextRunDate.getTime()) && nextRunDate > new Date()) return nextRunDate;
      }
      
      // Priority 2: entity_next_transitions (only if earlier than now = next event)
      const entityNextTransitions = bridgeState.attributes?.entity_next_transitions || {};
      const nextTransition = entityNextTransitions[entityId];
      if (nextTransition) {
        const nextDate = new Date(nextTransition);
        if (!isNaN(nextDate.getTime()) && nextDate > new Date()) return nextDate;
      }
      
      // Fallback: global next_run (backward compat)
      const nextRun = bridgeState.attributes?.next_run;
      if (!nextRun) return null;
      const nextRunDate = new Date(nextRun);
      if (isNaN(nextRunDate.getTime()) || nextRunDate <= new Date()) return null;
      return nextRunDate;
    } catch (err) {
      return null;
    }
  }

  /** Collect max_runtime_turn_off_times from ALL bridge sensors (multiple Homie Scheduler instances). */
  _getAllTurnOffCandidatesFromBridges() {
    const entityId = this._config?.entity;
    if (!entityId || !this._hass?.states) return [];
    const now = new Date();
    const candidates = [];
    for (const eid in this._hass.states) {
      if (!eid.startsWith('sensor.')) continue;
      // Use fresh bridge state from state_changed when available (slot start updates bridge async)
      const state = (eid === this._bridgeSensor && this._bridgeStateOverride)
        ? this._bridgeStateOverride
        : this._hass.states[eid];
      const attrs = state?.attributes || {};
      if (attrs.integration !== 'homie_scheduler' || !attrs.entry_id) continue;
      const entityIds = attrs.entity_ids || [];
      const items = attrs.items || [];
      const hasEntity = entityIds.includes(entityId) || items.some(i => i?.entity_id === entityId);
      if (!hasEntity) continue;
      const maxRuntimeTurnOffTimes = attrs.max_runtime_turn_off_times || {};
      const val = maxRuntimeTurnOffTimes[entityId];
      if (val == null || val === '') continue;
      let turnOffMs = parseInt(val, 10);
      if (isNaN(turnOffMs)) continue;
      if (turnOffMs > 0 && turnOffMs < 1e12) turnOffMs *= 1000;
      const d = new Date(turnOffMs);
      if (d > now) candidates.push(d.getTime());
    }
    return candidates;
  }

  _getTurnOffTime() {
    try {
      const bridgeState = this._getBridgeState();
      if (!bridgeState) return null;

      const entityId = this._config?.entity;
      if (!entityId) return null;

      const activeButtons = bridgeState.attributes?.active_buttons || {};
      const activeButton = activeButtons[entityId];

      // Priority 1: active_buttons (from button card set_active_button)
      if (activeButton && activeButton.timer_end) {
        let timerEnd = parseInt(activeButton.timer_end, 10);
        if (!isNaN(timerEnd)) {
          if (timerEnd > 0 && timerEnd < 1e12) timerEnd *= 1000; // seconds → ms
          const d = new Date(timerEnd);
          if (d > new Date()) return d;
        }
      }

      // Collect all valid turn-off times; boiler turns off at the earliest
      const now = new Date();
      const candidates = [];

      // max_runtime_turn_off_times from ALL bridge sensors (multiple instances → take min)
      const bridgeCandidates = this._getAllTurnOffCandidatesFromBridges();
      candidates.push(...bridgeCandidates);

      // Fallback: entity.last_changed + max_runtime (only when integration hasn't provided turn-off time)
      const hasTurnOffFromIntegration = candidates.length > 0;
      if (!hasTurnOffFromIntegration) {
        const entityMaxRuntime = bridgeState.attributes?.entity_max_runtime || {};
        const maxMinutes = entityMaxRuntime[entityId];
        if (maxMinutes != null && Number(maxMinutes) > 0) {
          const entityState = this._getEntityState();
          if (entityState && entityState.state === 'on' && entityState.last_changed) {
            const lastChanged = new Date(entityState.last_changed).getTime();
            const d = new Date(lastChanged + Number(maxMinutes) * 60 * 1000);
            if (d > now) candidates.push(d.getTime());
          }
        }
      }

      if (candidates.length > 0) return new Date(Math.min(...candidates));

      return null;
    } catch (err) {
      return null;
    }
  }

  _hasSchedules() {
    try {
      const bridgeState = this._getBridgeState();
      if (!bridgeState) return false;
      
      const items = bridgeState.attributes?.items || [];
      const entityItems = items.filter(item => 
        item && item.entity_id === this._config?.entity && item.enabled
      );
      
      return entityItems.length > 0;
    } catch (err) {
      return false;
    }
  }

  /** Compute slot end time from active items (uses duration). Fallback when integration hasn't stored turn-off yet. */
  _getSlotEndFromActiveItems() {
    try {
      const bridgeState = this._getBridgeState();
      if (!bridgeState) return null;
      const entityId = this._config?.entity;
      if (!entityId) return null;
      const entityState = this._getEntityState();
      if (!entityState || entityState.state !== 'on') return null;

      const items = bridgeState.attributes?.items || [];
      const now = new Date();
      let earliestEnd = null;

      for (const item of items) {
        if (!item || item.entity_id !== entityId || !item.enabled) continue;
        const timeStr = item.time;
        const duration = parseInt(item.duration, 10) || 30;
        const weekdays = item.weekdays || [];
        if (!timeStr || !weekdays.length) continue;

        const m = timeStr.match(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/);
        if (!m) continue;
        const hour = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);

        // Integration weekdays: 0=Mon .. 6=Sun. JS getDay: 0=Sun .. 6=Sat => int: 0=Mon..6=Sun
        const jsDay = now.getDay();
        const intWeekday = jsDay === 0 ? 6 : jsDay - 1;
        if (!weekdays.includes(intWeekday)) continue;

        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, min, 0, 0);
        const end = new Date(start.getTime() + duration * 60 * 1000);
        if (start <= now && now < end) {
          if (!earliestEnd || end < earliestEnd) earliestEnd = end;
        }
        // Cross-midnight: slot started yesterday
        const startYesterday = new Date(start);
        startYesterday.setDate(startYesterday.getDate() - 1);
        const endYesterday = new Date(startYesterday.getTime() + duration * 60 * 1000);
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayIntWeekday = yesterday.getDay() === 0 ? 6 : yesterday.getDay() - 1;
        if (weekdays.includes(yesterdayIntWeekday) && startYesterday <= now && now < endYesterday) {
          if (!earliestEnd || endYesterday < earliestEnd) earliestEnd = endYesterday;
        }
      }
      return earliestEnd;
    } catch (err) {
      return null;
    }
  }

  _formatDateTime(date) {
    if (!date) return '';
    
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const timeStr = `${hours}:${minutes}`;
      
      if (dateOnly.getTime() === today.getTime()) {
        return `Today, ${timeStr}`;
      }
      
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (dateOnly.getTime() === tomorrow.getTime()) {
        return `Tomorrow, ${timeStr}`;
      }
      
      // For other dates, show date
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      return `${day}.${month} ${timeStr}`;
    } catch (err) {
      return '';
    }
  }

  _getMaxWorkingTimeText() {
    try {
      const bridgeState = this._getBridgeState();
      if (!bridgeState || !this._config?.entity) return '';
      const entityMaxRuntime = bridgeState.attributes?.entity_max_runtime || {};
      const minutes = entityMaxRuntime[this._config.entity];
      if (minutes == null || Number(minutes) <= 0) return '';
      const m = parseInt(minutes, 10);
      if (m < 60) return `${m} min`;
      if (m === 60) return '1 hour';
      return `${m / 60} hours`;
    } catch (err) {
      return '';
    }
  }

  /** Last run text: today → "14:40 for 4 min"; other days → "10 Feb for 4 min". */
  _getLastRunText() {
    try {
      const bridgeState = this._getBridgeState();
      if (!bridgeState || !this._config?.entity) return '';
      const entityLastRuns = bridgeState.attributes?.entity_last_runs || {};
      const last = entityLastRuns[this._config.entity];
      if (!last || !last.started_at) return '';
      const startedAt = last.started_at;
      const d = new Date(startedAt);
      if (isNaN(d.getTime())) return '';
      const now = new Date();
      const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      let prefixStr = '';
      if (isToday) {
        prefixStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      } else {
        prefixStr = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      }
      const totalSec = last.duration_seconds != null ? parseInt(last.duration_seconds, 10) : null;
      let durationStr;
      if (totalSec != null && !isNaN(totalSec)) {
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        if (min >= 60) durationStr = `${Math.floor(min / 60)}h ${min % 60} min${sec ? ` ${sec} s` : ''}`;
        else if (sec) durationStr = `${min} min ${sec} s`;
        else durationStr = `${min} min`;
      } else {
        const durationMin = last.duration_minutes != null ? parseInt(last.duration_minutes, 10) : 0;
        durationStr = durationMin < 60 ? `${durationMin} min` : `${Math.floor(durationMin / 60)}h ${durationMin % 60} min`;
      }
      return `${prefixStr} for ${durationStr}`;
    } catch (err) {
      return '';
    }
  }

  _formatTimeUntil(date) {
    if (!date) return '';
    
    try {
      const now = Date.now();
      const targetTime = date.getTime();
      const diffMs = targetTime - now;
      
      if (diffMs <= 0) return 'now';
      
      const totalSeconds = Math.floor(diffMs / 1000);
      const minutes = Math.floor(totalSeconds / 60) % 60;
      const seconds = totalSeconds % 60;
      const hours = Math.floor(totalSeconds / 3600);
      
      if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
      }
      return `${minutes}m ${seconds}s`;
    } catch (err) {
      return '';
    }
  }

  _getSubtitle() {
    const isOn = this._isEntityOn();
    const turnOffTime = this._getTurnOffTime();
    const hasSchedules = this._hasSchedules();
    
    if (!isOn) {
      // Entity is off
      if (hasSchedules) {
        const nextRun = this._getNextRunTime();
        if (nextRun) {
          const now = Date.now();
          const diffMs = nextRun.getTime() - now;
          const oneDayMs = 24 * 60 * 60 * 1000;
          if (diffMs > 0 && diffMs < oneDayMs) {
            const timeUntil = this._formatTimeUntil(nextRun);
            return `Next run in ${timeUntil}`;
          } else {
            const timeStr = this._formatDateTime(nextRun);
            return `Next run: ${timeStr}`;
          }
        }
        return 'Next run:';
      }
      return 'Off';
    }
    
    // Entity is on (turn-off time from integration: slot duration, button, or max_runtime)
    if (turnOffTime) {
      const timeUntil = this._formatTimeUntil(turnOffTime);
      // If time is in the past, bridge may not have updated yet — refresh to get new slot end
      if (timeUntil === 'now') {
        this._scheduleCountdownRefresh();
        return 'Runs, updating…';
      }
      return `Runs, will be off in ${timeUntil}`;
    }
    
    // Entity is on but no turn-off time from integration
    return 'Runs, please switch off manually';
  }

  async _callService(service, data) {
    if (!this._hass) {
      return Promise.resolve();
    }
    
    if (!this._entryId) {
      this._findBridgeSensor();
      if (!this._entryId) {
        return Promise.resolve();
      }
    }
    
    if (!this._config || !this._config.entity) {
      return Promise.resolve();
    }

    try {
      const serviceData = { entry_id: this._entryId, ...data };
      const result = await this._hass.callService('homie_scheduler', service, serviceData);
      return result;
    } catch (err) {
      // Ignore errors silently for status card
      return Promise.resolve();
    }
  }

  async _toggleEntity() {
    if (!this._hass || !this._config || !this._config.entity) return;
    
    try {
      const isOn = this._isEntityOn();
      
      if (isOn) {
        // Turning off - clear any active timer
        if (this._turnOffTimer) {
          clearTimeout(this._turnOffTimer);
          this._turnOffTimer = null;
        }
        
        // Clear active button marker in integration
        if (this._entryId) {
          try {
            await this._callService('clear_active_button', {
              entity_id: this._config.entity
            });
          } catch (e) {
            // Ignore errors
          }
        }
        
        await this._hass.callService('switch', 'turn_off', {
          entity_id: this._config.entity
        });
      } else {
        // Turning on – just turn on (turn-off is from button card duration or integration max_runtime)
        await this._hass.callService('switch', 'turn_on', {
          entity_id: this._config.entity
        });
      }
      
      // Update entity state
      setTimeout(() => {
        if (this._hass && this._config && this._config.entity) {
          this._hass.callService('homeassistant', 'update_entity', {
            entity_id: this._config.entity
          }).catch(() => {});
          this.hass = { ...this._hass };
        }
      }, 100);
    } catch (err) {
      alert('Failed to toggle switch: ' + (err.message || err));
    }
  }

  _attachEventListeners() {
    const button = this.shadowRoot.querySelector('[data-action="toggle"]');
    if (!button) return;
    
    // Remove old listener by cloning
    const newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);
    
    newButton.addEventListener('click', (e) => {
      e.stopPropagation();
      if (newButton.classList.contains('disabled')) {
        return;
      }
      this._toggleEntity().catch(err => {
      });
    });
  }

  _showError(message) {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = `
      <div style="padding: 16px; color: var(--error-color, #f44336);">
        ${message}
      </div>
    `;
  }

  async render() {
    if (!this.shadowRoot) return;
    
    if (!this._config || !this._config.entity) {
      this._showError('Please configure entity in card settings');
      return;
    }

    try {
      const template = await this._loadTemplate();
      
      const isOn = this._isEntityOn();
      const title = this._getTitle();
      const subtitle = this._getSubtitle();
      
      const iconButtonClass = isOn ? 'active' : '';
      const maxWorkingTime = this._getMaxWorkingTimeText();
      const maxTimeHiddenClass = maxWorkingTime ? '' : 'max-time-hidden';
      const maxWorkingTimeDisplay = maxWorkingTime || '—';
      const lastRunText = this._getLastRunText();
      const lastRunHiddenClass = lastRunText ? '' : 'last-run-hidden';
      const entityStatus = this._isEntityOn() ? 'On' : 'Off';

      const htmlContent = template
        .replace(/\{\{ICON_BUTTON_CLASS\}\}/g, iconButtonClass)
        .replace(/\{\{TITLE\}\}/g, this._escapeHtml(title))
        .replace(/\{\{ENTITY_STATUS\}\}/g, entityStatus)
        .replace(/\{\{SUBTITLE\}\}/g, this._escapeHtml(subtitle))
        .replace(/\{\{MAX_TIME_HIDDEN_CLASS\}\}/g, maxTimeHiddenClass)
        .replace(/\{\{MAX_WORKING_TIME\}\}/g, this._escapeHtml(maxWorkingTimeDisplay))
        .replace(/\{\{LAST_RUN_HIDDEN_CLASS\}\}/g, lastRunHiddenClass)
        .replace(/\{\{LAST_RUN_TEXT\}\}/g, this._escapeHtml(lastRunText));
      
      // Load MDI font only in dev mode
      const isDevMode = window.location.protocol === 'file:' || 
                       window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1';
      const fontLink = isDevMode ? 
        '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@mdi/font@latest/css/materialdesignicons.min.css">' : '';
      
      const styleContent = `/**\n * Boiler Status Card - Styles\n * \n * Card showing boiler status with icon in circle\n */\n\n:host {\n  display: block;\n  \n  /* Status card design tokens - с возможностью переопределения */\n  --_accent: var(--homie-status-accent, var(--state-switch-on-color, var(--warning-color, #ffc107)));\n  --_bg: var(--homie-status-bg, var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9))));\n  --_radius: var(--homie-status-radius, var(--ha-card-border-radius, 4px));\n  --_shadow: var(--homie-status-shadow, var(--ha-card-box-shadow, 0 2px 4px rgba(0, 0, 0, 0.1)));\n  \n  --_text: var(--homie-status-text, var(--primary-text-color, #212121));\n  --_text-secondary: var(--homie-status-text-secondary, var(--secondary-text-color, #757575));\n  --_text-on-accent: var(--homie-status-text-on-accent, var(--text-primary-on-background, #ffffff));\n  \n  --_disabled-color: var(--homie-status-disabled, var(--disabled-color, var(--disabled-text-color, #9e9e9e)));\n}\n\n.status-card {\n  display: flex;\n  align-items: center;\n  gap: 16px;\n  padding: 16px;\n  border-radius: var(--ha-card-border-radius, 4px);\n  background: var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9)));\n  box-shadow: var(--ha-card-box-shadow, 0 2px 4px rgba(0, 0, 0, 0.1));\n}\n\n.icon-button {\n  flex-shrink: 0;\n  width: 64px;\n  height: 64px;\n  padding: 0;\n  border: none;\n  background: transparent;\n  cursor: pointer;\n  border-radius: 50%;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: transform 0.2s ease, opacity 0.2s ease;\n}\n\n.icon-button:hover:not(.disabled) {\n  transform: scale(1.05);\n  opacity: 0.9;\n}\n\n.icon-button:active:not(.disabled) {\n  transform: scale(0.95);\n}\n\n.icon-button.disabled {\n  cursor: not-allowed;\n  opacity: 0.5;\n}\n\n.icon-circle {\n  width: 64px;\n  height: 64px;\n  border-radius: 50%;\n  background: var(--disabled-color, var(--disabled-text-color, #9e9e9e));\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: background-color 0.2s ease;\n}\n\n.icon-button.active .icon-circle {\n  background: var(--state-switch-on-color, var(--warning-color, #ffc107));\n}\n\n.status-icon {\n  color: var(--text-primary-on-background, #ffffff);\n  --mdc-icon-size: 32px;\n}\n\n.content {\n  flex: 1;\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  min-width: 0; /* Allow text truncation */\n}\n\n.title {\n  font-size: 16px;\n  font-weight: 500;\n  color: var(--primary-text-color, #212121);\n  line-height: 1.2;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.subtitle {\n  font-size: 12px;\n  line-height: 1;\n  color: var(--secondary-text-color, #757575);\n}\n\n.max-time.max-time-hidden {\n  display: none;\n}\n\n.last-run.last-run-hidden {\n  display: none;\n}\n`;
      
      this.shadowRoot.innerHTML = `${fontLink}<style>${styleContent}</style>${htmlContent}`;
      
      // Attach event listeners
      this._attachEventListeners();
      this._scheduleCountdownUpdate();
    } catch (err) {
      this._showError('Failed to render card: ' + (err.message || err));
    }
  }

  _escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Register custom element (safe: skip if already defined)
if (typeof customElements !== 'undefined' && !customElements.get('homie-scheduler-boiler-status')) {
  customElements.define('homie-scheduler-boiler-status', HomieBoilerStatusCard);
  window.logCardInfo('boiler-status-card');
}

class HomieBoilerScheduleSlotsCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = null;
    this._hass = null;
    this._entryId = null;
    this._bridgeSensor = null;
    this._debounceTimer = null;
    this._htmlTemplate = null;
    this._expandedSlots = new Set(); // Track expanded slots
    this._secondsTimer = null; // Timer for updating seconds countdown
    this._configError = null; // Store config error message
    this._unsubStateChanged = null; // Unsubscribe function for state_changed events
    this._optimisticBridgeState = null; // Local overlay for optimistic updates (avoids mutating hass.states)
  }

  async _loadTemplate() {
    if (this._htmlTemplate) return this._htmlTemplate;
    
    // Template is embedded in production build
    this._htmlTemplate = `  <!-- Main Header -->\n  <div class="main-header">\n    <div class="header-left">\n      <div class="header-icon {{ENABLED_CLASS}}" data-action="toggle-enabled" title="Toggle scheduler">\n        <ha-icon icon="mdi:calendar-clock"></ha-icon>\n        <!-- <ha-icon icon="{{ICON}}"></ha-icon> -->\n      </div>\n      <div class="header-text">\n        <div class="header-title">\n          {{TITLE}}\n        </div>\n        <div class="header-status">{{STATUS_TEXT}}</div>\n      </div>\n    </div>\n  </div>\n  \n  <!-- Slots List (hidden when 0 slots) -->\n  <div class="slots-container{{SLOTS_CONTAINER_CLASS}}">\n    {{ITEMS_CONTENT}}\n  </div>\n  \n  <!-- Add Slot Button -->\n  <button class="button-outline" data-action="open-add-popup">\n    Add Schedule Slot\n  </button>\n  \n  <!-- Add Slot Popup -->\n  <div class="popup-overlay" id="add-popup" style="display: none;">\n    <div class="popup-content">\n      <div class="popup-header">\n        <ha-icon icon="mdi:power"></ha-icon>\n        <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">\n          <span class="popup-title">Add Schedule Slot</span>\n          <div style="font-size: 12px; color: var(--secondary-text-color, #757575);">\n            for {{ENTITY_NAME}}\n          </div>\n        </div>\n        <button class="popup-close" data-action="close-popup">\n          <ha-icon icon="mdi:close"></ha-icon>\n        </button>\n      </div>\n      \n      <div class="popup-body">\n        <!-- Title Input -->\n        <div class="popup-field">\n          <label>\n            <ha-icon icon="mdi:label-outline"></ha-icon>\n            <span>Title (optional)</span>\n          </label>\n          <input type="text" class="homie-input" id="popup-title" placeholder="e.g. Morning heating">\n        </div>\n        \n        <!-- Time Input -->\n        <div class="popup-field">\n          <label>\n            <ha-icon icon="mdi:clock-outline"></ha-icon>\n            <span>Start Time</span>\n          </label>\n          <div class="time-selects">\n            <select class="homie-select popup-time-hours" id="popup-time-hours">\n              <option value="00">00</option>\n              <option value="01">01</option>\n              <option value="02">02</option>\n              <option value="03">03</option>\n              <option value="04">04</option>\n              <option value="05">05</option>\n              <option value="06">06</option>\n              <option value="07">07</option>\n              <option value="08" selected>08</option>\n              <option value="09">09</option>\n              <option value="10">10</option>\n              <option value="11">11</option>\n              <option value="12">12</option>\n              <option value="13">13</option>\n              <option value="14">14</option>\n              <option value="15">15</option>\n              <option value="16">16</option>\n              <option value="17">17</option>\n              <option value="18">18</option>\n              <option value="19">19</option>\n              <option value="20">20</option>\n              <option value="21">21</option>\n              <option value="22">22</option>\n              <option value="23">23</option>\n            </select>\n            <span class="time-separator">:</span>\n            <select class="homie-select popup-time-minutes" id="popup-time-minutes">\n              <option value="00" selected>00</option>\n              <option value="05">05</option>\n              <option value="10">10</option>\n              <option value="15">15</option>\n              <option value="20">20</option>\n              <option value="25">25</option>\n              <option value="30">30</option>\n              <option value="35">35</option>\n              <option value="40">40</option>\n              <option value="45">45</option>\n              <option value="50">50</option>\n              <option value="55">55</option>\n            </select>\n          </div>\n        </div>\n        \n        <!-- Duration Selector -->\n        <div class="popup-field">\n          <label>\n            <ha-icon icon="mdi:timer-outline"></ha-icon>\n            <span>Duration (minutes)</span>\n          </label>\n          <!-- SHARED:duration-selector -->\n<!-- Duration Selector Component (universal - for popup and slot) -->\n<div class="duration-selector-wrapper">\n  <input \n    type="range" \n    class="duration-slider" \n    data-action="update-duration-slider"\n    data-item-id="{{ITEM_ID}}"\n    min="{{DURATION_MIN}}"\n    max="{{DURATION_MAX}}"\n    step="{{DURATION_STEP}}"\n    value="{{DURATION_VALUE}}"\n  />\n  <input \n    type="number" \n    class="duration-input homie-input" \n    data-action="update-duration"\n    data-item-id="{{ITEM_ID}}"\n    min="{{DURATION_MIN}}"\n    max="{{DURATION_MAX}}"\n    step="{{DURATION_STEP}}"\n    value="{{DURATION_VALUE}}"\n  />\n</div>\n<!-- END:duration-selector -->\n        </div>\n        \n        <!-- Weekday Selector -->\n        <div class="popup-field">\n          <label>\n            <ha-icon icon="mdi:calendar"></ha-icon>\n            <span>Days of Week</span>\n          </label>\n          <!-- SHARED:weekday-selector -->\n<!-- Weekday Selection Component (universal - without popup-field) -->\n<div class="weekday-mode-selector">\n  <button type="button" class="weekday-mode-btn active" data-mode="everyday">Everyday</button>\n  <button type="button" class="weekday-mode-btn" data-mode="weekdays">Weekdays</button>\n  <button type="button" class="weekday-mode-btn" data-mode="custom">Custom</button>\n</div>\n<div class="popup-weekdays hidden" id="popup-weekdays-custom">\n  <div class="popup-weekday" data-day="0">Mon</div>\n  <div class="popup-weekday" data-day="1">Tue</div>\n  <div class="popup-weekday" data-day="2">Wed</div>\n  <div class="popup-weekday" data-day="3">Thu</div>\n  <div class="popup-weekday" data-day="4">Fri</div>\n  <div class="popup-weekday" data-day="5">Sat</div>\n  <div class="popup-weekday" data-day="6">Sun</div>\n</div>\n<!-- END:weekday-selector -->\n        </div>\n      </div>\n      \n      <div class="popup-footer">\n        <button class="popup-button cancel" data-action="close-popup">Cancel</button>\n        <button class="popup-button save" data-action="save-slot">Save</button>\n      </div>\n    </div>\n  </div>\n\n<!-- Slot Item Template -->\n<template id="slot-item-template">\n  <div class="slot-card {{DISABLED_CLASS}}" data-item-id="{{ITEM_ID}}">\n    <div class="slot-header">\n      <div class="slot-icon {{ICON_CLASS}}" data-action="toggle-item" title="Toggle slot">\n        <ha-icon icon="mdi:power"></ha-icon>\n      </div>\n      <div class="slot-info">\n        <div class="slot-name">{{SLOT_NAME}}</div>\n        <div class="slot-status">{{SLOT_STATUS}}</div>\n      </div>\n    </div>\n    <button class="slot-expand" data-action="toggle-expand" title="Expand/collapse details">\n      <ha-icon icon="mdi:chevron-down"></ha-icon>\n    </button>\n    \n    <div class="slot-expandable">\n      <div class="slot-details">\n        <div class="slot-title">\n          <ha-icon icon="mdi:label-outline"></ha-icon>\n          <input type="text" class="homie-input slot-title-input" data-action="update-title" data-item-id="{{ITEM_ID}}" value="{{SLOT_TITLE}}" placeholder="Slot name">\n        </div>\n        <div class="slot-time">\n          <ha-icon icon="mdi:clock-outline"></ha-icon>\n          <div class="time-selects">\n            <select class="homie-select slot-time-hours" data-action="update-time-hours" data-item-id="{{ITEM_ID}}">\n              <option value="00" {{TIME_HOURS_00}}>00</option>\n              <option value="01" {{TIME_HOURS_01}}>01</option>\n              <option value="02" {{TIME_HOURS_02}}>02</option>\n              <option value="03" {{TIME_HOURS_03}}>03</option>\n              <option value="04" {{TIME_HOURS_04}}>04</option>\n              <option value="05" {{TIME_HOURS_05}}>05</option>\n              <option value="06" {{TIME_HOURS_06}}>06</option>\n              <option value="07" {{TIME_HOURS_07}}>07</option>\n              <option value="08" {{TIME_HOURS_08}}>08</option>\n              <option value="09" {{TIME_HOURS_09}}>09</option>\n              <option value="10" {{TIME_HOURS_10}}>10</option>\n              <option value="11" {{TIME_HOURS_11}}>11</option>\n              <option value="12" {{TIME_HOURS_12}}>12</option>\n              <option value="13" {{TIME_HOURS_13}}>13</option>\n              <option value="14" {{TIME_HOURS_14}}>14</option>\n              <option value="15" {{TIME_HOURS_15}}>15</option>\n              <option value="16" {{TIME_HOURS_16}}>16</option>\n              <option value="17" {{TIME_HOURS_17}}>17</option>\n              <option value="18" {{TIME_HOURS_18}}>18</option>\n              <option value="19" {{TIME_HOURS_19}}>19</option>\n              <option value="20" {{TIME_HOURS_20}}>20</option>\n              <option value="21" {{TIME_HOURS_21}}>21</option>\n              <option value="22" {{TIME_HOURS_22}}>22</option>\n              <option value="23" {{TIME_HOURS_23}}>23</option>\n            </select>\n            <span class="time-separator">:</span>\n            <select class="homie-select slot-time-minutes" data-action="update-time-minutes" data-item-id="{{ITEM_ID}}">\n              <option value="00" {{TIME_MINUTES_00}}>00</option>\n              <option value="05" {{TIME_MINUTES_05}}>05</option>\n              <option value="10" {{TIME_MINUTES_10}}>10</option>\n              <option value="15" {{TIME_MINUTES_15}}>15</option>\n              <option value="20" {{TIME_MINUTES_20}}>20</option>\n              <option value="25" {{TIME_MINUTES_25}}>25</option>\n              <option value="30" {{TIME_MINUTES_30}}>30</option>\n              <option value="35" {{TIME_MINUTES_35}}>35</option>\n              <option value="40" {{TIME_MINUTES_40}}>40</option>\n              <option value="45" {{TIME_MINUTES_45}}>45</option>\n              <option value="50" {{TIME_MINUTES_50}}>50</option>\n              <option value="55" {{TIME_MINUTES_55}}>55</option>\n            </select>\n          </div>\n        </div>\n      </div>\n      <div class="slot-duration">\n        <ha-icon icon="mdi:timer-outline"></ha-icon>\n        <!-- SHARED:duration-selector -->\n<!-- Duration Selector Component (universal - for popup and slot) -->\n<div class="duration-selector-wrapper">\n  <input \n    type="range" \n    class="duration-slider" \n    data-action="update-duration-slider"\n    data-item-id="{{ITEM_ID}}"\n    min="{{DURATION_MIN}}"\n    max="{{DURATION_MAX}}"\n    step="{{DURATION_STEP}}"\n    value="{{DURATION_VALUE}}"\n  />\n  <input \n    type="number" \n    class="duration-input homie-input" \n    data-action="update-duration"\n    data-item-id="{{ITEM_ID}}"\n    min="{{DURATION_MIN}}"\n    max="{{DURATION_MAX}}"\n    step="{{DURATION_STEP}}"\n    value="{{DURATION_VALUE}}"\n  />\n</div>\n<!-- END:duration-selector -->\n      </div>\n      \n      <!-- SHARED:weekday-selector -->\n<!-- Weekday Selection Component (universal - without popup-field) -->\n<div class="weekday-mode-selector">\n  <button type="button" class="weekday-mode-btn active" data-mode="everyday">Everyday</button>\n  <button type="button" class="weekday-mode-btn" data-mode="weekdays">Weekdays</button>\n  <button type="button" class="weekday-mode-btn" data-mode="custom">Custom</button>\n</div>\n<div class="popup-weekdays hidden" id="popup-weekdays-custom">\n  <div class="popup-weekday" data-day="0">Mon</div>\n  <div class="popup-weekday" data-day="1">Tue</div>\n  <div class="popup-weekday" data-day="2">Wed</div>\n  <div class="popup-weekday" data-day="3">Thu</div>\n  <div class="popup-weekday" data-day="4">Fri</div>\n  <div class="popup-weekday" data-day="5">Sat</div>\n  <div class="popup-weekday" data-day="6">Sun</div>\n</div>\n<!-- END:weekday-selector -->\n      \n      <button class="slot-delete" data-action="delete-item">\n        <ha-icon icon="mdi:delete"></ha-icon>\n        <span>Remove Slot {{SLOT_NUMBER}}</span>\n      </button>\n    </div>\n  </div>\n</template>\n`;
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
    
    // Extract slot template from main template
    const slotMatch = template.match(/<template id="slot-item-template">([\s\S]*?)<\/template>/);
    if (slotMatch) {
      return slotMatch[1].trim();
    }
    
    // Also try to extract from embedded-templates if template loading failed
    if (embeddedTemplates) {
      const embeddedContent = embeddedTemplates.innerHTML;
      const embeddedSlotMatch = embeddedContent.match(/<template id="slot-item-template">([\s\S]*?)<\/template>/);
      if (embeddedSlotMatch) {
        return embeddedSlotMatch[1].trim();
      }
    }
    
    return null;
  }

  setConfig(config) {
    try {
      // Don't throw error - just show warning in UI
      if (!config || !config.entity) {
        this._config = { 
          entity: null, 
          title: config?.title || 'Water Heater Schedule',
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
      // Set config
      this._config = {
        ...config
      };
      
      // Normalize duration configuration
      // Support both duration_range: [min, max] and separate min_duration/max_duration
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
      
      // Subscribe to state_changed events for bridge sensor (for real-time sync between cards)
      if (this._hass && this._hass.connection && !this._unsubStateChanged) {
        try {
          // subscribeEvents returns a Promise that resolves to an unsubscribe function
          this._hass.connection.subscribeEvents(
            (event) => {
              const entityId = event?.data?.entity_id;
              if (!entityId || entityId !== this._bridgeSensor) return;

              if (event.data && this._hass) {
                this._hass.callService('homeassistant', 'update_entity', {
                  entity_id: this._bridgeSensor
                }).catch(() => {});
                // Poll to clear optimistic when real slot appears (don't force-clear immediately)
                const hadTemp = this._optimisticBridgeState?.attributes?.items?.some(i => i?.id?.startsWith?.('temp-'));
                if (hadTemp) {
                  let attempts = 0;
                  const pollClear = () => {
                    if (!this._optimisticBridgeState?.attributes?.items?.some(i => i?.id?.startsWith?.('temp-'))) return;
                    const fromHass = this._hass?.states?.[this._bridgeSensor]?.attributes?.items || [];
                    const entityId = this._config?.entity;
                    const tempItems = (this._optimisticBridgeState?.attributes?.items || []).filter(i => i?.id?.startsWith?.('temp-'));
                    const realHasSame = tempItems.some(t => fromHass.some(h =>
                      h?.entity_id === entityId && h?.time === t?.time &&
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
      // Also check if any item for THIS entity changed
      const entityId = this._config?.entity;
      const itemsContentChanged = !itemsStructureChanged && oldItems.some((oldItem) => {
        if (!oldItem || !oldItem.id) return false;
        // Only check items for this entity
        if (entityId && oldItem.entity_id !== entityId) return false;
        const newItem = newItems.find(item => item && item.id === oldItem.id);
        if (!newItem) return false;
        return oldItem.enabled !== newItem.enabled ||
               oldItem.time !== newItem.time ||
               oldItem.duration !== newItem.duration ||
               JSON.stringify(oldItem.weekdays || []) !== JSON.stringify(newItem.weekdays || []);
      });
      
      // Check if bridge sensor state changed (enabled/disabled)
      const stateChanged = oldState !== newState;
      
      // Check if next_run changed
      const nextRunChanged = oldNextRun !== newNextRun;
      
      // Full render if: first time, no content, structure changed, state changed, or next_run changed
      if (!wasInitialized || !this.shadowRoot.innerHTML || itemsStructureChanged || stateChanged || nextRunChanged) {
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
      if (!this._hass || !this._config || !this._config.entity) return;

      const switchEntity = this._config.entity;
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
            
            // Check if this entry manages the requested entity
            const entityIds = attrs.entity_ids || [];
            const items = attrs.items || [];
            
            // Check if entity is in entity_ids list
            if (entityIds.includes(switchEntity)) {
              this._bridgeSensor = entityId;
              this._entryId = attrs.entry_id;
              return;
            }
            
            // Also check if any item has this entity_id (for cases where entity_ids list is not yet updated)
            const hasEntityInItems = items.some(item => item && item.entity_id === switchEntity);
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
        this._entryId = firstBridgeSensor.entryId;
        return;
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

  /** Max duration for slots: capped by integration "Max run time" (entity_max_runtime) for this entity. */
  _getEffectiveMaxDuration() {
    const configMax = this._config?.max_duration || 1440;
    const bridgeState = this._getBridgeState();
    const entityMaxRuntime = (bridgeState?.attributes?.entity_max_runtime || {})[this._config?.entity];
    if (entityMaxRuntime > 0) {
      return Math.min(configMax, entityMaxRuntime);
    }
    return configMax;
  }

  _getItems() {
    try {
      // Safe check - if no config or entity, return empty array
      if (!this._config || !this._config.entity) {
        return [];
      }
      
      // Filter out temporary slots (created by button, not visible in UI)
      
      const bridgeState = this._getBridgeState();
      const allItems = bridgeState?.attributes?.items || [];
      
      // Filter items by entity_id from config and exclude temporary slots (created by button)
      const entityId = this._config.entity;
      const filtered = allItems.filter(item => {
        if (!item || item.entity_id !== entityId) {
          return false;
        }
        // Exclude temporary slots created by button (strict check)
        if (item.temporary === true) {
          return false;
        }
        return true;
      });
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
      if (!this._config || !this._config.entity) {
        return false;
      }
      
      const items = this._getItems(); // Already filtered by entity_id
      
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
          candidates.push({ date: nextStart, duration });
        }
      }
      
      if (candidates.length === 0) return null;
      
      // Return earliest start time with its duration
      const earliest = candidates.reduce((min, candidate) => 
        candidate.date < min.date ? candidate : min
      );
      
      return this._formatNextRun(earliest.date, earliest.duration);
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

  _formatNextRun(date, duration) {
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
    
    // Duration suffix (from homie-schedule bridge sensor)
    const durationStr = this._formatDuration(duration);
    
    if (days === 0 && seconds < 3600) {
      // Less than 1 hour — show minutes and seconds so countdown updates every second
      const secs = seconds % 60;
      if (minutes === 0) {
        return `in ${seconds}s${durationStr}`;
      }
      return `in ${minutes}m ${secs}s${durationStr}`;
    } else if (days === 0) {
      // Today
      return `Today ${timeStr}${durationStr}`;
    } else if (days === 1) {
      // Tomorrow
      return `Tomorrow ${timeStr}${durationStr}`;
    } else {
      // Future day
      return `${weekdays[date.getDay()]} ${timeStr}${durationStr}`;
    }
  }

  async _callService(service, data) {
    // Safe checks - don't throw errors
    if (!this._hass) {
      return Promise.resolve(); // Resolve silently, don't throw
    }
    
    if (!this._entryId) {
      this._findBridgeSensor();
      if (!this._entryId) {
        const msg = 'Homie Scheduler: bridge sensor not found. Check integration is installed and sensor "Scheduler Info" exists.';
        console.warn(msg);
        if (typeof alert === 'function') alert(msg);
        return Promise.resolve();
      }
    }
    
    if (!this._config || !this._config.entity) {
      return Promise.resolve();
    }

    try {
      const serviceData = { entry_id: this._entryId, ...data };
      const result = await this._hass.callService('homie_scheduler', service, serviceData);
      return result;
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
    // Check if there are any items - if not, show add popup instead
    const items = this._getItems();
    if (items.length === 0) {
      // No items - show add popup instead of toggling
      this._openAddPopup();
      return;
    }
    
    // Check current state: card is enabled if at least one slot is enabled
    const hasEnabledSlots = items.some(item => item && item.enabled === true);
    const willDisable = hasEnabledSlots;
    const newEnabledState = !willDisable;
    
    // Optimistically update local data and UI for immediate feedback
    if (this._hass && this._bridgeSensor) {
      const bridgeState = this._hass.states[this._bridgeSensor];
      if (bridgeState?.attributes?.items) {
        const allItems = [...bridgeState.attributes.items];
        
        // Update all slots for this entity optimistically
        items.forEach(item => {
          if (item && item.id) {
            const itemIndex = allItems.findIndex(i => i && i.id === item.id);
            if (itemIndex !== -1) {
              const updatedItem = { ...allItems[itemIndex], enabled: newEnabledState };
              allItems[itemIndex] = updatedItem;
              
              // Update UI immediately for each slot
              this._updateSlotElement(item.id, updatedItem);
            }
          }
        });
        
        // Use local overlay for optimistic update (avoids mutating hass.states)
        this._optimisticBridgeState = {
          ...bridgeState,
          attributes: {
            ...bridgeState.attributes,
            items: allItems
          }
        };
        
        // Update header status immediately
        this._updateHeaderStatus();
        
        // Trigger hass update to sync with other cards (optimistic)
        this.hass = { ...this._hass };
        
        // Sync other cards with optimistic state
        this._syncAllCardsForEntity(null, null, this._optimisticBridgeState);
      }
    }
    
    // Then update all slots via service (server is source of truth)
    for (const item of items) {
      if (item && item.id) {
        await this._callService('update_item', {
          id: item.id,
          enabled: newEnabledState
        });
      }
    }
    
    // Force update bridge sensor after toggling all slots - request entity update and sync
    if (this._hass && this._bridgeSensor) {
      // Request entity update from server to get fresh state
      try {
        await this._hass.callService('homeassistant', 'update_entity', {
          entity_id: this._bridgeSensor
        });
      } catch (e) {
      }
      
      // Wait a bit for state to update from server, then trigger full sync
      setTimeout(() => {
        if (this._hass) {
          // Re-fetch state from server and update (this will trigger sync in all cards)
          this.hass = { ...this._hass };
        }
      }, 500);
    }
  }

  _openAddPopup() {
    const popup = this.shadowRoot.getElementById('add-popup');
    if (popup) {
      popup.style.display = 'flex';
      // Reset form
      const hoursSelect = this.shadowRoot.getElementById('popup-time-hours');
      const minutesSelect = this.shadowRoot.getElementById('popup-time-minutes');
      const now = new Date();
      const hour = String(now.getHours()).padStart(2, '0');
      const minute = String(Math.round(now.getMinutes() / 5) * 5).padStart(2, '0');
      if (hoursSelect) hoursSelect.value = hour;
      if (minutesSelect) minutesSelect.value = minute;
      
      // Find duration wrapper specifically in popup (not in slots)
      const popupDurationWrapper = popup.querySelector('.duration-selector-wrapper');
      if (!popupDurationWrapper) {
        return;
      }
      
      // Allowed values: 5, 10, 15, ... up to max, plus max if not multiple of 5 (e.g. 66, 63)
      const durationInput = popupDurationWrapper.querySelector('[data-action="update-duration"]');
      const durationSlider = popupDurationWrapper.querySelector('[data-action="update-duration-slider"]');
      const minDuration = this._config.min_duration || 15;
      const maxDuration = this._getEffectiveMaxDuration();
      const allowedValues = window.DurationSelector && typeof window.DurationSelector.computeAllowedValues === 'function'
        ? window.DurationSelector.computeAllowedValues(minDuration, maxDuration, 5)
        : (() => { const a = []; for (let i = minDuration; i <= maxDuration; i += 5) a.push(i); if (a[a.length - 1] < maxDuration) a.push(maxDuration); return a; })();
      const defaultDuration = Math.min(minDuration, maxDuration);
      popupDurationWrapper.dataset.durationValues = allowedValues.join(',');
      
      if (durationInput) {
        durationInput.min = minDuration;
        durationInput.max = maxDuration;
        durationInput.step = 1;
        durationInput.value = String(defaultDuration);
        durationInput.setAttribute('value', String(defaultDuration));
      }
      if (durationSlider) {
        durationSlider.min = 0;
        durationSlider.max = Math.max(0, allowedValues.length - 1);
        durationSlider.step = 1;
        const defaultIdx = allowedValues.indexOf(defaultDuration);
        const idx = defaultIdx >= 0 ? defaultIdx : 0;
        durationSlider.value = String(idx);
        durationSlider.setAttribute('value', String(idx));
      }
      
      // Attach duration selector event listeners to popup wrapper specifically
      DurationSelector.attachEventListeners(popupDurationWrapper);
    }
  }

  _closeAddPopup() {
    const popup = this.shadowRoot.getElementById('add-popup');
    if (popup) {
      popup.style.display = 'none';
    }
  }


  async _saveSlot() {
    const hoursSelect = this.shadowRoot.getElementById('popup-time-hours');
    const minutesSelect = this.shadowRoot.getElementById('popup-time-minutes');
    const titleInput = this.shadowRoot.getElementById('popup-title');
    const selectedDays = WeekdaySelector.getSelectedWeekdays(this.shadowRoot);
    
    // Get duration from popup - find wrapper specifically in popup
    const popup = this.shadowRoot.getElementById('add-popup');
    const popupDurationWrapper = popup?.querySelector('.duration-selector-wrapper');
    
    let duration = null;
    if (popupDurationWrapper) {
      duration = DurationSelector.getSelectedDuration(popupDurationWrapper);
    } else {
      duration = DurationSelector.getSelectedDuration(this.shadowRoot);
    }


    if (!hoursSelect || !minutesSelect) {
      return;
    }
    
    if (!duration) {
      alert('Please select a duration');
      return;
    }
    if (selectedDays.length === 0) {
      alert('Please select at least one day');
      return;
    }

    const time = `${hoursSelect.value}:${minutesSelect.value}`;
    const title = titleInput?.value?.trim() || null;

    if (!this._config || !this._config.entity) {
      return;
    }
    
    // Use shared helper to add slot (complete workflow)
    const switchServices = ScheduleHelper.createSwitchServices(this._config.entity);
    
    try {
      await ScheduleHelper.addScheduleSlot({
        hass: this._hass,
        callService: async (service, data) => {
          return await this._callService(service, data);
        },
        getBridgeState: () => this._getBridgeState(),
        entity_id: this._config.entity,
        time: time,
        duration: duration,
        weekdays: selectedDays,
        title: title,
        service_start: switchServices.service_start,
        service_end: switchServices.service_end,
        bridgeSensor: this._bridgeSensor,
        onRender: () => {
          // Use current hass (updated by WebSocket), not stale hass from closure
          this.hass = { ...this._hass };
          this.render().catch(() => {});
        }
      });

      // Optimistic UI: show new slot immediately, clear when real appears (poll, don't force-clear)
      const bridgeState = this._getBridgeState();
      if (bridgeState && bridgeState.attributes) {
        const currentItems = bridgeState.attributes.items || [];
        const alreadyHasSlot = currentItems.some(
          (i) => i && i.entity_id === this._config.entity && i.time === time
        );
        if (!alreadyHasSlot) {
          const newItem = {
            id: 'temp-' + Date.now(),
            entity_id: this._config.entity,
            time,
            duration: parseInt(duration, 10) || duration,
            weekdays: selectedDays,
            enabled: true,
            service_start: switchServices.service_start,
            service_end: switchServices.service_end
          };
          if (title) newItem.title = title;
          const newItems = [...currentItems, newItem];
          this._optimisticBridgeState = {
            ...bridgeState,
            attributes: { ...bridgeState.attributes, items: newItems }
          };
          this.hass = { ...this._hass };
          this._syncAllCardsForEntity(null, null, this._optimisticBridgeState);
          await this.render();
          // Poll until real slot appears (don't force-clear so slot stays visible)
          let attempts = 0;
          const pollClear = () => {
            if (!this._optimisticBridgeState?.attributes?.items?.some(i => i?.id?.startsWith?.('temp-'))) return;
            const fromHass = this._hass?.states?.[this._bridgeSensor]?.attributes?.items || [];
            const entityId = this._config?.entity;
            const tempItems = (this._optimisticBridgeState?.attributes?.items || []).filter(i => i?.id?.startsWith?.('temp-'));
            const realHasSame = tempItems.some(t => fromHass.some(h =>
              h?.entity_id === entityId && h?.time === t?.time &&
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
    // Update header status without full re-render
    try {
      const enabled = this._isEnabled();
      let statusText = enabled ? 'On' : 'Off';
      let needsSecondsTimer = false;
      
      if (enabled) {
        const nextRun = this._getNextRun();
        if (nextRun) {
          statusText = `Next run: ${nextRun}`;
          
          // Update every second when showing countdown ("in Xm Ys" or "in Xs")
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
    // Sync all cards for the same entity
    if (!window._homieScheduleCards || !this._hass || !this._config?.entity) {
      return;
    }
    
    const currentEntity = this._config.entity;
    
    // Update all other cards with the same entity
    window._homieScheduleCards.forEach(card => {
      // Skip this card (it's already updated)
      if (card === this) return;
      
      // Only sync cards with the same entity
      if (card._config?.entity === currentEntity && card._hass) {
        // Pass optimistic state overlay (avoids mutating hass.states)
        if (optimisticBridgeState) {
          card._optimisticBridgeState = optimisticBridgeState;
        }
        
        // If updating a specific slot, update that slot element directly
        if (itemId && updatedItem && card._updateSlotElement) {
          card._updateSlotElement(itemId, updatedItem);
          card._updateHeaderStatus();
        } else {
          // For delete operations or full sync, force complete re-render
          if (card._syncSlotsFromBridgeSensor) {
            card._syncSlotsFromBridgeSensor();
          }
          if (card.render) {
            card.render().catch(() => {});
          }
        }
        
        card.hass = { ...card._hass };
      }
    });
  }

  _updateSlotElement(itemId, updatedItem) {
    // Update only the changed slot element without full re-render
    const slotCard = this.shadowRoot.querySelector(`[data-item-id="${itemId}"]`);
    if (!slotCard) return;

    // Set flag to prevent event handlers from firing during programmatic updates
    slotCard.dataset.updating = 'true';

    // Update slot name if title changed
    const slotNameEl = slotCard.querySelector('.slot-name');
    if (slotNameEl) {
      const slotNumber = this._getItems().indexOf(updatedItem) + 1;
      const slotName = updatedItem.title || `Slot ${slotNumber}`;
      slotNameEl.textContent = slotName;
    }
    
    // Update title input value if it exists
    const titleInput = slotCard.querySelector('.slot-title-input');
    if (titleInput) {
      titleInput.value = updatedItem.title || '';
    }
    
    // Update slot status text
    const statusEl = slotCard.querySelector('.slot-status');
    if (statusEl) {
      const daysText = WeekdaySelector.formatWeekdays(updatedItem.weekdays);
      const durationStr = this._formatDuration(updatedItem.duration);
      const slotStatus = `${daysText} on ${updatedItem.time}${durationStr}`;
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

    // Update duration select (config with effective max for allowed values 5,10,...,max)
    DurationSelector.setDurationInSlot(slotCard, updatedItem.duration, { ...this._config, max_duration: this._getEffectiveMaxDuration() });

    // Update weekday selector state
    WeekdaySelector.setSelectedWeekdays(this.shadowRoot, updatedItem.weekdays, slotCard);

    // Update icon and card classes
    const iconEl = slotCard.querySelector('.slot-icon');
    if (iconEl) {
      iconEl.className = `slot-icon ${updatedItem.enabled ? 'enabled' : 'disabled'}`;
    }
    
    if (updatedItem.enabled) {
      slotCard.classList.remove('disabled');
    } else {
      slotCard.classList.add('disabled');
    }

    // Clear update flag after a short delay
    setTimeout(() => {
      delete slotCard.dataset.updating;
    }, 0);
  }

  async _updateItem(itemId, updates) {
    // Optimistically update local data for immediate UI feedback (using overlay, no hass mutation)
    if (this._hass && this._bridgeSensor) {
      const bridgeState = this._getBridgeState();
      if (bridgeState?.attributes?.items) {
        const items = [...bridgeState.attributes.items];
        const itemIndex = items.findIndex(item => item && item.id === itemId);
        if (itemIndex !== -1) {
          const updatedItem = { ...items[itemIndex], ...updates };
          items[itemIndex] = updatedItem;
          
          this._optimisticBridgeState = {
            ...bridgeState,
            attributes: {
              ...bridgeState.attributes,
              items: items
            }
          };
          
          this._updateSlotElement(itemId, updatedItem);
          this._updateHeaderStatus();
          this.hass = { ...this._hass };
          this._syncAllCardsForEntity(itemId, updatedItem, this._optimisticBridgeState);
        }
      }
    }
    
    try {
      await this._callService('update_item', {
        id: itemId,
        ...updates
      });
    } catch (err) {
      throw err;
    }
    
    // Request fresh state from server, clear optimistic overlay when real update arrives
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
        }
      }, 500);
    }
  }

  async _deleteItem(itemId) {
    await this._callService('delete_item', { id: itemId });
    
    // Force update after deleting item - request entity update and re-render
    if (this._hass && this._bridgeSensor) {
      // Request entity update from server
      try {
        await this._hass.callService('homeassistant', 'update_entity', {
          entity_id: this._bridgeSensor
        });
      } catch (e) {
      }
      
      // Wait for state to update from server, then trigger full re-render
      setTimeout(async () => {
        if (this._hass) {
          // Request fresh state again
          try {
            await this._hass.callService('homeassistant', 'update_entity', {
              entity_id: this._bridgeSensor
            });
          } catch (e) {
          }
          
          // Trigger full re-render
          setTimeout(() => {
            if (this._hass) {
              this._optimisticBridgeState = null;
              this.hass = { ...this._hass };
              this.render().catch(() => {});
              setTimeout(() => {
                this._syncAllCardsForEntity();
              }, 100);
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
      // Always check config first - even before hass
      if (!this._config || !this._config.entity) {
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
    const enabled = this._isEnabled();
    const title = this._config.title || 'Water Heater Scheduler';
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
    const styleContent = `/**\n * Boiler Scheduler Card - Styles\n * All variables in :host; common/slot/popup/duration use them (overridable via --homie-slots-*).\n */\n\n:host {\n  display: block;\n  padding: 0;\n  overflow: hidden;\n  background: transparent;\n  --circular-button-size: var(--mdc-icon-button-size, 40px);\n\n  /* Card (header, slot card) */\n  --_accent: var(--homie-slots-accent, var(--primary-color, #03a9f4));\n  --_bg: var(--homie-slots-bg, var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9))));\n  --_radius: var(--homie-slots-radius, var(--ha-card-border-radius, 8px));\n  --_shadow: var(--homie-slots-shadow, var(--ha-card-box-shadow, 0 2px 8px rgba(0, 0, 0, 0.1)));\n  --_text: var(--homie-slots-text, var(--primary-text-color, #212121));\n  --_text-secondary: var(--homie-slots-text-secondary, var(--secondary-text-color, #757575));\n  --_text-on-accent: var(--homie-slots-text-on-accent, var(--text-primary-on-background, #ffffff));\n  --_disabled-color: var(--homie-slots-disabled, var(--disabled-color, var(--disabled-text-color, #9e9e9e)));\n\n  /* Select */\n  --_bg-select: var(--homie-slots-bg-select, var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9))));\n  --_divider-select: var(--homie-slots-divider-select, var(--divider-color, rgba(0, 0, 0, 0.12)));\n  --_text-select: var(--homie-slots-text-select, var(--primary-text-color, #212121));\n  --_radius-select: var(--homie-slots-radius-select, var(--mdc-shape-small, 4px));\n  --_focus-ring: var(--homie-slots-focus-ring, 0 0 0 2px rgba(3, 169, 244, 0.1));\n\n  /* Input, buttons, slot, weekday, duration */\n  --_padding-input-vertical: var(--homie-slots-padding-input-vertical, var(--mdc-shape-small, 4px));\n  --_padding-input-horizontal: var(--homie-slots-padding-input-horizontal, var(--mdc-shape-small, 8px));\n  --_border-input: var(--homie-slots-border-input, 1px solid var(--_divider));\n  --_radius-input: var(--homie-slots-radius-input, var(--_radius-small));\n  --_divider: var(--homie-slots-divider, var(--divider-color, rgba(0, 0, 0, 0.12)));\n  --_radius-small: var(--homie-slots-radius-small, var(--mdc-shape-small, 4px));\n  --_radius-medium: var(--homie-slots-radius-medium, var(--mdc-shape-medium, 8px));\n  --_secondary-bg: var(--homie-slots-secondary-bg, var(--secondary-background-color, #f5f5f5));\n  --_error-color: var(--homie-slots-error-color, var(--error-color, #f44336));\n\n  /* Button outline */\n  --_button-outline-padding: var(--homie-slots-button-outline-padding, var(--mdc-button-horizontal-padding, 16px));\n  --_button-outline-margin-top: var(--homie-slots-button-outline-margin-top, var(--mdc-layout-grid-gutter, 12px));\n  --_button-outline-radius: var(--homie-slots-button-outline-radius, var(--_radius-medium));\n  --_button-outline-bg: var(--homie-slots-button-outline-bg, transparent);\n  --_button-outline-border: var(--homie-slots-button-outline-border, 2px solid var(--_accent));\n  --_button-outline-color: var(--homie-slots-button-outline-color, var(--_accent));\n  --_button-outline-font-size: var(--homie-slots-button-outline-font-size, var(--mdc-typography-button-font-size, 14px));\n  --_button-outline-font-weight: var(--homie-slots-button-outline-font-weight, var(--mdc-typography-button-font-weight, 900));\n  --_button-outline-letter-spacing: var(--homie-slots-button-outline-letter-spacing, var(--mdc-typography-button-letter-spacing, 0em));\n  --_button-outline-min-height: var(--homie-slots-button-outline-min-height, var(--mdc-button-height, 36px));\n  --_button-outline-hover-shadow: var(--homie-slots-button-outline-hover-shadow, 0 2px 8px rgba(3, 169, 244, 0.3));\n  --_button-outline-active-transform: var(--homie-slots-button-outline-active-transform, scale(0.98));\n  --_button-outline-active-shadow: var(--homie-slots-button-outline-active-shadow, 0 1px 4px rgba(3, 169, 244, 0.2));\n\n  /* Popup */\n  --_popup-bg: var(--homie-slots-popup-background, var(--ha-dialog-background, var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9)))));\n  --_popup-color: var(--homie-slots-popup-color, var(--primary-text-color, #212121));\n  --_popup-backdrop-filter: var(--homie-slots-popup-backdrop-filter, var(--ha-card-backdrop-filter, none));\n  --_popup-box-shadow: var(--homie-slots-popup-box-shadow, var(--ha-card-box-shadow, none));\n  --_popup-border-radius: var(--homie-slots-popup-border-radius, var(--ha-card-border-radius, 16px));\n  --_popup-width: var(--mdc-dialog-width, 90%);\n  --_popup-max-width: var(--mdc-dialog-max-width, 400px);\n  --_popup-min-width: var(--mdc-dialog-min-width, 0px);\n  --_popup-max-height: var(--mdc-dialog-max-height, 90vh);\n\n  color: var(--_text);\n}\n\n/* === Common / slot / popup / duration (use :host vars above) === */\n.homie-select {\n  background: var(--_bg-select);\n  border: 1px solid var(--_divider-select);\n  border-radius: var(--_radius-select);\n  color: var(--_text-select);\n  font-size: 14px;\n  font-family: inherit;\n  cursor: pointer;\n  appearance: none;\n  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23999999' d='M6 9L1 4h10z'/%3E%3C/svg%3E");\n  background-repeat: no-repeat;\n  background-position: right var(--mdc-shape-small, 6px) center;\n  background-size: 12px;\n  transition: border-color 0.2s, box-shadow 0.2s;\n  padding: var(--_padding-input-vertical) var(--_padding-input-horizontal);\n  padding-right: calc(var(--_padding-input-horizontal) * 2 + 12px);\n}\n@media (prefers-color-scheme: dark) {\n  .homie-select {\n    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E");\n  }\n}\n.homie-select:focus {\n  outline: none;\n  border-color: var(--_accent);\n  box-shadow: var(--_focus-ring);\n}\n.homie-select option {\n  background: var(--_bg-select);\n  color: var(--_text-select);\n}\n.homie-input {\n  width: 100%;\n  background: var(--_bg);\n  border: var(--_border-input);\n  border-radius: var(--_radius-input);\n  color: var(--_text);\n  font-size: 14px;\n  font-family: inherit;\n  padding: var(--_padding-input-vertical) var(--_padding-input-horizontal);\n  transition: border-color 0.2s, box-shadow 0.2s;\n  box-sizing: border-box;\n}\n.homie-input:focus {\n  outline: none;\n  border-color: var(--_accent);\n  box-shadow: var(--_focus-ring);\n}\n.homie-input::placeholder {\n  color: var(--_text-secondary);\n  opacity: 0.7;\n}\n.button-outline {\n  width: 100%;\n  padding: var(--_button-outline-padding) var(--_button-outline-padding);\n  margin-top: var(--_button-outline-margin-top);\n  border-radius: var(--_button-outline-radius);\n  background: var(--_button-outline-bg);\n  border: var(--_button-outline-border);\n  color: var(--_button-outline-color);\n  font-size: var(--_button-outline-font-size);\n  font-weight: var(--_button-outline-font-weight);\n  letter-spacing: var(--_button-outline-letter-spacing);\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: all 0.2s;\n  -webkit-tap-highlight-color: transparent;\n  min-height: var(--_button-outline-min-height);\n}\n.button-outline:hover {\n  background: var(--_accent);\n  color: var(--_text-on-accent);\n  box-shadow: var(--_button-outline-hover-shadow);\n}\n.button-outline:active {\n  transform: var(--_button-outline-active-transform);\n  box-shadow: var(--_button-outline-active-shadow);\n}\n.slot-expandable {\n  max-height: 0;\n  overflow: hidden;\n  transition: max-height 0.3s ease-out;\n}\n.slot-card.expanded .slot-expandable {\n  max-height: 500px;\n  transition: max-height 0.3s ease-in;\n  padding: var(--ha-card-header-padding, 16px) 0;\n  display: flex;\n  flex-direction: column;\n  gap: var(--mdc-layout-grid-gutter, 12px);\n}\n.slot-details {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 16px);\n  margin-bottom: var(--mdc-layout-grid-gutter, 12px);\n  flex-wrap: wrap;\n}\n.slot-time, .slot-duration {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 6px);\n  font-size: 14px;\n}\n.slot-time ha-icon, .slot-duration ha-icon {\n  --mdc-icon-size: 22px;\n  opacity: 0.9;\n}\n.slot-time .time-picker-separator {\n  color: var(--_text);\n}\n.slot-delete {\n  width: 100%;\n  padding: var(--mdc-shape-small, 10px);\n  margin-top: var(--mdc-layout-grid-gutter, 12px);\n  border-radius: var(--_radius-medium);\n  background: var(--_secondary-bg);\n  border: 1px solid var(--_divider);\n  color: var(--_error-color);\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: var(--mdc-layout-grid-gutter, 8px);\n  transition: all 0.2s;\n  font-size: 14px;\n  font-weight: 500;\n  font-family: inherit;\n}\n.slot-delete:active { transform: scale(0.98); }\n.slot-delete ha-icon { --mdc-icon-size: 22px; }\n.empty-state {\n  text-align: center;\n  padding: 48px 16px;\n  color: var(--_text-secondary);\n}\n.empty-state ha-icon { --mdc-icon-size: 48px; opacity: 0.3; margin-bottom: 16px; }\n.empty-text { font-size: 14px; line-height: 20px; }\n.popup-overlay {\n  position: fixed;\n  top: 0; left: 0; right: 0; bottom: 0;\n  background: rgba(0, 0, 0, 0.5);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  z-index: 1000;\n  animation: fadeIn 0.2s;\n}\n@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }\n.popup-header {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 12px);\n  padding: var(--ha-card-header-padding, 20px);\n  border-bottom: 1px solid var(--_divider);\n}\n.popup-header ha-icon { --mdc-icon-size: 28px; color: var(--_accent); }\n.popup-title { flex: 1; font-size: 18px; font-weight: 500; color: var(--_text); }\n.popup-close {\n  width: var(--circular-button-size, var(--mdc-icon-button-size, 40px));\n  height: var(--circular-button-size, var(--mdc-icon-button-size, 40px));\n  min-width: var(--circular-button-size, var(--mdc-icon-button-size, 40px));\n  min-height: var(--circular-button-size, var(--mdc-icon-button-size, 40px));\n  border-radius: 50%;\n  background: transparent;\n  border: none;\n  color: var(--_text-secondary);\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: all 0.2s;\n}\n.popup-close ha-icon { --mdc-icon-size: 24px; }\n.popup-body { padding: var(--ha-card-header-padding, 20px); }\n.popup-field { margin-bottom: 20px; }\n.popup-field:last-child { margin-bottom: 0; }\n.popup-field label {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin-bottom: 8px;\n  font-size: 14px;\n  font-weight: 500;\n  color: var(--_text);\n}\n.popup-field label ha-icon { --mdc-icon-size: 24px; color: var(--_accent); }\n.popup-footer {\n  display: flex;\n  gap: var(--mdc-layout-grid-gutter, 12px);\n  padding: var(--ha-card-header-padding, 20px);\n  border-top: 1px solid var(--_divider);\n}\n.popup-button {\n  flex: 1;\n  padding: var(--mdc-shape-small, 12px) var(--mdc-shape-medium, 24px);\n  border: none;\n  border-radius: var(--_radius-medium);\n  font-size: 14px;\n  font-weight: 500;\n  cursor: pointer;\n  transition: all 0.2s;\n  font-family: inherit;\n}\n.popup-button.cancel { background: var(--_secondary-bg); color: var(--_text); }\n.popup-button.save { background: var(--_accent); color: var(--_text-on-accent); }\n.popup-button:active { transform: scale(0.98); }\n.time-selects { display: flex; align-items: center; gap: 8px; width: 100%; }\n.popup-time-hours, .popup-time-minutes { flex: 1; }\n.time-separator { font-size: 18px; font-weight: 500; color: var(--_text-secondary); user-select: none; }\n.slot-time .time-selects { display: flex; align-items: center; gap: 6px; width: auto; }\n.slot-time .time-separator { font-size: 14px; color: var(--_text); }\n.weekday-mode-selector { display: flex; gap: 8px; margin-bottom: 12px; }\n.weekday-mode-btn {\n  flex: 1;\n  padding: var(--mdc-shape-small, 10px);\n  border: 2px solid var(--_divider);\n  border-radius: var(--_radius-medium);\n  background: var(--_secondary-bg);\n  color: var(--_text-secondary);\n  text-align: center;\n  font-size: 13px;\n  font-weight: 500;\n  cursor: pointer;\n  transition: all 0.2s;\n  user-select: none;\n  font-family: inherit;\n}\n.weekday-mode-btn.active, .weekday-mode-btn:hover {\n  background: var(--_accent);\n  border-color: var(--_accent);\n  color: var(--_text-on-accent);\n}\n.weekday-mode-btn:hover { opacity: 0.8; }\n.popup-weekdays { display: flex; gap: 8px; flex-wrap: wrap; }\n.popup-weekdays.hidden { display: none; }\n.popup-weekday {\n  flex: 1;\n  min-width: 40px;\n  padding: var(--mdc-shape-small, 10px);\n  border: 2px solid var(--_divider);\n  border-radius: var(--_radius-medium);\n  background: var(--_secondary-bg);\n  color: var(--_text-secondary);\n  text-align: center;\n  font-size: 13px;\n  font-weight: 500;\n  cursor: pointer;\n  transition: all 0.2s;\n  user-select: none;\n}\n.popup-weekday.active {\n  background: var(--_accent);\n  border-color: var(--_accent);\n  color: var(--_text-on-accent);\n}\n@media (max-width: 480px) {\n  .popup-weekday { min-width: 35px; padding: 8px; font-size: 12px; }\n}\n.duration-selector-wrapper {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 12px);\n  width: 100%;\n}\n.duration-slider {\n  flex: 1;\n  height: 4px;\n  border-radius: 2px;\n  background: var(--_divider);\n  outline: none;\n  -webkit-appearance: none;\n  appearance: none;\n}\n.duration-slider::-webkit-slider-thumb {\n  -webkit-appearance: none;\n  appearance: none;\n  width: 20px;\n  height: 20px;\n  border-radius: 50%;\n  background: var(--_accent);\n  cursor: pointer;\n  border: 2px solid var(--_bg);\n  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);\n  transition: all 0.2s;\n}\n.duration-slider::-webkit-slider-thumb:hover {\n  transform: scale(1.1);\n  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);\n}\n.duration-slider::-moz-range-thumb {\n  width: 20px;\n  height: 20px;\n  border-radius: 50%;\n  background: var(--_accent);\n  cursor: pointer;\n  border: 2px solid var(--_bg);\n  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);\n  transition: all 0.2s;\n}\n.duration-slider::-moz-range-thumb:hover {\n  transform: scale(1.1);\n  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);\n}\n.duration-input {\n  width: 80px;\n  min-width: 80px;\n  text-align: center;\n}\n\n/* ========================================\n   MAIN HEADER\n   ======================================== */\n\n.main-header {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  padding: var(--ha-card-header-padding, 16px);\n  background: var(--_bg);\n  border-radius: var(--_radius);\n  box-shadow: var(--_shadow);\n  backdrop-filter: var(--ha-card-backdrop-filter, blur(10px));\n}\n\n.main-header:not(:last-child) {\n  margin-bottom: var(--mdc-layout-grid-gutter, 12px);\n}\n\n.header-left {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  flex: 1;\n}\n\n.header-icon {\n  width: var(--circular-button-size);\n  height: var(--circular-button-size);\n  min-width: var(--circular-button-size);\n  min-height: var(--circular-button-size);\n  border-radius: 50%;\n  background: var(--_accent);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  color: var(--_text-on-accent);\n  cursor: pointer;\n  transition: all 0.2s;\n  -webkit-tap-highlight-color: transparent;\n}\n\n.header-icon:active {\n  transform: scale(0.95);\n}\n\n.header-icon.disabled {\n  opacity: 0.5;\n  background: var(--_disabled-color);\n}\n\n.header-icon.enabled {\n  background: var(--_accent);\n  opacity: 1;\n}\n\n.header-icon ha-icon {\n  --mdc-icon-size: 28px;\n}\n\n.header-text {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n\n.header-title {\n  font-size: 16px;\n  font-weight: 500;\n  color: var(--primary-text-color, #212121);\n  line-height: 22px;\n}\n\n.header-status {\n  font-size: 14px;\n  color: var(--secondary-text-color, #757575);\n  line-height: 20px;\n}\n\n.add-button {\n  width: var(--circular-button-size);\n  height: var(--circular-button-size);\n  min-width: var(--circular-button-size);\n  min-height: var(--circular-button-size);\n  border-radius: 50%;\n  background: var(--primary-color, #03a9f4);\n  border: none;\n  color: var(--text-primary-on-background, #ffffff);\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: all 0.2s;\n  -webkit-tap-highlight-color: transparent;\n}\n\n.add-button:active {\n  transform: scale(0.95);\n}\n\n.add-button ha-icon {\n  --mdc-icon-size: 28px;\n}\n\n/* ========================================\n   ADD SLOT BUTTON\n   ======================================== */\n\n/* Button outline style moved to shared/assets/homie-css.css */\n\n/* ========================================\n   SLOTS CONTAINER\n   ======================================== */\n\n.slots-container {\n  display: flex;\n  flex-direction: column;\n  gap: var(--mdc-layout-grid-gutter, 12px);\n}\n\n.slots-container--empty {\n  display: none;\n}\n\n/* ========================================\n   SLOT CARD (Blue Card Design)\n   ======================================== */\n\n.slot-card {\n  background: var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9)));\n  border-radius: var(--ha-card-border-radius, var(--mdc-shape-medium, 8px));\n  padding: var(--ha-card-header-padding, 16px) var(--ha-card-header-padding, 16px) 0 var(--ha-card-header-padding, 16px);\n  color: var(--primary-text-color, #212121);\n  position: relative;\n  box-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0, 0, 0, 0.1));\n  transition: transform 0.2s, box-shadow 0.2s, background 0.2s;\n  backdrop-filter: var(--ha-card-backdrop-filter, blur(10px));\n}\n\n/* Active slot (enabled) - same background as header */\n.slot-card:not(.disabled) {\n  background: var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9)));\n}\n\n.slot-card.disabled {\n  opacity: 0.6;\n  background: var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.5)));\n}\n\n.slot-header {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 12px);\n  margin-bottom: 0;\n}\n\n.slot-icon {\n  width: var(--circular-button-size);\n  height: var(--circular-button-size);\n  min-width: var(--circular-button-size);\n  min-height: var(--circular-button-size);\n  border-radius: 50%;\n  background: var(--primary-color, #03a9f4);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  cursor: pointer;\n  transition: all 0.2s;\n  -webkit-tap-highlight-color: transparent;\n  color: var(--text-primary-on-background, #ffffff);\n}\n\n.slot-icon:active {\n  transform: scale(0.95);\n}\n\n.slot-icon.enabled {\n  background: var(--primary-color, #03a9f4);\n  opacity: 1;\n}\n\n.slot-icon.disabled {\n  background: var(--disabled-color, var(--disabled-text-color, #9e9e9e));\n  opacity: 0.6;\n}\n\n.slot-icon ha-icon {\n  --mdc-icon-size: 24px;\n}\n\n.slot-info {\n  flex: 1;\n}\n\n.slot-name {\n  font-size: 16px;\n  font-weight: 500;\n  margin-bottom: 4px;\n}\n\n.slot-status {\n  font-size: 14px;\n  color: var(--secondary-text-color, #757575);\n}\n\n.slot-expand {\n  width: 100%;\n  padding: 8px 0;\n  margin-top: var(--mdc-layout-grid-gutter, 12px);\n  border-radius: 0;\n  background: transparent;\n  border: none;\n  border-top: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));\n  color: var(--primary-text-color, #212121);\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: all 0.2s;\n  -webkit-tap-highlight-color: transparent;\n}\n\n.slot-expand ha-icon {\n  --mdc-icon-size: 20px;\n  transition: transform 0.2s;\n}\n\n.slot-card.expanded .slot-expand ha-icon {\n  transform: rotate(180deg);\n}\n\n/* Slot expandable, slot-details styles moved to shared/assets/homie-css.css */\n\n.slot-title {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 6px);\n  font-size: 14px;\n  width: 100%;\n  flex-basis: 100%;\n  margin-bottom: var(--mdc-layout-grid-gutter, 8px);\n}\n\n.slot-time,\n.slot-duration {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 6px);\n  font-size: 14px;\n}\n\n.slot-title ha-icon,\n.slot-time ha-icon,\n.slot-duration ha-icon {\n  --mdc-icon-size: 22px;\n  opacity: 0.9;\n}\n\n.slot-title .slot-title-input {\n  flex: 1;\n}\n\n/* Time picker styles are now in shared/homie-select/homie-select.css */\n\n.slot-time .time-picker-separator {\n  color: var(--primary-text-color, #212121);\n}\n\n/* Select styles are now in shared/homie-select.css */\n\n.slot-weekdays-wrapper {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 6px);\n}\n\n.slot-weekdays-icon {\n  --mdc-icon-size: 22px;\n  opacity: 0.9;\n  flex-shrink: 0;\n}\n\n.slot-weekdays {\n  display: flex;\n  gap: var(--mdc-layout-grid-gutter, 6px);\n  flex-wrap: wrap;\n  flex: 1;\n  justify-content: flex-start;\n}\n\n.slot-weekday {\n  padding: var(--mdc-shape-small, 6px) var(--mdc-shape-small, 8px);\n  border-radius: var(--ha-card-border-radius, var(--mdc-shape-small, 4px));\n  background: var(--secondary-background-color, #f5f5f5);\n  border: 2px solid var(--divider-color, rgba(0, 0, 0, 0.12));\n  color: var(--primary-text-color, #212121);\n  font-size: 12px;\n  font-weight: 400;\n  cursor: pointer;\n  transition: all 0.2s;\n  user-select: none;\n  flex-shrink: 0;\n  min-width: fit-content;\n  flex: 1;\n  text-align: center;\n  min-width: 0;\n}\n\n.slot-weekday.active {\n  background: var(--primary-color, #03a9f4);\n  color: var(--text-primary-on-background, #ffffff);\n  font-weight: 600;\n  border-color: var(--primary-color, #03a9f4);\n}\n\n/* Slot delete, empty state styles moved to shared/assets/homie-css.css */\n\n/* Popup overlay, popup-header, popup-body, popup-field styles moved to shared/assets/homie-css.css */\n\n/* Popup content (defaults, override via --homie-slots-popup-*) */\n.popup-content {\n  background: var(--_popup-bg);\n  color: var(--_popup-color);\n  -webkit-backdrop-filter: var(--_popup-backdrop-filter);\n  backdrop-filter: var(--_popup-backdrop-filter);\n  box-shadow: var(--_popup-box-shadow);\n  border-radius: var(--_popup-border-radius);\n  width: var(--_popup-width);\n  max-width: var(--_popup-max-width);\n  min-width: var(--_popup-min-width);\n  max-height: var(--_popup-max-height);\n  overflow-y: auto;\n  animation: slideUp 0.3s;\n}\n\n@keyframes slideUp {\n  from {\n    transform: translateY(20px);\n    opacity: 0;\n  }\n  to {\n    transform: translateY(0);\n    opacity: 1;\n  }\n}\n\n\n/* Slot time selects */\n.slot-time .time-selects {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  width: auto;\n}\n\n.slot-time .time-separator {\n  font-size: 14px;\n  color: var(--primary-text-color, #212121);\n}\n\n/* Popup select styles are now in shared/homie-select.css */\n\n/* Time selects, weekday selector, popup footer/button styles moved to shared/assets/homie-css.css */\n\n/* ========================================\n   RESPONSIVE\n   ======================================== */\n\n@media (max-width: 480px) {\n  .main-header {\n    padding: var(--mdc-shape-small, 12px);\n  }\n  \n  .header-title {\n    font-size: 16px;\n  }\n  \n  .slot-card {\n    padding: var(--mdc-shape-small, 12px);\n  }\n  \n  :host {\n    --_popup-width: var(--mdc-dialog-width, 95%);\n    --_popup-max-height: var(--mdc-dialog-max-height, 85vh);\n  }\n}\n\n/* ========================================\n   DARK THEME SUPPORT\n   ======================================== */\n\n/* Dark theme adjustments are handled by HA CSS variables */\n/* No additional dark theme styles needed */\n`;
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
    
    // Replace duration placeholders (step computed so slider can reach max)
    const minDuration = this._config.min_duration || 15;
    const maxDuration = this._getEffectiveMaxDuration();
    const durationStep = window.DurationSelector && typeof window.DurationSelector.computeStep === 'function'
      ? window.DurationSelector.computeStep(minDuration, maxDuration, this._config.duration_step || 15)
      : (this._config.duration_step || 15);
    const defaultDuration = Math.min(minDuration, maxDuration);
    
    let processedTemplate = template
      .replace(/\{\{DURATION_MIN\}\}/g, minDuration)
      .replace(/\{\{DURATION_MAX\}\}/g, maxDuration)
      .replace(/\{\{DURATION_STEP\}\}/g, durationStep)
      .replace(/\{\{DURATION_VALUE\}\}/g, defaultDuration)
      .replace(/\{\{ITEM_ID\}\}/g, ''); // Empty for popup
    
    // Get entity name for popup header
    const entityName = this._config?.entity || 'entity';
    const entityState = this._hass?.states?.[entityName];
    const entityDisplayName = entityState?.attributes?.friendly_name || entityName;
    
    // Replace placeholders (icon is now fixed in template)
    const slotsContainerClass = items.length === 0 ? ' slots-container--empty' : '';
    const htmlContent = processedTemplate
      .replace(/\{\{TITLE\}\}/g, title)
      .replace(/\{\{STATUS_TEXT\}\}/g, statusText)
      .replace(/\{\{ENABLED_CLASS\}\}/g, enabledClass)
      .replace(/\{\{SLOTS_CONTAINER_CLASS\}\}/g, slotsContainerClass)
      .replace(/\{\{ITEMS_CONTENT\}\}/g, itemsContentHtml)
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
    const slotNumber = this._getItems().indexOf(item) + 1;
    
    // Load slot template
    const template = await this._loadSlotTemplate();
    if (!template) {
      // Return empty string to prevent breaking the entire card
      return '';
    }
    
    // Format slot name - use title if available, otherwise "Slot N"
    const slotName = item.title || `Slot ${slotNumber}`;
    
    // Format slot status
    const daysText = WeekdaySelector.formatWeekdays(item.weekdays);
    const durationStr = this._formatDuration(item.duration);
    const slotStatus = `${daysText} on ${item.time}${durationStr}`;
    
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

    // Replace placeholders (step computed so slider can reach max)
    const minDuration = this._config.min_duration || 15;
    const maxDuration = this._getEffectiveMaxDuration();
    const durationStep = window.DurationSelector && typeof window.DurationSelector.computeStep === 'function'
      ? window.DurationSelector.computeStep(minDuration, maxDuration, this._config.duration_step || 15)
      : (this._config.duration_step || 15);
    const durationValue = item.duration || minDuration;
    
    let result = template
      .replace(/\{\{ITEM_ID\}\}/g, item.id)
      .replace(/\{\{SLOT_NUMBER\}\}/g, slotNumber)
      .replace(/\{\{SLOT_NAME\}\}/g, slotName)
      .replace(/\{\{SLOT_TITLE\}\}/g, item.title || '')
      .replace(/\{\{DISABLED_CLASS\}\}/g, item.enabled ? '' : 'disabled')
      .replace(/\{\{ICON_CLASS\}\}/g, item.enabled ? 'enabled' : 'disabled')
      .replace(/\{\{SLOT_STATUS\}\}/g, slotStatus)
      .replace(/\{\{ITEM_TIME\}\}/g, item.time)
      .replace(/\{\{DURATION_MIN\}\}/g, minDuration)
      .replace(/\{\{DURATION_MAX\}\}/g, maxDuration)
      .replace(/\{\{DURATION_STEP\}\}/g, durationStep)
      .replace(/\{\{DURATION_VALUE\}\}/g, Math.min(durationValue, maxDuration));
    
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
    
    // Create a temporary DOM element to set weekday selector state
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = result;
    const slotCard = tempDiv.querySelector(`[data-item-id="${item.id}"]`);
    if (slotCard) {
      WeekdaySelector.setSelectedWeekdays(tempDiv, item.weekdays, slotCard);
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
    WeekdaySelector.attachEventListeners(this.shadowRoot);
    
    // Popup duration selection - NOT here, it's attached in _openAddPopup() when popup opens
    // This prevents duplicate event listeners and ensures values are set correctly

    // Item actions
    const slotCards = this.shadowRoot.querySelectorAll('.slot-card');
    slotCards.forEach(itemEl => {
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

      // Toggle expand/collapse
      const expandBtn = itemEl.querySelector('[data-action="toggle-expand"]');
      if (expandBtn) {
        expandBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isExpanded = itemEl.classList.contains('expanded');
          if (isExpanded) {
            itemEl.classList.remove('expanded');
            this._expandedSlots.delete(itemId);
          } else {
            itemEl.classList.add('expanded');
            this._expandedSlots.add(itemId);
          }
          const icon = expandBtn.querySelector('ha-icon');
          if (icon) {
            icon.setAttribute('icon', itemEl.classList.contains('expanded') ? 'mdi:chevron-up' : 'mdi:chevron-down');
          }
        });
      }

      // Restore expanded state if it was expanded before
      if (this._expandedSlots.has(itemId)) {
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
          this._deleteItem(itemId);
        });
      }

      // Update title input
      const titleInput = itemEl.querySelector('.slot-title-input');
      if (titleInput) {
        let titleDebounceTimer = null;
        
        const saveTitleUpdate = (newTitle) => {
          if (itemEl.dataset.updating === 'true') return;
          this._updateItem(itemId, { title: newTitle });
        };
        
        // Auto-save on input with debounce
        titleInput.addEventListener('input', (e) => {
          e.stopPropagation();
          clearTimeout(titleDebounceTimer);
          const newTitle = e.target.value.trim() || null;
          titleDebounceTimer = setTimeout(() => {
            saveTitleUpdate(newTitle);
          }, 600); // 600ms delay
        });
        
        // Also save on blur (immediate)
        titleInput.addEventListener('blur', (e) => {
          e.stopPropagation();
          clearTimeout(titleDebounceTimer); // Cancel pending debounced save
          const newTitle = e.target.value.trim() || null;
          saveTitleUpdate(newTitle);
        });
        
        titleInput.addEventListener('click', (e) => {
          e.stopPropagation();
        });
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

      // Update duration - use shared component (allowed values 5,10,...,max)
      const durationConfig = { ...this._config, max_duration: this._getEffectiveMaxDuration() };
      DurationSelector.setDurationInSlot(itemEl, item.duration, durationConfig);
      DurationSelector.attachEventListenersInSlot(itemEl, (duration) => {
        if (itemEl.dataset.updating === 'true') return;
        this._updateItem(itemId, { duration });
      }, durationConfig);

      // Weekday selector - use shared component
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
          // Debug: check what getSelectedWeekdays sees
          const activeModeBtn = itemEl.querySelector('.weekday-mode-btn.active');
          const mode = activeModeBtn ? activeModeBtn.dataset.mode : 'everyday';
          const customDays = itemEl.querySelectorAll('.popup-weekday.active');const selectedWeekdays = WeekdaySelector.getSelectedWeekdays(itemEl);
          
          if (selectedWeekdays.length === 0) {
            // Don't allow empty weekdays - restore previous state
            WeekdaySelector.setSelectedWeekdays(itemEl, currentItem.weekdays, itemEl);
            return;
          }
          
          // Only update if weekdays actually changed
          const currentWeekdaysSorted = (currentItem.weekdays || []).slice().sort();
          const selectedWeekdaysSorted = selectedWeekdays.slice().sort();
          const weekdaysChanged = JSON.stringify(selectedWeekdaysSorted) !== JSON.stringify(currentWeekdaysSorted);if (weekdaysChanged) {
            this._updateItem(itemId, { weekdays: selectedWeekdays });
          } else {
          }
        };
        
        // First, attach shared component listeners (this handles mode buttons and custom weekdays)
        // This will clone elements, so we need to add our handlers AFTER
        WeekdaySelector.attachEventListeners(itemEl);
        
        // Check elements AFTER attachEventListeners
        const modeBtnsAfter = itemEl.querySelectorAll('.weekday-mode-btn');
        const weekdayBtnsAfter = itemEl.querySelectorAll('.popup-weekday');
        
        // Add handlers directly to the CLONED elements (after attachEventListeners)
        // Use retry mechanism to ensure elements are ready
        const addWeekdayHandlers = () => {
          const modeBtns = itemEl.querySelectorAll('.weekday-mode-btn');
          const weekdayBtns = itemEl.querySelectorAll('.popup-weekday');
          
          
          if (modeBtns.length === 0 && weekdayBtns.length === 0) {
            setTimeout(addWeekdayHandlers, 50);
            return;
          }
          
          
          // Add handler to mode buttons
          modeBtns.forEach((btn, index) => {
            // Remove any existing handlers by cloning
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            // Add WeekdaySelector handler first
            newBtn.addEventListener('click', (e) => {
              const scope = newBtn.closest('.slot-card') || itemEl;
              scope.querySelectorAll('.weekday-mode-btn').forEach(b => b.classList.remove('active'));
              newBtn.classList.add('active');
              const mode = newBtn.dataset.mode;
              
              // Find custom weekdays - search in slot card (not popup-field, as slots don't have it)
              const slotCard = newBtn.closest('.slot-card') || itemEl;
              let customWeekdays = slotCard.querySelector('#popup-weekdays-custom') || slotCard.querySelector('.popup-weekdays');
              
              
              if (mode === 'everyday' || mode === 'weekdays') {
                if (customWeekdays) {
                  customWeekdays.classList.add('hidden');
                }
              } else {
                // Custom mode - show and set active days from current item
                if (customWeekdays) {
                  customWeekdays.classList.remove('hidden');
                  
                  // Get current item weekdays and set them as active
                  const currentItems = this._getItems();
                  const currentItem = currentItems.find(i => i.id === itemId);
                  if (currentItem && currentItem.weekdays) {
                    // Set active state for days that are in currentItem.weekdays
                    slotCard.querySelectorAll('.popup-weekday').forEach(dayEl => {
                      const day = parseInt(dayEl.dataset.day);
                      if (currentItem.weekdays.includes(day)) {
                        dayEl.classList.add('active');
                      } else {
                        dayEl.classList.remove('active');
                      }
                    });
                  }
                } else {
                }
              }
            });
            
            // Then add our update handler
            newBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              setTimeout(updateWeekdays, 100);
            });
          });
          
          // Add handler to custom weekday buttons
          weekdayBtns.forEach((dayEl, index) => {
            // Remove any existing handlers by cloning
            const newDayEl = dayEl.cloneNode(true);
            dayEl.parentNode.replaceChild(newDayEl, dayEl);
            
            // Add WeekdaySelector handler first
            newDayEl.addEventListener('click', (e) => {
              newDayEl.classList.toggle('active');
            });
            
            // Then add our update handler
            newDayEl.addEventListener('click', (e) => {
              e.stopPropagation();
              setTimeout(updateWeekdays, 100);
            });
          });
        };
        
        // Start trying to add handlers - use longer delay to ensure attachEventListeners finished
        setTimeout(() => {
          addWeekdayHandlers();
        }, 100);
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
if (typeof customElements !== 'undefined' && !customElements.get('homie-scheduler-boiler-slots')) {
  customElements.define('homie-scheduler-boiler-slots', HomieBoilerScheduleSlotsCard);
  window.logCardInfo('boiler-slots-card');
}

class HomieClimateScheduleSlotsCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = null;
    this._hass = null;
    this._entryId = null;
    this._bridgeSensor = null;
    this._debounceTimer = null;
    this._htmlTemplate = null;
    this._expandedSlots = new Set(); // Track expanded slots
    this._configError = null; // Store config error message
    this._unsubStateChanged = null; // Unsubscribe function for state_changed events
    this._optimisticBridgeState = null; // Local overlay for optimistic updates (avoids mutating hass.states)
  }

  async _loadTemplate() {
    if (this._htmlTemplate) return this._htmlTemplate;
    
    // Template is embedded in production build
    this._htmlTemplate = `  <!-- Main Header -->\n  <div class="main-header">\n    <div class="header-left">\n      <div class="header-icon {{ENABLED_CLASS}}" data-action="toggle-enabled" title="Toggle scheduler">\n        <ha-icon icon="mdi:calendar-clock"></ha-icon>\n        <!-- <ha-icon icon="{{ICON}}"></ha-icon> -->\n      </div>\n      <div class="header-text">\n        <div class="header-title">\n          {{TITLE}}\n        </div>\n        <div class="header-status">{{STATUS_TEXT}}</div>\n      </div>\n    </div>\n  </div>\n  \n  <!-- Slots List (hidden when 0 slots) -->\n  <div class="slots-container{{SLOTS_CONTAINER_CLASS}}">\n    {{ITEMS_CONTENT}}\n  </div>\n  \n  <!-- Add Slot Button -->\n  <button class="button-outline" data-action="open-add-popup">\n    Add Schedule Slot\n  </button>\n  \n  <!-- Add Slot Popup -->\n  <div class="popup-overlay" id="add-popup" style="display: none;">\n    <div class="popup-content">\n      <div class="popup-header">\n        <ha-icon icon="mdi:power"></ha-icon>\n        <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">\n          <span class="popup-title">Add Schedule Slot</span>\n          <div style="font-size: 12px; color: var(--secondary-text-color, #757575);">\n            for {{ENTITY_NAME}}\n          </div>\n        </div>\n        <button class="popup-close" data-action="close-popup">\n          <ha-icon icon="mdi:close"></ha-icon>\n        </button>\n      </div>\n      \n      <div class="popup-body">\n        <!-- Title Input -->\n        <div class="popup-field">\n          <label>\n            <ha-icon icon="mdi:label-outline"></ha-icon>\n            <span>Title (optional)</span>\n          </label>\n          <input type="text" class="homie-input" id="popup-title" placeholder="e.g. Morning heating">\n        </div>\n        \n        <!-- Time Input -->\n        <div class="popup-field">\n          <label>\n            <ha-icon icon="mdi:clock-outline"></ha-icon>\n            <span>Start Time</span>\n          </label>\n          <div class="time-selects">\n            <select class="homie-select popup-time-hours" id="popup-time-hours">\n              <option value="00">00</option>\n              <option value="01">01</option>\n              <option value="02">02</option>\n              <option value="03">03</option>\n              <option value="04">04</option>\n              <option value="05">05</option>\n              <option value="06">06</option>\n              <option value="07">07</option>\n              <option value="08" selected>08</option>\n              <option value="09">09</option>\n              <option value="10">10</option>\n              <option value="11">11</option>\n              <option value="12">12</option>\n              <option value="13">13</option>\n              <option value="14">14</option>\n              <option value="15">15</option>\n              <option value="16">16</option>\n              <option value="17">17</option>\n              <option value="18">18</option>\n              <option value="19">19</option>\n              <option value="20">20</option>\n              <option value="21">21</option>\n              <option value="22">22</option>\n              <option value="23">23</option>\n            </select>\n            <span class="time-separator">:</span>\n            <select class="homie-select popup-time-minutes" id="popup-time-minutes">\n              <option value="00" selected>00</option>\n              <option value="05">05</option>\n              <option value="10">10</option>\n              <option value="15">15</option>\n              <option value="20">20</option>\n              <option value="25">25</option>\n              <option value="30">30</option>\n              <option value="35">35</option>\n              <option value="40">40</option>\n              <option value="45">45</option>\n              <option value="50">50</option>\n              <option value="55">55</option>\n            </select>\n          </div>\n        </div>\n        \n        <!-- HVAC Mode Select -->\n        <div class="popup-field">\n          <label>\n            <ha-icon icon="mdi:thermostat"></ha-icon>\n            <span>HVAC Mode</span>\n          </label>\n          <select class="homie-select" id="popup-hvac-mode">\n            {{HVAC_MODES_OPTIONS}}\n          </select>\n        </div>\n        \n        <!-- Duration Selector -->\n        <div class="popup-field">\n          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">\n            <ha-icon icon="mdi:timer-outline"></ha-icon>\n            <span>Duration (minutes)</span>\n            <input type="checkbox" id="popup-duration-enabled" style="width: 18px; height: 18px; cursor: pointer;">\n          </label>\n          <div id="popup-duration-wrapper" style="display: none; margin-top: 8px;">\n            <!-- SHARED:duration-selector -->\n<!-- Duration Selector Component (universal - for popup and slot) -->\n<div class="duration-selector-wrapper">\n  <input \n    type="range" \n    class="duration-slider" \n    data-action="update-duration-slider"\n    data-item-id="{{ITEM_ID}}"\n    min="{{DURATION_MIN}}"\n    max="{{DURATION_MAX}}"\n    step="{{DURATION_STEP}}"\n    value="{{DURATION_VALUE}}"\n  />\n  <input \n    type="number" \n    class="duration-input homie-input" \n    data-action="update-duration"\n    data-item-id="{{ITEM_ID}}"\n    min="{{DURATION_MIN}}"\n    max="{{DURATION_MAX}}"\n    step="{{DURATION_STEP}}"\n    value="{{DURATION_VALUE}}"\n  />\n</div>\n<!-- END:duration-selector -->\n          </div>\n        </div>\n        \n        <!-- Weekday Selector -->\n        <div class="popup-field">\n          <label>\n            <ha-icon icon="mdi:calendar"></ha-icon>\n            <span>Days of Week</span>\n          </label>\n          <!-- SHARED:weekday-selector -->\n<!-- Weekday Selection Component (universal - without popup-field) -->\n<div class="weekday-mode-selector">\n  <button type="button" class="weekday-mode-btn active" data-mode="everyday">Everyday</button>\n  <button type="button" class="weekday-mode-btn" data-mode="weekdays">Weekdays</button>\n  <button type="button" class="weekday-mode-btn" data-mode="custom">Custom</button>\n</div>\n<div class="popup-weekdays hidden" id="popup-weekdays-custom">\n  <div class="popup-weekday" data-day="0">Mon</div>\n  <div class="popup-weekday" data-day="1">Tue</div>\n  <div class="popup-weekday" data-day="2">Wed</div>\n  <div class="popup-weekday" data-day="3">Thu</div>\n  <div class="popup-weekday" data-day="4">Fri</div>\n  <div class="popup-weekday" data-day="5">Sat</div>\n  <div class="popup-weekday" data-day="6">Sun</div>\n</div>\n<!-- END:weekday-selector -->\n        </div>\n      </div>\n      \n      <div class="popup-footer">\n        <button class="popup-button cancel" data-action="close-popup">Cancel</button>\n        <button class="popup-button save" data-action="save-slot">Save</button>\n      </div>\n    </div>\n  </div>\n\n<!-- Slot Item Template -->\n<template id="slot-item-template">\n  <div class="slot-card {{DISABLED_CLASS}}" data-item-id="{{ITEM_ID}}">\n    <div class="slot-header">\n      <div class="slot-icon {{ICON_CLASS}}" data-action="toggle-item" title="Toggle slot">\n        <ha-icon icon="mdi:power"></ha-icon>\n      </div>\n      <div class="slot-info">\n        <div class="slot-name">{{SLOT_NAME}}</div>\n        <div class="slot-status">{{SLOT_STATUS}}</div>\n      </div>\n    </div>\n    <button class="slot-expand" data-action="toggle-expand" title="Expand/collapse details">\n      <ha-icon icon="mdi:chevron-down"></ha-icon>\n    </button>\n    \n    <div class="slot-expandable">\n      <div class="slot-details">\n        <div class="slot-time">\n          <ha-icon icon="mdi:clock-outline"></ha-icon>\n          <div class="time-selects">\n            <select class="homie-select slot-time-hours" data-action="update-time-hours" data-item-id="{{ITEM_ID}}">\n              <option value="00" {{TIME_HOURS_00}}>00</option>\n              <option value="01" {{TIME_HOURS_01}}>01</option>\n              <option value="02" {{TIME_HOURS_02}}>02</option>\n              <option value="03" {{TIME_HOURS_03}}>03</option>\n              <option value="04" {{TIME_HOURS_04}}>04</option>\n              <option value="05" {{TIME_HOURS_05}}>05</option>\n              <option value="06" {{TIME_HOURS_06}}>06</option>\n              <option value="07" {{TIME_HOURS_07}}>07</option>\n              <option value="08" {{TIME_HOURS_08}}>08</option>\n              <option value="09" {{TIME_HOURS_09}}>09</option>\n              <option value="10" {{TIME_HOURS_10}}>10</option>\n              <option value="11" {{TIME_HOURS_11}}>11</option>\n              <option value="12" {{TIME_HOURS_12}}>12</option>\n              <option value="13" {{TIME_HOURS_13}}>13</option>\n              <option value="14" {{TIME_HOURS_14}}>14</option>\n              <option value="15" {{TIME_HOURS_15}}>15</option>\n              <option value="16" {{TIME_HOURS_16}}>16</option>\n              <option value="17" {{TIME_HOURS_17}}>17</option>\n              <option value="18" {{TIME_HOURS_18}}>18</option>\n              <option value="19" {{TIME_HOURS_19}}>19</option>\n              <option value="20" {{TIME_HOURS_20}}>20</option>\n              <option value="21" {{TIME_HOURS_21}}>21</option>\n              <option value="22" {{TIME_HOURS_22}}>22</option>\n              <option value="23" {{TIME_HOURS_23}}>23</option>\n            </select>\n            <span class="time-separator">:</span>\n            <select class="homie-select slot-time-minutes" data-action="update-time-minutes" data-item-id="{{ITEM_ID}}">\n              <option value="00" {{TIME_MINUTES_00}}>00</option>\n              <option value="05" {{TIME_MINUTES_05}}>05</option>\n              <option value="10" {{TIME_MINUTES_10}}>10</option>\n              <option value="15" {{TIME_MINUTES_15}}>15</option>\n              <option value="20" {{TIME_MINUTES_20}}>20</option>\n              <option value="25" {{TIME_MINUTES_25}}>25</option>\n              <option value="30" {{TIME_MINUTES_30}}>30</option>\n              <option value="35" {{TIME_MINUTES_35}}>35</option>\n              <option value="40" {{TIME_MINUTES_40}}>40</option>\n              <option value="45" {{TIME_MINUTES_45}}>45</option>\n              <option value="50" {{TIME_MINUTES_50}}>50</option>\n              <option value="55" {{TIME_MINUTES_55}}>55</option>\n            </select>\n          </div>\n        </div>\n      </div>\n      <div class="slot-duration">\n        <ha-icon icon="mdi:timer-outline"></ha-icon>\n        <!-- SHARED:duration-selector -->\n<!-- Duration Selector Component (universal - for popup and slot) -->\n<div class="duration-selector-wrapper">\n  <input \n    type="range" \n    class="duration-slider" \n    data-action="update-duration-slider"\n    data-item-id="{{ITEM_ID}}"\n    min="{{DURATION_MIN}}"\n    max="{{DURATION_MAX}}"\n    step="{{DURATION_STEP}}"\n    value="{{DURATION_VALUE}}"\n  />\n  <input \n    type="number" \n    class="duration-input homie-input" \n    data-action="update-duration"\n    data-item-id="{{ITEM_ID}}"\n    min="{{DURATION_MIN}}"\n    max="{{DURATION_MAX}}"\n    step="{{DURATION_STEP}}"\n    value="{{DURATION_VALUE}}"\n  />\n</div>\n<!-- END:duration-selector -->\n      </div>\n      <div class="slot-hvac-mode">\n        <ha-icon icon="mdi:thermostat"></ha-icon>\n        <select class="homie-select" data-action="update-hvac-mode" data-item-id="{{ITEM_ID}}">\n          {{HVAC_MODE_OPTIONS}}\n        </select>\n      </div>\n      \n      <!-- SHARED:weekday-selector -->\n<!-- Weekday Selection Component (universal - without popup-field) -->\n<div class="weekday-mode-selector">\n  <button type="button" class="weekday-mode-btn active" data-mode="everyday">Everyday</button>\n  <button type="button" class="weekday-mode-btn" data-mode="weekdays">Weekdays</button>\n  <button type="button" class="weekday-mode-btn" data-mode="custom">Custom</button>\n</div>\n<div class="popup-weekdays hidden" id="popup-weekdays-custom">\n  <div class="popup-weekday" data-day="0">Mon</div>\n  <div class="popup-weekday" data-day="1">Tue</div>\n  <div class="popup-weekday" data-day="2">Wed</div>\n  <div class="popup-weekday" data-day="3">Thu</div>\n  <div class="popup-weekday" data-day="4">Fri</div>\n  <div class="popup-weekday" data-day="5">Sat</div>\n  <div class="popup-weekday" data-day="6">Sun</div>\n</div>\n<!-- END:weekday-selector -->\n      \n      <button class="slot-delete" data-action="delete-item">\n        <ha-icon icon="mdi:delete"></ha-icon>\n        <span>Remove {{SLOT_NAME}}</span>\n      </button>\n    </div>\n  </div>\n</template>\n`;
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
    
    // Extract slot template from main template
    const slotMatch = template.match(/<template id="slot-item-template">([\s\S]*?)<\/template>/);
    if (slotMatch) {
      return slotMatch[1].trim();
    }
    
    // Also try to extract from embedded-templates if template loading failed
    if (embeddedTemplates) {
      const embeddedContent = embeddedTemplates.innerHTML;
      const embeddedSlotMatch = embeddedContent.match(/<template id="slot-item-template">([\s\S]*?)<\/template>/);
      if (embeddedSlotMatch) {
        return embeddedSlotMatch[1].trim();
      }
    }
    
    return null;
  }

  setConfig(config) {
    try {
      // Don't throw error - just show warning in UI
      if (!config || !config.entity) {
        this._config = { 
          entity: null, 
          title: config?.title || 'Water Heater Schedule',
          icon: config?.icon || 'mdi:toggle-switch-variant-off'
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
      // Set config with default icon if not provided
      this._config = {
        ...config,
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
      
      // Subscribe to state_changed events for bridge sensor (for real-time sync between cards)
      if (this._hass && this._hass.connection && !this._unsubStateChanged) {
        try {
          // subscribeEvents returns a Promise that resolves to an unsubscribe function
          this._hass.connection.subscribeEvents(
            (event) => {
              const entityId = event?.data?.entity_id;
              if (!entityId || entityId !== this._bridgeSensor) return;

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
                    const entityId = this._config?.entity;
                    const tempItems = (this._optimisticBridgeState?.attributes?.items || []).filter(i => i?.id?.startsWith?.('temp-'));
                    const realHasSame = tempItems.some(t => fromHass.some(h =>
              h?.entity_id === entityId && h?.time === t?.time &&
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
      // Also check if any item for THIS entity changed
      const entityId = this._config?.entity;
      const itemsContentChanged = !itemsStructureChanged && oldItems.some((oldItem) => {
        if (!oldItem || !oldItem.id) return false;
        // Only check items for this entity
        if (entityId && oldItem.entity_id !== entityId) return false;
        const newItem = newItems.find(item => item && item.id === oldItem.id);
        if (!newItem) return false;
        return oldItem.enabled !== newItem.enabled ||
               oldItem.time !== newItem.time ||
               oldItem.duration !== newItem.duration ||
               JSON.stringify(oldItem.weekdays || []) !== JSON.stringify(newItem.weekdays || []);
      });
      
      // Check if bridge sensor state changed (enabled/disabled)
      const stateChanged = oldState !== newState;
      
      // Check if next_run changed
      const nextRunChanged = oldNextRun !== newNextRun;
      
      // Full render if: first time, no content, structure changed, state changed, or next_run changed
      if (!wasInitialized || !this.shadowRoot.innerHTML || itemsStructureChanged || stateChanged || nextRunChanged) {
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
      if (!this._hass || !this._config || !this._config.entity) return;

      const switchEntity = this._config.entity;
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
            
            // Check if this entry manages the requested entity
            const entityIds = attrs.entity_ids || [];
            const items = attrs.items || [];
            
            // Check if entity is in entity_ids list
            if (entityIds.includes(switchEntity)) {
              this._bridgeSensor = entityId;
              this._entryId = attrs.entry_id;
              return;
            }
            
            // Also check if any item has this entity_id (for cases where entity_ids list is not yet updated)
            const hasEntityInItems = items.some(item => item && item.entity_id === switchEntity);
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

  _getItems() {
    try {
      // Safe check - if no config or entity, return empty array
      if (!this._config || !this._config.entity) {
        return [];
      }
      
      const bridgeState = this._getBridgeState();
      const allItems = bridgeState?.attributes?.items || [];
      
      // Filter items by entity_id from config and exclude temporary slots (created by button)
      const entityId = this._config.entity;
      const filtered = allItems.filter(item => 
        item && 
        item.entity_id === entityId && 
        item.temporary !== true  // Exclude temporary slots created by button (strict check)
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
      if (!this._config || !this._config.entity) {
        return false;
      }
      
      const items = this._getItems(); // Already filtered by entity_id
      
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
    
    if (!this._config || !this._config.entity) {
      return Promise.resolve(); // Resolve silently, don't throw
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
    // Check if there are any items - if not, show add popup instead
    const items = this._getItems();
    if (items.length === 0) {
      // No items - show add popup instead of toggling
      this._openAddPopup();
      return;
    }
    
    // Check current state: card is enabled if at least one slot is enabled
    const hasEnabledSlots = items.some(item => item && item.enabled === true);
    const willDisable = hasEnabledSlots;
    const newEnabledState = !willDisable;
    
    // Optimistically update local data and UI (using overlay, no hass mutation)
    if (this._hass && this._bridgeSensor) {
      const bridgeState = this._getBridgeState();
      if (bridgeState?.attributes?.items) {
        const allItems = [...bridgeState.attributes.items];
        
        items.forEach(item => {
          if (item && item.id) {
            const itemIndex = allItems.findIndex(i => i && i.id === item.id);
            if (itemIndex !== -1) {
              const updatedItem = { ...allItems[itemIndex], enabled: newEnabledState };
              allItems[itemIndex] = updatedItem;
              this._updateSlotElement(item.id, updatedItem);
            }
          }
        });
        
        this._optimisticBridgeState = {
          ...bridgeState,
          attributes: {
            ...bridgeState.attributes,
            items: allItems
          }
        };
        
        this._updateHeaderStatus();
        this.hass = { ...this._hass };
        this._syncAllCardsForEntity(null, null, this._optimisticBridgeState);
      }
    }
    
    // Then update all slots via service (server is source of truth)
    for (const item of items) {
      if (item && item.id) {
        await this._callService('update_item', {
          id: item.id,
          enabled: newEnabledState
        });
      }
    }
    
    // Force update bridge sensor after toggling all slots - request entity update and sync
    if (this._hass && this._bridgeSensor) {
      // Request entity update from server to get fresh state
      try {
        await this._hass.callService('homeassistant', 'update_entity', {
          entity_id: this._bridgeSensor
        });
      } catch (e) {
      }
      
      // Wait a bit for state to update from server, then trigger full sync
      setTimeout(() => {
        if (this._hass) {
          // Re-fetch state from server and update (this will trigger sync in all cards)
          this.hass = { ...this._hass };
        }
      }, 500);
    }
  }

  _openAddPopup() {
    const popup = this.shadowRoot.getElementById('add-popup');
    if (popup) {
      popup.style.display = 'flex';
      // Reset form
      const hoursSelect = this.shadowRoot.getElementById('popup-time-hours');
      const minutesSelect = this.shadowRoot.getElementById('popup-time-minutes');
      const hvacModeSelect = this.shadowRoot.getElementById('popup-hvac-mode');
      const durationEnabledCheckbox = this.shadowRoot.getElementById('popup-duration-enabled');
      const durationWrapper = this.shadowRoot.getElementById('popup-duration-wrapper');
      const now = new Date();
      const hour = String(now.getHours()).padStart(2, '0');
      const minute = String(Math.round(now.getMinutes() / 5) * 5).padStart(2, '0');
      if (hoursSelect) hoursSelect.value = hour;
      if (minutesSelect) minutesSelect.value = minute;
      
      // Reset duration checkbox and hide duration selector
      if (durationEnabledCheckbox) {
        durationEnabledCheckbox.checked = false;
      }
      if (durationWrapper) {
        durationWrapper.style.display = 'none';
      }
      DurationSelector.reset(this.shadowRoot, null); // No duration by default for climate
      
      // Load HVAC modes from entity
      if (hvacModeSelect && this._config && this._config.entity && this._hass) {
        const entityState = this._hass.states[this._config.entity];
        if (entityState && entityState.attributes && entityState.attributes.hvac_modes) {
          const hvacModes = entityState.attributes.hvac_modes.filter(mode => mode !== 'off');
          hvacModeSelect.innerHTML = '';
          hvacModes.forEach(mode => {
            const option = document.createElement('option');
            option.value = mode;
            option.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
            hvacModeSelect.appendChild(option);
          });
          // Set default to first mode (usually 'heat' or 'cool')
          if (hvacModes.length > 0) {
            hvacModeSelect.value = hvacModes[0];
          }
        }
      }
    }
  }

  _closeAddPopup() {
    const popup = this.shadowRoot.getElementById('add-popup');
    if (popup) {
      popup.style.display = 'none';
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

    if (!this._config || !this._config.entity) {
      return;
    }
    
    // Use shared helper to add slot (EXACTLY as in boiler slots card)
    const climateServices = ScheduleHelper.createClimateServices(this._config.entity, hvacMode);
    const durationValue = duration && duration !== '' ? parseInt(duration) : null;
    
    try {
      await ScheduleHelper.addScheduleSlot({
        hass: this._hass,
        callService: async (service, data) => {
          return await this._callService(service, data);
        },
        getBridgeState: () => this._getBridgeState(),
        entity_id: this._config.entity,
        time: time,
        duration: durationValue,
        weekdays: selectedDays,
        title: title,
        service_start: climateServices.service_start,
        service_end: durationValue ? climateServices.service_end : null,
        bridgeSensor: this._bridgeSensor,
        onRender: () => {
          // Use current hass (updated by WebSocket), not stale hass from closure
          this.hass = { ...this._hass };
          this.render().catch(() => {});
        }
      });

      // Optimistic UI: show new slot immediately, clear when real appears (poll, don't force-clear)
      const bridgeState = this._getBridgeState();
      if (bridgeState && bridgeState.attributes) {
        const currentItems = bridgeState.attributes.items || [];
        const alreadyHasSlot = currentItems.some(
          (i) => i && i.entity_id === this._config.entity && i.time === time
        );
        if (!alreadyHasSlot) {
          const newItem = {
            id: 'temp-' + Date.now(),
            entity_id: this._config.entity,
            time,
            duration: durationValue,
            weekdays: selectedDays,
            enabled: true,
            service_start: climateServices.service_start,
            service_end: durationValue ? climateServices.service_end : null
          };
          if (title) newItem.title = title;
          const newItems = [...currentItems, newItem];
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
            const entityId = this._config?.entity;
            const tempItems = (this._optimisticBridgeState?.attributes?.items || []).filter(i => i?.id?.startsWith?.('temp-'));
            const realHasSame = tempItems.some(t => fromHass.some(h =>
              h?.entity_id === entityId && h?.time === t?.time &&
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
    // Update header status without full re-render
    try {
      const enabled = this._isEnabled();
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
    if (!window._homieScheduleCards || !this._hass || !this._config?.entity) {
      return;
    }
    
    const currentEntity = this._config.entity;
    
    window._homieScheduleCards.forEach(card => {
      if (card === this) return;
      
      if (card._config?.entity === currentEntity && card._hass) {
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
      }
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

    // Update icon and card classes
    const iconEl = slotCard.querySelector('.slot-icon');
    if (iconEl) {
      iconEl.className = `slot-icon ${updatedItem.enabled ? 'enabled' : 'disabled'}`;
    }
    
    if (updatedItem.enabled) {
      slotCard.classList.remove('disabled');
    } else {
      slotCard.classList.add('disabled');
    }

    // Clear update flag after a short delay
    setTimeout(() => {
      delete slotCard.dataset.updating;
    }, 0);
  }

  async _updateItem(itemId, updates) {
    // Optimistically update (using overlay, no hass mutation)
    if (this._hass && this._bridgeSensor) {
      const bridgeState = this._getBridgeState();
      if (bridgeState?.attributes?.items) {
        const items = [...bridgeState.attributes.items];
        const itemIndex = items.findIndex(item => item && item.id === itemId);
        if (itemIndex !== -1) {
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
          
          this._optimisticBridgeState = {
            ...bridgeState,
            attributes: {
              ...bridgeState.attributes,
              items: items
            }
          };
          
          this._updateSlotElement(itemId, updatedItem);
          this._updateHeaderStatus();
          this.hass = { ...this._hass };
          this._syncAllCardsForEntity(itemId, updatedItem, this._optimisticBridgeState);
        }
      }
    }
    
    const serviceData = { id: itemId, ...updates };
    await this._callService('update_item', serviceData);
    
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

  async _deleteItem(itemId) {
    if (!confirm('Delete this schedule item?')) return;
    await this._callService('delete_item', { id: itemId });
    
    // Force update after deleting item - request entity update and re-render
    if (this._hass && this._bridgeSensor) {
      // Request entity update from server
      try {
        await this._hass.callService('homeassistant', 'update_entity', {
          entity_id: this._bridgeSensor
        });
      } catch (e) {
      }
      
      // Wait for state to update from server, then trigger full re-render
      setTimeout(async () => {
        if (this._hass) {
          // Request fresh state again
          try {
            await this._hass.callService('homeassistant', 'update_entity', {
              entity_id: this._bridgeSensor
            });
          } catch (e) {
          }
          
          // Trigger full re-render
          setTimeout(() => {
            if (this._hass) {
              this._optimisticBridgeState = null;
              this.hass = { ...this._hass };
              this.render().catch(() => {});
              
              // Sync all other cards with the same entity after state is updated
              // Use a small delay to ensure bridge sensor state is fresh
              setTimeout(() => {
                this._syncAllCardsForEntity();
              }, 100);
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
      // Always check config first - even before hass
      if (!this._config || !this._config.entity) {
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
    const enabled = this._isEnabled();
    const title = this._config.title || 'Water Heater Scheduler';
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
    const styleContent = `/**\n * Climate Scheduler Card - Styles\n * All variables in :host; common/slot/popup/duration use them (overridable via --homie-slots-*).\n */\n\n:host {\n  display: block;\n  padding: 0;\n  overflow: hidden;\n  background: transparent;\n  --circular-button-size: var(--mdc-icon-button-size, 40px);\n\n  /* Card (header, slot card) */\n  --_accent: var(--homie-slots-accent, var(--primary-color, #03a9f4));\n  --_bg: var(--homie-slots-bg, var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9))));\n  --_radius: var(--homie-slots-radius, var(--ha-card-border-radius, 8px));\n  --_shadow: var(--homie-slots-shadow, var(--ha-card-box-shadow, 0 2px 8px rgba(0, 0, 0, 0.1)));\n  --_text: var(--homie-slots-text, var(--primary-text-color, #212121));\n  --_text-secondary: var(--homie-slots-text-secondary, var(--secondary-text-color, #757575));\n  --_text-on-accent: var(--homie-slots-text-on-accent, var(--text-primary-on-background, #ffffff));\n  --_disabled-color: var(--homie-slots-disabled, var(--disabled-color, var(--disabled-text-color, #9e9e9e)));\n\n  /* Select */\n  --_bg-select: var(--homie-slots-bg-select, var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9))));\n  --_divider-select: var(--homie-slots-divider-select, var(--divider-color, rgba(0, 0, 0, 0.12)));\n  --_text-select: var(--homie-slots-text-select, var(--primary-text-color, #212121));\n  --_radius-select: var(--homie-slots-radius-select, var(--mdc-shape-small, 4px));\n  --_focus-ring: var(--homie-slots-focus-ring, 0 0 0 2px rgba(3, 169, 244, 0.1));\n\n  /* Input, buttons, slot, weekday, duration */\n  --_padding-input-vertical: var(--homie-slots-padding-input-vertical, var(--mdc-shape-small, 4px));\n  --_padding-input-horizontal: var(--homie-slots-padding-input-horizontal, var(--mdc-shape-small, 8px));\n  --_border-input: var(--homie-slots-border-input, 1px solid var(--_divider));\n  --_radius-input: var(--homie-slots-radius-input, var(--_radius-small));\n  --_divider: var(--homie-slots-divider, var(--divider-color, rgba(0, 0, 0, 0.12)));\n  --_radius-small: var(--homie-slots-radius-small, var(--mdc-shape-small, 4px));\n  --_radius-medium: var(--homie-slots-radius-medium, var(--mdc-shape-medium, 8px));\n  --_secondary-bg: var(--homie-slots-secondary-bg, var(--secondary-background-color, #f5f5f5));\n  --_error-color: var(--homie-slots-error-color, var(--error-color, #f44336));\n\n  /* Button outline */\n  --_button-outline-padding: var(--homie-slots-button-outline-padding, var(--mdc-button-horizontal-padding, 16px));\n  --_button-outline-margin-top: var(--homie-slots-button-outline-margin-top, var(--mdc-layout-grid-gutter, 12px));\n  --_button-outline-radius: var(--homie-slots-button-outline-radius, var(--_radius-medium));\n  --_button-outline-bg: var(--homie-slots-button-outline-bg, transparent);\n  --_button-outline-border: var(--homie-slots-button-outline-border, 2px solid var(--_accent));\n  --_button-outline-color: var(--homie-slots-button-outline-color, var(--_accent));\n  --_button-outline-font-size: var(--homie-slots-button-outline-font-size, var(--mdc-typography-button-font-size, 14px));\n  --_button-outline-font-weight: var(--homie-slots-button-outline-font-weight, var(--mdc-typography-button-font-weight, 900));\n  --_button-outline-letter-spacing: var(--homie-slots-button-outline-letter-spacing, var(--mdc-typography-button-letter-spacing, 0em));\n  --_button-outline-min-height: var(--homie-slots-button-outline-min-height, var(--mdc-button-height, 36px));\n  --_button-outline-hover-shadow: var(--homie-slots-button-outline-hover-shadow, 0 2px 8px rgba(3, 169, 244, 0.3));\n  --_button-outline-active-transform: var(--homie-slots-button-outline-active-transform, scale(0.98));\n  --_button-outline-active-shadow: var(--homie-slots-button-outline-active-shadow, 0 1px 4px rgba(3, 169, 244, 0.2));\n\n  /* Popup */\n  --_popup-bg: var(--homie-slots-popup-background, var(--ha-dialog-background, var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9)))));\n  --_popup-color: var(--homie-slots-popup-color, var(--primary-text-color, #212121));\n  --_popup-backdrop-filter: var(--homie-slots-popup-backdrop-filter, var(--ha-card-backdrop-filter, none));\n  --_popup-box-shadow: var(--homie-slots-popup-box-shadow, var(--ha-card-box-shadow, none));\n  --_popup-border-radius: var(--homie-slots-popup-border-radius, var(--ha-card-border-radius, 16px));\n  --_popup-width: var(--mdc-dialog-width, 90%);\n  --_popup-max-width: var(--mdc-dialog-max-width, 400px);\n  --_popup-min-width: var(--mdc-dialog-min-width, 0px);\n  --_popup-max-height: var(--mdc-dialog-max-height, 90vh);\n\n  color: var(--_text);\n}\n\n/* === Common / slot / popup / duration (use :host vars above) === */\n.homie-select {\n  background: var(--_bg-select);\n  border: 1px solid var(--_divider-select);\n  border-radius: var(--_radius-select);\n  color: var(--_text-select);\n  font-size: 14px;\n  font-family: inherit;\n  cursor: pointer;\n  appearance: none;\n  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23999999' d='M6 9L1 4h10z'/%3E%3C/svg%3E");\n  background-repeat: no-repeat;\n  background-position: right var(--mdc-shape-small, 6px) center;\n  background-size: 12px;\n  transition: border-color 0.2s, box-shadow 0.2s;\n  padding: var(--_padding-input-vertical) var(--_padding-input-horizontal);\n  padding-right: calc(var(--_padding-input-horizontal) * 2 + 12px);\n}\n@media (prefers-color-scheme: dark) {\n  .homie-select {\n    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E");\n  }\n}\n.homie-select:focus {\n  outline: none;\n  border-color: var(--_accent);\n  box-shadow: var(--_focus-ring);\n}\n.homie-select option {\n  background: var(--_bg-select);\n  color: var(--_text-select);\n}\n.homie-input {\n  width: 100%;\n  background: var(--_bg);\n  border: var(--_border-input);\n  border-radius: var(--_radius-input);\n  color: var(--_text);\n  font-size: 14px;\n  font-family: inherit;\n  padding: var(--_padding-input-vertical) var(--_padding-input-horizontal);\n  transition: border-color 0.2s, box-shadow 0.2s;\n  box-sizing: border-box;\n}\n.homie-input:focus {\n  outline: none;\n  border-color: var(--_accent);\n  box-shadow: var(--_focus-ring);\n}\n.homie-input::placeholder {\n  color: var(--_text-secondary);\n  opacity: 0.7;\n}\n.button-outline {\n  width: 100%;\n  padding: var(--_button-outline-padding) var(--_button-outline-padding);\n  margin-top: var(--_button-outline-margin-top);\n  border-radius: var(--_button-outline-radius);\n  background: var(--_button-outline-bg);\n  border: var(--_button-outline-border);\n  color: var(--_button-outline-color);\n  font-size: var(--_button-outline-font-size);\n  font-weight: var(--_button-outline-font-weight);\n  letter-spacing: var(--_button-outline-letter-spacing);\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: all 0.2s;\n  -webkit-tap-highlight-color: transparent;\n  min-height: var(--_button-outline-min-height);\n}\n.button-outline:hover {\n  background: var(--_accent);\n  color: var(--_text-on-accent);\n  box-shadow: var(--_button-outline-hover-shadow);\n}\n.button-outline:active {\n  transform: var(--_button-outline-active-transform);\n  box-shadow: var(--_button-outline-active-shadow);\n}\n.slot-expandable {\n  max-height: 0;\n  overflow: hidden;\n  transition: max-height 0.3s ease-out;\n}\n.slot-card.expanded .slot-expandable {\n  max-height: 500px;\n  transition: max-height 0.3s ease-in;\n  padding: var(--ha-card-header-padding, 16px) 0;\n  display: flex;\n  flex-direction: column;\n  gap: var(--mdc-layout-grid-gutter, 12px);\n}\n.slot-details {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 16px);\n  margin-bottom: var(--mdc-layout-grid-gutter, 12px);\n  flex-wrap: wrap;\n}\n.slot-time, .slot-duration {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 6px);\n  font-size: 14px;\n}\n.slot-time ha-icon, .slot-duration ha-icon {\n  --mdc-icon-size: 22px;\n  opacity: 0.9;\n}\n.slot-time .time-picker-separator {\n  color: var(--_text);\n}\n.slot-delete {\n  width: 100%;\n  padding: var(--mdc-shape-small, 10px);\n  margin-top: var(--mdc-layout-grid-gutter, 12px);\n  border-radius: var(--_radius-medium);\n  background: var(--_secondary-bg);\n  border: 1px solid var(--_divider);\n  color: var(--_error-color);\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: var(--mdc-layout-grid-gutter, 8px);\n  transition: all 0.2s;\n  font-size: 14px;\n  font-weight: 500;\n  font-family: inherit;\n}\n.slot-delete:active { transform: scale(0.98); }\n.slot-delete ha-icon { --mdc-icon-size: 22px; }\n.empty-state {\n  text-align: center;\n  padding: 48px 16px;\n  color: var(--_text-secondary);\n}\n.empty-state ha-icon { --mdc-icon-size: 48px; opacity: 0.3; margin-bottom: 16px; }\n.empty-text { font-size: 14px; line-height: 20px; }\n.popup-overlay {\n  position: fixed;\n  top: 0; left: 0; right: 0; bottom: 0;\n  background: rgba(0, 0, 0, 0.5);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  z-index: 1000;\n  animation: fadeIn 0.2s;\n}\n@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }\n.popup-header {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 12px);\n  padding: var(--ha-card-header-padding, 20px);\n  border-bottom: 1px solid var(--_divider);\n}\n.popup-header ha-icon { --mdc-icon-size: 28px; color: var(--_accent); }\n.popup-title { flex: 1; font-size: 18px; font-weight: 500; color: var(--_text); }\n.popup-close {\n  width: var(--circular-button-size, var(--mdc-icon-button-size, 40px));\n  height: var(--circular-button-size, var(--mdc-icon-button-size, 40px));\n  min-width: var(--circular-button-size, var(--mdc-icon-button-size, 40px));\n  min-height: var(--circular-button-size, var(--mdc-icon-button-size, 40px));\n  border-radius: 50%;\n  background: transparent;\n  border: none;\n  color: var(--_text-secondary);\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: all 0.2s;\n}\n.popup-close ha-icon { --mdc-icon-size: 24px; }\n.popup-body { padding: var(--ha-card-header-padding, 20px); }\n.popup-field { margin-bottom: 20px; }\n.popup-field:last-child { margin-bottom: 0; }\n.popup-field label {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin-bottom: 8px;\n  font-size: 14px;\n  font-weight: 500;\n  color: var(--_text);\n}\n.popup-field label ha-icon { --mdc-icon-size: 24px; color: var(--_accent); }\n.popup-footer {\n  display: flex;\n  gap: var(--mdc-layout-grid-gutter, 12px);\n  padding: var(--ha-card-header-padding, 20px);\n  border-top: 1px solid var(--_divider);\n}\n.popup-button {\n  flex: 1;\n  padding: var(--mdc-shape-small, 12px) var(--mdc-shape-medium, 24px);\n  border: none;\n  border-radius: var(--_radius-medium);\n  font-size: 14px;\n  font-weight: 500;\n  cursor: pointer;\n  transition: all 0.2s;\n  font-family: inherit;\n}\n.popup-button.cancel { background: var(--_secondary-bg); color: var(--_text); }\n.popup-button.save { background: var(--_accent); color: var(--_text-on-accent); }\n.popup-button:active { transform: scale(0.98); }\n.time-selects { display: flex; align-items: center; gap: 8px; width: 100%; }\n.popup-time-hours, .popup-time-minutes { flex: 1; }\n.time-separator { font-size: 18px; font-weight: 500; color: var(--_text-secondary); user-select: none; }\n.slot-time .time-selects { display: flex; align-items: center; gap: 6px; width: auto; }\n.slot-time .time-separator { font-size: 14px; color: var(--_text); }\n.weekday-mode-selector { display: flex; gap: 8px; margin-bottom: 12px; }\n.weekday-mode-btn {\n  flex: 1;\n  padding: var(--mdc-shape-small, 10px);\n  border: 2px solid var(--_divider);\n  border-radius: var(--_radius-medium);\n  background: var(--_secondary-bg);\n  color: var(--_text-secondary);\n  text-align: center;\n  font-size: 13px;\n  font-weight: 500;\n  cursor: pointer;\n  transition: all 0.2s;\n  user-select: none;\n  font-family: inherit;\n}\n.weekday-mode-btn.active, .weekday-mode-btn:hover {\n  background: var(--_accent);\n  border-color: var(--_accent);\n  color: var(--_text-on-accent);\n}\n.weekday-mode-btn:hover { opacity: 0.8; }\n.popup-weekdays { display: flex; gap: 8px; flex-wrap: wrap; }\n.popup-weekdays.hidden { display: none; }\n.popup-weekday {\n  flex: 1;\n  min-width: 40px;\n  padding: var(--mdc-shape-small, 10px);\n  border: 2px solid var(--_divider);\n  border-radius: var(--_radius-medium);\n  background: var(--_secondary-bg);\n  color: var(--_text-secondary);\n  text-align: center;\n  font-size: 13px;\n  font-weight: 500;\n  cursor: pointer;\n  transition: all 0.2s;\n  user-select: none;\n}\n.popup-weekday.active {\n  background: var(--_accent);\n  border-color: var(--_accent);\n  color: var(--_text-on-accent);\n}\n@media (max-width: 480px) {\n  .popup-weekday { min-width: 35px; padding: 8px; font-size: 12px; }\n}\n.duration-selector-wrapper {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 12px);\n  width: 100%;\n}\n.duration-slider {\n  flex: 1;\n  height: 4px;\n  border-radius: 2px;\n  background: var(--_divider);\n  outline: none;\n  -webkit-appearance: none;\n  appearance: none;\n}\n.duration-slider::-webkit-slider-thumb {\n  -webkit-appearance: none;\n  appearance: none;\n  width: 20px;\n  height: 20px;\n  border-radius: 50%;\n  background: var(--_accent);\n  cursor: pointer;\n  border: 2px solid var(--_bg);\n  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);\n  transition: all 0.2s;\n}\n.duration-slider::-webkit-slider-thumb:hover {\n  transform: scale(1.1);\n  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);\n}\n.duration-slider::-moz-range-thumb {\n  width: 20px;\n  height: 20px;\n  border-radius: 50%;\n  background: var(--_accent);\n  cursor: pointer;\n  border: 2px solid var(--_bg);\n  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);\n  transition: all 0.2s;\n}\n.duration-slider::-moz-range-thumb:hover {\n  transform: scale(1.1);\n  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);\n}\n.duration-input {\n  width: 80px;\n  min-width: 80px;\n  text-align: center;\n}\n\n/* ========================================\n   MAIN HEADER\n   ======================================== */\n\n.main-header {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  padding: var(--ha-card-header-padding, 16px);\n  background: var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9)));\n  border-radius: var(--ha-card-border-radius, var(--mdc-shape-medium, 8px));\n  box-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0, 0, 0, 0.1));\n  backdrop-filter: var(--ha-card-backdrop-filter, blur(10px));\n}\n\n.main-header:not(:last-child) {\n  margin-bottom: var(--mdc-layout-grid-gutter, 12px);\n}\n\n.header-left {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  flex: 1;\n}\n\n.header-icon {\n  width: var(--circular-button-size);\n  height: var(--circular-button-size);\n  min-width: var(--circular-button-size);\n  min-height: var(--circular-button-size);\n  border-radius: 50%;\n  background: var(--primary-color, #03a9f4);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  color: var(--text-primary-on-background, #ffffff);\n  cursor: pointer;\n  transition: all 0.2s;\n  -webkit-tap-highlight-color: transparent;\n}\n\n.header-icon:active {\n  transform: scale(0.95);\n}\n\n.header-icon.disabled {\n  opacity: 0.5;\n  background: var(--disabled-color, var(--disabled-text-color));\n}\n\n.header-icon.enabled {\n  background: var(--primary-color, #03a9f4);\n  opacity: 1;\n}\n\n.header-icon ha-icon {\n  --mdc-icon-size: 28px;\n}\n\n.header-text {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n\n.header-title {\n  font-size: 18px;\n  font-weight: 500;\n  color: var(--primary-text-color, #212121);\n  line-height: 24px;\n}\n\n.header-status {\n  font-size: 14px;\n  color: var(--secondary-text-color, #757575);\n  line-height: 20px;\n}\n\n.add-button {\n  width: var(--circular-button-size);\n  height: var(--circular-button-size);\n  min-width: var(--circular-button-size);\n  min-height: var(--circular-button-size);\n  border-radius: 50%;\n  background: var(--primary-color, #03a9f4);\n  border: none;\n  color: var(--text-primary-on-background, #ffffff);\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: all 0.2s;\n  -webkit-tap-highlight-color: transparent;\n}\n\n.add-button:active {\n  transform: scale(0.95);\n}\n\n.add-button ha-icon {\n  --mdc-icon-size: 28px;\n}\n\n/* ========================================\n   ADD SLOT BUTTON\n   ======================================== */\n\n/* Button outline style moved to shared/assets/homie-css.css */\n\n/* ========================================\n   SLOTS CONTAINER\n   ======================================== */\n\n.slots-container {\n  display: flex;\n  flex-direction: column;\n  gap: var(--mdc-layout-grid-gutter, 12px);\n}\n\n.slots-container--empty {\n  display: none;\n}\n\n/* ========================================\n   SLOT CARD (Blue Card Design)\n   ======================================== */\n\n.slot-card {\n  background: var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9)));\n  border-radius: var(--ha-card-border-radius, var(--mdc-shape-medium, 8px));\n  padding: var(--ha-card-header-padding, 16px) var(--ha-card-header-padding, 16px) 0 var(--ha-card-header-padding, 16px);\n  color: var(--primary-text-color, #212121);\n  position: relative;\n  box-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0, 0, 0, 0.1));\n  transition: transform 0.2s, box-shadow 0.2s, background 0.2s;\n  backdrop-filter: var(--ha-card-backdrop-filter, blur(10px));\n}\n\n/* Active slot (enabled) - same background as header */\n.slot-card:not(.disabled) {\n  background: var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9)));\n}\n\n.slot-card.disabled {\n  opacity: 0.6;\n  background: var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.5)));\n}\n\n.slot-header {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 12px);\n  margin-bottom: 0;\n}\n\n.slot-icon {\n  width: var(--circular-button-size);\n  height: var(--circular-button-size);\n  min-width: var(--circular-button-size);\n  min-height: var(--circular-button-size);\n  border-radius: 50%;\n  background: var(--primary-color, #03a9f4);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  cursor: pointer;\n  transition: all 0.2s;\n  -webkit-tap-highlight-color: transparent;\n  color: var(--text-primary-on-background, #ffffff);\n}\n\n.slot-icon:active {\n  transform: scale(0.95);\n}\n\n.slot-icon.enabled {\n  background: var(--primary-color, #03a9f4);\n  opacity: 1;\n}\n\n.slot-icon.disabled {\n  background: var(--disabled-color, var(--disabled-text-color, #9e9e9e));\n  opacity: 0.6;\n}\n\n.slot-icon ha-icon {\n  --mdc-icon-size: 24px;\n}\n\n.slot-info {\n  flex: 1;\n}\n\n.slot-name {\n  font-size: 16px;\n  font-weight: 500;\n  margin-bottom: 4px;\n}\n\n.slot-status {\n  font-size: 14px;\n  color: var(--secondary-text-color, #757575);\n}\n\n.slot-expand {\n  width: 100%;\n  padding: 8px 0;\n  margin-top: var(--mdc-layout-grid-gutter, 12px);\n  border-radius: 0;\n  background: transparent;\n  border: none;\n  border-top: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));\n  color: var(--primary-text-color, #212121);\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: all 0.2s;\n  -webkit-tap-highlight-color: transparent;\n}\n\n.slot-expand ha-icon {\n  --mdc-icon-size: 20px;\n  transition: transform 0.2s;\n}\n\n.slot-card.expanded .slot-expand ha-icon {\n  transform: rotate(180deg);\n}\n\n/* Slot expandable, slot-details styles moved to shared/assets/homie-css.css */\n\n.slot-time,\n.slot-duration,\n.slot-hvac-mode {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 6px);\n  font-size: 14px;\n}\n\n.slot-time ha-icon,\n.slot-duration ha-icon,\n.slot-hvac-mode ha-icon {\n  --mdc-icon-size: 22px;\n  opacity: 0.9;\n}\n\n/* Time picker styles are now in shared/homie-select/homie-select.css */\n\n.slot-time .time-picker-separator {\n  color: var(--primary-text-color, #212121);\n}\n\n/* Select styles are now in shared/homie-select.css */\n\n.slot-weekdays-wrapper {\n  display: flex;\n  align-items: center;\n  gap: var(--mdc-layout-grid-gutter, 6px);\n}\n\n.slot-weekdays-icon {\n  --mdc-icon-size: 22px;\n  opacity: 0.9;\n  flex-shrink: 0;\n}\n\n.slot-weekdays {\n  display: flex;\n  gap: var(--mdc-layout-grid-gutter, 6px);\n  flex-wrap: wrap;\n  flex: 1;\n  justify-content: flex-start;\n}\n\n.slot-weekday {\n  padding: var(--mdc-shape-small, 6px) var(--mdc-shape-small, 8px);\n  border-radius: var(--ha-card-border-radius, var(--mdc-shape-small, 4px));\n  background: var(--secondary-background-color, #f5f5f5);\n  border: 2px solid var(--divider-color, rgba(0, 0, 0, 0.12));\n  color: var(--primary-text-color, #212121);\n  font-size: 12px;\n  font-weight: 400;\n  cursor: pointer;\n  transition: all 0.2s;\n  user-select: none;\n  flex-shrink: 0;\n  min-width: fit-content;\n  flex: 1;\n  text-align: center;\n  min-width: 0;\n}\n\n.slot-weekday.active {\n  background: var(--primary-color, #03a9f4);\n  color: var(--text-primary-on-background, #ffffff);\n  font-weight: 600;\n  border-color: var(--primary-color, #03a9f4);\n}\n\n/* Slot delete, empty state styles moved to shared/assets/homie-css.css */\n\n/* Popup overlay, popup-header, popup-body, popup-field styles moved to shared/assets/homie-css.css */\n\n/* Popup content (defaults, override via --homie-slots-popup-*) */\n.popup-content {\n  background: var(--_popup-bg);\n  color: var(--_popup-color);\n  -webkit-backdrop-filter: var(--_popup-backdrop-filter);\n  backdrop-filter: var(--_popup-backdrop-filter);\n  box-shadow: var(--_popup-box-shadow);\n  border-radius: var(--_popup-border-radius);\n  width: var(--_popup-width);\n  max-width: var(--_popup-max-width);\n  min-width: var(--_popup-min-width);\n  max-height: var(--_popup-max-height);\n  overflow-y: auto;\n  animation: slideUp 0.3s;\n}\n\n@keyframes slideUp {\n  from {\n    transform: translateY(20px);\n    opacity: 0;\n  }\n  to {\n    transform: translateY(0);\n    opacity: 1;\n  }\n}\n\n/* Popup select styles are now in shared/homie-select.css */\n\n/* Slot time selects */\n.slot-time .time-selects {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  width: auto;\n}\n\n/* Slot time select styles are now in shared/homie-select.css */\n\n.slot-time .time-separator {\n  font-size: 14px;\n  color: var(--primary-text-color, #212121);\n}\n\n/* Time selects, weekday selector, popup footer/button styles moved to shared/assets/homie-css.css */\n\n/* ========================================\n   RESPONSIVE\n   ======================================== */\n\n@media (max-width: 480px) {\n  .main-header {\n    padding: var(--mdc-shape-small, 12px);\n  }\n  \n  .header-title {\n    font-size: 16px;\n  }\n  \n  .slot-card {\n    padding: var(--mdc-shape-small, 12px);\n  }\n  \n  :host {\n    --_popup-width: var(--mdc-dialog-width, 95%);\n    --_popup-max-height: var(--mdc-dialog-max-height, 85vh);\n  }\n}\n\n/* ========================================\n   DARK THEME SUPPORT\n   ======================================== */\n\n/* Dark theme adjustments are handled by HA CSS variables */\n/* No additional dark theme styles needed */\n`;
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
    
    // Get entity name for popup header
    const entityName = this._config?.entity || 'entity';
    const entityState = this._hass?.states?.[entityName];
    const entityDisplayName = entityState?.attributes?.friendly_name || entityName;
    
    // Replace placeholders (icon is now fixed in template)
    const htmlContent = processedTemplate
      .replace(/\{\{TITLE\}\}/g, title)
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
    const slotNumber = this._getItems().indexOf(item) + 1;
    
    // Load slot template
    const template = await this._loadSlotTemplate();
    if (!template) {
      // Return empty string to prevent breaking the entire card
      return '';
    }
    
    // Format slot name - use title if available, otherwise "Slot N"
    const slotName = item.title || `Slot ${slotNumber}`;
    
    // Format slot status
    const daysText = WeekdaySelector.formatWeekdays(item.weekdays);
    
    // Get HVAC mode from service_start for climate entities
    let statusPrefix = item.enabled ? 'On' : 'Off';
    let currentHvacMode = null;
    if (item.service_start && item.service_start.value && item.service_start.value.hvac_mode) {
      currentHvacMode = item.service_start.value.hvac_mode;
      statusPrefix = item.enabled ? currentHvacMode.charAt(0).toUpperCase() + currentHvacMode.slice(1) : 'Off';
    }
    
    // Get HVAC modes from entity for dropdown
    let hvacModeOptions = '';
    if (this._config && this._config.entity && this._hass) {
      const entityState = this._hass.states[this._config.entity];
      if (entityState && entityState.attributes && entityState.attributes.hvac_modes) {
        const hvacModes = entityState.attributes.hvac_modes.filter(mode => mode !== 'off');
        hvacModeOptions = hvacModes.map(mode => {
          const selected = currentHvacMode === mode ? 'selected' : '';
          const label = mode.charAt(0).toUpperCase() + mode.slice(1);
          return `<option value="${mode}" ${selected}>${label}</option>`;
        }).join('');
      }
    }
    if (!hvacModeOptions) {
      // Fallback if entity not found or no modes available
      // Make sure to select the correct mode even in fallback
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
      .replace(/\{\{DISABLED_CLASS\}\}/g, item.enabled ? '' : 'disabled')
      .replace(/\{\{ICON_CLASS\}\}/g, item.enabled ? 'enabled' : 'disabled')
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
    
    // Duration enabled checkbox - show/hide duration selector
    const durationEnabledCheckbox = this.shadowRoot.getElementById('popup-duration-enabled');
    const durationWrapper = this.shadowRoot.getElementById('popup-duration-wrapper');
    if (durationEnabledCheckbox && durationWrapper) {
      durationEnabledCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          durationWrapper.style.display = 'block';
          // Allowed values: 5, 10, 15, ... up to max, plus max if not multiple of 5
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
      });
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

      // Toggle expand/collapse
      const expandBtn = itemEl.querySelector('[data-action="toggle-expand"]');
      if (expandBtn) {
        expandBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isExpanded = itemEl.classList.contains('expanded');
          if (isExpanded) {
            itemEl.classList.remove('expanded');
            this._expandedSlots.delete(itemId);
          } else {
            itemEl.classList.add('expanded');
            this._expandedSlots.add(itemId);
          }
          const icon = expandBtn.querySelector('ha-icon');
          if (icon) {
            icon.setAttribute('icon', itemEl.classList.contains('expanded') ? 'mdi:chevron-up' : 'mdi:chevron-down');
          }
        });
      }

      // Restore expanded state if it was expanded before
      if (this._expandedSlots.has(itemId)) {
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
          this._deleteItem(itemId);
        });
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
              entity_id: this._config.entity,
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
        };
        // Clone node to remove all event listeners
        const newHvacModeSelect = hvacModeSelect.cloneNode(true);
        hvacModeSelect.parentNode.replaceChild(newHvacModeSelect, hvacModeSelect);
        newHvacModeSelect.addEventListener('change', hvacModeHandler);
        newHvacModeSelect.addEventListener('click', (e) => {
          e.stopPropagation();
        });
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
        
        // First, attach shared component listeners (this handles mode buttons and custom weekdays)
        // This will clone elements, so we need to add our handlers AFTER
        WeekdaySelector.attachEventListeners(itemEl);
        
        // Check elements AFTER attachEventListeners
        const modeBtnsAfter = itemEl.querySelectorAll('.weekday-mode-btn');
        const weekdayBtnsAfter = itemEl.querySelectorAll('.popup-weekday');
        
        // Add handlers directly to the CLONED elements (after attachEventListeners)
        // Use retry mechanism to ensure elements are ready
        const addWeekdayHandlers = () => {
          const modeBtns = itemEl.querySelectorAll('.weekday-mode-btn');
          const weekdayBtns = itemEl.querySelectorAll('.popup-weekday');
          
          
          if (modeBtns.length === 0 && weekdayBtns.length === 0) {
            setTimeout(addWeekdayHandlers, 50);
            return;
          }
          
          
          // Add handler to mode buttons
          modeBtns.forEach((btn, index) => {
            // Remove any existing handlers by cloning
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            // Add WeekdaySelector handler first
            newBtn.addEventListener('click', (e) => {
              const scope = newBtn.closest('.slot-card') || itemEl;
              scope.querySelectorAll('.weekday-mode-btn').forEach(b => b.classList.remove('active'));
              newBtn.classList.add('active');
              const mode = newBtn.dataset.mode;
              
              // Find custom weekdays - search in slot card (not popup-field, as slots don't have it)
              const slotCard = newBtn.closest('.slot-card') || itemEl;
              let customWeekdays = slotCard.querySelector('#popup-weekdays-custom') || slotCard.querySelector('.popup-weekdays');
              
              
              if (mode === 'everyday' || mode === 'weekdays') {
                if (customWeekdays) {
                  customWeekdays.classList.add('hidden');
                }
              } else {
                // Custom mode - show and set active days from current item
                if (customWeekdays) {
                  customWeekdays.classList.remove('hidden');
                  
                  // Get current item weekdays and set them as active
                  const currentItems = this._getItems();
                  const currentItem = currentItems.find(i => i.id === itemId);
                  if (currentItem && currentItem.weekdays) {
                    // Set active state for days that are in currentItem.weekdays
                    slotCard.querySelectorAll('.popup-weekday').forEach(dayEl => {
                      const day = parseInt(dayEl.dataset.day);
                      if (currentItem.weekdays.includes(day)) {
                        dayEl.classList.add('active');
                      } else {
                        dayEl.classList.remove('active');
                      }
                    });
                  }
                } else {
                }
              }
            });
            
            // Then add our update handler
            newBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              setTimeout(updateWeekdays, 100);
            });
          });
          
          // Add handler to custom weekday buttons
          weekdayBtns.forEach((dayEl, index) => {
            // Remove any existing handlers by cloning
            const newDayEl = dayEl.cloneNode(true);
            dayEl.parentNode.replaceChild(newDayEl, dayEl);
            
            // Add WeekdaySelector handler first
            newDayEl.addEventListener('click', (e) => {
              newDayEl.classList.toggle('active');
            });
            
            // Then add our update handler
            newDayEl.addEventListener('click', (e) => {
              e.stopPropagation();
              setTimeout(updateWeekdays, 100);
            });
          });
        };
        
        // Start trying to add handlers - use longer delay to ensure attachEventListeners finished
        setTimeout(() => {
          addWeekdayHandlers();
        }, 100);
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
  window.logCardInfo('climate-slots-card');
}
export {};
