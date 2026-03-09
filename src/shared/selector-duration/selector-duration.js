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

export { DurationSelectorMins, DurationSelectorHours };
