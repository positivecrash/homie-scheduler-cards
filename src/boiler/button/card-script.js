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
 */

// Shared Components will be auto-included by build script
// DO NOT include ScheduleHelper, DurationSelector, or WeekdaySelector here - they will be added during build

class HomieBoilerScheduleButtonCard extends HTMLElement {
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
    this._externalRecirculationTimerSet = false;  // True when we set recirculation timer for current "on" (external or fallback)
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

                // Handle entity turned off — clear active button marker and reset external-timer flag
                if (entityId === this._config?.entity && oldState?.state === 'on' && newState?.state === 'off') {
                  this._externalRecirculationTimerSet = false;
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

                // Recirculation only: entity turned ON from outside (e.g. physical button, another toggle) — set timer for duration
                if (entityId === this._config?.entity && this._config?.mode === 'recirculation' &&
                    oldState?.state !== 'on' && newState?.state === 'on' && !this._weJustTurnedOn) {
                  this._externalRecirculationTimerSet = true;
                  setTimeout(() => this._applyRecirculationTimerFromExternal(), 150);
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
    // Check if there's a pending timer in integration and restore it
    if (this._buttonId && this._config?.entity && this._entryId) {
      try {
        const bridgeState = this._getBridgeState();
        const activeButtons = bridgeState?.attributes?.active_buttons || {};
        const activeButton = activeButtons[this._config.entity];
        
        if (activeButton && activeButton.button_id === this._buttonId) {
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

  _hasActiveSchedule() {
    try {
      if (!this._config || !this._config.entity) return false;
      
      const bridgeState = this._getBridgeState();
      if (!bridgeState) return false;
      
      const items = bridgeState.attributes?.items || [];
      const entityItems = items.filter(item => item && item.entity_id === this._config.entity);
      
      if (entityItems.length === 0) return false;
      
      // Check if any item is currently active (simplified check)
      // In a real implementation, we'd check against current time
      // For now, we'll check if integration is active and entity is on
      const isIntegrationActive = bridgeState.state === 'active';
      const isEntityOn = this._isEntityOn();
      
      // If entity is on and integration is active, likely there's an active schedule
      return isIntegrationActive && isEntityOn;
    } catch (err) {
      return false;
    }
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

  /** Recirculation only: entity was turned ON from outside — set timer for duration (same as if user pressed the button). */
  async _applyRecirculationTimerFromExternal() {
    if (this._config?.mode !== 'recirculation' || !this._config?.entity || !this._hass) return;
    const durationMinutes = parseInt(this._config.duration) || 1;
    const durationMs = durationMinutes * 60 * 1000;
    const timerEndTime = Date.now() + durationMs;

    if (this._turnOffTimer) {
      clearTimeout(this._turnOffTimer);
      this._turnOffTimer = null;
    }

    if (this._buttonId && this._entryId) {
      try {
        await this._callService('set_active_button', {
          entity_id: this._config.entity,
          button_id: this._buttonId,
          timer_end: timerEndTime,
          duration: durationMinutes
        });
      } catch (e) {
        // Ignore errors
      }
    }

    this._turnOffTimer = setTimeout(async () => {
      try {
        if (this._hass && this._config?.entity) {
          if (this._isInsideActiveSlot()) {
            if (this._entryId) {
              try {
                await this._callService('clear_active_button', { entity_id: this._config.entity });
              } catch (e) {}
            }
            this._turnOffTimer = null;
            this.render().catch(() => {});
            return;
          }
          await this._hass.callService('switch', 'turn_off', { entity_id: this._config.entity });
          if (this._entryId) {
            try {
              await this._callService('clear_active_button', { entity_id: this._config.entity });
            } catch (e) {}
          }
          setTimeout(() => {
            if (this._hass && this._config?.entity) {
              this._hass.callService('homeassistant', 'update_entity', { entity_id: this._config.entity }).catch(() => {});
              this.hass = { ...this._hass };
            }
          }, 100);
        }
      } catch (err) {
      } finally {
        this._turnOffTimer = null;
      }
      this.render().catch(() => {});
    }, durationMs);

    this.render().catch(() => {});
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
        const msg = 'Homie Scheduler: bridge sensor not found. Check integration is installed and sensor "Scheduler Info" exists.';
        console.warn(msg);
        if (typeof alert === 'function') alert(msg);
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
      const msg = 'Homie Scheduler: ' + (err?.message || String(err));
      console.error(msg, err);
      if (typeof alert === 'function') alert(msg);
      throw err;
    }
  }

  async _runSchedule() {
    const isOn = this._isEntityOn();
    
    // Check if this specific button is the active one
    let isThisButtonActive = false;
    if (this._buttonId) {
      try {
        const bridgeState = this._getBridgeState();
        const activeButtons = bridgeState?.attributes?.active_buttons || {};
        const activeButton = activeButtons[this._config.entity];
        if (activeButton && activeButton.button_id === this._buttonId) {
          isThisButtonActive = true;
        }
      } catch (e) {
        // Ignore errors
      }
    }
    
    // If entity is on AND this button activated it - turn off
    if (isOn && isThisButtonActive) {
      try {
        // Clear turn-off timer
        if (this._turnOffTimer) {
          clearTimeout(this._turnOffTimer);
          this._turnOffTimer = null;
        }
        
        // Clear active button marker in integration
        if (this._config.entity && this._entryId) {
          try {
            await this._callService('clear_active_button', {
              entity_id: this._config.entity
            });
          } catch (e) {
            // Ignore errors
          }
        }
        
        // Turn off entity
        await this._hass.callService('switch', 'turn_off', {
          entity_id: this._config.entity
        });
        
        // Update entity state
        setTimeout(() => {
          if (this._hass && this._config && this._config.entity) {
            this._hass.callService('homeassistant', 'update_entity', {
              entity_id: this._config.entity
            }).catch(() => {});
            this.hass = { ...this._hass };
          }
        }, 100);
        
        return;
      } catch (err) {
        alert('Failed to turn off: ' + (err.message || err));
        return;
      }
    }
    
    // If entity is on but another button activated it - switch to this button
    // (turn off, then turn on with this button's duration)
    if (isOn && !isThisButtonActive) {
      try {
        // Turn off first
        await this._hass.callService('switch', 'turn_off', {
          entity_id: this._config.entity
        });
        
        // Wait a bit for state to update
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Then continue to turn on with new duration (fall through to normal logic)
      } catch (err) {
        alert('Failed to switch: ' + (err.message || err));
        return;
      }
    }

    try {
      // Step 1: Turn on boiler immediately (for instant response)
      if (this._config?.mode === 'recirculation') this._weJustTurnedOn = true;
      try {
        await this._hass.callService('switch', 'turn_on', {
          entity_id: this._config.entity
        });
        
        // Update entity state immediately so button shows disabled state
        try {
          await this._hass.callService('homeassistant', 'update_entity', {
            entity_id: this._config.entity
          });
        } catch (e) {
          // Ignore update errors, state will update eventually
        }
        
        // Force update hass state to reflect entity change
        setTimeout(() => {
          if (this._hass && this._config && this._config.entity) {
            // Request fresh state
            this._hass.callService('homeassistant', 'update_entity', {
              entity_id: this._config.entity
            }).catch(() => {});
            
            // Update hass reference to trigger re-render
            this.hass = { ...this._hass };
          }
        }, 100);
      } catch (err) {
        alert('Failed to turn on boiler: ' + (err.message || err));
        return;
      }

      // Step 2: Schedule automatic turn-off using setTimeout (no slot creation needed)
      const durationMinutes = parseInt(this._config.duration) || 60;
      const durationMs = durationMinutes * 60 * 1000;
      
      // Clear any existing turn-off timer for this entity
      if (this._turnOffTimer) {
        clearTimeout(this._turnOffTimer);
        this._turnOffTimer = null;
      }
      
      // Calculate timer end time
      const timerStartTime = Date.now();
      const timerEndTime = timerStartTime + durationMs;
      
      // Step 3: Mark this button as active in integration (via service)
      if (this._buttonId && this._entryId) {
        try {
          await this._callService('set_active_button', {
            entity_id: this._config.entity,
            button_id: this._buttonId,
            timer_end: timerEndTime,
            duration: durationMinutes
          });
        } catch (e) {
          // Ignore errors
        }
      }
      if (this._config?.mode === 'recirculation') {
        setTimeout(() => { this._weJustTurnedOn = false; }, 500);
      }

      // Schedule turn-off after duration
      this._turnOffTimer = setTimeout(async () => {
        try {
          if (this._hass && this._config && this._config.entity) {
            // If a schedule slot has started and overlaps — let scheduler control turn-off (respects max_runtime)
            if (this._isInsideActiveSlot()) {
              if (this._config.entity && this._entryId) {
                try {
                  await this._callService('clear_active_button', {
                    entity_id: this._config.entity
                  });
                } catch (e) {
                  // Ignore errors
                }
              }
              this._turnOffTimer = null;
              this.render().catch(() => {});
              return;
            }
            await this._hass.callService('switch', 'turn_off', {
              entity_id: this._config.entity
            });
            // Clear active button marker in integration
            if (this._config.entity && this._entryId) {
              try {
                await this._callService('clear_active_button', {
                  entity_id: this._config.entity
                });
              } catch (e) {
                // Ignore errors
              }
            }
            
            // Update entity state to reflect turn-off
            setTimeout(() => {
              if (this._hass && this._config && this._config.entity) {
                this._hass.callService('homeassistant', 'update_entity', {
                  entity_id: this._config.entity
                }).catch(() => {});
                this.hass = { ...this._hass };
              }
            }, 100);
          } else {
          }
        } catch (err) {
          // Ignore errors
        } finally {
          this._turnOffTimer = null;
        }
      }, durationMs);
      
      // Trigger re-render to show active state
      setTimeout(() => {
        this.render().catch(() => {});
      }, 150);
    } catch (err) {
      alert('Failed to run schedule: ' + (err.message || err));
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
      
      // Check if this specific button is the active one (from integration)
      let isThisButtonActive = false;
      if (this._buttonId) {
        try {
          const bridgeState = this._getBridgeState();
          const activeButtons = bridgeState?.attributes?.active_buttons || {};
          const activeButton = activeButtons[this._config.entity];
          if (activeButton && activeButton.button_id === this._buttonId) {
            isThisButtonActive = true;
          }
        } catch (e) {
          // Ignore errors
        }
      }

      // Recirculation fallback: entity is ON but we have no timer (e.g. turned on from outside, or we missed state_changed)
      if (isRecirculation && isEntityOn && !isThisButtonActive && !this._externalRecirculationTimerSet && !this._weJustTurnedOn) {
        this._externalRecirculationTimerSet = true;
        setTimeout(() => this._applyRecirculationTimerFromExternal(), 0);
      }
      
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
      
      // Build recirculation labels
      let recirculationLabelTop = 'Recirculation';
      let recirculationLabelBottom = '';
      
      if (isRecirculation) {
        if (isEntityOn && isThisButtonActive) {
          // Recirculation is running from this button
          recirculationLabelTop = 'Recirculation';
          
          // Get turn-off time
          const turnOffTime = this._getTurnOffTime();
          let targetTime = turnOffTime;
          
          if (!targetTime) {
            // Fallback if no timer_end - calculate expected time
            targetTime = new Date(Date.now() + (this._config.duration * 60 * 1000));
          }
          
          const timeUntil = this._formatTimeUntil(targetTime);
          recirculationLabelBottom = `will be off in ${timeUntil}`;
        } else if (isEntityOn && !isThisButtonActive) {
          // Entity is on, but not from this button (manual or other source)
          recirculationLabelTop = 'Already running';
          const runsSinceText = this._getRunsSinceText();
          recirculationLabelBottom = runsSinceText || '';
        } else {
          // Recirculation is off
          recirculationLabelTop = 'Recirculation';
          const durationParts = this._formatDuration(this._config.duration);
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
  console.info(
    '%c Homie Scheduler %c boiler-button-card',
    'color: white; background:rgb(94, 94, 243); font-weight: 700; border-radius: 5px; padding 10px',
    'color: rgb(94, 94, 243); font-weight: 700;'
  );
}
