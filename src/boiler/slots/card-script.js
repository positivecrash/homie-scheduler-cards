/**
 * Homie Schedule Slots Card - Development Version
 * 
 * ✏️ SOURCE FILE - EDIT THIS!
 * 
 * This version loads styles from external file card-styles.css
 * Use for development with preview.html
 * 
 * ⚠️ For production run: bash build.sh
 * This will create homie-schedule-slots.js with embedded styles
 */

class HomieBoilerScheduleSlotsCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = null;
    this._hass = null;
    this._entryId = null;
    this._bridgeSensor = null;
    this._debounceTimer = null;
    this._htmlTemplate = null;
    this._expandedSlots = new Set(); // Track expanded slots
    this._secondsTimer = null; // Timer for updating seconds countdown
    this._configError = null; // Store config error message
    this._unsubStateChanged = null; // Unsubscribe function for state_changed events
    this._optimisticBridgeState = null; // Local overlay for optimistic updates (avoids mutating hass.states)
  }

  async _loadTemplate() {
    if (this._htmlTemplate) return this._htmlTemplate;
    
    // Check if templates are embedded in DOM (for preview.html)
    const embeddedTemplates = document.getElementById('embedded-templates');
    if (embeddedTemplates) {
      // Clone the embedded templates to work with
      const clone = embeddedTemplates.cloneNode(true);
      
      // Remove the slot-item-template from clone (we only need main template)
      const slotTemplate = clone.querySelector('template#slot-item-template');
      if (slotTemplate) {
        slotTemplate.remove();
      }
      
      // Get the innerHTML of the clone (main template without slot template)
      this._htmlTemplate = clone.innerHTML.trim();
      
      // Validate that we got some content
      if (this._htmlTemplate && this._htmlTemplate.length > 0) {
        return this._htmlTemplate;
      }
    }
    
    // Try to load from external file (for Home Assistant)
    try {
      const response = await fetch('card-template.html');
      if (response.ok) {
        this._htmlTemplate = await response.text();
        return this._htmlTemplate;
      }
    } catch (e) {
      // CORS or file not found
    }
    
    return null;
  }


  async _loadSlotTemplate() {
    // Check if slot template is embedded in DOM (for preview.html)
    // First check in embedded-templates div
    const embeddedTemplates = document.getElementById('embedded-templates');
    if (embeddedTemplates) {
      const slotTemplateEl = embeddedTemplates.querySelector('template#slot-item-template');
      if (slotTemplateEl) {
        return slotTemplateEl.innerHTML.trim();
      }
    }
    
    // Also check in document root (fallback)
    const slotTemplateEl = document.getElementById('slot-item-template');
    if (slotTemplateEl) {
      return slotTemplateEl.innerHTML.trim();
    }
    
    // Try to load from main template
    const template = await this._loadTemplate();
    if (!template) {
      return null;
    }
    
    // Extract slot template from main template
    const slotMatch = template.match(/<template id="slot-item-template">([\s\S]*?)<\/template>/);
    if (slotMatch) {
      return slotMatch[1].trim();
    }
    
    // Also try to extract from embedded-templates if template loading failed
    if (embeddedTemplates) {
      const embeddedContent = embeddedTemplates.innerHTML;
      const embeddedSlotMatch = embeddedContent.match(/<template id="slot-item-template">([\s\S]*?)<\/template>/);
      if (embeddedSlotMatch) {
        return embeddedSlotMatch[1].trim();
      }
    }
    
    return null;
  }

  setConfig(config) {
    try {
      // Don't throw error - just show warning in UI
      if (!config || !config.entity) {
        this._config = { 
          entity: null, 
          title: config?.title || 'Water Heater Schedule',
        };
        // Delay error display until shadowRoot is ready
        if (this.shadowRoot) {
          this._showError('Please configure entity in card settings');
        } else {
          // If shadowRoot not ready, will show error in render()
          this._configError = 'Please configure entity in card settings';
        }
        return;
      }
      // Set config
      this._config = {
        ...config
      };
      
      // Normalize duration configuration
      // Support both duration_range: [min, max] and separate min_duration/max_duration
      if (config.duration_range && Array.isArray(config.duration_range) && config.duration_range.length === 2) {
        this._config.min_duration = config.duration_range[0];
        this._config.max_duration = config.duration_range[1];
      } else {
        // Fallback to defaults if not specified
        this._config.min_duration = config.min_duration || 15;
        this._config.max_duration = config.max_duration || 1440;
      }
      // duration_step fallback
      this._config.duration_step = config.duration_step || 15;
      
      this._configError = null;
      if (this._hass && this.shadowRoot) {
        this.render().catch(err => {});
      }
    } catch (err) {
      // Never throw from setConfig - it breaks the editor
      this._config = config || {};
      // Duration configuration defaults with fallback
      if (config?.duration_range && Array.isArray(config.duration_range) && config.duration_range.length === 2) {
        this._config.min_duration = config.duration_range[0];
        this._config.max_duration = config.duration_range[1];
      } else {
        this._config.min_duration = this._config.min_duration || 15;
        this._config.max_duration = this._config.max_duration || 1440;
      }
      this._config.duration_step = this._config.duration_step || 15;
      this._configError = 'Configuration error';
      if (this.shadowRoot) {
        this._showError('Configuration error. Please check card settings.');
      }
    }
  }
  
  _showError(message) {
    // Ensure shadowRoot exists (should be created in constructor, but check anyway)
    if (!this.shadowRoot) {
      try {
        this.attachShadow({ mode: 'open' });
      } catch (e) {
        return;
      }
    }
    
    const errorHtml = `
      <div style="padding: 16px; text-align: center; color: var(--error-color, #f44336);">
        <ha-icon icon="mdi:alert-circle" style="font-size: 48px; margin-bottom: 16px;"></ha-icon>
        <div style="font-size: 16px; font-weight: 500; margin-bottom: 8px;">Configuration Error</div>
        <div style="font-size: 14px; color: var(--secondary-text-color, #888);">${message}</div>
      </div>
    `;
    
    this.shadowRoot.innerHTML = errorHtml;
  }

  set hass(hass) {
    try {
      const wasInitialized = !!this._hass;
      const oldBridgeState = this._hass?.states?.[this._bridgeSensor];
      const oldItems = oldBridgeState?.attributes?.items || [];
      const oldState = oldBridgeState?.state;
      const oldNextRun = oldBridgeState?.attributes?.next_run;
      
      this._hass = hass;
      
      // Find bridge sensor on first hass set
      if (!this._bridgeSensor) {
        this._findBridgeSensor();
      }
      
      if (!this._bridgeSensor) {
        // Bridge sensor not found yet, just render if not initialized
        if (!wasInitialized || !this.shadowRoot.innerHTML) {
          this.render().catch(err => {});
        }
        return;
      }
      
      // Subscribe to state_changed events for bridge sensor (for real-time sync between cards)
      if (this._hass && this._hass.connection && !this._unsubStateChanged) {
        try {
          // subscribeEvents returns a Promise that resolves to an unsubscribe function
          this._hass.connection.subscribeEvents(
            (event) => {
              const entityId = event?.data?.entity_id;
              if (!entityId || entityId !== this._bridgeSensor) return;

              if (event.data && this._hass) {
                this._hass.callService('homeassistant', 'update_entity', {
                  entity_id: this._bridgeSensor
                }).catch(() => {});
                // Poll to clear optimistic when real slot appears (don't force-clear immediately)
                const hadTemp = this._optimisticBridgeState?.attributes?.items?.some(i => i?.id?.startsWith?.('temp-'));
                if (hadTemp) {
                  let attempts = 0;
                  const pollClear = () => {
                    if (!this._optimisticBridgeState?.attributes?.items?.some(i => i?.id?.startsWith?.('temp-'))) return;
                    const fromHass = this._hass?.states?.[this._bridgeSensor]?.attributes?.items || [];
                    const entityId = this._config?.entity;
                    const tempItems = (this._optimisticBridgeState?.attributes?.items || []).filter(i => i?.id?.startsWith?.('temp-'));
                    const realHasSame = tempItems.some(t => fromHass.some(h =>
                      h?.entity_id === entityId && h?.time === t?.time &&
                      JSON.stringify(h?.weekdays || []) === JSON.stringify(t?.weekdays || []) &&
                      !String(h?.id || '').startsWith('temp-')));
                    if (realHasSame) {
                      this._optimisticBridgeState = null;
                      this.hass = { ...this._hass };
                      this.render().catch(() => {});
                    } else if (attempts < 20) {
                      attempts++;
                      setTimeout(pollClear, 500);
                    }
                  };
                  setTimeout(pollClear, 400);
                } else {
                  this._optimisticBridgeState = null;
                  this.hass = { ...this._hass };
                  setTimeout(() => this.hass = { ...this._hass }, 150);
                }
              }
            },
            'state_changed'
          ).then((unsubscribeFn) => {
            // Store the unsubscribe function once Promise resolves
            this._unsubStateChanged = unsubscribeFn;
          }).catch((e) => {
          });
        } catch (e) {
        }
      }
      
      // Check if bridge sensor state or items changed (for synchronization between multiple cards)
      const newBridgeState = this._hass?.states?.[this._bridgeSensor];
      const newItems = newBridgeState?.attributes?.items || [];
      const newState = newBridgeState?.state;
      const newNextRun = newBridgeState?.attributes?.next_run;
      
      // Check if items structure changed (add/delete)
      const itemsStructureChanged = oldItems.length !== newItems.length || 
        oldItems.some((oldItem, idx) => {
          const newItem = newItems[idx];
          return !newItem || oldItem.id !== newItem.id;
        });
      
      // Check if items content changed (for sync between cards)
      // Compare by item ID, not by index (items might be in different order)
      // Also check if any item for THIS entity changed
      const entityId = this._config?.entity;
      const itemsContentChanged = !itemsStructureChanged && oldItems.some((oldItem) => {
        if (!oldItem || !oldItem.id) return false;
        // Only check items for this entity
        if (entityId && oldItem.entity_id !== entityId) return false;
        const newItem = newItems.find(item => item && item.id === oldItem.id);
        if (!newItem) return false;
        return oldItem.enabled !== newItem.enabled ||
               oldItem.time !== newItem.time ||
               oldItem.duration !== newItem.duration ||
               JSON.stringify(oldItem.weekdays || []) !== JSON.stringify(newItem.weekdays || []);
      });
      
      // Check if bridge sensor state changed (enabled/disabled)
      const stateChanged = oldState !== newState;
      
      // Check if next_run changed
      const nextRunChanged = oldNextRun !== newNextRun;
      
      // Full render if: first time, no content, structure changed, state changed, or next_run changed
      if (!wasInitialized || !this.shadowRoot.innerHTML || itemsStructureChanged || stateChanged || nextRunChanged) {
        this.render().catch(err => {});
      } else if (itemsContentChanged) {
        // Items content changed - update all slot elements to sync with other cards
        this._syncSlotsFromBridgeSensor();
      } else {
        // Just update header status if needed (for next_run changes)
        this._updateHeaderStatus();
      }
    } catch (err) {
      // Never throw from setter - it breaks the editorthis._hass = hass;
      if (this.shadowRoot && this._configError) {
        this._showError(this._configError);
      }
    }
  }

  _findBridgeSensor() {
    try {
      if (!this._hass || !this._config || !this._config.entity) return;

      const switchEntity = this._config.entity;
      let firstBridgeSensor = null; // Fallback: use first bridge sensor found
    
      // Search for bridge sensor that contains this entity in entity_ids or items
      for (const entityId in this._hass.states) {
        if (!entityId.startsWith('sensor.')) continue;
        
        try {
          const state = this._hass.states?.[entityId];
          if (!state) continue;
          
          const attrs = state.attributes || {};
          
          // Use only 'homie_scheduler' integration
          if (
            attrs.integration === 'homie_scheduler' &&
            attrs.entry_id
          ) {
            // Remember first bridge sensor as fallback
            if (!firstBridgeSensor) {
              firstBridgeSensor = { entityId, entryId: attrs.entry_id };
            }
            
            // Check if this entry manages the requested entity
            const entityIds = attrs.entity_ids || [];
            const items = attrs.items || [];
            
            // Check if entity is in entity_ids list
            if (entityIds.includes(switchEntity)) {
              this._bridgeSensor = entityId;
              this._entryId = attrs.entry_id;
              return;
            }
            
            // Also check if any item has this entity_id (for cases where entity_ids list is not yet updated)
            const hasEntityInItems = items.some(item => item && item.entity_id === switchEntity);
            if (hasEntityInItems) {
              this._bridgeSensor = entityId;
              this._entryId = attrs.entry_id;
              return;
            }
          }
        } catch (err) {
          // Skip this entity if there's an error - don't break the loop
          continue;
        }
      }
    
      // If no specific bridge sensor found, use first one (for adding first item)
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
      return this._optimisticBridgeState ?? this._hass.states?.[this._bridgeSensor] ?? null;
    } catch (err) {
      return null;
    }
  }

  _getItems() {
    try {
      // Safe check - if no config or entity, return empty array
      if (!this._config || !this._config.entity) {
        return [];
      }
      
      // Filter out temporary slots (created by button, not visible in UI)
      
      const bridgeState = this._getBridgeState();
      const allItems = bridgeState?.attributes?.items || [];
      
      // Filter items by entity_id from config and exclude temporary slots (created by button)
      const entityId = this._config.entity;
      const filtered = allItems.filter(item => {
        if (!item || item.entity_id !== entityId) {
          return false;
        }
        // Exclude temporary slots created by button (strict check)
        if (item.temporary === true) {
          return false;
        }
        return true;
      });
      // Dedupe by (time, weekdays): when both temp and real slot exist, show only one (prefer real)
      const byKey = new Map();
      for (const item of filtered) {
        const key = (item.time || '') + '|' + JSON.stringify(item.weekdays || []);
        const existing = byKey.get(key);
        const isTemp = item.id && String(item.id).startsWith('temp-');
        if (!existing) {
          byKey.set(key, item);
        } else {
          const existingIsTemp = existing.id && String(existing.id).startsWith('temp-');
          if (isTemp && !existingIsTemp) {
            // keep existing (real)
          } else if (!isTemp && existingIsTemp) {
            byKey.set(key, item);
          }
        }
      }
      return Array.from(byKey.values());
    } catch (err) {
      return [];
    }
  }

  _isEnabled() {
    try {
      if (!this._config || !this._config.entity) {
        return false;
      }
      
      const items = this._getItems(); // Already filtered by entity_id
      
      // If no items at all, card is off
      if (!items || items.length === 0) {
        return false;
      }
      
      // Card is enabled if it has at least one enabled slot for this entity
      // Don't rely on bridge sensor state (which is global for all entities)
      return items.some(item => item && item.enabled === true);
    } catch (err) {
      return false;
    }
  }


  _getNextRun() {
    // Calculate next_run for THIS entity from its items (not from bridge sensor)
    // Bridge sensor shows next_run for ALL entities, but we need it for specific entity
    try {
      const items = this._getItems(); // Already filtered by entity_id
      if (!items || items.length === 0) return null;
      
      const now = new Date();
      const candidates = [];
      
      // Calculate next start time for each enabled item
      for (const item of items) {
        if (!item || !item.enabled) continue;
        
        const nextStart = this._calculateNextStart(item, now);
        if (nextStart) {
          const duration = item.duration || null; // Use null if duration not specified
          candidates.push({ date: nextStart, duration });
        }
      }
      
      if (candidates.length === 0) return null;
      
      // Return earliest start time with its duration
      const earliest = candidates.reduce((min, candidate) => 
        candidate.date < min.date ? candidate : min
      );
      
      return this._formatNextRun(earliest.date, earliest.duration);
    } catch (e) {
      return null;
    }
  }

  _calculateNextStart(item, now) {
    // Calculate next start time for an item (same logic as Python _calculate_next_start)
    // Returns Date or null
    try {
      const timeStr = item.time;
      const weekdays = item.weekdays || [];
      
      if (!timeStr || !weekdays || weekdays.length === 0) return null;
      
      // Parse time (HH:MM)
      const timeMatch = timeStr.match(/^([0-1][0-9]|2[0-3]):([0-5][0-9])$/);
      if (!timeMatch) return null;
      
      const hour = parseInt(timeMatch[1], 10);
      const minute = parseInt(timeMatch[2], 10);
      
      // Try next 8 days (today + 7 more days)
      for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
        const candidateDt = new Date(now);
        candidateDt.setDate(candidateDt.getDate() + dayOffset);
        candidateDt.setHours(hour, minute, 0, 0);
        
        // Skip if in the past (including if it's exactly now, we want future)
        if (candidateDt <= now) continue;
        
        // Check if weekday matches
        // JavaScript: 0=Sunday, 1=Monday, ..., 6=Saturday
        // Integration: 0=Monday, 1=Tuesday, ..., 6=Sunday
        // Convert JS weekday to integration weekday
        let jsWeekday = candidateDt.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        let integrationWeekday = jsWeekday === 0 ? 6 : jsWeekday - 1; // 0=Mon, 1=Tue, ..., 6=Sun
        
        if (weekdays.includes(integrationWeekday)) {
          return candidateDt;
        }
      }
      
      return null;
    } catch (e) {
      return null;
    }
  }

  _formatDuration(duration) {
    // Format duration: if > 60 min, show in hours
    if (!duration) return '';
    if (duration > 60) {
      const hours = Math.floor(duration / 60);
      const minutes = duration % 60;
      if (minutes === 0) {
        return ` for ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
      } else {
        return ` for ${hours}h ${minutes}min`;
      }
    } else {
      return ` for ${duration} min`;
    }
  }

  _formatNextRun(date, duration) {
    const now = new Date();
    const diff = date - now;
    
    if (diff < 0) return null;
    
    // Calculate days difference by comparing dates, not milliseconds
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const days = Math.floor((targetDate - nowDate) / (1000 * 60 * 60 * 24));
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    
    // Format time as HH:MM (24-hour format)
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hours}:${mins}`;
    
    // Weekday names (Monday=0, Sunday=6) - matching integration
    // Note: JavaScript getDay() returns 0=Sunday, 6=Saturday
    // But integration uses Python weekday() where 0=Monday, 6=Sunday
    // So we need to adjust: JS Sunday(0) -> Mon(0), JS Monday(1) -> Tue(1), etc.
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    // Duration suffix (from homie-schedule bridge sensor)
    const durationStr = this._formatDuration(duration);
    
    if (days === 0 && seconds < 3600) {
      // Less than 1 hour — show minutes and seconds so countdown updates every second
      const secs = seconds % 60;
      if (minutes === 0) {
        return `in ${seconds}s${durationStr}`;
      }
      return `in ${minutes}m ${secs}s${durationStr}`;
    } else if (days === 0) {
      // Today
      return `Today ${timeStr}${durationStr}`;
    } else if (days === 1) {
      // Tomorrow
      return `Tomorrow ${timeStr}${durationStr}`;
    } else {
      // Future day
      return `${weekdays[date.getDay()]} ${timeStr}${durationStr}`;
    }
  }

  async _callService(service, data) {
    // Safe checks - don't throw errors
    if (!this._hass) {
      return Promise.resolve(); // Resolve silently, don't throw
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
      // Log more details about the error
      if (err.code) {
      }
      if (err.message) {
      }
      // Show user-friendly error message
      const errorMsg = err.message || 'Service call failed';
      
      // Check if it's a service not found error
      if (err.code === 3 || errorMsg.includes('not found') || errorMsg.includes('Unknown service')) {
        alert('Integration service not available. Please check:\n1. Integration is installed\n2. Integration is enabled\n3. Home Assistant is restarted after integration installation');
      } else {
        // Extract user-friendly error message
        let userMsg = errorMsg;
        // Remove technical details if present
        if (userMsg.includes('for dictionary value')) {
          userMsg = userMsg.split('for dictionary value')[0].trim();
        }
        // Remove old validation messages
        if (userMsg.includes('[30, 60]')) {
          userMsg = userMsg.replace(/\[30, 60\]/g, '');
          userMsg = userMsg.replace(/value must be one of/, 'Invalid duration value');
        }
        alert(`Error: ${userMsg}`);
      }
    }
  }

  _debounceUpdate(callback, delay = 500) {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }
    this._debounceTimer = setTimeout(callback, delay);
  }

  async _toggleEnabled() {
    // Check if there are any items - if not, show add popup instead
    const items = this._getItems();
    if (items.length === 0) {
      // No items - show add popup instead of toggling
      this._openAddPopup();
      return;
    }
    
    // Check current state: card is enabled if at least one slot is enabled
    const hasEnabledSlots = items.some(item => item && item.enabled === true);
    const willDisable = hasEnabledSlots;
    const newEnabledState = !willDisable;
    
    // Optimistically update local data and UI for immediate feedback
    if (this._hass && this._bridgeSensor) {
      const bridgeState = this._hass.states[this._bridgeSensor];
      if (bridgeState?.attributes?.items) {
        const allItems = [...bridgeState.attributes.items];
        
        // Update all slots for this entity optimistically
        items.forEach(item => {
          if (item && item.id) {
            const itemIndex = allItems.findIndex(i => i && i.id === item.id);
            if (itemIndex !== -1) {
              const updatedItem = { ...allItems[itemIndex], enabled: newEnabledState };
              allItems[itemIndex] = updatedItem;
              
              // Update UI immediately for each slot
              this._updateSlotElement(item.id, updatedItem);
            }
          }
        });
        
        // Use local overlay for optimistic update (avoids mutating hass.states)
        this._optimisticBridgeState = {
          ...bridgeState,
          attributes: {
            ...bridgeState.attributes,
            items: allItems
          }
        };
        
        // Update header status immediately
        this._updateHeaderStatus();
        
        // Trigger hass update to sync with other cards (optimistic)
        this.hass = { ...this._hass };
        
        // Sync other cards with optimistic state
        this._syncAllCardsForEntity(null, null, this._optimisticBridgeState);
      }
    }
    
    // Then update all slots via service (server is source of truth)
    for (const item of items) {
      if (item && item.id) {
        await this._callService('update_item', {
          id: item.id,
          enabled: newEnabledState
        });
      }
    }
    
    // Force update bridge sensor after toggling all slots - request entity update and sync
    if (this._hass && this._bridgeSensor) {
      // Request entity update from server to get fresh state
      try {
        await this._hass.callService('homeassistant', 'update_entity', {
          entity_id: this._bridgeSensor
        });
      } catch (e) {
      }
      
      // Wait a bit for state to update from server, then trigger full sync
      setTimeout(() => {
        if (this._hass) {
          // Re-fetch state from server and update (this will trigger sync in all cards)
          this.hass = { ...this._hass };
        }
      }, 500);
    }
  }

  _openAddPopup() {
    const popup = this.shadowRoot.getElementById('add-popup');
    if (popup) {
      popup.style.display = 'flex';
      // Reset form
      const hoursSelect = this.shadowRoot.getElementById('popup-time-hours');
      const minutesSelect = this.shadowRoot.getElementById('popup-time-minutes');
      const now = new Date();
      const hour = String(now.getHours()).padStart(2, '0');
      const minute = String(Math.round(now.getMinutes() / 5) * 5).padStart(2, '0');
      if (hoursSelect) hoursSelect.value = hour;
      if (minutesSelect) minutesSelect.value = minute;
      
      // Find duration wrapper specifically in popup (not in slots)
      const popupDurationWrapper = popup.querySelector('.duration-selector-wrapper');
      if (!popupDurationWrapper) {
        return;
      }
      
      
      // Set min, max, step for duration selector FIRST
      const durationInput = popupDurationWrapper.querySelector('[data-action="update-duration"]');
      const durationSlider = popupDurationWrapper.querySelector('[data-action="update-duration-slider"]');
      const minDuration = this._config.min_duration || 15;
      const maxDuration = this._config.max_duration || 1440;
      const durationStep = this._config.duration_step || 15;
      const defaultDuration = minDuration;
      
      
      if (durationInput) {
        durationInput.min = minDuration;
        durationInput.max = maxDuration;
        durationInput.step = durationStep;
        durationInput.value = String(defaultDuration);
        durationInput.setAttribute('value', String(defaultDuration));
      }
      if (durationSlider) {
        durationSlider.min = minDuration;
        durationSlider.max = maxDuration;
        durationSlider.step = durationStep;
        durationSlider.value = String(defaultDuration);
        durationSlider.setAttribute('value', String(defaultDuration));
      }
      
      // Attach duration selector event listeners to popup wrapper specifically
      DurationSelector.attachEventListeners(popupDurationWrapper);
    }
  }

  _closeAddPopup() {
    const popup = this.shadowRoot.getElementById('add-popup');
    if (popup) {
      popup.style.display = 'none';
    }
  }


  async _saveSlot() {
    const hoursSelect = this.shadowRoot.getElementById('popup-time-hours');
    const minutesSelect = this.shadowRoot.getElementById('popup-time-minutes');
    const titleInput = this.shadowRoot.getElementById('popup-title');
    const selectedDays = WeekdaySelector.getSelectedWeekdays(this.shadowRoot);
    
    // Get duration from popup - find wrapper specifically in popup
    const popup = this.shadowRoot.getElementById('add-popup');
    const popupDurationWrapper = popup?.querySelector('.duration-selector-wrapper');
    
    let duration = null;
    if (popupDurationWrapper) {
      duration = DurationSelector.getSelectedDuration(popupDurationWrapper);
    } else {
      duration = DurationSelector.getSelectedDuration(this.shadowRoot);
    }


    if (!hoursSelect || !minutesSelect) {
      return;
    }
    
    if (!duration) {
      alert('Please select a duration');
      return;
    }
    if (selectedDays.length === 0) {
      alert('Please select at least one day');
      return;
    }

    const time = `${hoursSelect.value}:${minutesSelect.value}`;
    const title = titleInput?.value?.trim() || null;

    if (!this._config || !this._config.entity) {
      return;
    }
    
    // Use shared helper to add slot (complete workflow)
    const switchServices = ScheduleHelper.createSwitchServices(this._config.entity);
    
    try {
      await ScheduleHelper.addScheduleSlot({
        hass: this._hass,
        callService: async (service, data) => {
          return await this._callService(service, data);
        },
        getBridgeState: () => this._getBridgeState(),
        entity_id: this._config.entity,
        time: time,
        duration: duration,
        weekdays: selectedDays,
        title: title,
        service_start: switchServices.service_start,
        service_end: switchServices.service_end,
        bridgeSensor: this._bridgeSensor,
        onRender: () => {
          // Use current hass (updated by WebSocket), not stale hass from closure
          this.hass = { ...this._hass };
          this.render().catch(() => {});
        }
      });

      // Optimistic UI: show new slot immediately, clear when real appears (poll, don't force-clear)
      const bridgeState = this._getBridgeState();
      if (bridgeState && bridgeState.attributes) {
        const currentItems = bridgeState.attributes.items || [];
        const alreadyHasSlot = currentItems.some(
          (i) => i && i.entity_id === this._config.entity && i.time === time
        );
        if (!alreadyHasSlot) {
          const newItem = {
            id: 'temp-' + Date.now(),
            entity_id: this._config.entity,
            time,
            duration: parseInt(duration, 10) || duration,
            weekdays: selectedDays,
            enabled: true,
            service_start: switchServices.service_start,
            service_end: switchServices.service_end
          };
          if (title) newItem.title = title;
          const newItems = [...currentItems, newItem];
          this._optimisticBridgeState = {
            ...bridgeState,
            attributes: { ...bridgeState.attributes, items: newItems }
          };
          this.hass = { ...this._hass };
          this._syncAllCardsForEntity(null, null, this._optimisticBridgeState);
          await this.render();
          // Poll until real slot appears (don't force-clear so slot stays visible)
          let attempts = 0;
          const pollClear = () => {
            if (!this._optimisticBridgeState?.attributes?.items?.some(i => i?.id?.startsWith?.('temp-'))) return;
            const fromHass = this._hass?.states?.[this._bridgeSensor]?.attributes?.items || [];
            const entityId = this._config?.entity;
            const tempItems = (this._optimisticBridgeState?.attributes?.items || []).filter(i => i?.id?.startsWith?.('temp-'));
            const realHasSame = tempItems.some(t => fromHass.some(h =>
              h?.entity_id === entityId && h?.time === t?.time &&
              JSON.stringify(h?.weekdays || []) === JSON.stringify(t?.weekdays || []) &&
              !String(h?.id || '').startsWith('temp-')));
            if (realHasSame) {
              this._optimisticBridgeState = null;
              this.hass = { ...this._hass };
              this.render().catch(() => {});
            } else if (attempts < 20) {
              attempts++;
              setTimeout(pollClear, 500);
            }
          };
          setTimeout(pollClear, 500);
        }
      }
    } catch (err) {
      alert('Failed to add slot: ' + (err.message || err));
      return;
    }

    this._closeAddPopup();
  }

  _formatTime(timeStr) {
    // Convert 24h to 12h format for display
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
  }

  async _addItem() {
    // Legacy method - now opens popup
    this._openAddPopup();
  }

  _updateHeaderStatus() {
    // Update header status without full re-render
    try {
      const enabled = this._isEnabled();
      let statusText = enabled ? 'On' : 'Off';
      let needsSecondsTimer = false;
      
      if (enabled) {
        const nextRun = this._getNextRun();
        if (nextRun) {
          statusText = `Next run: ${nextRun}`;
          
          // Update every second when showing countdown ("in Xm Ys" or "in Xs")
          if (nextRun.includes('in ')) {
            needsSecondsTimer = true;
          }
        }
      }
      
      const headerStatus = this.shadowRoot.querySelector('.header-status');
      if (headerStatus) {
        headerStatus.textContent = statusText;
      }
      
      // Update header icon enabled/disabled class
      const headerIcon = this.shadowRoot.querySelector('.header-icon');
      if (headerIcon) {
        if (enabled) {
          headerIcon.classList.add('enabled');
          headerIcon.classList.remove('disabled');
        } else {
          headerIcon.classList.add('disabled');
          headerIcon.classList.remove('enabled');
        }
      }
      
      // Manage seconds countdown timer
      if (needsSecondsTimer && !this._secondsTimer) {
        // Start timer to update every second
        this._secondsTimer = setInterval(() => {
          this._updateHeaderStatus();
        }, 1000);
      } else if (!needsSecondsTimer && this._secondsTimer) {
        // Stop timer if we don't need it anymore
        clearInterval(this._secondsTimer);
        this._secondsTimer = null;
      }
    } catch (err) {}
  }

  _syncSlotsFromBridgeSensor() {
    // Sync all slots from bridge sensor (for synchronization between multiple cards)
    try {
      const items = this._getItems();
      if (!items || items.length === 0) return;
      
      // Get fresh items from bridge sensor to ensure we have latest state
      const bridgeState = this._getBridgeState();
      const allItems = bridgeState?.attributes?.items || [];
      
      items.forEach(item => {
        if (item && item.id) {
          // Find the item in allItems to get the latest state
          const latestItem = allItems.find(i => i && i.id === item.id);
          if (latestItem) {
            this._updateSlotElement(item.id, latestItem);
          } else {
            // Fallback to item from filtered list
            this._updateSlotElement(item.id, item);
          }
        }
      });
      
      // Also update header status
      this._updateHeaderStatus();
    } catch (err) {}
  }
  
  _syncAllCardsForEntity(itemId = null, updatedItem = null, optimisticBridgeState = null) {
    // Sync all cards for the same entity
    if (!window._homieScheduleCards || !this._hass || !this._config?.entity) {
      return;
    }
    
    const currentEntity = this._config.entity;
    
    // Update all other cards with the same entity
    window._homieScheduleCards.forEach(card => {
      // Skip this card (it's already updated)
      if (card === this) return;
      
      // Only sync cards with the same entity
      if (card._config?.entity === currentEntity && card._hass) {
        // Pass optimistic state overlay (avoids mutating hass.states)
        if (optimisticBridgeState) {
          card._optimisticBridgeState = optimisticBridgeState;
        }
        
        // If updating a specific slot, update that slot element directly
        if (itemId && updatedItem && card._updateSlotElement) {
          card._updateSlotElement(itemId, updatedItem);
          card._updateHeaderStatus();
        } else {
          // For delete operations or full sync, force complete re-render
          if (card._syncSlotsFromBridgeSensor) {
            card._syncSlotsFromBridgeSensor();
          }
          if (card.render) {
            card.render().catch(() => {});
          }
        }
        
        card.hass = { ...card._hass };
      }
    });
  }

  _updateSlotElement(itemId, updatedItem) {
    // Update only the changed slot element without full re-render
    const slotCard = this.shadowRoot.querySelector(`[data-item-id="${itemId}"]`);
    if (!slotCard) return;

    // Set flag to prevent event handlers from firing during programmatic updates
    slotCard.dataset.updating = 'true';

    // Update slot name if title changed
    const slotNameEl = slotCard.querySelector('.slot-name');
    if (slotNameEl) {
      const slotNumber = this._getItems().indexOf(updatedItem) + 1;
      const slotName = updatedItem.title || `Slot ${slotNumber}`;
      slotNameEl.textContent = slotName;
    }
    
    // Update title input value if it exists
    const titleInput = slotCard.querySelector('.slot-title-input');
    if (titleInput) {
      titleInput.value = updatedItem.title || '';
    }
    
    // Update slot status text
    const statusEl = slotCard.querySelector('.slot-status');
    if (statusEl) {
      const daysText = WeekdaySelector.formatWeekdays(updatedItem.weekdays);
      const durationStr = this._formatDuration(updatedItem.duration);
      const slotStatus = `${daysText} on ${updatedItem.time}${durationStr}`;
      statusEl.textContent = slotStatus;
    }

    // Update time selects
    const [hours, minutes] = updatedItem.time.split(':');
    const roundedMinutes = String(Math.round(parseInt(minutes || 0) / 5) * 5).padStart(2, '0');
    const hoursSelect = slotCard.querySelector('.slot-time-hours');
    const minutesSelect = slotCard.querySelector('.slot-time-minutes');
    if (hoursSelect && hoursSelect.value !== hours) {
      hoursSelect.value = hours;
    }
    if (minutesSelect && minutesSelect.value !== roundedMinutes) {
      minutesSelect.value = roundedMinutes;
    }

    // Update duration select
    DurationSelector.setDurationInSlot(slotCard, updatedItem.duration, this._config);

    // Update weekday selector state
    WeekdaySelector.setSelectedWeekdays(this.shadowRoot, updatedItem.weekdays, slotCard);

    // Update icon and card classes
    const iconEl = slotCard.querySelector('.slot-icon');
    if (iconEl) {
      iconEl.className = `slot-icon ${updatedItem.enabled ? 'enabled' : 'disabled'}`;
    }
    
    if (updatedItem.enabled) {
      slotCard.classList.remove('disabled');
    } else {
      slotCard.classList.add('disabled');
    }

    // Clear update flag after a short delay
    setTimeout(() => {
      delete slotCard.dataset.updating;
    }, 0);
  }

  async _updateItem(itemId, updates) {
    // Optimistically update local data for immediate UI feedback (using overlay, no hass mutation)
    if (this._hass && this._bridgeSensor) {
      const bridgeState = this._getBridgeState();
      if (bridgeState?.attributes?.items) {
        const items = [...bridgeState.attributes.items];
        const itemIndex = items.findIndex(item => item && item.id === itemId);
        if (itemIndex !== -1) {
          const updatedItem = { ...items[itemIndex], ...updates };
          items[itemIndex] = updatedItem;
          
          this._optimisticBridgeState = {
            ...bridgeState,
            attributes: {
              ...bridgeState.attributes,
              items: items
            }
          };
          
          this._updateSlotElement(itemId, updatedItem);
          this._updateHeaderStatus();
          this.hass = { ...this._hass };
          this._syncAllCardsForEntity(itemId, updatedItem, this._optimisticBridgeState);
        }
      }
    }
    
    try {
      await this._callService('update_item', {
        id: itemId,
        ...updates
      });
    } catch (err) {
      throw err;
    }
    
    // Request fresh state from server, clear optimistic overlay when real update arrives
    if (this._hass && this._bridgeSensor) {
      try {
        await this._hass.callService('homeassistant', 'update_entity', {
          entity_id: this._bridgeSensor
        });
      } catch (e) {
      }
      
      setTimeout(() => {
        if (this._hass) {
          this._optimisticBridgeState = null;
          this.hass = { ...this._hass };
        }
      }, 100);
      
      setTimeout(() => {
        if (this._hass) {
          this._optimisticBridgeState = null;
          this.hass = { ...this._hass };
        }
      }, 500);
    }
  }

  async _deleteItem(itemId) {
    if (!confirm('Delete this schedule item?')) return;
    await this._callService('delete_item', { id: itemId });
    
    // Force update after deleting item - request entity update and re-render
    if (this._hass && this._bridgeSensor) {
      // Request entity update from server
      try {
        await this._hass.callService('homeassistant', 'update_entity', {
          entity_id: this._bridgeSensor
        });
      } catch (e) {
      }
      
      // Wait for state to update from server, then trigger full re-render
      setTimeout(async () => {
        if (this._hass) {
          // Request fresh state again
          try {
            await this._hass.callService('homeassistant', 'update_entity', {
              entity_id: this._bridgeSensor
            });
          } catch (e) {
          }
          
          // Trigger full re-render
          setTimeout(() => {
            if (this._hass) {
              this._optimisticBridgeState = null;
              this.hass = { ...this._hass };
              this.render().catch(() => {});
              setTimeout(() => {
                this._syncAllCardsForEntity();
              }, 100);
            }
          }, 200);
        }
      }, 500);
    }
  }

  _toggleWeekday(item, day) {
    const weekdays = [...item.weekdays];
    const index = weekdays.indexOf(day);
    
    if (index > -1) {
      if (weekdays.length > 1) {
        weekdays.splice(index, 1);
      } else {
        return; // Don't allow empty weekdays
      }
    } else {
      weekdays.push(day);
      weekdays.sort((a, b) => a - b);
    }
    
    this._updateItem(item.id, { weekdays });
  }

  async render() {
    try {
      // Always check config first - even before hass
      if (!this._config || !this._config.entity) {
        const errorMsg = this._configError || 'Please configure entity in card settings';
        if (this.shadowRoot) {
          this._showError(errorMsg);
        }
        return;
      }
      
      if (!this._hass) {
        // If no hass yet, show placeholder
        if (this.shadowRoot) {
          const placeholderHtml = `
            <div style="padding: 16px; text-align: center; color: var(--secondary-text-color, #888);">
              <ha-icon icon="mdi:loading" style="font-size: 48px; margin-bottom: 16px; animation: spin 1s linear infinite;"></ha-icon>
              <div style="font-size: 14px;">Loading...</div>
            </div>
            <style>
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            </style>
          `;
          this.shadowRoot.innerHTML = placeholderHtml;
        }
        return;
      }

      const items = this._getItems();
    const enabled = this._isEnabled();
    const title = this._config.title || 'Water Heater Scheduler';
    const enabledClass = enabled ? 'enabled' : 'disabled';
    
    // Build status text
    // Use homie-schedule bridge sensor for next run information
    let statusText = enabled ? 'On' : 'Off';
    if (enabled) {
      const nextRun = this._getNextRun();
      if (nextRun) {
        statusText = `Next run: ${nextRun}`;
      }
    }

    // Load styles and MDI font (for dev/preview only)
    // In production, HA provides ha-icon component with built-in MDI support
    const styleLink = `<link rel="stylesheet" href="card-styles.css">`;
    const mdiFontLink = `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@mdi/font@latest/css/materialdesignicons.min.css">`;

    // Prepare template data
    const itemsContentPromises = items.map(item => this._renderItem(item));
    const itemsContent = await Promise.all(itemsContentPromises);
    const itemsContentHtml = itemsContent.join('');
    
    // Load HTML template
    const template = await this._loadTemplate();
    if (!template) {
      this._showError('Failed to load card template. Please refresh the page.');
      return;
    }
    
    // Replace duration placeholders in popup template
    const minDuration = this._config.min_duration || 15;
    const maxDuration = this._config.max_duration || 1440;
    const durationStep = this._config.duration_step || 15;
    const defaultDuration = minDuration;
    
    let processedTemplate = template
      .replace(/\{\{DURATION_MIN\}\}/g, minDuration)
      .replace(/\{\{DURATION_MAX\}\}/g, maxDuration)
      .replace(/\{\{DURATION_STEP\}\}/g, durationStep)
      .replace(/\{\{DURATION_VALUE\}\}/g, defaultDuration)
      .replace(/\{\{ITEM_ID\}\}/g, ''); // Empty for popup
    
    // Get entity name for popup header
    const entityName = this._config?.entity || 'entity';
    const entityState = this._hass?.states?.[entityName];
    const entityDisplayName = entityState?.attributes?.friendly_name || entityName;
    
    // Replace placeholders (icon is now fixed in template)
    const slotsContainerClass = items.length === 0 ? ' slots-container--empty' : '';
    const htmlContent = processedTemplate
      .replace(/\{\{TITLE\}\}/g, title)
      .replace(/\{\{STATUS_TEXT\}\}/g, statusText)
      .replace(/\{\{ENABLED_CLASS\}\}/g, enabledClass)
      .replace(/\{\{SLOTS_CONTAINER_CLASS\}\}/g, slotsContainerClass)
      .replace(/\{\{ITEMS_CONTENT\}\}/g, itemsContentHtml)
      .replace(/\{\{ENTITY_NAME\}\}/g, entityDisplayName);

    // Load MDI font only in dev mode (when running from file:// or localhost)
    // In production (HA), ha-icon component handles icons automatically
    const isDevMode = window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const fontLink = isDevMode ? mdiFontLink : '';
    
      this.shadowRoot.innerHTML = `${fontLink}${styleLink}${htmlContent}`;

      // Attach event listeners
      this._attachEventListeners();
    } catch (err) {
      // Never throw from render - it breaks the editor
      if (this.shadowRoot) {
        this._showError('Error rendering card. Please check configuration.');
      }
    }
  }

  async _renderItem(item) {
    const slotNumber = this._getItems().indexOf(item) + 1;
    
    // Load slot template
    const template = await this._loadSlotTemplate();
    if (!template) {
      // Return empty string to prevent breaking the entire card
      return '';
    }
    
    // Format slot name - use title if available, otherwise "Slot N"
    const slotName = item.title || `Slot ${slotNumber}`;
    
    // Format slot status
    const daysText = WeekdaySelector.formatWeekdays(item.weekdays);
    const durationStr = this._formatDuration(item.duration);
    const slotStatus = `${daysText} on ${item.time}${durationStr}`;
    
    // Prepare time placeholders
    const [hours, minutes] = item.time.split(':');
    const roundedMinutes = String(Math.round(parseInt(minutes || 0) / 5) * 5).padStart(2, '0');
    const timeHoursPlaceholders = {};
    const timeMinutesPlaceholders = {};
    for (let i = 0; i < 24; i++) {
      const hourStr = String(i).padStart(2, '0');
      timeHoursPlaceholders[`TIME_HOURS_${hourStr}`] = hourStr === hours ? 'selected' : '';
    }
    for (let i = 0; i < 60; i += 5) {
      const minuteStr = String(i).padStart(2, '0');
      timeMinutesPlaceholders[`TIME_MINUTES_${minuteStr}`] = minuteStr === roundedMinutes ? 'selected' : '';
    }

    // Replace placeholders
    const minDuration = this._config.min_duration || 15;
    const maxDuration = this._config.max_duration || 1440;
    const durationStep = this._config.duration_step || 15;
    const durationValue = item.duration || minDuration;
    
    let result = template
      .replace(/\{\{ITEM_ID\}\}/g, item.id)
      .replace(/\{\{SLOT_NUMBER\}\}/g, slotNumber)
      .replace(/\{\{SLOT_NAME\}\}/g, slotName)
      .replace(/\{\{SLOT_TITLE\}\}/g, item.title || '')
      .replace(/\{\{DISABLED_CLASS\}\}/g, item.enabled ? '' : 'disabled')
      .replace(/\{\{ICON_CLASS\}\}/g, item.enabled ? 'enabled' : 'disabled')
      .replace(/\{\{SLOT_STATUS\}\}/g, slotStatus)
      .replace(/\{\{ITEM_TIME\}\}/g, item.time)
      .replace(/\{\{DURATION_MIN\}\}/g, minDuration)
      .replace(/\{\{DURATION_MAX\}\}/g, maxDuration)
      .replace(/\{\{DURATION_STEP\}\}/g, durationStep)
      .replace(/\{\{DURATION_VALUE\}\}/g, durationValue);
    
    // Replace time hour placeholders
    for (let i = 0; i < 24; i++) {
      const hourStr = String(i).padStart(2, '0');
      result = result.replace(new RegExp(`\\{\\{TIME_HOURS_${hourStr}\\}\\}`, 'g'), timeHoursPlaceholders[`TIME_HOURS_${hourStr}`]);
    }
    
    // Replace time minute placeholders
    for (let i = 0; i < 60; i += 5) {
      const minuteStr = String(i).padStart(2, '0');
      result = result.replace(new RegExp(`\\{\\{TIME_MINUTES_${minuteStr}\\}\\}`, 'g'), timeMinutesPlaceholders[`TIME_MINUTES_${minuteStr}`]);
    }
    
    // Create a temporary DOM element to set weekday selector state
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = result;
    const slotCard = tempDiv.querySelector(`[data-item-id="${item.id}"]`);
    if (slotCard) {
      WeekdaySelector.setSelectedWeekdays(tempDiv, item.weekdays, slotCard);
      result = tempDiv.innerHTML;
    }
    
    return result;
  }

  _attachEventListeners() {
    // Toggle enabled - click on header icon
    const toggleButton = this.shadowRoot.querySelector('[data-action="toggle-enabled"]');
    if (toggleButton) {
      toggleButton.addEventListener('click', () => this._toggleEnabled());
      toggleButton.style.cursor = 'pointer';
    }

    // Add button - open popup
    const addButton = this.shadowRoot.querySelector('[data-action="open-add-popup"]');
    if (addButton) {
      addButton.addEventListener('click', () => this._openAddPopup());
    }

    // Popup close buttons
    this.shadowRoot.querySelectorAll('[data-action="close-popup"]').forEach(btn => {
      btn.addEventListener('click', () => this._closeAddPopup());
    });

    // Popup overlay click to close
    const popupOverlay = this.shadowRoot.getElementById('add-popup');
    if (popupOverlay) {
      popupOverlay.addEventListener('click', (e) => {
        if (e.target === popupOverlay) {
          this._closeAddPopup();
    }
      });
    }

    // Popup save button
    const saveButton = this.shadowRoot.querySelector('[data-action="save-slot"]');
    if (saveButton) {
      saveButton.addEventListener('click', () => this._saveSlot());
    }

    // Popup weekday selection - use shared component
    WeekdaySelector.attachEventListeners(this.shadowRoot);
    
    // Popup duration selection - NOT here, it's attached in _openAddPopup() when popup opens
    // This prevents duplicate event listeners and ensures values are set correctly

    // Item actions
    const slotCards = this.shadowRoot.querySelectorAll('.slot-card');
    slotCards.forEach(itemEl => {
      const itemId = itemEl.dataset.itemId;
      const items = this._getItems();
      const item = items.find(i => i.id === itemId);
      if (!item) return;

      // Toggle item enabled (via icon)
      const itemIcon = itemEl.querySelector('.slot-icon[data-action="toggle-item"]');
      if (itemIcon) {
        itemIcon.addEventListener('click', () => {
          // Get fresh item data on each click to ensure we have current state
          const currentItems = this._getItems();
          const currentItem = currentItems.find(i => i.id === itemId);
          if (currentItem) {
            this._updateItem(itemId, { enabled: !currentItem.enabled });
          }
        });
      }

      // Toggle expand/collapse
      const expandBtn = itemEl.querySelector('[data-action="toggle-expand"]');
      if (expandBtn) {
        expandBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isExpanded = itemEl.classList.contains('expanded');
          if (isExpanded) {
            itemEl.classList.remove('expanded');
            this._expandedSlots.delete(itemId);
          } else {
            itemEl.classList.add('expanded');
            this._expandedSlots.add(itemId);
          }
          const icon = expandBtn.querySelector('ha-icon');
          if (icon) {
            icon.setAttribute('icon', itemEl.classList.contains('expanded') ? 'mdi:chevron-up' : 'mdi:chevron-down');
          }
        });
      }

      // Restore expanded state if it was expanded before
      if (this._expandedSlots.has(itemId)) {
        itemEl.classList.add('expanded');
        const icon = expandBtn?.querySelector('ha-icon');
        if (icon) {
          icon.setAttribute('icon', 'mdi:chevron-up');
        }
      }

      // Prevent clicks inside expandable from closing it
      const expandable = itemEl.querySelector('.slot-expandable');
      if (expandable) {
        expandable.addEventListener('click', (e) => {
          e.stopPropagation();
        });
      }

      // Delete item
      const deleteBtn = itemEl.querySelector('[data-action="delete-item"]');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._deleteItem(itemId);
        });
      }

      // Update title input
      const titleInput = itemEl.querySelector('.slot-title-input');
      if (titleInput) {
        let titleDebounceTimer = null;
        
        const saveTitleUpdate = (newTitle) => {
          if (itemEl.dataset.updating === 'true') return;
          this._updateItem(itemId, { title: newTitle });
        };
        
        // Auto-save on input with debounce
        titleInput.addEventListener('input', (e) => {
          e.stopPropagation();
          clearTimeout(titleDebounceTimer);
          const newTitle = e.target.value.trim() || null;
          titleDebounceTimer = setTimeout(() => {
            saveTitleUpdate(newTitle);
          }, 600); // 600ms delay
        });
        
        // Also save on blur (immediate)
        titleInput.addEventListener('blur', (e) => {
          e.stopPropagation();
          clearTimeout(titleDebounceTimer); // Cancel pending debounced save
          const newTitle = e.target.value.trim() || null;
          saveTitleUpdate(newTitle);
        });
        
        titleInput.addEventListener('click', (e) => {
          e.stopPropagation();
        });
      }
      
      // Update time - hours and minutes selects
      const hoursSelect = itemEl.querySelector('.slot-time-hours');
      const minutesSelect = itemEl.querySelector('.slot-time-minutes');
      
      if (hoursSelect) {
        const hoursHandler = (e) => {
          if (itemEl.dataset.updating === 'true') return;
          e.stopPropagation();
          const currentItems = this._getItems();
          const currentItem = currentItems.find(i => i.id === itemId);
          if (!currentItem) return;
          const [oldHours, oldMinutes] = currentItem.time.split(':');
          const newTime = `${e.target.value}:${oldMinutes}`;
          this._updateItem(itemId, { time: newTime });
        };
        const newHoursSelect = hoursSelect.cloneNode(true);
        hoursSelect.parentNode.replaceChild(newHoursSelect, hoursSelect);
        newHoursSelect.addEventListener('change', hoursHandler);
        newHoursSelect.addEventListener('click', (e) => {
          e.stopPropagation();
        });
        const [hours] = item.time.split(':');
        newHoursSelect.value = hours;
      }
      
      if (minutesSelect) {
        const minutesHandler = (e) => {
          if (itemEl.dataset.updating === 'true') return;
          e.stopPropagation();
          const currentItems = this._getItems();
          const currentItem = currentItems.find(i => i.id === itemId);
          if (!currentItem) return;
          const [oldHours, oldMinutes] = currentItem.time.split(':');
          const newTime = `${oldHours}:${e.target.value}`;
          this._updateItem(itemId, { time: newTime });
        };
        const newMinutesSelect = minutesSelect.cloneNode(true);
        minutesSelect.parentNode.replaceChild(newMinutesSelect, minutesSelect);
        newMinutesSelect.addEventListener('change', minutesHandler);
        newMinutesSelect.addEventListener('click', (e) => {
          e.stopPropagation();
        });
        const [, minutes] = item.time.split(':');
        const roundedMinutes = String(Math.round(parseInt(minutes || 0) / 5) * 5).padStart(2, '0');
        newMinutesSelect.value = roundedMinutes;
      }

      // Update duration - use shared component
      // First, set the initial duration value
      DurationSelector.setDurationInSlot(itemEl, item.duration, this._config);
      // Then attach event listeners
      DurationSelector.attachEventListenersInSlot(itemEl, (duration) => {
        if (itemEl.dataset.updating === 'true') return;
        this._updateItem(itemId, { duration });
      }, this._config);

      // Weekday selector - use shared component
      // Attach event listeners for this specific slot's weekday selector
      // NOTE: In slots, weekday selector is NOT wrapped in .popup-field (unlike in popup)
      
      // Check if weekday selector exists BEFORE attachEventListeners
      const modeBtnsBefore = itemEl.querySelectorAll('.weekday-mode-btn');
      const weekdayBtnsBefore = itemEl.querySelectorAll('.popup-weekday');
      
      // In slots, weekday selector is directly in itemEl, not in .popup-field
      if (modeBtnsBefore.length > 0 || weekdayBtnsBefore.length > 0) {
        // Function to update weekdays
        const updateWeekdays = () => {
          if (itemEl.dataset.updating === 'true') {
            return;
          }
          
          const currentItems = this._getItems();
          const currentItem = currentItems.find(i => i.id === itemId);
          if (!currentItem) {
            return;
          }
          
          // Query weekday selector state
          // Debug: check what getSelectedWeekdays sees
          const activeModeBtn = itemEl.querySelector('.weekday-mode-btn.active');
          const mode = activeModeBtn ? activeModeBtn.dataset.mode : 'everyday';
          const customDays = itemEl.querySelectorAll('.popup-weekday.active');const selectedWeekdays = WeekdaySelector.getSelectedWeekdays(itemEl);
          
          if (selectedWeekdays.length === 0) {
            // Don't allow empty weekdays - restore previous state
            WeekdaySelector.setSelectedWeekdays(itemEl, currentItem.weekdays, itemEl);
            return;
          }
          
          // Only update if weekdays actually changed
          const currentWeekdaysSorted = (currentItem.weekdays || []).slice().sort();
          const selectedWeekdaysSorted = selectedWeekdays.slice().sort();
          const weekdaysChanged = JSON.stringify(selectedWeekdaysSorted) !== JSON.stringify(currentWeekdaysSorted);if (weekdaysChanged) {
            this._updateItem(itemId, { weekdays: selectedWeekdays });
          } else {
          }
        };
        
        // First, attach shared component listeners (this handles mode buttons and custom weekdays)
        // This will clone elements, so we need to add our handlers AFTER
        WeekdaySelector.attachEventListeners(itemEl);
        
        // Check elements AFTER attachEventListeners
        const modeBtnsAfter = itemEl.querySelectorAll('.weekday-mode-btn');
        const weekdayBtnsAfter = itemEl.querySelectorAll('.popup-weekday');
        
        // Add handlers directly to the CLONED elements (after attachEventListeners)
        // Use retry mechanism to ensure elements are ready
        const addWeekdayHandlers = () => {
          const modeBtns = itemEl.querySelectorAll('.weekday-mode-btn');
          const weekdayBtns = itemEl.querySelectorAll('.popup-weekday');
          
          
          if (modeBtns.length === 0 && weekdayBtns.length === 0) {
            setTimeout(addWeekdayHandlers, 50);
            return;
          }
          
          
          // Add handler to mode buttons
          modeBtns.forEach((btn, index) => {
            // Remove any existing handlers by cloning
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            // Add WeekdaySelector handler first
            newBtn.addEventListener('click', (e) => {
              const scope = newBtn.closest('.slot-card') || itemEl;
              scope.querySelectorAll('.weekday-mode-btn').forEach(b => b.classList.remove('active'));
              newBtn.classList.add('active');
              const mode = newBtn.dataset.mode;
              
              // Find custom weekdays - search in slot card (not popup-field, as slots don't have it)
              const slotCard = newBtn.closest('.slot-card') || itemEl;
              let customWeekdays = slotCard.querySelector('#popup-weekdays-custom') || slotCard.querySelector('.popup-weekdays');
              
              
              if (mode === 'everyday' || mode === 'weekdays') {
                if (customWeekdays) {
                  customWeekdays.classList.add('hidden');
                }
              } else {
                // Custom mode - show and set active days from current item
                if (customWeekdays) {
                  customWeekdays.classList.remove('hidden');
                  
                  // Get current item weekdays and set them as active
                  const currentItems = this._getItems();
                  const currentItem = currentItems.find(i => i.id === itemId);
                  if (currentItem && currentItem.weekdays) {
                    // Set active state for days that are in currentItem.weekdays
                    slotCard.querySelectorAll('.popup-weekday').forEach(dayEl => {
                      const day = parseInt(dayEl.dataset.day);
                      if (currentItem.weekdays.includes(day)) {
                        dayEl.classList.add('active');
                      } else {
                        dayEl.classList.remove('active');
                      }
                    });
                  }
                } else {
                }
              }
            });
            
            // Then add our update handler
            newBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              setTimeout(updateWeekdays, 100);
            });
          });
          
          // Add handler to custom weekday buttons
          weekdayBtns.forEach((dayEl, index) => {
            // Remove any existing handlers by cloning
            const newDayEl = dayEl.cloneNode(true);
            dayEl.parentNode.replaceChild(newDayEl, dayEl);
            
            // Add WeekdaySelector handler first
            newDayEl.addEventListener('click', (e) => {
              newDayEl.classList.toggle('active');
            });
            
            // Then add our update handler
            newDayEl.addEventListener('click', (e) => {
              e.stopPropagation();
              setTimeout(updateWeekdays, 100);
            });
          });
        };
        
        // Start trying to add handlers - use longer delay to ensure attachEventListeners finished
        setTimeout(() => {
          addWeekdayHandlers();
        }, 100);
      } else {}
    });
  }

  getCardSize() {
    return 3;
  }
  
  connectedCallback() {
    // Register this card instance for cross-card sync
    if (!window._homieScheduleCards) {
      window._homieScheduleCards = new Set();
    }
    window._homieScheduleCards.add(this);
  }
  
  disconnectedCallback() {
    // Card disconnected from DOM - cleanup subscriptions
    if (this._unsubStateChanged) {
      try {
        // Check if it's a function before calling
        if (typeof this._unsubStateChanged === 'function') {
          this._unsubStateChanged();
        } else {
        }
      } catch (e) {
      }
      this._unsubStateChanged = null;
    }
    
    // Unregister this card instance
    if (window._homieScheduleCards) {
      window._homieScheduleCards.delete(this);
    }
    
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    
    // Clear seconds countdown timer
    if (this._secondsTimer) {
      clearInterval(this._secondsTimer);
      this._secondsTimer = null;
    }
  }
}

// Register custom element (safe: skip if already defined)
if (typeof customElements !== 'undefined' && !customElements.get('homie-scheduler-boiler-slots')) {
  customElements.define('homie-scheduler-boiler-slots', HomieBoilerScheduleSlotsCard);
  console.info(
    '%c Homie Scheduler %c boiler-slots-card',
    'color: white; background:rgb(94, 94, 243); font-weight: 700; border-radius: 5px; padding 10px',
    'color: rgb(94, 94, 243); font-weight: 700;'
  );
}
