/**
 * Scheduler Boiler Button Card
 * Last build: 2026-03-04T20:10:24.156Z
 * Version: 1.1.1
 */
window.__HOMIE_SCHEDULER_CARDS_VERSION = '1.1.1';

// Shared Components will be auto-included by build script
// DO NOT include ScheduleHelper, DurationSelector, or WeekdaySelector here - they will be added during build

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

// Shared component: selector-duration/mins/duration-selector.js
/**
 * Duration Selector (minutes)
 * Slider + number input, duration in minutes. Used by boiler schedule card.
 */

// Prevent duplicate class declaration when multiple cards are loaded
if (typeof window.DurationSelector === 'undefined') {
  window.DurationSelector = class DurationSelector {
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
        return value && value !== '' ? parseInt(value) : null;
      }
    }
    const input = shadowRoot.querySelector('[data-action="update-duration"]');
    if (!input) return null;
    const value = input.value;
    return value && value !== '' ? parseInt(value) : null;
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

class HomieBoilerScheduleButtonCard extends HTMLElement {
  static getStubConfig() {
    return { entity: '', duration: 0 };
  }

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

                // Handle entity turned off — clear active button marker
                if (entityId === this._config?.entity && oldState?.state === 'on' && newState?.state === 'off') {
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
            if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (boiler button): subscribeStateChanged failed', e);
          });
        } catch (e) {
          if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (boiler button): subscribeStateChanged setup failed', e);
        }
      }
      
      // Re-render on state changes
      this.render().catch(err => {});
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (boiler button): hass setter failed', err);
    }
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
    // Restore timer if this button was active before page reload
    if (this._buttonId && this._config?.entity && this._entryId) {
      try {
        const activeButton = this._getBridgeState()?.attributes?.active_buttons?.[this._config.entity];
        if (activeButton?.button_id === this._buttonId) {
          const remainingMs = parseInt(activeButton.timer_end) - Date.now();
          if (remainingMs > 0 && remainingMs < 24 * 60 * 60 * 1000) {
            this._startTurnOffTimer(remainingMs);
          } else {
            this._clearActive();
          }
        }
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (boiler button): refresh failed', e);
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
        if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (boiler button): unsubscribe in disconnectedCallback failed', e);
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
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (boiler button): _findBridgeSensor failed', err);
    }
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
    return this._getEntityState()?.state === 'on';
  }

  _hasActiveSchedule() {
    return this._getBridgeState()?.state === 'active' && this._isEntityOn();
  }

  _isThisButtonActive() {
    try {
      const activeButton = this._getBridgeState()?.attributes?.active_buttons?.[this._config?.entity];
      return !!(activeButton && activeButton.button_id === this._buttonId);
    } catch (e) { return false; }
  }

  /** Elapsed time since entity turned on (e.g. "5m 18s") for "Already running for X" display. */
  _getElapsedRunningText() {
    try {
      const entityState = this._getEntityState();
      if (!entityState?.last_changed) return '';
      const diffMs = Date.now() - new Date(entityState.last_changed).getTime();
      if (diffMs < 0) return '';
      const totalSec = Math.floor(diffMs / 1000);
      const minutes = Math.floor(totalSec / 60);
      const seconds = totalSec % 60;
      if (minutes < 1) return totalSec < 60 ? `${totalSec}s` : '1m';
      if (seconds === 0) return `${minutes}m`;
      return `${minutes}m ${seconds}s`;
    } catch (e) { return ''; }
  }

  /** Elapsed time in minutes only (e.g. "0m", "5m") for recirculation "Already running for X". */
  _getElapsedRunningMinutesOnly() {
    try {
      const entityState = this._getEntityState();
      if (!entityState?.last_changed) return null;
      const diffMs = Date.now() - new Date(entityState.last_changed).getTime();
      if (diffMs < 0) return null;
      const minutes = Math.floor(diffMs / 60000);
      return `${minutes}m`;
    } catch (e) { return null; }
  }

  /** Refresh entity state: request HA update + retrigger re-render. */
  _refreshEntityState() {
    if (!this._hass || !this._config?.entity) return;
    this._hass.callService('homeassistant', 'update_entity', { entity_id: this._config.entity }).catch(() => {});
    this.hass = { ...this._hass };
  }

  /** Clear active_button in integration (fire and forget). */
  _clearActive() {
    if (!this._entryId) return;
    this._callService('clear_active_button', { entity_id: this._config.entity }).catch(() => {});
  }

  /** Stop and clear local turn-off timer. */
  _clearTimer() {
    if (this._turnOffTimer) { clearTimeout(this._turnOffTimer); this._turnOffTimer = null; }
  }

  /**
   * Start turn-off timer for durationMs. When it fires: if inside active slot → only clear active_button;
   * otherwise turn_off + clear_active_button.
   */
  _startTurnOffTimer(durationMs) {
    this._clearTimer();
    this._turnOffTimer = setTimeout(async () => {
      try {
        if (!this._hass || !this._config?.entity) return;
        if (this._isInsideActiveSlot()) {
          this._clearActive();
        } else {
          await this._hass.callService('switch', 'turn_off', { entity_id: this._config.entity });
          this._clearActive();
          setTimeout(() => this._refreshEntityState(), 100);
        }
      } catch (err) {
        if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (boiler button): turn off failed', err);
      } finally {
        this._turnOffTimer = null;
        this.render().catch(() => {});
      }
    }, durationMs);
  }

  /**
   * Register active_button in integration and start local timer.
   */
  async _activateButton(durationMinutes) {
    const durationMs = durationMinutes * 60 * 1000;
    const timerEnd = Date.now() + durationMs;
    if (this._buttonId && this._entryId) {
      await this._callService('set_active_button', {
        entity_id: this._config.entity,
        button_id: this._buttonId,
        timer_end: timerEnd,
        duration: durationMinutes
      }).catch(() => {});
    }
    this._startTurnOffTimer(durationMs);
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

  /** Max duration (minutes) from integration entity_max_runtime for this entity, or null if not set. */
  _getMaxDurationFromIntegration() {
    try {
      const bridgeState = this._getBridgeState();
      const entityMaxRuntime = bridgeState?.attributes?.entity_max_runtime || {};
      const max = entityMaxRuntime[this._config?.entity];
      if (max == null || max === '') return null;
      const n = parseInt(max, 10);
      return isNaN(n) || n < 1 ? null : n;
    } catch (e) { return null; }
  }

  /** Duration to use: min(config.duration, integration limit). Integration limit applies when set. */
  _getCappedDuration() {
    const max = this._getMaxDurationFromIntegration();
    const d = parseInt(this._config?.duration, 10) || (this._config?.mode === 'recirculation' ? 1 : 60);
    if (max == null || max < 1) return d;
    return Math.min(d, max);
  }

  /** Turn-off time for recirculation display: (1) active_buttons (this button), (2) max_runtime_turn_off_times from bridge. */
  _getRecirculationTurnOffTime() {
    try {
      const bridgeState = this._getBridgeState();
      if (!bridgeState) return null;
      const entityId = this._config?.entity;
      const activeButtons = bridgeState.attributes?.active_buttons || {};
      const activeButton = activeButtons[entityId];
      if (activeButton?.timer_end && activeButton?.button_id === this._buttonId) {
        const t = parseInt(activeButton.timer_end, 10);
        if (!isNaN(t)) {
          const ms = t > 0 && t < 1e12 ? t * 1000 : t;
          const d = new Date(ms);
          if (d > new Date()) return d;
        }
      }
      const turnOffMs = bridgeState.attributes?.max_runtime_turn_off_times?.[entityId];
      if (turnOffMs != null && turnOffMs !== '') {
        let t = parseInt(turnOffMs, 10);
        if (!isNaN(t) && t > 0 && t < 1e12) t *= 1000;
        const d = new Date(t);
        if (d > new Date()) return d;
      }
      return null;
    } catch (e) { return null; }
  }

  /** Fallback when bridge has no turn-off time yet (e.g. right after external turn-on): use last_changed + integration max_runtime. */
  _getRecirculationTurnOffTimeFallback() {
    try {
      const maxMin = this._getMaxDurationFromIntegration();
      if (maxMin == null || maxMin < 1) return null;
      const entityState = this._getEntityState();
      if (!entityState?.last_changed || entityState.state !== 'on') return null;
      const endMs = new Date(entityState.last_changed).getTime() + maxMin * 60 * 1000;
      const d = new Date(endMs);
      if (d <= new Date()) return null;
      return d;
    } catch (e) { return null; }
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
        console.warn('Homie Scheduler (boiler button): bridge sensor not found. Check integration is installed and sensor "Scheduler Info" exists.');
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
      console.warn('Homie Scheduler (boiler button):', err?.message || err, err);
      throw err;
    }
  }

  async _runSchedule() {
    const isOn = this._isEntityOn();
    const isThisButtonActive = this._isThisButtonActive();

    try {
      if (isOn && isThisButtonActive) {
        // This button is active → turn off
        this._clearTimer();
        this._clearActive();
        await this._hass.callService('switch', 'turn_off', { entity_id: this._config.entity });
        setTimeout(() => this._refreshEntityState(), 100);
        return;
      }

      if (isOn && !isThisButtonActive) {
        // Another button/source is active → turn off first, then re-activate with our duration
        await this._hass.callService('switch', 'turn_off', { entity_id: this._config.entity });
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Turn on
      if (this._config?.mode === 'recirculation') {
        this._weJustTurnedOn = true;
        setTimeout(() => { this._weJustTurnedOn = false; }, 500);
      }
      await this._hass.callService('switch', 'turn_on', { entity_id: this._config.entity });
      setTimeout(() => this._refreshEntityState(), 100);

      const durationMinutes = this._getCappedDuration();
      await this._activateButton(durationMinutes);

      setTimeout(() => this.render().catch(() => {}), 150);
    } catch (err) {
      console.warn('Homie Scheduler (boiler button): Failed to run schedule', err.message || err, err);
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
      
      const isThisButtonActive = this._isThisButtonActive();

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
      
      // Recirculation: "Will be off in X" if (started from this button) OR (integration has entity_max_runtime); else "Already running for X"
      let recirculationLabelTop = 'Recirculation';
      let recirculationLabelBottom = '';
      
      if (isRecirculation) {
        if (isEntityOn) {
          const fromButton = isThisButtonActive;
          const hasIntegrationLimit = this._getMaxDurationFromIntegration() != null;
          const turnOffTime = this._getRecirculationTurnOffTime() || this._getRecirculationTurnOffTimeFallback();
          const showWillBeOff = (fromButton || hasIntegrationLimit) && turnOffTime;
          if (showWillBeOff) {
            recirculationLabelTop = 'Recirculation';
            recirculationLabelBottom = `Will be off in ${this._formatTimeUntil(turnOffTime)}`;
          } else {
            recirculationLabelTop = 'Recirculation';
            const elapsedMin = this._getElapsedRunningMinutesOnly();
            recirculationLabelBottom = elapsedMin != null ? `Already running for ${elapsedMin}` : 'Already running';
          }
        } else {
          recirculationLabelTop = 'Recirculation';
          const capped = this._getCappedDuration();
          const durationParts = this._formatDuration(capped);
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
      
      const styleContent = `/**\n * Shared styles for slot-form-fields.html (Add Slot popup + Edit Slot).\n * Uses :host CSS variables from the card (--_accent, --_text, etc.).\n */\n\n.popup-field { margin-bottom: 20px; }\n.popup-field:last-child { margin-bottom: 0; }\n\n/* Shared form (add popup + edit slot) - one structure, same styles */\n.slot-form .slot-form-field { margin-bottom: 20px; }\n.slot-form .slot-form-field:last-child { margin-bottom: 0; }\n.slot-form .slot-form-label {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 14px;\n  font-weight: 500;\n  color: var(--_text);\n  margin-bottom: 8px;\n}\n.slot-form .slot-form-label ha-icon { --mdc-icon-size: 22px; color: var(--_accent); }\n\n/* Mode, Fan, Temp in one row */\n.slot-form-row {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 12px 16px;\n  align-items: flex-end;\n  margin-bottom: 20px;\n}\n.slot-form-row .slot-form-field {\n  flex: 1;\n  min-width: 0;\n  margin-bottom: 0;\n}\n.slot-form-row-mode-fan-temp .slot-form-field-mode,\n.slot-form-row-mode-fan-temp .slot-form-field-fan,\n.slot-form-row-mode-fan-temp .slot-form-field-temp {\n  flex: 1 1 0;\n  min-width: 0;\n}\n/* stretch selects and inputs to full column width */\n.slot-form-row-mode-fan-temp .slot-form-field select,\n.slot-form-row-mode-fan-temp .slot-form-field input[type="number"] {\n  width: 100%;\n  box-sizing: border-box;\n  display: block;\n}\n\n.slot-form-field-mode .slot-form-mode-select { width: 100%; box-sizing: border-box; }\n.slot-form-mode-warning {\n  margin-top: 8px;\n  font-size: 12px;\n  color: var(--_error-color);\n  line-height: 1.4;\n}\n.slot-form-mode-warning:empty { display: none; }\n\n.slot-form-entities-wrap { position: relative; }\n.slot-form-entities-trigger {\n  margin-top: 8px;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-height: 40px;\n  padding: 6px 12px;\n  border-radius: var(--_radius-medium);\n  border: 1px solid var(--_divider);\n  background: var(--_bg-select);\n  cursor: pointer;\n  transition: border-color 0.2s, box-shadow 0.2s;\n}\n.slot-form-entities-trigger:hover,\n.slot-form-entities-trigger.open {\n  border-color: var(--_accent);\n  box-shadow: var(--_focus-ring);\n}\n.slot-form-entities-chips {\n  flex: 1;\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  align-items: center;\n  min-height: 24px;\n}\n.popup-entity-chip {\n  display: inline-flex;\n  align-items: center;\n  padding: 2px 8px;\n  border-radius: var(--_radius-small);\n  background: var(--_secondary-bg);\n  border: 1px solid var(--_divider);\n  font-size: 12px;\n  color: var(--_text);\n  white-space: nowrap;\n}\n.slot-form-entities-caret {\n  --mdc-icon-size: 20px;\n  color: var(--_text-secondary);\n  flex-shrink: 0;\n  transition: transform 0.2s;\n}\n.slot-form-entities-trigger.open .slot-form-entities-caret {\n  transform: rotate(180deg);\n}\n.slot-form-entities-dropdown {\n  display: none;\n  position: absolute;\n  left: 0;\n  right: 0;\n  top: 100%;\n  margin-top: 4px;\n  z-index: 10;\n  flex-direction: column;\n  border-radius: var(--_radius-medium);\n  border: 1px solid var(--_divider);\n  background: var(--_popup-bg);\n  box-shadow: var(--_popup-box-shadow);\n  max-height: 220px;\n  overflow: hidden;\n}\n.slot-form-entities-dropdown.open {\n  display: flex;\n}\n.slot-form-entities-select-all-row {\n  border-bottom: 1px solid var(--_divider);\n  flex-shrink: 0;\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 10px 16px;\n  cursor: pointer;\n  min-height: 44px;\n  box-sizing: border-box;\n}\n.slot-form-entity-row:hover {\n  background: var(--_secondary-bg);\n}\n.entities-selector-row.entities-selector-row-unsupported {\n  opacity: 0.5;\n  pointer-events: none;\n}\n.entities-selector-row.entities-selector-row-unsupported .entities-selector-entity-name::after {\n  content: ' (not supported for this mode)';\n  font-size: 11px;\n  color: var(--_text-secondary);\n  font-weight: 400;\n}\n.slot-form-entities-dropdown .entities-selector-list {\n  overflow-y: auto;\n  overflow-x: hidden;\n  display: flex;\n  flex-direction: column;\n  flex: 1;\n  min-height: 0;\n}\n.slot-form-entities-dropdown .entities-selector-row {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  padding: 10px 16px;\n  cursor: pointer;\n  border-bottom: 1px solid var(--_divider);\n  transition: background 0.2s;\n  min-height: 44px;\n  box-sizing: border-box;\n}\n.popup-entities-dropdown .entities-selector-row:last-child {\n  border-bottom: none;\n}\n.popup-entities-dropdown .entities-selector-row:hover {\n  background: var(--_secondary-bg);\n}\n.popup-entities-dropdown .entities-selector-row.hidden {\n  display: none;\n}\n.popup-entities-dropdown .entities-selector-row-unsupported {\n  opacity: 0.5;\n  pointer-events: none;\n}\n.popup-entities-dropdown .entities-selector-row-unsupported .entities-selector-entity-name::after {\n  content: ' (not supported for this mode)';\n  font-size: 11px;\n  color: var(--_text-secondary);\n  font-weight: 400;\n}\n.popup-entity-row input[type="checkbox"] {\n  width: 18px;\n  height: 18px;\n  margin: 0;\n  cursor: pointer;\n  accent-color: var(--_accent);\n  flex-shrink: 0;\n}\n.popup-entity-row ha-icon {\n  --mdc-icon-size: 22px;\n  color: var(--_text-secondary);\n  flex-shrink: 0;\n}\n.popup-entity-name {\n  flex: 1;\n  font-size: 14px;\n  font-weight: 500;\n  color: var(--_text);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.popup-entities-list label {\n  cursor: pointer;\n}\n.popup-field label {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin-bottom: 8px;\n  font-size: 14px;\n  font-weight: 500;\n  color: var(--_text);\n}\n.popup-field label ha-icon { --mdc-icon-size: 24px; color: var(--_accent); }\n\n/* HA-style row: label left, control (e.g. ha-switch) right */\n.popup-field-row {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 8px 0;\n  gap: 16px;\n  cursor: pointer;\n}\n.popup-field-row-label {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 14px;\n  font-weight: 500;\n  color: var(--_text);\n  cursor: pointer;\n  margin: 0;\n  flex: 1;\n}\n.popup-field-row-label ha-icon {\n  --mdc-icon-size: 24px;\n  color: var(--_accent);\n}\n.popup-duration-row ha-switch,\n.slot-form-duration-enabled {\n  flex-shrink: 0;\n}\n.slot-form-duration-row {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 8px 0;\n  gap: 16px;\n  cursor: pointer;\n}\n.slot-form-field-row-label {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 14px;\n  font-weight: 500;\n  color: var(--_text);\n  cursor: pointer;\n  margin: 0;\n  flex: 1;\n}\n.slot-form-field-row-label ha-icon {\n  --mdc-icon-size: 24px;\n  color: var(--_accent);\n}\n/* Slot edit: same vertical layout as add (label on new line, then control) */\n.slot-expandable .slot-form .slot-form-field {\n  display: block;\n  font-size: 14px;\n}\n.slot-expandable .slot-form-title-input {\n  width: 100%;\n  box-sizing: border-box;\n}\n\n/**\n * Boiler Schedule Button Card - Simplified Styles\n * \n * Simple HA-style button\n */\n\n:host {\n  display: block;\n  margin: 0 !important;\n  \n  /* Button design tokens - паттерн как в Mushroom cards */\n  /* Кнопка = карточка, поэтому использует фон и тени карточки */\n  --_bg: var(--ha-card-background, var(--card-background-color, #1c1c1c));\n  --_radius: var(--ha-card-border-radius, 12px);\n  --_shadow: var(--ha-card-box-shadow, none);\n  --_backdrop-filter: var(--ha-card-backdrop-filter, none);\n  --_border-color: var(--divider-color, rgba(255, 255, 255, 0.12));\n  \n  --_text: var(--primary-text-color, #fff);\n  --_text-secondary: var(--secondary-text-color, rgba(255,255,255,0.7));\n  \n  --_accent: var(--homie-button-accent, var(--primary-color, #03a9f4));\n  --_disabled-opacity: 0.5;\n  \n  /* Inactive = обычный фон карточки, Active = акцентный цвет */\n  /* С возможностью переопределения через --homie-button-* переменные */\n  --_button-bg-inactive: var(--homie-button-bg-inactive, var(--_bg));\n  --_button-bg-active: var(--homie-button-bg-active, var(--_accent));\n  --_button-bg-disabled: var(--homie-button-bg-disabled, var(--_bg));\n  \n  /* Текст на inactive кнопке = акцентный цвет (primary-color, обычно синий) */\n  --_button-text-inactive: var(--homie-button-text-inactive, var(--primary-color, #03a9f4));\n  --_button-text-active: var(--homie-button-text-active, var(--text-primary-color, #fff));\n  --_button-text-disabled: var(--homie-button-text-disabled, var(--disabled-text-color, rgba(255,255,255,0.5)));\n  \n  --_button-radius: var(--homie-button-radius, var(--_radius));\n  --_button-shadow: var(--homie-button-shadow, var(--_shadow));\n  --_button-shadow-active: var(--homie-button-shadow-active, var(--_shadow));\n  --_button-backdrop-filter: var(--homie-button-backdrop-filter, var(--_backdrop-filter));\n  --_button-border-color: var(--homie-button-border-color, var(--_border-color));\n}\n\n.schedule-button {\n  width: 100%;\n  height: 100%;\n  padding: 12px 16px;\n  border-radius: var(--_button-radius);\n  background: var(--_button-bg-inactive);\n  border: 1px solid var(--_button-border-color);\n  color: var(--_button-text-inactive);\n  box-shadow: var(--_button-shadow);\n  -webkit-backdrop-filter: var(--_button-backdrop-filter);\n  backdrop-filter: var(--_button-backdrop-filter);\n  cursor: pointer;\n  font-size: 14px;\n  font-weight: 500;\n  text-align: center;\n  transition: all 0.2s ease-in-out;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  gap: 4px;\n}\n\n.hidden {\n  display: none !important;\n}\n\n.button-label {\n  font-size: 12px;\n  font-weight: 400;\n  opacity: 0.9;\n  text-transform: uppercase;\n  letter-spacing: 0.5px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 8px;\n}\n\n.label-icon {\n  width: 14px;\n  height: 14px;\n  opacity: 0.9;\n  flex-shrink: 0;  /* Prevent icon from shrinking */\n  margin-right: 4px;  /* Additional spacing */\n}\n\n.button-duration {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  line-height: 1.2;\n}\n\n.duration-number {\n  font-size: 40px;\n  font-weight: 600;\n}\n\n.duration-unit {\n  font-size: 18px;\n  font-weight: 600;\n  opacity: 0.9;\n}\n\n.schedule-button.active {\n  background: var(--_button-bg-active);\n  color: var(--_button-text-active);\n  box-shadow: var(--_button-shadow-active);\n}\n\n.schedule-button.disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n  pointer-events: none;\n  background: var(--_button-bg-disabled);\n  color: var(--_button-text-disabled);\n  box-shadow: none;\n}\n\n/* Active button that is also disabled - keep active color but make it non-clickable */\n.schedule-button.active.disabled {\n  background: var(--_button-bg-active);\n  color: var(--_button-text-active);\n  opacity: 1;  /* Keep full opacity for active button */\n  cursor: not-allowed;\n  pointer-events: none;\n  box-shadow: var(--_button-shadow-active);\n}\n\n/* Recirculation mode styles */\n.schedule-button.recirculation {\n  flex-direction: column;\n  gap: 8px;\n  padding: 16px;\n}\n\n.recirculation-icon {\n  opacity: 1 !important; /* Override parent opacity */\n  color: inherit; /* Inherit text color from button */\n  --mdc-icon-size: 50px;\n  transition: transform 0.3s ease, opacity 0.2s ease;\n  display: block;\n}\n\n\n/* Hover effect for icon - removed for recirculation */\n\n/* Active state for icon */\n.schedule-button.recirculation.active .recirculation-icon {\n  opacity: 1 !important;\n  animation: pulse 2s ease-in-out infinite;\n}\n\n@keyframes pulse {\n  0%, 100% {\n    opacity: 1;\n  }\n  50% {\n    opacity: 0.8;\n  }\n}\n\n.recirculation-label-top,\n.recirculation-label-bottom {\n  font-size: 12px;\n  font-weight: 300; /* Thin text */\n  text-transform: uppercase;\n  letter-spacing: 0.3px;\n  opacity: 0.9;\n  line-height: 1.2;\n}\n\n.recirculation-label-top {\n  margin-bottom: 4px;\n}\n\n.recirculation-label-bottom {\n  margin-top: 4px;\n}\n\n/* ============================================\n * Кастомизация через CSS переменные\n * ============================================\n * \n * Можно переопределить в themes.yaml или через card-mod:\n * \n * homie-scheduler-boiler-button {\n *   --homie-button-bg-inactive: #2c2c2c;\n *   --homie-button-bg-active: #4caf50;\n *   --homie-button-bg-disabled: #1a1a1a;\n *   \n *   --homie-button-text-inactive: #ffffff;\n *   --homie-button-text-active: #ffffff;\n *   --homie-button-text-disabled: rgba(255,255,255,0.3);\n * \n *   --homie-button-backdrop-filter: var(--ha-card-backdrop-filter, none);\n *   --homie-button-border-color: var(--divider-color, rgba(255, 255, 255, 0.12));\n *   \n *   --homie-button-radius: 16px;\n *   --homie-button-shadow: 0 2px 4px rgba(0,0,0,0.1);\n *   --homie-button-shadow-active: 0 4px 12px rgba(76,175,80,0.4);\n * }\n */\n`;
      
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
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'custom:homie-scheduler-boiler-button',
    name: 'Homie Scheduler Button',
    description: 'Quick schedule button',
    icon: 'https://brands.home-assistant.io/custom_integrations/homie_scheduler/icon.png',
    preview: false
  });
  window.logCardInfo('boiler-button-card');
}
