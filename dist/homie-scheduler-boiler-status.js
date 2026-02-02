/**
 * Scheduler Boiler Status Card
 * Last build: 2026-02-02T14:38:13.013Z
 * Version: 1.0.1
 */

// Shared Components (auto-included from shared/)
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
    // Use data-action selectors - works for both popup and slot
    const input = shadowRoot.querySelector('[data-action="update-duration"]');
    const slider = shadowRoot.querySelector('[data-action="update-duration-slider"]');
    if (input) {
      input.value = duration ? String(duration) : '';
    }
    if (slider) {
      slider.value = duration ? String(duration) : '';
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
    
    // Remove old listeners by cloning
    const newInput = input.cloneNode(true);
    const newSlider = slider.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    slider.parentNode.replaceChild(newSlider, slider);
    
    // Single source of truth for duration value
    let currentValue = parseInt(newInput.value) || parseInt(newSlider.value) || 0;
    
    // Sync slider -> input
    const sliderInputHandler = (e) => {
      currentValue = parseInt(e.target.value);
      newInput.value = String(currentValue);
      newInput.setAttribute('value', String(currentValue));
    };
    newSlider.addEventListener('input', sliderInputHandler);
    newSlider.addEventListener('change', sliderInputHandler);
    
    // Sync input -> slider (with validation)
    const inputChangeHandler = (e) => {
      const value = parseInt(e.target.value);
      const min = parseInt(newInput.min) || 0;
      const max = parseInt(newInput.max) || 1440;
      
      if (!isNaN(value)) {
        const clampedValue = Math.max(min, Math.min(max, value));
        currentValue = clampedValue;
        newSlider.value = String(currentValue);
        newSlider.setAttribute('value', String(currentValue));
        newInput.value = String(currentValue);
        newInput.setAttribute('value', String(currentValue));
      }
    };
    newInput.addEventListener('input', inputChangeHandler);
    newInput.addEventListener('change', inputChangeHandler);
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
    const input = slotCard.querySelector('[data-action="update-duration"]');
    const slider = slotCard.querySelector('[data-action="update-duration-slider"]');
    
    // Update min/max/step if config provided
    if (config) {
      const minDuration = config.min_duration || 15;
      const maxDuration = config.max_duration || 1440;
      const durationStep = config.duration_step || 15;
      
      if (input) {
        input.min = minDuration;
        input.max = maxDuration;
        input.step = durationStep;
      }
      if (slider) {
        slider.min = minDuration;
        slider.max = maxDuration;
        slider.step = durationStep;
      }
    }
    
    // Update values
    if (input) {
      input.value = duration ? String(duration) : '';
    }
    if (slider) {
      slider.value = duration ? String(duration) : '';
    }
  }

  /**
   * Attach event listeners for duration selector in a slot card
   * @param {HTMLElement} slotCard - The slot card element
   * @param {Function} onChangeCallback - Callback function when duration changes (receives duration value)
   * @param {Object} config - Optional config with min_duration, max_duration, duration_step
   */
  static attachEventListenersInSlot(slotCard, onChangeCallback, config = null) {
    const input = slotCard.querySelector('[data-action="update-duration"]');
    const slider = slotCard.querySelector('[data-action="update-duration-slider"]');
    
    // Update min/max/step if config provided
    if (config && input && slider) {
      const minDuration = config.min_duration || 15;
      const maxDuration = config.max_duration || 1440;
      const durationStep = config.duration_step || 15;
      
      input.min = minDuration;
      input.max = maxDuration;
      input.step = durationStep;
      slider.min = minDuration;
      slider.max = maxDuration;
      slider.step = durationStep;
    }
    
    if (input && slider) {
      // Remove old listeners by cloning FIRST
      const newInput = input.cloneNode(true);
      const newSlider = slider.cloneNode(true);
      input.parentNode.replaceChild(newInput, input);
      slider.parentNode.replaceChild(newSlider, slider);
      
      // Single source of truth for duration value (from cloned elements)
      let currentValue = parseInt(newInput.value) || parseInt(newSlider.value) || 0;
      
      // Sync slider -> input (using newSlider and newInput)
      const sliderHandler = (e) => {
        currentValue = parseInt(e.target.value);
        newInput.value = String(currentValue);
        newInput.setAttribute('value', String(currentValue));
        if (onChangeCallback) {
          onChangeCallback(currentValue);
        }
      };
      
      // Sync input -> slider (with validation, using newInput and newSlider)
      const inputHandler = (e) => {
        const value = parseInt(e.target.value);
        const min = parseInt(newInput.min) || 0;
        const max = parseInt(newInput.max) || 1440;
        
        if (!isNaN(value)) {
          const clampedValue = Math.max(min, Math.min(max, value));
          currentValue = clampedValue;
          newSlider.value = String(currentValue);
          newSlider.setAttribute('value', String(currentValue));
          newInput.value = String(currentValue);
          newInput.setAttribute('value', String(currentValue));
          if (onChangeCallback) {
            onChangeCallback(currentValue);
          }
        } else if (e.target.value === '') {
          // Allow empty value (for climate cards where duration is optional)
          if (onChangeCallback) {
            onChangeCallback(null);
          }
        }
      };
      
      // Attach new listeners to cloned elements
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
  }

  async _loadTemplate() {
    if (this._htmlTemplate) return this._htmlTemplate;
    
    // Template is embedded in production build
    this._htmlTemplate = `<div class="status-card">\n  <button class="icon-button {{ICON_BUTTON_CLASS}}" data-action="toggle">\n    <div class="icon-circle">\n      <ha-icon icon="mdi:water-thermometer-outline" class="status-icon"></ha-icon>\n    </div>\n  </button>\n  <div class="content">\n    <div class="title">{{TITLE}}</div>\n    <div class="max-time {{MAX_TIME_HIDDEN_CLASS}}">\n      Max run time: {{MAX_WORKING_TIME}}\n    </div>\n    <div class="subtitle">{{SUBTITLE}}</div>\n  </div>\n</div>\n`;
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
                  }
                  this._hass.callService('homeassistant', 'update_entity', {
                    entity_id: entityId
                  }).catch(() => {});
                  this.hass = { ...this._hass };
                  setTimeout(() => this.render().catch(() => {}), 50);
                  if (entityId === this._config?.entity) {
                    setTimeout(() => this.render().catch(() => {}), 200);
                    setTimeout(() => this.render().catch(() => {}), 400);
                    this._startBridgePoll();
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
      
      const htmlContent = template
        .replace(/\{\{ICON_BUTTON_CLASS\}\}/g, iconButtonClass)
        .replace(/\{\{TITLE\}\}/g, this._escapeHtml(title))
        .replace(/\{\{SUBTITLE\}\}/g, this._escapeHtml(subtitle))
        .replace(/\{\{MAX_TIME_HIDDEN_CLASS\}\}/g, maxTimeHiddenClass)
        .replace(/\{\{MAX_WORKING_TIME\}\}/g, this._escapeHtml(maxWorkingTimeDisplay));
      
      // Load MDI font only in dev mode
      const isDevMode = window.location.protocol === 'file:' || 
                       window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1';
      const fontLink = isDevMode ? 
        '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@mdi/font@latest/css/materialdesignicons.min.css">' : '';
      
      const styleContent = `/**\n * Boiler Status Card - Styles\n * \n * Card showing boiler status with icon in circle\n */\n\n:host {\n  display: block;\n  \n  /* Status card design tokens - с возможностью переопределения */\n  --_accent: var(--homie-status-accent, var(--state-switch-on-color, var(--warning-color, #ffc107)));\n  --_bg: var(--homie-status-bg, var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9))));\n  --_radius: var(--homie-status-radius, var(--ha-card-border-radius, 4px));\n  --_shadow: var(--homie-status-shadow, var(--ha-card-box-shadow, 0 2px 4px rgba(0, 0, 0, 0.1)));\n  \n  --_text: var(--homie-status-text, var(--primary-text-color, #212121));\n  --_text-secondary: var(--homie-status-text-secondary, var(--secondary-text-color, #757575));\n  --_text-on-accent: var(--homie-status-text-on-accent, var(--text-primary-on-background, #ffffff));\n  \n  --_disabled-color: var(--homie-status-disabled, var(--disabled-color, var(--disabled-text-color, #9e9e9e)));\n}\n\n.status-card {\n  display: flex;\n  align-items: center;\n  gap: 16px;\n  padding: 16px;\n  border-radius: var(--ha-card-border-radius, 4px);\n  background: var(--ha-card-background, var(--card-background-color, rgba(255, 255, 255, 0.9)));\n  box-shadow: var(--ha-card-box-shadow, 0 2px 4px rgba(0, 0, 0, 0.1));\n}\n\n.icon-button {\n  flex-shrink: 0;\n  width: 64px;\n  height: 64px;\n  padding: 0;\n  border: none;\n  background: transparent;\n  cursor: pointer;\n  border-radius: 50%;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: transform 0.2s ease, opacity 0.2s ease;\n}\n\n.icon-button:hover:not(.disabled) {\n  transform: scale(1.05);\n  opacity: 0.9;\n}\n\n.icon-button:active:not(.disabled) {\n  transform: scale(0.95);\n}\n\n.icon-button.disabled {\n  cursor: not-allowed;\n  opacity: 0.5;\n}\n\n.icon-circle {\n  width: 64px;\n  height: 64px;\n  border-radius: 50%;\n  background: var(--disabled-color, var(--disabled-text-color, #9e9e9e));\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: background-color 0.2s ease;\n}\n\n.icon-button.active .icon-circle {\n  background: var(--state-switch-on-color, var(--warning-color, #ffc107));\n}\n\n.status-icon {\n  color: var(--text-primary-on-background, #ffffff);\n  --mdc-icon-size: 32px;\n}\n\n.content {\n  flex: 1;\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  min-width: 0; /* Allow text truncation */\n}\n\n.title {\n  font-size: 16px;\n  font-weight: 500;\n  color: var(--primary-text-color, #212121);\n  line-height: 1.2;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.subtitle {\n  font-size: 14px;\n  font-weight: 400;\n  color: var(--secondary-text-color, #757575);\n  line-height: 1.2;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.max-time {\n  font-size: 12px;\n  line-height: 1;\n  color: var(--secondary-text-color, #757575);\n}\n\n.max-time.max-time-hidden {\n  display: none;\n}\n`;
      
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
  console.info(
    '%c Homie Scheduler %c boiler-status-card',
    'color: white; background:rgb(94, 94, 243); font-weight: 700; border-radius: 5px; padding 10px',
    'color: rgb(94, 94, 243); font-weight: 700;'
  );
}
