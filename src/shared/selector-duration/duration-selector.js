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

// Export for ES6 modules (backward compatibility)
export { DurationSelector };
