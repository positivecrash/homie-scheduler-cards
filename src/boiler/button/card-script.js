/**
 * Homie Boiler Schedule Button Card - Production Version (auto-generated from dev version)
 * 
 * ✏️ SOURCE FILE - EDIT THIS!
 * 
 * Production version with embedded styles and HTML template
 * Use for development with preview.html
 * 
 * ⚠️ For production run: bash build.sh
 * This will create homie-scheduler-boiler-button.js with embedded styles
 *
 * --- ALGORITHM (button card) ---
 * 1. Data: one entity, duration (minutes), mode (normal | recirculation). No link to status or slots cards.
 * 2. Click: turn_on entity, call set_active_button(entity, button_id, timer_end, duration); start
 *    local _turnOffTimer; when it fires, turn_off entity and clear_active_button.
 * 3. External turn-on (physical switch): integration applies entity_max_runtime; we show "Will be off in X" from bridge.
 * 4. When entity turns off: we clear active_buttons in integration (so bridge is in sync).
 * 5. Display: if active_buttons[entity].button_id === this._buttonId we show countdown from
 *    timer_end; otherwise we show "FOR X MIN" (config duration). Countdown comes from bridge
 *    or local timer.
 * 6. Recirculation: duration is capped by integration entity_max_runtime. When entity is on,
 *    if there is a turn-off time (button's active_buttons or integration max_runtime_turn_off_times)
 *    show "Will be off in X" (with seconds); otherwise "Already running for X" (elapsed).
 *    External turn-on (physical switch): integration applies entity_max_runtime; we only show countdown.
 */

// Shared Components will be auto-included by build script
// DO NOT include ScheduleHelper, DurationSelector, or WeekdaySelector here - they will be added during build

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
    // In dev mode, use embedded template (build script will replace this)
    this._htmlTemplate = `<button class="{{NORMAL_BUTTON_CLASS}}" data-action="run-schedule">
  <span class="button-label">
    <ha-icon icon="mdi:timer-play-outline" class="label-icon"></ha-icon>
    {{LABEL_TEXT}}
  </span>
  <span class="button-duration">
    <span class="duration-number">{{DURATION_NUMBER}}</span>
    <span class="duration-unit">{{DURATION_UNIT}}</span>
  </span>
</button>

<button class="{{RECIRCULATION_BUTTON_CLASS}}" data-action="run-schedule">
  <ha-icon icon="mdi:reload" class="recirculation-icon"></ha-icon>
  <span class="recirculation-text">{{RECIRCULATION_TEXT}}</span>
</button>
`;
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
      
      const styleLink = `<link rel="stylesheet" href="card-styles.css">`;
      
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
