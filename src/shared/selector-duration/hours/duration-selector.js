/**
 * Duration Selector (hours)
 * Slider + number input, duration in hours (0.5–12, step 0.5). Used by climate card.
 * Slider uses real hours (min 0.5, max 12) so thumb at start = 0.5 h, like boiler.
 */

const HOURS_MIN = 0.5;
const HOURS_MAX = 12;
const HOURS_STEP = 0.5;

// Prevent duplicate class declaration when multiple cards are loaded
if (typeof window.DurationSelector === 'undefined') {
  window.DurationSelector = class DurationSelector {
  static computeStep(min, max, preferredStep = 0.5) {
    return preferredStep;
  }

  /** @returns {number|null} Duration in hours, or null */
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

  /** @param {number|null} duration - Duration in hours */
  static setSelectedDuration(shadowRoot, duration) {
    const wrapper = shadowRoot.classList && shadowRoot.classList.contains('duration-selector-wrapper')
      ? shadowRoot
      : shadowRoot.querySelector('.duration-selector-wrapper');
    const input = (wrapper || shadowRoot).querySelector('[data-action="update-duration"]');
    const slider = (wrapper || shadowRoot).querySelector('[data-action="update-duration-slider"]');
    const num = duration != null && duration !== '' ? parseFloat(duration) : NaN;
    const val = Number.isNaN(num) ? '' : Math.max(HOURS_MIN, Math.min(HOURS_MAX, num));
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
    newInput.min = HOURS_MIN;
    newInput.max = HOURS_MAX;
    newInput.step = String(HOURS_STEP);
    newSlider.min = HOURS_MIN;
    newSlider.max = HOURS_MAX;
    newSlider.step = String(HOURS_STEP);
    let currentHours = parseFloat(newInput.value);
    if (Number.isNaN(currentHours)) currentHours = HOURS_MIN;
    newSlider.value = String(currentHours);
    const sliderInputHandler = (e) => {
      const val = parseFloat(e.target.value);
      currentHours = Number.isNaN(val) ? HOURS_MIN : Math.max(HOURS_MIN, Math.min(HOURS_MAX, val));
      newInput.value = String(currentHours);
      newInput.setAttribute('value', newInput.value);
    };
    newSlider.addEventListener('input', sliderInputHandler);
    newSlider.addEventListener('change', sliderInputHandler);
    const inputChangeHandler = (e) => {
      const value = parseFloat(e.target.value);
      if (!isNaN(value)) {
        currentHours = Math.max(HOURS_MIN, Math.min(HOURS_MAX, value));
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

  /** @param {number|null} duration - Duration in hours */
  static setDurationInSlot(slotCard, duration, config = null) {
    const wrapper = slotCard.classList && slotCard.classList.contains('duration-selector-wrapper')
      ? slotCard
      : slotCard.querySelector('.duration-selector-wrapper');
    const input = (wrapper || slotCard).querySelector('[data-action="update-duration"]');
    const slider = (wrapper || slotCard).querySelector('[data-action="update-duration-slider"]');
    if (config && input) {
      const minH = config.min_duration ?? HOURS_MIN;
      const maxH = config.max_duration ?? HOURS_MAX;
      input.min = minH;
      input.max = maxH;
      input.step = String(HOURS_STEP);
    }
    if (slider) {
      slider.min = config?.min_duration ?? HOURS_MIN;
      slider.max = config?.max_duration ?? HOURS_MAX;
      slider.step = String(HOURS_STEP);
    }
    const num = duration != null && duration !== '' ? parseFloat(duration) : NaN;
    const val = Number.isNaN(num) ? '' : Math.max(HOURS_MIN, Math.min(HOURS_MAX, num));
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
    if (config && input) {
      input.min = minH;
      input.max = maxH;
      input.step = String(HOURS_STEP);
    }
    if (slider) {
      slider.min = minH;
      slider.max = maxH;
      slider.step = String(HOURS_STEP);
    }
    if (input && slider) {
      const newInput = input.cloneNode(true);
      const newSlider = slider.cloneNode(true);
      input.parentNode.replaceChild(newInput, input);
      slider.parentNode.replaceChild(newSlider, slider);
      let currentHours = parseFloat(newInput.value);
      if (isNaN(currentHours)) currentHours = HOURS_MIN;
      newSlider.value = String(currentHours);
      const sliderHandler = (e) => {
        const val = parseFloat(e.target.value);
        currentHours = Number.isNaN(val) ? HOURS_MIN : Math.max(HOURS_MIN, Math.min(HOURS_MAX, val));
        newInput.value = String(currentHours);
        newInput.setAttribute('value', newInput.value);
        if (onChangeCallback) onChangeCallback(currentHours);
      };
      const inputHandler = (e) => {
        const value = parseFloat(e.target.value);
        if (!isNaN(value)) {
          currentHours = Math.max(HOURS_MIN, Math.min(HOURS_MAX, value));
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
}

export { DurationSelector };
