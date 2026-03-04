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
 *
 * --- ALGORITHM (slots card) ---
 * 1. Data: one entity, bridge sensor. Shows schedule slots (items) for this entity from bridge.
 * 2. Slots come from bridge attributes.items, filtered by entity_id. No link to status or button cards.
 * 3. Max duration for a slot: min(card max_duration, integration entity_max_runtime for this entity)
 *    when integration has it set; otherwise card max_duration only.
 * 4. Add slot: popup with time, weekdays, duration; calls homie_scheduler add_schedule_item (or
 *    helper that updates items). Optimistic UI: show new slot until bridge confirms.
 * 5. Edit/delete slot: update_item/delete_item via integration; _syncAllCardsForEntity updates
 *    only this card's slot DOM (and shared duration selector in slots), not status or button.
 * 6. Next run text: from bridge entity_next_runs or computed from items for this entity.
 * 7. Scheduler on/off: switch.homie_scheduler_enabled; card reflects enabled state.
 */

const SCHEDULER_SWITCH_ENTITY = 'switch.homie_scheduler_enabled';

class HomieBoilerScheduleSlotsCard extends HTMLElement {
  static getStubConfig() {
    return { entity: '', title: 'Schedule' };
  }

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

  /** Normalize duration_range / min_duration / max_duration / duration_step from raw config object. */
  _normalizeDurationConfig(cfg) {
    if (cfg?.duration_range && Array.isArray(cfg.duration_range) && cfg.duration_range.length === 2) {
      cfg.min_duration = cfg.duration_range[0];
      cfg.max_duration = cfg.duration_range[1];
    } else {
      cfg.min_duration = cfg.min_duration || 15;
      cfg.max_duration = cfg.max_duration || 1440;
    }
    cfg.duration_step = cfg.duration_step || 15;
  }

  setConfig(config) {
    try {
      if (!config || !config.entity) {
        this._config = { entity: null, title: config?.title || 'Water Heater Schedule' };
        if (this.shadowRoot) {
          this._showError('Please configure entity in card settings');
        } else {
          this._configError = 'Please configure entity in card settings';
        }
        return;
      }
      this._config = { ...config };
      this._normalizeDurationConfig(this._config);
      this._configError = null;
      if (this._hass && this.shadowRoot) {
        this.render().catch(err => {});
      }
    } catch (err) {
      // Never throw from setConfig - it breaks the editor
      this._config = config || {};
      this._normalizeDurationConfig(this._config);
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
      const oldSchedulerSwitchState = this._hass?.states?.[SCHEDULER_SWITCH_ENTITY]?.state;

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
      
      // Subscribe to state_changed events for bridge sensor and scheduler switch (toggle must react to switch)
      if (this._hass && this._hass.connection && !this._unsubStateChanged) {
        try {
          this._hass.connection.subscribeEvents(
            (event) => {
              const entityId = event?.data?.entity_id;
              if (!entityId) return;
              if (entityId === SCHEDULER_SWITCH_ENTITY) {
                this.hass = { ...this._hass };
                return;
              }
              if (entityId !== this._bridgeSensor) return;

              if (event.data && this._hass) {
                this._hass.callService('homeassistant', 'update_entity', {
                  entity_id: this._bridgeSensor
                }).catch(() => {});
                // Poll to clear optimistic when real slot appears (don't force-clear immediately)
                const hadTemp = this._optimisticBridgeState?.attributes?.items?.some(i => i?.id?.startsWith?.('temp-'));
                if (hadTemp) {
                  this._pollClearTempItems(20, 400);
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
            if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (boiler): subscribeStateChanged failed', e);
          });
        } catch (e) {
          if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (boiler): subscribeStateChanged setup failed', e);
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
      const newSchedulerSwitchState = this._hass?.states?.[SCHEDULER_SWITCH_ENTITY]?.state;
      const schedulerSwitchChanged = oldSchedulerSwitchState !== newSchedulerSwitchState;

      // Check if next_run changed
      const nextRunChanged = oldNextRun !== newNextRun;

      // Full render if: first time, no content, structure changed, state changed, switch toggled, or next_run changed
      if (!wasInitialized || !this.shadowRoot.innerHTML || itemsStructureChanged || stateChanged || schedulerSwitchChanged || nextRunChanged) {
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
    
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (boiler): _resolveBridgeSensor failed', err);
    }
  }

  _getBridgeState() {
    try {
      if (!this._bridgeSensor || !this._hass) return null;
      return this._optimisticBridgeState ?? this._hass.states?.[this._bridgeSensor] ?? null;
    } catch (err) {
      return null;
    }
  }

  /** Max duration for slots: card config capped by integration "Max run time" (entity_max_runtime) for this entity when set. */
  _getEffectiveMaxDuration() {
    const configMax = this._config?.max_duration ?? 1440;
    const bridgeState = this._getBridgeState();
    const entityMaxRuntime = (bridgeState?.attributes?.entity_max_runtime || {})[this._config?.entity];
    if (entityMaxRuntime != null && Number(entityMaxRuntime) > 0) {
      return Math.min(configMax, Number(entityMaxRuntime));
    }
    return configMax;
  }

  /** Returns { minDuration, maxDuration, durationStep } for duration selector — single source of truth. */
  _getDurationConfig() {
    const minDuration = this._config?.min_duration || 15;
    const maxDuration = this._getEffectiveMaxDuration();
    const durationStep = window.DurationSelector?.computeStep?.(minDuration, maxDuration, this._config?.duration_step || 15)
      ?? (this._config?.duration_step || 15);
    return { minDuration, maxDuration, durationStep };
  }

  /** Apply a new items array as optimistic state and trigger UI sync across cards. */
  _applyOptimisticItems(newItems) {
    const bridgeState = this._getBridgeState();
    if (!bridgeState) return;
    this._optimisticBridgeState = { ...bridgeState, attributes: { ...bridgeState.attributes, items: newItems } };
    this._updateHeaderStatus();
    this.hass = { ...this._hass };
    this._syncAllCardsForEntity(null, null, this._optimisticBridgeState);
  }

  /** Return new items array with `updates` applied to items whose id is in `targetIds`. */
  _applyUpdatesToItems(items, targetIds, updates) {
    return items.map(item => item && targetIds.includes(item.id) ? { ...item, ...updates } : item);
  }

  /** Request HA to refresh the bridge sensor. */
  async _refreshBridgeSensor() {
    if (!this._hass || !this._bridgeSensor) return;
    try {
      await this._hass.callService('homeassistant', 'update_entity', { entity_id: this._bridgeSensor });
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (boiler): _refreshBridgeSensor failed', e);
    }
  }

  /** Clear optimistic state and re-trigger hass after `delayMs`. */
  _clearOptimisticAfter(delayMs = 100) {
    setTimeout(() => {
      if (!this._hass) return;
      this._optimisticBridgeState = null;
      this.hass = { ...this._hass };
    }, delayMs);
  }

  /** Poll until temp items are replaced by real items from HA, then clear optimistic state. */
  _pollClearTempItems(maxAttempts = 20, intervalMs = 500) {
    let attempts = 0;
    const poll = () => {
      if (!this._optimisticBridgeState?.attributes?.items?.some(i => i?.id?.startsWith?.('temp-'))) return;
      const fromHass = this._hass?.states?.[this._bridgeSensor]?.attributes?.items || [];
      const entityId = this._config?.entity;
      const tempItems = this._optimisticBridgeState.attributes.items.filter(i => i?.id?.startsWith?.('temp-'));
      const realHasSame = tempItems.some(t => fromHass.some(h =>
        h?.entity_id === entityId && h?.time === t?.time &&
        JSON.stringify(h?.weekdays || []) === JSON.stringify(t?.weekdays || []) &&
        !String(h?.id || '').startsWith('temp-')));
      if (realHasSame) {
        this._optimisticBridgeState = null;
        this.hass = { ...this._hass };
        this.render().catch(() => {});
      } else if (attempts < maxAttempts) {
        attempts++;
        setTimeout(poll, intervalMs);
      }
    };
    setTimeout(poll, intervalMs);
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
        if (item.temporary === true) {
          return false;
        }
        return true;
      });
      return filtered;
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

  /** True if the scheduler switch is on. Uses switch.homie_scheduler_enabled so the toggle stays in sync. */
  _isSchedulerEnabled() {
    try {
      const state = this._hass?.states?.[SCHEDULER_SWITCH_ENTITY]?.state;
      return state === 'on';
    } catch (err) {
      return true;
    }
  }

  /** For display only: enabled only when scheduler is on AND card has enabled slots. */
  _isEnabledForDisplay() {
    return this._isSchedulerEnabled() && this._isEnabled();
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
      if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
      
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
        console.warn('Homie Scheduler (boiler): bridge sensor not found. Check integration is installed and sensor "Scheduler Info" exists.');
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
        console.warn('Homie Scheduler (boiler): Integration service not available.', err.message || err);
      } else {
        let userMsg = errorMsg;
        if (userMsg.includes('for dictionary value')) userMsg = userMsg.split('for dictionary value')[0].trim();
        if (userMsg.includes('[30, 60]')) {
          userMsg = userMsg.replace(/\[30, 60\]/g, '').replace(/value must be one of/, 'Invalid duration value');
        }
        console.warn('Homie Scheduler (boiler):', userMsg, err);
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
    const items = this._getItems();
    if (items.length === 0) { this._openAddPopup(); return; }

    const bridgeState = this._getBridgeState();
    const allItems = bridgeState?.attributes?.items;
    if (!allItems) return;

    const itemIds = items.map(i => i?.id).filter(Boolean);

    if (!this._isSchedulerEnabled()) {
      // Scheduler off: enable all slots for this entity, then turn on the scheduler switch
      this._applyOptimisticItems(this._applyUpdatesToItems(allItems, itemIds, { enabled: true }));
      for (const item of items) if (item?.id) await this._callService('update_item', { id: item.id, enabled: true });
      await this._refreshBridgeSensor();
      try {
        await this._hass.callService('switch', 'turn_on', { entity_id: SCHEDULER_SWITCH_ENTITY });
      } catch (e) {
        console.warn('Homie Scheduler: failed to turn on scheduler switch', e);
      }
      this._clearOptimisticAfter(300);
      return;
    }

    // Scheduler on: toggle all slots on↔off
    const newEnabled = !items.some(i => i?.enabled);
    this._applyOptimisticItems(this._applyUpdatesToItems(allItems, itemIds, { enabled: newEnabled }));
    for (const item of items) if (item?.id) await this._callService('update_item', { id: item.id, enabled: newEnabled });
    await this._refreshBridgeSensor();
    this._clearOptimisticAfter(500);
  }

  /** Full match of two items (excluding title): entity_id, time, weekdays, duration. */
  _itemsFullMatch(a, b) {
    if (!a || !b) return false;
    if (a.entity_id !== b.entity_id) return false;
    if ((a.time || '') !== (b.time || '')) return false;
    if (JSON.stringify(a.weekdays || []) !== JSON.stringify(b.weekdays || [])) return false;
    const parseDur = (v) => { const d = parseInt(v, 10); return (v != null && v !== '' && !Number.isNaN(d)) ? d : null; };
    const durA = a.duration == null ? null : parseDur(a.duration);
    const durB = b.duration == null ? null : parseDur(b.duration);
    return durA === durB;
  }

  /** True if items contains an item (id !== excludeId) that fully matches candidate. */
  _findDuplicateItem(items, candidate, excludeId) {
    return items.some(i => i && i.id !== excludeId && i.temporary !== true && this._itemsFullMatch(i, candidate));
  }

  _openAddPopup() {
    const popup = this.shadowRoot.getElementById('add-popup');
    if (popup) {
      const errEl = popup.querySelector('#add-popup-error');
      if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
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
      
      // Allowed values: 5, 10, 15, ... up to max, plus max if not multiple of 5 (e.g. 66, 63)
      const durationInput = popupDurationWrapper.querySelector('[data-action="update-duration"]');
      const durationSlider = popupDurationWrapper.querySelector('[data-action="update-duration-slider"]');
      const { minDuration, maxDuration } = this._getDurationConfig();
      const allowedValues = window.DurationSelector && typeof window.DurationSelector.computeAllowedValues === 'function'
        ? window.DurationSelector.computeAllowedValues(minDuration, maxDuration, 5)
        : (() => { const a = []; for (let i = minDuration; i <= maxDuration; i += 5) a.push(i); if (a[a.length - 1] < maxDuration) a.push(maxDuration); return a; })();
      const defaultDuration = Math.min(minDuration, maxDuration);
      popupDurationWrapper.dataset.durationValues = allowedValues.join(',');
      
      if (durationInput) {
        durationInput.min = minDuration;
        durationInput.max = maxDuration;
        durationInput.step = 1;
        durationInput.value = String(defaultDuration);
        durationInput.setAttribute('value', String(defaultDuration));
      }
      if (durationSlider) {
        durationSlider.min = 0;
        durationSlider.max = Math.max(0, allowedValues.length - 1);
        durationSlider.step = 1;
        const defaultIdx = allowedValues.indexOf(defaultDuration);
        const idx = defaultIdx >= 0 ? defaultIdx : 0;
        durationSlider.value = String(idx);
        durationSlider.setAttribute('value', String(idx));
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
      console.warn('Homie Scheduler (boiler): Please select a duration');
      return;
    }
    if (selectedDays.length === 0) {
      console.warn('Homie Scheduler (boiler): Please select at least one day');
      return;
    }

    const time = `${hoursSelect.value}:${minutesSelect.value}`;
    const title = titleInput?.value?.trim() || null;

    if (!this._config || !this._config.entity) {
      return;
    }

    const entityId = this._config.entity;
    const durationParsed = parseInt(duration, 10);
    const durationNum = (duration != null && duration !== '' && !Number.isNaN(durationParsed)) ? durationParsed : (typeof duration === 'number' ? duration : null);
    const bridgeState = this._getBridgeState();
    const allItems = (bridgeState?.attributes?.items || []).filter(i => i && i.temporary !== true);
    const candidate = { entity_id: entityId, time, weekdays: selectedDays, duration: durationNum };
    if (this._findDuplicateItem(allItems, candidate, null)) {
      const errEl = this.shadowRoot.getElementById('add-popup')?.querySelector('#add-popup-error');
      if (errEl) {
        errEl.textContent = 'A slot with the same time, days and duration already exists.';
        errEl.style.display = 'block';
      }
      return;
    }
    
    const switchServices = ScheduleHelper.createSwitchServices(entityId);
    
    try {
      await ScheduleHelper.addScheduleSlot({
        hass: this._hass,
        callService: async (service, data) => {
          return await this._callService(service, data);
        },
        getBridgeState: () => this._getBridgeState(),
        entity_id: entityId,
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
          (i) => i && i.entity_id === entityId && i.time === time
        );
        if (!alreadyHasSlot) {
          const newItem = {
            id: 'temp-' + Date.now(),
            entity_id: entityId,
            time,
            duration: (duration != null && duration !== '' && !Number.isNaN(parseInt(duration, 10))) ? (parseInt(duration, 10) || duration) : duration,
            weekdays: selectedDays,
            enabled: true,
            service_start: switchServices.service_start,
            service_end: switchServices.service_end
          };
          if (title) newItem.title = title;
          this._optimisticBridgeState = {
            ...bridgeState,
            attributes: { ...bridgeState.attributes, items: [...currentItems, newItem] }
          };
          this.hass = { ...this._hass };
          this._syncAllCardsForEntity(null, null, this._optimisticBridgeState);
          await this.render();
          this._pollClearTempItems();
        }
      }
    } catch (err) {
      console.warn('Homie Scheduler (boiler): Failed to add slot', err.message || err, err);
      return;
    }

    this._closeAddPopup();
  }

  _formatTime(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return '';
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours, 10);
    if (Number.isNaN(h)) return timeStr;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes || '00'} ${ampm}`;
  }

  async _addItem() {
    // Legacy method - now opens popup
    this._openAddPopup();
  }

  _updateHeaderStatus() {
    // Update header status without full re-render (respect scheduler on/off)
    try {
      const enabled = this._isEnabledForDisplay();
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
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (boiler): _updateHeaderStatus failed', err);
    }
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
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (boiler): _syncSlotsFromBridgeSensor failed', err);
    }
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
    const minsVal = parseInt(minutes, 10); const roundedMinutes = String((Number.isNaN(minsVal) ? 0 : Math.round(minsVal / 5) * 5)).padStart(2, '0');
    const hoursSelect = slotCard.querySelector('.slot-time-hours');
    const minutesSelect = slotCard.querySelector('.slot-time-minutes');
    if (hoursSelect && hoursSelect.value !== hours) {
      hoursSelect.value = hours;
    }
    if (minutesSelect && minutesSelect.value !== roundedMinutes) {
      minutesSelect.value = roundedMinutes;
    }

    // Update duration select (config with effective max for allowed values 5,10,...,max)
    const { maxDuration: effectiveMax } = this._getDurationConfig();
    DurationSelector.setDurationInSlot(slotCard, updatedItem.duration, { ...this._config, max_duration: effectiveMax });

    // Update weekday selector state
    WeekdaySelector.setSelectedWeekdays(this.shadowRoot, updatedItem.weekdays, slotCard);

    // Update icon and card classes (scheduler must be on for slot to show as enabled)
    const schedulerOn = this._isSchedulerEnabled();
    const showEnabled = schedulerOn && updatedItem.enabled;
    const iconEl = slotCard.querySelector('.slot-icon');
    if (iconEl) {
      iconEl.className = `slot-icon ${showEnabled ? 'enabled' : 'disabled'}`;
    }
    
    if (showEnabled) {
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
    const bridgeState = this._getBridgeState();
    const slotCard = this.shadowRoot.querySelector(`.slot-card[data-item-id="${itemId}"]`);
    const errEl = slotCard?.querySelector('[data-slot-error]');
    if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }

    const allItems = (bridgeState?.attributes?.items || []).filter(i => i && i.temporary !== true);
    const currentItem = allItems.find(i => i.id === itemId);
    if (currentItem && (updates.time !== undefined || updates.duration !== undefined || updates.weekdays !== undefined)) {
      const wouldBe = { ...currentItem, ...updates };
      if (updates.duration === null || updates.duration === undefined) {
        delete wouldBe.duration;
      } else {
        const d = typeof updates.duration === 'number' ? updates.duration : parseInt(updates.duration, 10);
        wouldBe.duration = (!Number.isNaN(d) && d >= 0) ? d : (currentItem.duration != null ? currentItem.duration : undefined);
      }
      if (this._findDuplicateItem(allItems, wouldBe, itemId)) {
        if (errEl) {
          errEl.textContent = 'A slot with the same time, days and duration already exists.';
          errEl.style.display = 'block';
        }
        return;
      }
    }

    // Optimistic update: immediately reflect changes in UI without waiting for backend
    if (bridgeState?.attributes?.items) {
      const newItems = bridgeState.attributes.items.map(i => i?.id === itemId ? { ...i, ...updates } : i);
      const updatedItem = newItems.find(i => i?.id === itemId);
      this._optimisticBridgeState = { ...bridgeState, attributes: { ...bridgeState.attributes, items: newItems } };
      if (updatedItem) this._updateSlotElement(itemId, updatedItem);
      this._updateHeaderStatus();
      this.hass = { ...this._hass };
      this._syncAllCardsForEntity(itemId, updatedItem, this._optimisticBridgeState);
    }

    await this._callService('update_item', { id: itemId, ...updates });
    await this._refreshBridgeSensor();
    this._clearOptimisticAfter(100);
    this._clearOptimisticAfter(500);
  }

  async _deleteItem(itemId) {
    await this._callService('delete_item', { id: itemId });
    await this._refreshBridgeSensor();
    // Wait for HA to propagate deletion, then force full re-render
    setTimeout(async () => {
      await this._refreshBridgeSensor();
      this._optimisticBridgeState = null;
      this.hass = { ...this._hass };
      this.render().catch(() => {});
      setTimeout(() => this._syncAllCardsForEntity(), 100);
    }, 500);
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
    const enabled = this._isEnabledForDisplay();
    const title = this._config?.title ?? '';
    const headerTitleClass = title ? '' : 'header-title--hidden';
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
    
    // Replace duration placeholders (step computed so slider can reach max)
    const { minDuration, maxDuration, durationStep } = this._getDurationConfig();
    const defaultDuration = Math.min(minDuration, maxDuration);

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
      .replace(/\{\{HEADER_TITLE_CLASS\}\}/g, headerTitleClass)
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
    const slotEnabled = this._isSchedulerEnabled();
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
    const minsVal = parseInt(minutes, 10); const roundedMinutes = String((Number.isNaN(minsVal) ? 0 : Math.round(minsVal / 5) * 5)).padStart(2, '0');
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

    // Replace placeholders (step computed so slider can reach max)
    const { minDuration, maxDuration, durationStep } = this._getDurationConfig();
    const durationValue = item.duration || minDuration;
    
    let result = template
      .replace(/\{\{ITEM_ID\}\}/g, item.id)
      .replace(/\{\{SLOT_NUMBER\}\}/g, slotNumber)
      .replace(/\{\{SLOT_NAME\}\}/g, slotName)
      .replace(/\{\{SLOT_TITLE\}\}/g, item.title || '')
      .replace(/\{\{DISABLED_CLASS\}\}/g, (slotEnabled && item.enabled) ? '' : 'disabled')
      .replace(/\{\{ICON_CLASS\}\}/g, (slotEnabled && item.enabled) ? 'enabled' : 'disabled')
      .replace(/\{\{SLOT_STATUS\}\}/g, slotStatus)
      .replace(/\{\{ITEM_TIME\}\}/g, item.time)
      .replace(/\{\{DURATION_MIN\}\}/g, minDuration)
      .replace(/\{\{DURATION_MAX\}\}/g, maxDuration)
      .replace(/\{\{DURATION_STEP\}\}/g, durationStep)
      .replace(/\{\{DURATION_VALUE\}\}/g, Math.min(durationValue, maxDuration));
    
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
        const minsVal = parseInt(minutes, 10); const roundedMinutes = String((Number.isNaN(minsVal) ? 0 : Math.round(minsVal / 5) * 5)).padStart(2, '0');
        newMinutesSelect.value = roundedMinutes;
      }

      // Update duration - use shared component (allowed values 5,10,...,max)
      const { maxDuration: slotMax } = this._getDurationConfig();
      const durationConfig = { ...this._config, max_duration: slotMax };
      DurationSelector.setDurationInSlot(itemEl, item.duration, durationConfig);
      DurationSelector.attachEventListenersInSlot(itemEl, (duration) => {
        if (itemEl.dataset.updating === 'true') return;
        this._updateItem(itemId, { duration });
      }, durationConfig);

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
                      const day = parseInt(dayEl.dataset.day, 10);
                      if (!Number.isNaN(day) && currentItem.weekdays.includes(day)) {
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
        if (typeof this._unsubStateChanged === 'function') {
          this._unsubStateChanged();
        }
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (boiler): unsubscribe in disconnectedCallback failed', e);
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
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'custom:homie-scheduler-boiler-slots',
    name: 'Homie Scheduler Boiler',
    description: 'Boiler schedule slots card',
    icon: 'https://brands.home-assistant.io/custom_integrations/homie_scheduler/icon.png',
    preview: false
  });
  window.logCardInfo('boiler-slots-card');
}
