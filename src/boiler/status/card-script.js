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
              if (event && event.data) {
                const entityId = event.data.entity_id;
                
                // Handle bridge sensor updates
                if (entityId === this._bridgeSensor) {
                  const newState = event.data.new_state;
                  if (newState && this._hass) {
                    this._hass.states[this._bridgeSensor] = newState;
                    this.hass = { ...this._hass };
                  }
                }
                
                // Handle entity state changes (boiler on/off)
                if (entityId === this._config?.entity) {
                  // Trigger re-render to update status
                  setTimeout(() => {
                    this.render().catch(() => {});
                  }, 100);
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
    
    // Handle auto_off: if not specified, use default 120 minutes; if 0, disable auto-off
    let autoOff = 120; // Default: 2 hours
    if (config.auto_off !== undefined && config.auto_off !== null) {
      autoOff = parseInt(config.auto_off);
      if (isNaN(autoOff)) {
        autoOff = 120; // Fallback to default if invalid value
      }
    }
    
    this._config = {
      entity: config.entity,
      title: config.title || null,
      auto_off: autoOff
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
      
      const nextRun = bridgeState.attributes?.next_run;
      if (!nextRun) return null;
      
      // Parse ISO datetime string
      const nextRunDate = new Date(nextRun);
      if (isNaN(nextRunDate.getTime())) return null;
      
      return nextRunDate;
    } catch (err) {
      return null;
    }
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
          const twoHoursMs = 2 * 60 * 60 * 1000;
          
          if (diffMs > 0 && diffMs < twoHoursMs) {
            // Less than 2 hours - show countdown
            const timeUntil = this._formatTimeUntil(nextRun);
            return `Next run in ${timeUntil}`;
          } else {
            // 2 hours or more - show time
            const timeStr = this._formatDateTime(nextRun);
            return `Next run: ${timeStr}`;
          }
        }
        return 'Next run:';
      }
      return 'Off';
    }
    
    // Entity is on
    if (turnOffTime) {
      const now = Date.now();
      const diffMs = turnOffTime.getTime() - now;
      const twoHoursMs = 2 * 60 * 60 * 1000;
      
      if (diffMs < twoHoursMs) {
        // Less than 2 hours - show countdown
        const timeUntil = this._formatTimeUntil(turnOffTime);
        return `Runs, will be off in ${timeUntil}`;
      } else {
        // 2 hours or more - show time
        const timeStr = this._formatDateTime(turnOffTime);
        return `Runs, will be off ${timeStr}`;
      }
    }
    
    // Entity is on but no timer_end from integration
    // If auto_off is enabled (not 0), calculate expected turn-off time
    if (this._config?.auto_off > 0) {
      // Try to get when entity was turned on to calculate expected turn-off
      // For now, we'll show a generic message or calculate based on auto_off
      // Since we don't track when it was turned on, we'll show a message indicating auto-off is active
      const expectedTurnOff = new Date(Date.now() + (this._config.auto_off * 60 * 1000));
      const timeStr = this._formatDateTime(expectedTurnOff);
      return `Runs, will be off at ${timeStr}`;
    }
    
    // auto_off is 0 or not set (but should be set by default, so this is fallback)
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
        // Turning on - set up auto-off timer if enabled
        await this._hass.callService('switch', 'turn_on', {
          entity_id: this._config.entity
        });
        
        // Set up auto-off timer if auto_off is configured (and > 0)
        if (this._config.auto_off > 0) {
          const durationMinutes = this._config.auto_off;
          const durationMs = durationMinutes * 60 * 1000;
          
          // Clear any existing turn-off timer
          if (this._turnOffTimer) {
            clearTimeout(this._turnOffTimer);
            this._turnOffTimer = null;
          }
          
          // Calculate timer end time
          const timerStartTime = Date.now();
          const timerEndTime = timerStartTime + durationMs;
          
          // Mark as active in integration (via service) if bridge sensor is available
          if (this._entryId) {
            try {
              // Generate a unique button ID for status card
              const buttonId = `status_${this._config.entity}_${Date.now()}`;
              await this._callService('set_active_button', {
                entity_id: this._config.entity,
                button_id: buttonId,
                timer_end: timerEndTime,
                duration: durationMinutes
              });
            } catch (e) {
              // Ignore errors - timer will still work locally
            }
          }
          
          // Schedule turn-off after duration
          this._turnOffTimer = setTimeout(async () => {
            try {
              if (this._hass && this._config && this._config.entity) {
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
              }
            } catch (err) {
              // Ignore errors
            } finally {
              this._turnOffTimer = null;
            }
          }, durationMs);
        }
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
      
      const htmlContent = template
        .replace(/\{\{ICON_BUTTON_CLASS\}\}/g, iconButtonClass)
        .replace(/\{\{TITLE\}\}/g, this._escapeHtml(title))
        .replace(/\{\{SUBTITLE\}\}/g, this._escapeHtml(subtitle));
      
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
