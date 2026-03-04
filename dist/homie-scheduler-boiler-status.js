/**
 * Scheduler Boiler Status Card
 * Last build: 2026-03-04T17:42:12.840Z
 * Version: 1.1.0
 */
window.__HOMIE_SCHEDULER_CARDS_VERSION = '1.1.0';

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

class HomieBoilerStatusCard extends HTMLElement {
  static getStubConfig() {
    return { entity: '' };
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
                  const newState = event.data.new_state;
                  // Bridge update (e.g. Latest activity): use event payload and re-render so UI updates without refresh
                  if (entityId === this._bridgeSensor && newState) {
                    this._bridgeStateOverride = newState;
                    this.hass = { ...this._hass };
                    this.render().catch(() => {});
                  }
                  this._hass.callService('homeassistant', 'update_entity', {
                    entity_id: entityId
                  }).catch(() => {});
                  if (entityId !== this._bridgeSensor) {
                    this.hass = { ...this._hass };
                    setTimeout(() => this.render().catch(() => {}), 50);
                  }
                  if (entityId === this._config?.entity || entityId === this._bridgeSensor) {
                    this._startBridgePoll();
                  }
                }
              }
            },
            'state_changed'
          ).then((unsubscribeFn) => {
            this._unsubStateChanged = unsubscribeFn;
          }).catch((e) => {
            if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (boiler status): subscribeStateChanged failed', e);
          });
        } catch (e) {
          if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (boiler status): subscribeStateChanged setup failed', e);
        }
      }
      
      // Re-render on state changes
      this.render().catch(err => {});
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (boiler status): hass setter failed', err);
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
        if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (boiler status): unsubscribe in disconnectedCallback failed', e);
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
      if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (boiler status): _findBridgeSensor failed', err);
    }
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

  /** Turn-off time for subtitle: (1) integration (slot end or entity_max_runtime) if present; (2) else if run started by button — button timer. */
  _getTurnOffTime() {
    try {
      const bridgeState = this._getBridgeState();
      if (!bridgeState) return null;

      const entityId = this._config?.entity;
      if (!entityId) return null;

      const entityState = this._getEntityState();
      const now = new Date();
      const candidates = [];

      // 1) Integration first: slot end or entity_max_runtime (so slot-driven runs show slot time, not button)
      const bridgeCandidates = this._getAllTurnOffCandidatesFromBridges();
      candidates.push(...bridgeCandidates);

      if (candidates.length > 0) return new Date(Math.min(...candidates));

      // 2) Fallback: entity_max_runtime for this entity only
      const entityMaxRuntime = bridgeState.attributes?.entity_max_runtime || {};
      const maxMinutes = entityMaxRuntime[entityId];
      if (maxMinutes != null && Number(maxMinutes) > 0 && entityState?.state === 'on' && entityState.last_changed) {
        const lastChanged = new Date(entityState.last_changed).getTime();
        const d = new Date(lastChanged + Number(maxMinutes) * 60 * 1000);
        if (d > now) return d;
      }

      // 3) If run was started by the button card — show button's timer
      const activeButtons = bridgeState.attributes?.active_buttons || {};
      const activeButton = activeButtons[entityId];
      if (activeButton?.timer_end && entityState?.state === 'on' && entityState.last_changed) {
        let timerEnd = parseInt(activeButton.timer_end, 10);
        if (!isNaN(timerEnd)) {
          if (timerEnd > 0 && timerEnd < 1e12) timerEnd *= 1000;
          const durationMin = (activeButton.duration != null) ? Number(activeButton.duration) : 0;
          if (durationMin > 0) {
            const buttonStartMs = timerEnd - durationMin * 60 * 1000;
            const lastChangedMs = new Date(entityState.last_changed).getTime();
            if (lastChangedMs <= buttonStartMs + 5000) {
              const d = new Date(timerEnd);
              if (d > now) return d;
            }
          }
        }
      }

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
      const h = Math.floor(m / 60);
      const min = m % 60;
      if (min === 0) return h === 1 ? '1 hour' : `${h} hours`;
      return `${h} h ${min} min`;
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

  /** @param {Date} date - target time
   *  @param {number} [maxMs] - cap displayed countdown (e.g. entity_max_runtime) so it never exceeds limit when device clock is wrong */
  _formatTimeUntil(date, maxMs) {
    if (!date) return '';
    
    try {
      const now = Date.now();
      const targetTime = date.getTime();
      let diffMs = targetTime - now;
      if (maxMs != null && maxMs > 0 && diffMs > maxMs) diffMs = maxMs;
      
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
      const bridgeState = this._getBridgeState();
      const entityMaxRuntime = bridgeState?.attributes?.entity_max_runtime || {};
      const maxMinutes = entityMaxRuntime[this._config?.entity];
      const maxMs = (maxMinutes != null && Number(maxMinutes) > 0)
        ? Number(maxMinutes) * 60 * 1000
        : undefined;
      const timeUntil = this._formatTimeUntil(turnOffTime, maxMs);
      // If time is in the past, bridge may not have updated yet — refresh to get new slot end
      if (timeUntil === 'now') {
        this._scheduleCountdownRefresh();
        return 'Runs, updating…';
      }
      return `Runs, Will be off in ${timeUntil}`;
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

  /**
   * Toggle (click on status icon): no max time is applied from button/slots cards.
   * Only integration "Max run time" for this entity (if set in integration options) applies.
   */
  async _toggleEntity() {
    if (!this._hass || !this._config || !this._config.entity) return;
    
    try {
      const isOn = this._isEntityOn();
      
      if (isOn) {
        if (this._turnOffTimer) {
          clearTimeout(this._turnOffTimer);
          this._turnOffTimer = null;
        }
        if (this._entryId) {
          try {
            await this._callService('clear_active_button', { entity_id: this._config.entity });
          } catch (e) { /* ignore */ }
        }
        await this._hass.callService('switch', 'turn_off', {
          entity_id: this._config.entity
        });
      } else {
        // Turn on: clear button state so integration/slot controls turn-off (entity_max_runtime or slot)
        if (this._entryId) {
          try {
            await this._callService('clear_active_button', { entity_id: this._config.entity });
          } catch (e) { /* ignore */ }
        }
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
      console.warn('Homie Scheduler (boiler status): Failed to toggle switch', err.message || err, err);
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
      const titleForHeader = this._config?.title ? this._escapeHtml(this._config.title) : '';
      const titleWithSpace = titleForHeader ? titleForHeader + ' ' : '';
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
        .replace(/\{\{TITLE\}\}/g, titleWithSpace)
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
      
      const styleContent = `/**\n * Shared styles for slot-form-fields.html (Add Slot popup + Edit Slot).\n * Uses :host CSS variables from the card (--_accent, --_text, etc.).\n */\n\n.popup-field { margin-bottom: 20px; }\n.popup-field:last-child { margin-bottom: 0; }\n\n/* Shared form (add popup + edit slot) - one structure, same styles */\n.slot-form .slot-form-field { margin-bottom: 20px; }\n.slot-form .slot-form-field:last-child { margin-bottom: 0; }\n.slot-form .slot-form-label {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 14px;\n  font-weight: 500;\n  color: var(--_text);\n  margin-bottom: 8px;\n}\n.slot-form .slot-form-label ha-icon { --mdc-icon-size: 22px; color: var(--_accent); }\n\n/* Mode, Fan, Temp in one row */\n.slot-form-row {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 12px 16px;\n  align-items: flex-end;\n  margin-bottom: 20px;\n}\n.slot-form-row .slot-form-field {\n  flex: 1;\n  min-width: 0;\n  margin-bottom: 0;\n}\n.slot-form-row-mode-fan-temp .slot-form-field-mode,\n.slot-form-row-mode-fan-temp .slot-form-field-fan,\n.slot-form-row-mode-fan-temp .slot-form-field-temp {\n  flex: 1 1 0;\n  min-width: 0;\n}\n/* stretch selects and inputs to full column width */\n.slot-form-row-mode-fan-temp .slot-form-field select,\n.slot-form-row-mode-fan-temp .slot-form-field input[type="number"] {\n  width: 100%;\n  box-sizing: border-box;\n  display: block;\n}\n\n.slot-form-field-mode .slot-form-mode-select { width: 100%; box-sizing: border-box; }\n.slot-form-mode-warning {\n  margin-top: 8px;\n  font-size: 12px;\n  color: var(--_error-color);\n  line-height: 1.4;\n}\n.slot-form-mode-warning:empty { display: none; }\n\n.slot-form-entities-wrap { position: relative; }\n.slot-form-entities-trigger {\n  margin-top: 8px;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-height: 40px;\n  padding: 6px 12px;\n  border-radius: var(--_radius-medium);\n  border: 1px solid var(--_divider);\n  background: var(--_bg-select);\n  cursor: pointer;\n  transition: border-color 0.2s, box-shadow 0.2s;\n}\n.slot-form-entities-trigger:hover,\n.slot-form-entities-trigger.open {\n  border-color: var(--_accent);\n  box-shadow: var(--_focus-ring);\n}\n.slot-form-entities-chips {\n  flex: 1;\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  align-items: center;\n  min-height: 24px;\n}\n.popup-entity-chip {\n  display: inline-flex;\n  align-items: center;\n  padding: 2px 8px;\n  border-radius: var(--_radius-small);\n  background: var(--_secondary-bg);\n  border: 1px solid var(--_divider);\n  font-size: 12px;\n  color: var(--_text);\n  white-space: nowrap;\n}\n.slot-form-entities-caret {\n  --mdc-icon-size: 20px;\n  color: var(--_text-secondary);\n  flex-shrink: 0;\n  transition: transform 0.2s;\n}\n.slot-form-entities-trigger.open .slot-form-entities-caret {\n  transform: rotate(180deg);\n}\n.slot-form-entities-dropdown {\n  display: none;\n  position: absolute;\n  left: 0;\n  right: 0;\n  top: 100%;\n  margin-top: 4px;\n  z-index: 10;\n  flex-direction: column;\n  border-radius: var(--_radius-medium);\n  border: 1px solid var(--_divider);\n  background: var(--_popup-bg);\n  box-shadow: var(--_popup-box-shadow);\n  max-height: 220px;\n  overflow: hidden;\n}\n.slot-form-entities-dropdown.open {\n  display: flex;\n}\n.slot-form-entities-select-all-row {\n  border-bottom: 1px solid var(--_divider);\n  flex-shrink: 0;\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 10px 16px;\n  cursor: pointer;\n  min-height: 44px;\n  box-sizing: border-box;\n}\n.slot-form-entity-row:hover {\n  background: var(--_secondary-bg);\n}\n.entities-selector-row.entities-selector-row-unsupported {\n  opacity: 0.5;\n  pointer-events: none;\n}\n.entities-selector-row.entities-selector-row-unsupported .entities-selector-entity-name::after {\n  content: ' (not supported for this mode)';\n  font-size: 11px;\n  color: var(--_text-secondary);\n  font-weight: 400;\n}\n.slot-form-entities-dropdown .entities-selector-list {\n  overflow-y: auto;\n  overflow-x: hidden;\n  display: flex;\n  flex-direction: column;\n  flex: 1;\n  min-height: 0;\n}\n.slot-form-entities-dropdown .entities-selector-row {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  padding: 10px 16px;\n  cursor: pointer;\n  border-bottom: 1px solid var(--_divider);\n  transition: background 0.2s;\n  min-height: 44px;\n  box-sizing: border-box;\n}\n.popup-entities-dropdown .entities-selector-row:last-child {\n  border-bottom: none;\n}\n.popup-entities-dropdown .entities-selector-row:hover {\n  background: var(--_secondary-bg);\n}\n.popup-entities-dropdown .entities-selector-row.hidden {\n  display: none;\n}\n.popup-entities-dropdown .entities-selector-row-unsupported {\n  opacity: 0.5;\n  pointer-events: none;\n}\n.popup-entities-dropdown .entities-selector-row-unsupported .entities-selector-entity-name::after {\n  content: ' (not supported for this mode)';\n  font-size: 11px;\n  color: var(--_text-secondary);\n  font-weight: 400;\n}\n.popup-entity-row input[type="checkbox"] {\n  width: 18px;\n  height: 18px;\n  margin: 0;\n  cursor: pointer;\n  accent-color: var(--_accent);\n  flex-shrink: 0;\n}\n.popup-entity-row ha-icon {\n  --mdc-icon-size: 22px;\n  color: var(--_text-secondary);\n  flex-shrink: 0;\n}\n.popup-entity-name {\n  flex: 1;\n  font-size: 14px;\n  font-weight: 500;\n  color: var(--_text);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.popup-entities-list label {\n  cursor: pointer;\n}\n.popup-field label {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin-bottom: 8px;\n  font-size: 14px;\n  font-weight: 500;\n  color: var(--_text);\n}\n.popup-field label ha-icon { --mdc-icon-size: 24px; color: var(--_accent); }\n\n/* HA-style row: label left, control (e.g. ha-switch) right */\n.popup-field-row {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 8px 0;\n  gap: 16px;\n  cursor: pointer;\n}\n.popup-field-row-label {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 14px;\n  font-weight: 500;\n  color: var(--_text);\n  cursor: pointer;\n  margin: 0;\n  flex: 1;\n}\n.popup-field-row-label ha-icon {\n  --mdc-icon-size: 24px;\n  color: var(--_accent);\n}\n.popup-duration-row ha-switch,\n.slot-form-duration-enabled {\n  flex-shrink: 0;\n}\n.slot-form-duration-row {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 8px 0;\n  gap: 16px;\n  cursor: pointer;\n}\n.slot-form-field-row-label {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 14px;\n  font-weight: 500;\n  color: var(--_text);\n  cursor: pointer;\n  margin: 0;\n  flex: 1;\n}\n.slot-form-field-row-label ha-icon {\n  --mdc-icon-size: 24px;\n  color: var(--_accent);\n}\n/* Slot edit: same vertical layout as add (label on new line, then control) */\n.slot-expandable .slot-form .slot-form-field {\n  display: block;\n  font-size: 14px;\n}\n.slot-expandable .slot-form-title-input {\n  width: 100%;\n  box-sizing: border-box;\n}\n\n/**\n * Boiler Status Card - Styles\n * \n * Card showing boiler status with icon in circle\n */\n\n:host {\n  display: block;\n  \n  /* Status card design tokens - с возможностью переопределения */\n  --_accent: var(--homie-status-accent, var(--state-switch-on-color, var(--warning-color, #ffc107)));\n  --_bg: var(--homie-status-bg, var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9))));\n  --_radius: var(--homie-status-radius, var(--ha-card-border-radius, 4px));\n  --_shadow: var(--homie-status-shadow, var(--ha-card-box-shadow, 0 2px 4px rgba(0, 0, 0, 0.1)));\n  \n  --_text: var(--homie-status-text, var(--primary-text-color, #212121));\n  --_text-secondary: var(--homie-status-text-secondary, var(--secondary-text-color, #757575));\n  --_text-on-accent: var(--homie-status-text-on-accent, var(--text-primary-on-background, #ffffff));\n  \n  --_disabled-color: var(--homie-status-disabled, var(--disabled-color, var(--disabled-text-color, #9e9e9e)));\n}\n\n.status-card {\n  display: flex;\n  align-items: center;\n  gap: 16px;\n  padding: 16px;\n  border-radius: var(--ha-card-border-radius, 4px);\n  background: var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9)));\n  box-shadow: var(--ha-card-box-shadow, 0 2px 4px rgba(0, 0, 0, 0.1));\n}\n\n.icon-button {\n  flex-shrink: 0;\n  width: 64px;\n  height: 64px;\n  padding: 0;\n  border: none;\n  background: transparent;\n  cursor: pointer;\n  border-radius: 50%;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: transform 0.2s ease, opacity 0.2s ease;\n}\n\n.icon-button:active:not(.disabled) {\n  transform: scale(0.95);\n}\n\n.icon-button.disabled {\n  cursor: not-allowed;\n  opacity: 0.5;\n}\n\n.icon-circle {\n  width: 64px;\n  height: 64px;\n  border-radius: 50%;\n  background: var(--disabled-color, var(--disabled-text-color, #9e9e9e));\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: background-color 0.2s ease;\n}\n\n.icon-button.active .icon-circle {\n  background: var(--state-switch-on-color, var(--warning-color, #ffc107));\n}\n\n.status-icon {\n  color: var(--text-primary-on-background, #ffffff);\n  --mdc-icon-size: 32px;\n}\n\n.content {\n  flex: 1;\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  min-width: 0; /* Allow text truncation */\n}\n\n.title {\n  font-size: 16px;\n  font-weight: 500;\n  color: var(--primary-text-color, #212121);\n  line-height: 1.2;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.subtitle {\n  font-size: 12px;\n  line-height: 1;\n  color: var(--secondary-text-color, #757575);\n}\n\n.max-time.max-time-hidden {\n  display: none;\n}\n\n.last-run.last-run-hidden {\n  display: none;\n}\n`;
      
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
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'custom:homie-scheduler-boiler-status',
    name: 'Homie Scheduler Boiler Status',
    description: 'Boiler status and toggle',
    icon: 'https://brands.home-assistant.io/custom_integrations/homie_scheduler/icon.png',
    preview: false
  });
  window.logCardInfo('boiler-status-card');
}
