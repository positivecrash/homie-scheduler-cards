/**
 * Homie Boiler Status Card - Development Version
 * 
 * ✏️ SOURCE FILE - EDIT THIS!
 * 
 * Card showing boiler status with icon in circle that toggles the switch
 * 
 * ⚠️ For production run: bash build.sh
 * This will create homie-scheduler-boiler-status.js with embedded styles
 */

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
    // In dev mode, use embedded template (build script will replace this)
    const styleLink = `<link rel="stylesheet" href="card-styles.css">`;
    
    this._htmlTemplate = `<div class="status-card">
  <button class="icon-button {{ICON_BUTTON_CLASS}}" data-action="toggle">
    <div class="icon-circle">
      <ha-icon icon="mdi:water-thermometer-outline" class="status-icon"></ha-icon>
    </div>
  </button>
  <div class="content">
    <div class="title">{{TITLE}}</div>
    <div class="subtitle">{{SUBTITLE}}</div>
  </div>
  <div class="max-time {{MAX_TIME_HIDDEN_CLASS}}">
    Max working time: {{MAX_WORKING_TIME}}
  </div>
</div>
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
      
      const styleLink = `<link rel="stylesheet" href="card-styles.css">`;
      
      this.shadowRoot.innerHTML = `${fontLink}${styleLink}${htmlContent}`;
      
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
