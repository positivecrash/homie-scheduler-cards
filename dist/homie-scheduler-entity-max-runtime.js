/**
 * Scheduler Entity Max Runtime Card
 * Last build: 2026-02-27T17:41:11.174Z
 * Version: 1.0.6
 */
window.__HOMIE_SCHEDULER_CARDS_VERSION = '1.0.6';

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
      slider.value = duration != null && duration !== '' ? String(duration) : '';
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
          if (onChangeCallback) onChangeCallback(currentValue);
        } else if (e.target.value === '') {
          currentValue = NaN;
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

class HomieEntityMaxRuntimeCard extends HTMLElement {
  static getStubConfig() {
    return {};
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = null;
    this._hass = null;
    this._entryId = null;
    this._bridgeSensor = null;
    this._htmlTemplate = null;
    /** @type {{ entity_id: string, max_minutes: number }[]} */
    this._dialogData = [];
  }

  async _loadTemplate() {
    if (this._htmlTemplate) return this._htmlTemplate;
    
    // Template is embedded in production build
    this._htmlTemplate = `<ha-card>\n  <div class="card-content">\n    <h2 class="title">Entity max run time</h2>\n    <p class="description">Limit run time per switch. Add rows with + ADD, then Save.</p>\n    <button class="open-btn" data-action="open-dialog">Open settings</button>\n  </div>\n</ha-card>\n<div id="dialog-overlay" class="dialog-overlay hidden">\n  <div class="dialog">\n    <h2 class="dialog-title">Entity max run time</h2>\n    <div id="dialog-rows" class="dialog-rows"></div>\n    <button type="button" class="add-row-btn" data-action="add-row">+ ADD</button>\n    <div class="dialog-actions">\n      <button type="button" class="cancel-btn" data-action="cancel">CANCEL</button>\n      <button type="button" class="save-btn" data-action="save">SAVE</button>\n    </div>\n  </div>\n</div>\n`;
    return this._htmlTemplate;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._bridgeSensor && hass?.states) this._findBridgeSensor();
    this.render().catch(() => {});
  }

  setConfig(config) {
    this._config = config || {};
  }

  _findBridgeSensor() {
    if (!this._hass?.states) return;
    try {
      for (const entityId in this._hass.states) {
        if (!entityId.startsWith('sensor.')) continue;
        const state = this._hass.states[entityId];
        const attrs = state?.attributes || {};
        if (attrs.integration === 'homie_scheduler' && attrs.entry_id) {
          this._bridgeSensor = entityId;
          this._entryId = attrs.entry_id;
          return;
        }
      }
    } catch (err) {}
  }

  _getBridgeState() {
    if (!this._bridgeSensor || !this._hass?.states?.[this._bridgeSensor]) return null;
    return this._hass.states[this._bridgeSensor];
  }

  /** Current entity_max_runtime from bridge as array for dialog. */
  _getEntityMaxRuntimeList() {
    const bridge = this._getBridgeState();
    const raw = bridge?.attributes?.entity_max_runtime || {};
    if (typeof raw !== 'object') return [];
    return Object.entries(raw).map(([entity_id, max_minutes]) => ({
      entity_id,
      max_minutes: Number(max_minutes) || 0
    }));
  }

  /** Switch entity IDs for dropdown. */
  _getSwitchEntityIds() {
    if (!this._hass?.states) return [];
    return Object.keys(this._hass.states).filter(eid => eid.startsWith('switch.')).sort();
  }

  async render() {
    const template = await this._loadTemplate();
    const styleContent = `ha-card {\n  padding: 16px;\n}\n.card-content .title {\n  margin: 0 0 8px 0;\n  font-size: 1.2rem;\n}\n.card-content .description {\n  margin: 0 0 12px 0;\n  color: var(--secondary-text-color, #757575);\n  font-size: 0.9rem;\n}\n.open-btn {\n  background: var(--primary-color, #03a9f4);\n  color: var(--text-primary-color, #fff);\n  border: none;\n  padding: 10px 20px;\n  border-radius: 4px;\n  cursor: pointer;\n  font-size: 1rem;\n}\n.open-btn:hover {\n  opacity: 0.9;\n}\n\n.dialog-overlay {\n  position: fixed;\n  inset: 0;\n  background: rgba(0, 0, 0, 0.5);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  z-index: 9999;\n}\n.dialog-overlay.hidden {\n  display: none;\n}\n.dialog {\n  background: var(--ha-card-background, #fff);\n  border-radius: 8px;\n  padding: 20px;\n  max-width: 480px;\n  width: 90%;\n  max-height: 90vh;\n  overflow: auto;\n}\n.dialog-title {\n  margin: 0 0 16px 0;\n  font-size: 1.25rem;\n}\n.dialog-rows {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  margin-bottom: 16px;\n}\n.dialog-row {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n.dialog-row select {\n  flex: 1;\n  min-width: 0;\n  padding: 8px;\n  border: 1px solid var(--divider-color, #e0e0e0);\n  border-radius: 4px;\n  background: var(--card-background-color, #fff);\n  color: var(--primary-text-color, #212121);\n}\n.dialog-row input[type="number"] {\n  width: 80px;\n  padding: 8px;\n  border: 1px solid var(--divider-color, #e0e0e0);\n  border-radius: 4px;\n}\n.dialog-row .row-delete {\n  padding: 8px;\n  cursor: pointer;\n  color: var(--secondary-text-color, #757575);\n  background: none;\n  border: none;\n}\n.dialog-row .row-delete:hover {\n  color: var(--error-color, #f44336);\n}\n.add-row-btn {\n  margin-bottom: 16px;\n  padding: 8px 16px;\n  background: transparent;\n  color: var(--primary-color, #03a9f4);\n  border: 1px solid var(--primary-color, #03a9f4);\n  border-radius: 4px;\n  cursor: pointer;\n  font-size: 0.95rem;\n}\n.add-row-btn:hover {\n  background: rgba(3, 169, 244, 0.08);\n}\n.dialog-actions {\n  display: flex;\n  justify-content: flex-end;\n  gap: 12px;\n}\n.cancel-btn, .save-btn {\n  padding: 10px 20px;\n  border-radius: 4px;\n  cursor: pointer;\n  font-size: 1rem;\n  border: none;\n}\n.cancel-btn {\n  background: transparent;\n  color: var(--primary-color, #03a9f4);\n}\n.save-btn {\n  background: var(--primary-color, #03a9f4);\n  color: var(--text-primary-color, #fff);\n}\n`;
    this.shadowRoot.innerHTML = `<style>${styleContent}</style>${template}`;

    const openBtn = this.shadowRoot.querySelector('[data-action="open-dialog"]');
    if (openBtn) openBtn.addEventListener('click', () => this._openDialog());

    const overlay = this.shadowRoot.getElementById('dialog-overlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => { if (e.target === overlay) this._closeDialog(); });
    }
  }

  _openDialog() {
    this._dialogData = this._getEntityMaxRuntimeList();
    if (this._dialogData.length === 0) this._dialogData = [{ entity_id: '', max_minutes: 0 }];

    const overlay = this.shadowRoot.getElementById('dialog-overlay');
    if (overlay) overlay.classList.remove('hidden');
    this._renderDialogRows();

    const addBtn = this.shadowRoot.querySelector('[data-action="add-row"]');
    if (addBtn) addBtn.onclick = () => this._addRow();
    const cancelBtn = this.shadowRoot.querySelector('[data-action="cancel"]');
    if (cancelBtn) cancelBtn.onclick = () => this._closeDialog();
    const saveBtn = this.shadowRoot.querySelector('[data-action="save"]');
    if (saveBtn) saveBtn.onclick = () => this._save();
  }

  _closeDialog() {
    const overlay = this.shadowRoot.getElementById('dialog-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  _addRow() {
    this._dialogData.push({ entity_id: '', max_minutes: 0 });
    this._renderDialogRows();
  }

  _deleteRow(index) {
    this._dialogData.splice(index, 1);
    if (this._dialogData.length === 0) this._dialogData = [{ entity_id: '', max_minutes: 0 }];
    this._renderDialogRows();
  }

  _renderDialogRows() {
    const container = this.shadowRoot.getElementById('dialog-rows');
    if (!container) return;

    const switchIds = this._getSwitchEntityIds();
    container.innerHTML = '';

    this._dialogData.forEach((row, index) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'dialog-row';

      const select = document.createElement('select');
      select.dataset.index = String(index);
      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = '— Select entity —';
      select.appendChild(emptyOpt);
      switchIds.forEach(eid => {
        const opt = document.createElement('option');
        opt.value = eid;
        opt.textContent = eid;
        if (eid === row.entity_id) opt.selected = true;
        select.appendChild(opt);
      });
      select.addEventListener('change', () => {
        this._dialogData[index].entity_id = select.value;
      });

      const input = document.createElement('input');
      input.type = 'number';
      input.min = 1;
      input.max = 1440;
      input.placeholder = 'min';
      input.value = row.max_minutes > 0 ? String(row.max_minutes) : '';
      input.addEventListener('input', () => {
        const v = parseInt(input.value, 10);
        this._dialogData[index].max_minutes = isNaN(v) ? 0 : v;
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'row-delete';
      delBtn.setAttribute('aria-label', 'Delete');
      delBtn.innerHTML = '🗑';
      delBtn.addEventListener('click', () => this._deleteRow(index));

      rowEl.appendChild(select);
      rowEl.appendChild(input);
      rowEl.appendChild(delBtn);
      container.appendChild(rowEl);
    });
  }

  async _save() {
    const container = this.shadowRoot.getElementById('dialog-rows');
    if (!container) return;

    const rows = container.querySelectorAll('.dialog-row');
    const entities = [];
    rows.forEach((rowEl, i) => {
      const select = rowEl.querySelector('select');
      const input = rowEl.querySelector('input[type="number"]');
      const entity_id = select?.value?.trim() || '';
      const max_minutes = input?.value ? parseInt(input.value, 10) : 0;
      if (entity_id && max_minutes >= 1 && max_minutes <= 1440) {
        entities.push({ entity_id, max_minutes });
      }
    });

    if (!this._entryId || !this._hass?.callService) {
      this._closeDialog();
      return;
    }

    try {
      await this._hass.callService('homie_scheduler', 'set_entity_max_runtime', {
        entry_id: this._entryId,
        entities
      });
      this._closeDialog();
      if (this._bridgeSensor && this._hass.callService) {
        this._hass.callService('homeassistant', 'update_entity', { entity_id: this._bridgeSensor }).catch(() => {});
      }
    } catch (err) {
      console.error('Homie Entity Max Runtime: save failed', err);
    }
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('homie-scheduler-entity-max-runtime')) {
  customElements.define('homie-scheduler-entity-max-runtime', HomieEntityMaxRuntimeCard);
}
