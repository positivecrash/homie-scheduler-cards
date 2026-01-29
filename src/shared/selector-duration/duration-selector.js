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

// Export for ES6 modules (backward compatibility)
export { DurationSelector };
