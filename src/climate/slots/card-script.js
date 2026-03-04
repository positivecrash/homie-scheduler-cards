/**
 * Homie Climate Schedule Slots Card - Development Version
 * 
 * ✏️ SOURCE FILE - EDIT THIS!
 * 
 * This version loads styles from external file card-styles.css
 * Use for development with preview.html
 * 
 * ⚠️ For production run: bash build.sh
 * This will create homie-scheduler-climate-slots.js with embedded styles
 */

const SCHEDULER_SWITCH_ENTITY = 'switch.homie_scheduler_enabled';

class HomieClimateScheduleSlotsCard extends HTMLElement {
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
    this._expandedSlots = new Set(); // Track expanded slots by key (time|weekdays) so adding/removing entities doesn't collapse
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
    
    // Extract slot template from main template. Use last </template> after open tag
    // so nested <template> (e.g. entities-selector-row-tpl) does not truncate content (e.g. slot-delete button).
    const openTag = '<template id="slot-item-template">';
    const startIdx = template.indexOf(openTag);
    if (startIdx !== -1) {
      const contentStart = startIdx + openTag.length;
      const closeTag = '</template>';
      let lastClose = -1;
      let pos = contentStart;
      for (;;) {
        const idx = template.indexOf(closeTag, pos);
        if (idx === -1) break;
        lastClose = idx;
        pos = idx + closeTag.length;
      }
      if (lastClose !== -1) {
        return template.substring(contentStart, lastClose).trim();
      }
    }
    
    // Also try to extract from embedded-templates if template loading failed
    if (embeddedTemplates) {
      const embeddedContent = embeddedTemplates.innerHTML;
      const embeddedOpenTag = '<template id="slot-item-template">';
      const embeddedStart = embeddedContent.indexOf(embeddedOpenTag);
      if (embeddedStart !== -1) {
        const embContentStart = embeddedStart + embeddedOpenTag.length;
        const closeTag = '</template>';
        let lastClose = -1;
        let pos = embContentStart;
        for (;;) {
          const idx = embeddedContent.indexOf(closeTag, pos);
          if (idx === -1) break;
          lastClose = idx;
          pos = idx + closeTag.length;
        }
        if (lastClose !== -1) {
          return embeddedContent.substring(embContentStart, lastClose).trim();
        }
      }
    }
    
    return null;
  }

  setConfig(config) {
    try {
      if (!config) {
        this._config = { entities: [], title: config?.title || 'Schedule', icon: config?.icon || 'mdi:toggle-switch-variant-off' };
        return;
      }
      const raw = config.entity;
      const entities = Array.isArray(raw) ? raw.filter(Boolean) : (raw ? [raw] : []);
      if (entities.length === 0) {
        this._config = {
          entity: null,
          entities: [],
          title: config.title || 'Schedule',
          icon: config.icon || 'mdi:toggle-switch-variant-off'
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
      this._config = {
        ...config,
        entity: entities[0],
        entities,
        icon: config.icon || 'mdi:toggle-switch-variant-off'
      };
      
      this._normalizeDurationConfig(config, this._config);
      this._configError = null;
      if (this._hass && this.shadowRoot) {
        this.render().catch(err => {});
      }
    } catch (err) {
      // Never throw from setConfig - it breaks the editor
      this._config = config ? { ...config } : {};
      this._normalizeDurationConfig(this._config, this._config);
      this._configError = 'Configuration error';
      if (this.shadowRoot) {
        this._showError('Configuration error. Please check card settings.');
      }
    }
  }
  
  _showError(message) {
    if (!this.shadowRoot) {
      try {
        this.attachShadow({ mode: 'open' });
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): attachShadow failed', e);
        return;
      }
    }
    const raw = String(message != null ? message : '');
    const safeMessage = (window.ScheduleHelper && typeof window.ScheduleHelper.escapeHtml === 'function')
      ? window.ScheduleHelper.escapeHtml(raw)
      : raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const errorHtml = `
      <div style="padding: 16px; text-align: center; color: var(--error-color, #f44336);">
        <ha-icon icon="mdi:alert-circle" style="font-size: 48px; margin-bottom: 16px;"></ha-icon>
        <div style="font-size: 16px; font-weight: 500; margin-bottom: 8px;">Configuration Error</div>
        <div style="font-size: 14px; color: var(--secondary-text-color, #888);">${safeMessage}</div>
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
      
      // Subscribe to state_changed for bridge sensor and scheduler switch (toggle must react to switch)
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
                const hadTemp = this._optimisticBridgeState?.attributes?.items?.some(i => i?.id?.startsWith?.('temp-'));
                if (hadTemp) {
                  let attempts = 0;
                  const pollClear = () => {
                    if (!this._optimisticBridgeState?.attributes?.items?.some(i => i?.id?.startsWith?.('temp-'))) return;
                    const fromHass = this._hass?.states?.[this._bridgeSensor]?.attributes?.items || [];
                    const ourEntities = new Set(this._getEntities());
                    const tempItems = (this._optimisticBridgeState?.attributes?.items || []).filter(i => i?.id?.startsWith?.('temp-'));
                    const realHasSame = tempItems.some(t => fromHass.some(h =>
              ourEntities.has(h?.entity_id) && h?.time === t?.time &&
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
            if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): subscribeStateChanged failed', e);
          });
        } catch (e) {
          if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): subscribeStateChanged setup failed', e);
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
      const ourEntities = new Set(this._getEntities());
      const itemsContentChanged = !itemsStructureChanged && oldItems.some((oldItem) => {
        if (!oldItem || !oldItem.id) return false;
        if (!ourEntities.has(oldItem.entity_id)) return false;
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
      const entities = this._getEntities();
      if (!this._hass || !this._config || entities.length === 0) return;

      const firstEntity = entities[0];
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
            
            const entityIds = attrs.entity_ids || [];
            const items = attrs.items || [];
            if (entityIds.includes(firstEntity)) {
              this._bridgeSensor = entityId;
              this._entryId = attrs.entry_id;
              return;
            }
            const hasEntityInItems = items.some(item => item && item.entity_id === firstEntity);
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
        this._entryId = firstBridgeSensor.entryId;return;
      }
    
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): _resolveBridgeSensor failed', err);
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

  _getEntities() {
    const entities = this._config?.entities;
    if (Array.isArray(entities) && entities.length > 0) return entities;
    const e = this._config?.entity;
    return e ? [e] : [];
  }

  _getItems() {
    try {
      const entities = this._getEntities();
      if (entities.length === 0) return [];
      
      const bridgeState = this._getBridgeState();
      const allItems = bridgeState?.attributes?.items || [];
      
      const entitySet = new Set(entities);
      const filtered = allItems.filter(item => 
        item && 
        entitySet.has(item.entity_id) && 
        item.temporary !== true
      );
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
      if (this._getEntities().length === 0) return false;
      const items = this._getItems();
      
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
          candidates.push({ date: nextStart, duration, item });
        }
      }
      
      if (candidates.length === 0) return null;
      
      // Return earliest start time with its duration and item (for mode extraction)
      const earliest = candidates.reduce((min, candidate) => 
        candidate.date < min.date ? candidate : min
      );
      
      return this._formatNextRun(earliest.date, earliest.duration, earliest.item);
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

  _formatNextRun(date, duration, item = null) {
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
    
    // Get HVAC mode from item for climate entities
    let modePrefix = '';
    if (item && item.service_start && item.service_start.value && item.service_start.value.hvac_mode) {
      const hvacMode = item.service_start.value.hvac_mode;
      modePrefix = `${this._formatHvacModeLabel(hvacMode)}, `;
    }
    
    // Duration suffix (from homie-schedule bridge sensor)
    const durationStr = this._formatDuration(duration);
    
    if (days === 0 && seconds < 3600) {
      // Less than 1 hour
      if (minutes === 0) {
        // Less than 1 minute - show seconds
        return `${modePrefix}in ${seconds}s${durationStr}`;
      }
      return `${modePrefix}in ${minutes}m${durationStr}`;
    } else if (days === 0) {
      // Today
      return `${modePrefix}Today ${timeStr}${durationStr}`;
    } else if (days === 1) {
      // Tomorrow
      return `${modePrefix}Tomorrow ${timeStr}${durationStr}`;
    } else {
      // Future day
      return `${modePrefix}${weekdays[date.getDay()]} ${timeStr}${durationStr}`;
    }
  }

  async _callService(service, data) {
    // Safe checks - don't throw errors
    if (!this._hass) {
      return Promise.resolve(); // Resolve silently, don't throw
    }
    
    if (!this._entryId) {
      // Try to find bridge sensor again
      this._findBridgeSensor();
      if (!this._entryId) {
        return Promise.resolve();
      }
    }
    
    if (!this._config || this._getEntities().length === 0) {
      return Promise.resolve();
    }

    try {
      // Use only 'homie_scheduler' domain
      await this._hass.callService('homie_scheduler', service, {
        entry_id: this._entryId,
        ...data
      });
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
        console.warn('Homie Scheduler (climate): Integration service not available.', err.message || err);
      } else {
        let userMsg = errorMsg;
        if (userMsg.includes('for dictionary value')) userMsg = userMsg.split('for dictionary value')[0].trim();
        if (userMsg.includes('[30, 60]')) {
          userMsg = userMsg.replace(/\[30, 60\]/g, '').replace(/value must be one of/, 'Invalid duration value');
        }
        console.warn('Homie Scheduler (climate):', userMsg, err);
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
    if (items.length === 0) {
      this._openAddPopup();
      return;
    }
    if (!this._isSchedulerEnabled() && this._hass) {
      const bridgeState = this._getBridgeState();
      if (this._bridgeSensor && bridgeState?.attributes?.items) {
        const allItems = [...bridgeState.attributes.items];
        items.forEach(item => {
          if (item?.id) {
            const idx = allItems.findIndex(i => i && i.id === item.id);
            if (idx !== -1) {
              const updated = { ...allItems[idx], enabled: true };
              allItems[idx] = updated;
              this._updateSlotElement(item.id, updated);
            }
          }
        });
        this._optimisticBridgeState = { ...bridgeState, attributes: { ...bridgeState.attributes, items: allItems } };
        this._updateHeaderStatus();
        this.hass = { ...this._hass };
        this._syncAllCardsForEntity(null, null, this._optimisticBridgeState);
      }
      for (const item of items) {
        if (item?.id) await this._callService('update_item', { id: item.id, enabled: true });
      }
      if (this._bridgeSensor) {
        try {
          await this._hass.callService('homeassistant', 'update_entity', { entity_id: this._bridgeSensor });
        } catch (e) {
          if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): update_entity after enable-all failed', e);
        }
      }
      try {
        await this._hass.callService('switch', 'turn_on', { entity_id: SCHEDULER_SWITCH_ENTITY });
      } catch (e) {
        console.warn('Homie Scheduler: failed to turn on scheduler switch', e);
      }
      setTimeout(() => { if (this._hass) this.hass = { ...this._hass }; }, 300);
      return;
    }
    const hasEnabledSlots = items.some(item => item && item.enabled === true);
    const newEnabledState = !hasEnabledSlots;

    if (this._hass && this._bridgeSensor) {
      const bridgeState = this._getBridgeState();
      if (bridgeState?.attributes?.items) {
        const allItems = [...bridgeState.attributes.items];
        items.forEach(item => {
          if (item && item.id) {
            const idx = allItems.findIndex(i => i && i.id === item.id);
            if (idx !== -1) {
              const updated = { ...allItems[idx], enabled: newEnabledState };
              allItems[idx] = updated;
              this._updateSlotElement(item.id, updated);
            }
          }
        });
        this._optimisticBridgeState = {
          ...bridgeState,
          attributes: { ...bridgeState.attributes, items: allItems }
        };
        this._updateHeaderStatus();
        this.hass = { ...this._hass };
        this._syncAllCardsForEntity(null, null, this._optimisticBridgeState);
      }
    }

    for (const item of items) {
      if (item?.id) {
        await this._callService('update_item', { id: item.id, enabled: newEnabledState });
      }
    }

    if (this._hass && this._bridgeSensor) {
      try {
        await this._hass.callService('homeassistant', 'update_entity', { entity_id: this._bridgeSensor });
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): update_entity after toggle failed', e);
      }
      setTimeout(() => { if (this._hass) this.hass = { ...this._hass }; }, 500);
    }
  }

  /** Form root for Add Slot popup (shared form fragment). */
  _getAddFormRoot() {
    const popup = this.shadowRoot.getElementById('add-popup');
    if (!popup) return null;
    return popup.querySelector('[data-slot-form="root"]') || popup;
  }

  /** Entities wrap in Add Slot popup. */
  _getAddFormEntitiesWrap() {
    return this._getAddFormRoot()?.querySelector('[data-slot-form="entities-wrap"]') || null;
  }

  /** Get selected entity IDs from any entities-wrap (add popup or slot edit). */
  _getSelectedEntityIdsFromWrap(wrap, fallbackIds) {
    if (!wrap) return fallbackIds || [];
    const listEl = wrap.querySelector('.entities-selector-list');
    if (!listEl) return fallbackIds || [];
    const checked = listEl.querySelectorAll('input[name="entities-selector-entity"]:checked');
    return Array.from(checked).map(el => el.value);
  }

  _getPopupSelectedEntityIds() {
    const entities = this._getEntities();
    if (entities.length === 0) return [];
    const wrap = this._getAddFormEntitiesWrap();
    if (wrap && wrap.style.display !== 'none') {
      return this._getSelectedEntityIdsFromWrap(wrap, entities);
    }
    return entities;
  }

  /** Returns intersection of hvac_modes for all given entity ids. */
  _getCommonHvacModes(entityIds) {
    if (!this._hass || !entityIds || entityIds.length === 0) return [];
    let common = null;
    for (const eid of entityIds) {
      const state = this._hass.states[eid];
      const modes = state?.attributes?.hvac_modes;
      if (!Array.isArray(modes) || modes.length === 0) return [];
      const set = new Set(modes);
      if (common === null) common = set;
      else common = new Set([...common].filter(m => set.has(m)));
    }
    return common ? [...common] : [];
  }

  /** Refill Mode dropdown from intersection of hvac_modes of selected entities in wrap (add popup or slot edit). */
  _updateModeOptionsForWrap(wrap, modeSelectEl, opts = {}) {
    if (!modeSelectEl || !this._hass) return;
    const fallback = wrap && wrap.getAttribute('data-slot-form') === 'entities-wrap' ? this._getEntities() : [];
    const selectedIds = this._getSelectedEntityIdsFromWrap(wrap, fallback);
    const commonModes = this._getCommonHvacModes(selectedIds);
    const currentValue = modeSelectEl.value;
    modeSelectEl.innerHTML = '';
    if (commonModes.length === 0) {
      modeSelectEl.appendChild(new Option('Off', 'off'));
      modeSelectEl.value = 'off';
    } else {
      commonModes.forEach(mode => {
        const option = document.createElement('option');
        option.value = mode;
        option.textContent = this._formatHvacModeLabel(mode);
        modeSelectEl.appendChild(option);
      });
      const keepCurrent = commonModes.includes(currentValue);
      modeSelectEl.value = keepCurrent ? currentValue : commonModes[0];
    }
    if (opts.syncDurationVisibility) this._syncPopupDurationVisibility();
  }

  _updatePopupModeOptions() {
    const wrap = this._getAddFormEntitiesWrap();
    const hvacModeSelect = this._getAddFormRoot()?.querySelector('[data-slot-form="mode"]');
    this._updateModeOptionsForWrap(wrap, hvacModeSelect, { syncDurationVisibility: true });
  }

  /** Update mode warning and row states for any entities-wrap (add popup or slot edit). warningEl may be null (slot has no warning). */
  _updateModeWarningForWrap(wrap, modeSelectEl, warningEl) {
    if (!modeSelectEl || !this._hass) return;
    const listEl = wrap ? wrap.querySelector('.entities-selector-list') : null;
    const mode = modeSelectEl.value;
    if (!mode) {
      if (warningEl) warningEl.textContent = '';
      if (listEl) listEl.querySelectorAll('.entities-selector-row').forEach(row => { row.classList.remove('entities-selector-row-unsupported'); const inp = row.querySelector('input'); if (inp) inp.disabled = false; });
      return;
    }
    const entities = this._getEntities();
    const fallback = wrap && wrap.getAttribute('data-slot-form') === 'entities-wrap' ? entities : [];
    const selectedIds = this._getSelectedEntityIdsFromWrap(wrap, fallback);
    const unsupportedIds = new Set();
    entities.forEach(entityId => {
      const state = this._hass.states[entityId];
      const modes = state?.attributes?.hvac_modes;
      if (Array.isArray(modes) && !modes.includes(mode)) unsupportedIds.add(entityId);
    });
    const unsupportedNames = selectedIds
      .filter(eid => unsupportedIds.has(eid))
      .map(eid => this._hass.states[eid]?.attributes?.friendly_name || eid);
    if (listEl) {
      listEl.querySelectorAll('.entities-selector-row').forEach(row => {
        const input = row.querySelector('input[name="entities-selector-entity"]');
        if (!input) return;
        const entityId = input.value;
        const unsupported = unsupportedIds.has(entityId);
        row.classList.toggle('entities-selector-row-unsupported', unsupported);
        input.disabled = unsupported;
        if (unsupported) input.checked = false;
      });
    }
    if (warningEl) {
      warningEl.textContent = unsupportedNames.length === 0 ? '' : (unsupportedNames.length === 1
        ? `This mode is not supported for: ${unsupportedNames[0]}`
        : `This mode is not supported for: ${unsupportedNames.join(', ')}`);
    }
    this._updateEntityChipsForWrap(wrap, { updateSlotTitle: !!wrap?.closest?.('.slot-card') });
    const selectAll = wrap?.querySelector?.('.slot-form-entities-select-all');
    if (listEl && selectAll) {
      const all = listEl.querySelectorAll('.entities-selector-row:not(.entities-selector-row-unsupported) input[name="entities-selector-entity"]');
      const checkedCount = Array.from(all).filter(inp => inp.checked).length;
      selectAll.checked = checkedCount === all.length;
      selectAll.indeterminate = checkedCount > 0 && checkedCount < all.length;
    }
  }

  _updateHvacModeWarning() {
    const root = this._getAddFormRoot();
    const wrap = this._getAddFormEntitiesWrap();
    const hvacModeSelect = root?.querySelector('[data-slot-form="mode"]');
    const warningEl = root?.querySelector('[data-slot-form="mode-warning"]');
    this._updateModeWarningForWrap(wrap, hvacModeSelect, warningEl);
  }

  /** When mode is 'off', hide duration in add-popup and clear it (schedule turn-off only). */
  _syncPopupDurationVisibility() {
    const root = this._getAddFormRoot();
    const hvacModeSelect = root?.querySelector('[data-slot-form="mode"]');
    const durationWrapper = root?.querySelector('[data-slot-form="duration-wrapper"]');
    const durationEnabledCheckbox = root?.querySelector('[data-slot-form="duration-enabled"]');
    if (!hvacModeSelect || !durationWrapper) return;
    const popupDurationField = durationWrapper.closest('.slot-form-field');
    if (!popupDurationField) return;
    if (hvacModeSelect.value === 'off') {
      popupDurationField.style.display = 'none';
      if (durationEnabledCheckbox) durationEnabledCheckbox.checked = false;
      durationWrapper.style.display = 'none';
      if (window.DurationSelector) DurationSelector.reset(this.shadowRoot, null);
    } else {
      popupDurationField.style.display = '';
    }
  }

  /** Update chips (and optional slot title) for any entities-wrap (add popup or slot edit). */
  _updateEntityChipsForWrap(wrap, opts = {}) {
    if (!wrap) return;
    const chipsEl = wrap.querySelector('.slot-form-entities-chips');
    const listEl = wrap.querySelector('.entities-selector-list');
    if (!chipsEl || !listEl) return;
    const checked = listEl.querySelectorAll('input[name="entities-selector-entity"]:checked');
    const names = Array.from(checked).map(input => {
      const row = input.closest('.entities-selector-row');
      const nameEl = row && row.querySelector('.entities-selector-entity-name');
      return nameEl ? nameEl.textContent : input.value;
    });
    chipsEl.innerHTML = '';
    names.forEach(name => {
      const chip = document.createElement('span');
      chip.className = 'popup-entity-chip';
      chip.textContent = name;
      chipsEl.appendChild(chip);
    });
    if (opts.updateSlotTitle) this._updateSlotTitleFromEntities(wrap, names);
  }

  _updateEntitiesChips() {
    this._updateEntityChipsForWrap(this._getAddFormEntitiesWrap());
  }

  _updateSlotEntitiesChips(slotEntitiesWrap) {
    this._updateEntityChipsForWrap(slotEntitiesWrap, { updateSlotTitle: true });
  }

  /** Update slot header name and remove button text only when entity list changes; clear first to avoid duplication. */
  _updateSlotTitleFromEntities(slotEntitiesWrap, entityNames) {
    if (!slotEntitiesWrap) return;
    const slotCard = slotEntitiesWrap.closest('.slot-card');
    if (!slotCard) return;
    const nameEl = slotCard.querySelector('.slot-name');
    const removeSpan = slotCard.querySelector('.slot-delete span');
    if (nameEl) nameEl.textContent = '';
    if (removeSpan) removeSpan.textContent = '';
    const slotCards = this.shadowRoot.querySelectorAll('.slot-card');
    const slotNumber = slotCards.length ? Array.from(slotCards).indexOf(slotCard) + 1 : 1;
    const entityLabel = (entityNames && entityNames.length > 0) ? entityNames.join(', ') : '';
    const titleInput = slotCard.querySelector('[data-slot-form="title"]');
    const baseName = (titleInput && titleInput.value.trim()) || `Slot ${slotNumber}`;
    const slotName = baseName + (entityLabel ? ` (${entityLabel})` : '');
    if (nameEl) nameEl.textContent = slotName;
    if (removeSpan) removeSpan.textContent = 'Remove ' + baseName;
  }

  /** Slot edit: delegate to shared mode warning (row states + chips + selectAll). */
  _updateSlotEntitiesForMode(slotEntitiesWrap, itemEl) {
    const hvacSelect = itemEl?.querySelector?.('[data-slot-form="mode"]');
    this._updateModeWarningForWrap(slotEntitiesWrap, hvacSelect, null);
  }

  _entitiesDropdownCloseOnOutside(e) {
    const wrap = this._getAddFormEntitiesWrap();
    const dropdown = wrap?.querySelector('[data-slot-form="entities-dropdown"]');
    const trigger = wrap?.querySelector('[data-slot-form="entities-trigger"]');
    if (!dropdown || !trigger) return;
    if (dropdown.contains(e.target) || trigger.contains(e.target)) return;
    dropdown.classList.remove('open');
    trigger.classList.remove('open');
    document.removeEventListener('click', this._boundEntitiesCloseOnOutside);
  }

  _attachEntitiesDropdownListeners() {
    const wrap = this._getAddFormEntitiesWrap();
    const trigger = wrap?.querySelector('[data-slot-form="entities-trigger"]');
    const dropdown = wrap?.querySelector('[data-slot-form="entities-dropdown"]');
    const selectAll = wrap?.querySelector('[data-slot-form="entities-select-all"]');
    const listEl = dropdown ? dropdown.querySelector('.entities-selector-list') : null;
    if (!trigger || !dropdown) return;

    trigger.onclick = () => {
      const isOpen = dropdown.classList.toggle('open');
      trigger.classList.toggle('open', isOpen);
      if (isOpen) {
        this._updateEntitiesChips();
        this._boundEntitiesCloseOnOutside = this._entitiesDropdownCloseOnOutside.bind(this);
        setTimeout(() => document.addEventListener('click', this._boundEntitiesCloseOnOutside), 0);
      } else {
        document.removeEventListener('click', this._boundEntitiesCloseOnOutside);
      }
    };

    if (!dropdown._entitiesClickStopped) {
      dropdown.addEventListener('click', (e) => e.stopPropagation());
      dropdown._entitiesClickStopped = true;
    }
    if (selectAll && listEl) {
      selectAll.closest('label').onclick = (e) => e.stopPropagation();
      selectAll.onchange = () => {
        const checked = selectAll.checked;
        listEl.querySelectorAll('.entities-selector-row input[name="entities-selector-entity"]:not([disabled])').forEach(inp => { inp.checked = checked; });
        this._updateEntitiesChips();
        this._updatePopupModeOptions();
        this._updateHvacModeWarning();
      };
    }
    if (listEl) {
      listEl.querySelectorAll('input[name="entities-selector-entity"]').forEach(input => {
        input.addEventListener('change', () => {
          const all = listEl.querySelectorAll('.entities-selector-row input[name="entities-selector-entity"]');
          const checkedCount = Array.from(all).filter(inp => inp.checked).length;
          if (selectAll) {
            selectAll.checked = checkedCount === all.length;
            selectAll.indeterminate = checkedCount > 0 && checkedCount < all.length;
          }
          this._updateEntitiesChips();
          this._updatePopupModeOptions();
          this._updateHvacModeWarning();
        });
      });
    }
  }

  _openAddPopup() {
    const popup = this.shadowRoot.getElementById('add-popup');
    const root = this._getAddFormRoot();
    if (popup && root) {
      this._clearAddPopupError();
      popup.style.display = 'flex';
      const hoursSelect = root.querySelector('[data-slot-form="time-hours"]');
      const minutesSelect = root.querySelector('[data-slot-form="time-minutes"]');
      const hvacModeSelect = root.querySelector('[data-slot-form="mode"]');
      const durationEnabledCheckbox = root.querySelector('[data-slot-form="duration-enabled"]');
      const durationWrapper = root.querySelector('[data-slot-form="duration-wrapper"]');
      const entitiesWrap = root.querySelector('[data-slot-form="entities-wrap"]');
      const titleInput = root.querySelector('[data-slot-form="title"]');
      if (titleInput) titleInput.value = '';
      const now = new Date();
      const hour = String(now.getHours()).padStart(2, '0');
      const minute = String(Math.round(now.getMinutes() / 5) * 5).padStart(2, '0');
      if (hoursSelect) hoursSelect.value = hour;
      if (minutesSelect) minutesSelect.value = minute;
      if (durationEnabledCheckbox) durationEnabledCheckbox.checked = false;
      if (durationWrapper) durationWrapper.style.display = 'none';
      DurationSelector.reset(this.shadowRoot, null);

      const entities = this._getEntities();
      const dropdown = entitiesWrap?.querySelector('[data-slot-form="entities-dropdown"]');
      if (dropdown && entities.length > 1) {
        entitiesWrap.style.display = '';
        const trigger = entitiesWrap.querySelector('[data-slot-form="entities-trigger"]');
        if (trigger) trigger.classList.remove('open');
        dropdown.classList.remove('open');
        const selectAllInput = entitiesWrap.querySelector('[data-slot-form="entities-select-all"]');
        if (selectAllInput) { selectAllInput.checked = true; selectAllInput.indeterminate = false; }
        const isEntityDisabled = (entityId) => {
          if (!hvacModeSelect || !hvacModeSelect.value || !this._hass) return false;
          const state = this._hass.states[entityId];
          const modes = state?.attributes?.hvac_modes;
          return Array.isArray(modes) && !modes.includes(hvacModeSelect.value);
        };
        if (window.EntitiesSelector && window.EntitiesSelector.attachEntitiesList) {
          window.EntitiesSelector.attachEntitiesList(dropdown, {
            entities,
            checkedEntityIds: entities,
            hass: this._hass,
            onCheck: () => { this._updateEntitiesChips(); this._updatePopupModeOptions(); this._updateHvacModeWarning(); this._updateAddPopupFanAndTemp(); },
            onUncheck: () => { this._updateEntitiesChips(); this._updatePopupModeOptions(); this._updateHvacModeWarning(); this._updateAddPopupFanAndTemp(); },
            isEntityDisabled
          });
        }
        this._updateEntitiesChips();
        this._updateHvacModeWarning();
        this._attachEntitiesDropdownListeners();
      } else if (entitiesWrap) {
        entitiesWrap.style.display = 'none';
      }

      this._updatePopupModeOptions();
      this._updateHvacModeWarning();
      this._updateAddPopupFanAndTemp();
      this._syncPopupDurationVisibility();
    }
  }

  _updateAddPopupFanAndTemp() {
    const root = this._getAddFormRoot();
    if (!root || !this._hass) return;
    const selectedIds = this._getPopupSelectedEntityIds();
    const entityId = selectedIds.length ? selectedIds[0] : this._getEntities()[0];
    const fanSelect = root.querySelector('[data-slot-form="fan"]');
    const tempInput = root.querySelector('[data-slot-form="temp"]');
    if (!entityId) {
      if (fanSelect) { fanSelect.innerHTML = '<option value="">—</option>'; fanSelect.value = ''; }
      if (tempInput) { tempInput.min = 5; tempInput.max = 35; tempInput.value = 21; tempInput.placeholder = '—'; }
      return;
    }
    const state = this._hass.states[entityId];
    const attrs = state?.attributes || {};
    if (fanSelect) {
      const fanModes = attrs.fan_modes;
      const escape = (window.ScheduleHelper && typeof window.ScheduleHelper.escapeHtml === 'function') ? (s) => window.ScheduleHelper.escapeHtml(s) : (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      if (Array.isArray(fanModes) && fanModes.length) {
        fanSelect.innerHTML = fanModes.map(fm => {
          const label = (fm || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          return `<option value="${escape(fm)}">${escape(label)}</option>`;
        }).join('');
        fanSelect.value = fanModes[0];
      } else {
        fanSelect.innerHTML = '<option value="">—</option>';
        fanSelect.value = '';
      }
    }
    if (tempInput) {
      const min = attrs.min_temp != null ? attrs.min_temp : 5;
      const max = attrs.max_temp != null ? attrs.max_temp : 35;
      const val = attrs.temperature != null ? attrs.temperature : 21;
      tempInput.min = min;
      tempInput.max = max;
      tempInput.step = attrs.target_temp_step ?? 0.5;
      tempInput.value = Math.max(min, Math.min(max, val));
      tempInput.placeholder = '—';
    }
  }

  _showAddPopupError(message) {
    const popup = this.shadowRoot?.getElementById('add-popup');
    const errEl = popup?.querySelector('[data-slot-form="popup-error"]');
    if (errEl) {
      errEl.textContent = message;
      errEl.style.display = '';
    }
  }

  _clearAddPopupError() {
    const popup = this.shadowRoot?.getElementById('add-popup');
    const errEl = popup?.querySelector('[data-slot-form="popup-error"]');
    if (errEl) {
      errEl.textContent = '';
      errEl.style.display = 'none';
    }
  }

  /** True if two weekday arrays share at least one day. */
  _weekdaysOverlap(a, b) {
    const setA = new Set(a || []);
    return (b || []).some(d => setA.has(d));
  }

  /** True if a slot already exists at (time) for any selected entity with at least one weekday overlapping. */
  _hasAddSlotConflict(bridgeState, time, weekdays, selectedEntityIds) {
    const allItems = bridgeState?.attributes?.items || [];
    const entitySet = new Set(selectedEntityIds);
    return allItems.some(i =>
      i && !i.temporary && entitySet.has(i.entity_id) &&
      i.time === time && this._weekdaysOverlap(weekdays, i.weekdays)
    );
  }

  _closeAddPopup() {
    const popup = this.shadowRoot.getElementById('add-popup');
    if (popup) popup.style.display = 'none';
    const wrap = this._getAddFormEntitiesWrap();
    const trigger = wrap?.querySelector('[data-slot-form="entities-trigger"]');
    const dropdown = wrap?.querySelector('[data-slot-form="entities-dropdown"]');
    if (trigger) trigger.classList.remove('open');
    if (dropdown) dropdown.classList.remove('open');
    if (this._boundEntitiesCloseOnOutside) {
      document.removeEventListener('click', this._boundEntitiesCloseOnOutside);
      this._boundEntitiesCloseOnOutside = null;
    }
  }


  async _saveSlot() {
    const popup = this.shadowRoot.getElementById('add-popup');
    const root = popup?.querySelector('[data-slot-form="root"]') || popup;
    if (!root) return;
    const hoursSelect = root.querySelector('[data-slot-form="time-hours"]');
    const minutesSelect = root.querySelector('[data-slot-form="time-minutes"]');
    const hvacModeSelect = root.querySelector('[data-slot-form="mode"]');
    const titleInput = root.querySelector('[data-slot-form="title"]');
    const durationEnabledCheckbox = root.querySelector('[data-slot-form="duration-enabled"]');
    const durationWrapper = root.querySelector('[data-slot-form="duration-wrapper"]');
    const selectedDays = root ? WeekdaySelector.getSelectedWeekdays(root) : [];
    
    let duration = null;
    if (durationEnabledCheckbox && durationEnabledCheckbox.checked && durationWrapper) {
      duration = DurationSelector.getSelectedDuration(durationWrapper);
    }

    if (!hoursSelect || !minutesSelect) return;
    if (selectedDays.length === 0) {
      console.warn('Homie Scheduler (climate): Please select at least one day');
      return;
    }
    
    if (!hvacModeSelect || !hvacModeSelect.value) {
      console.warn('Homie Scheduler (climate): Please select an HVAC mode');
      return;
    }

    const time = `${hoursSelect.value}:${minutesSelect.value}`;
    const hvacMode = hvacModeSelect.value;
    const title = titleInput?.value?.trim() || null;
    // Duration from selector is in hours; API expects minutes
    const durationValue = (hvacMode === 'off') ? null : (ScheduleHelper && ScheduleHelper.durationHoursToMinutes ? ScheduleHelper.durationHoursToMinutes(duration) : (duration != null && duration !== '' ? (() => { const h = parseFloat(duration); return Number.isNaN(h) ? null : Math.round(h * 60); })() : null));

    const entities = this._getEntities();
    if (!this._config || entities.length === 0) return;

    const selectedEntityIds = this._getPopupSelectedEntityIds();
    if (selectedEntityIds.length === 0) {
      console.warn('Homie Scheduler (climate): Please select at least one entity for this slot');
      return;
    }

    this._clearAddPopupError();

    const bridgeState = this._getBridgeState();
    if (this._hasAddSlotConflict(bridgeState, time, selectedDays, selectedEntityIds)) {
      this._showAddPopupError('A slot already exists at this time and days for the selected entities.');
      return;
    }

    const fanSelect = root.querySelector('[data-slot-form="fan"]');
    const tempInput = root.querySelector('[data-slot-form="temp"]');
    const fanMode = fanSelect?.value || undefined;
    let temperature = undefined;
    if (tempInput && tempInput.value !== '' && !Number.isNaN(Number(tempInput.value))) {
      temperature = parseFloat(tempInput.value);
    }
    const climateServicesByEntity = {};
    selectedEntityIds.forEach(eid => {
      climateServicesByEntity[eid] = ScheduleHelper.createClimateServices(eid, hvacMode, { temperature, fan_mode: fanMode });
    });

    try {
      for (const entity_id of selectedEntityIds) {
        const climateServices = climateServicesByEntity[entity_id];
        await ScheduleHelper.addScheduleSlot({
          hass: this._hass,
          callService: async (service, data) => this._callService(service, data),
          getBridgeState: () => this._getBridgeState(),
          entity_id,
          time,
          duration: durationValue,
          weekdays: selectedDays,
          title,
          service_start: climateServices.service_start,
          service_end: durationValue ? climateServices.service_end : null,
          bridgeSensor: this._bridgeSensor,
          onRender: () => {
            this.hass = { ...this._hass };
            this.render().catch(() => {});
          }
        });
      }

      const bridgeState = this._getBridgeState();
      if (bridgeState && bridgeState.attributes) {
        const currentItems = bridgeState.attributes.items || [];
        const alreadyAll = selectedEntityIds.every(eid =>
          currentItems.some(i => i && i.entity_id === eid && i.time === time)
        );
        if (!alreadyAll) {
          const newItems = [...currentItems];
          selectedEntityIds.forEach((eid, idx) => {
            newItems.push({
              id: 'temp-' + Date.now() + '-' + idx,
              entity_id: eid,
              time,
              duration: durationValue,
              weekdays: selectedDays,
              enabled: true,
              service_start: climateServicesByEntity[eid].service_start,
              service_end: durationValue ? climateServicesByEntity[eid].service_end : null,
              ...(title ? { title } : {})
            });
          });
          this._optimisticBridgeState = {
            ...bridgeState,
            attributes: { ...bridgeState.attributes, items: newItems }
          };
          this.hass = { ...this._hass };
          this._syncAllCardsForEntity(null, null, this._optimisticBridgeState);
          await this.render();
          let attempts = 0;
          const pollClear = () => {
            if (!this._optimisticBridgeState?.attributes?.items?.some(i => i?.id?.startsWith?.('temp-'))) return;
            const fromHass = this._hass?.states?.[this._bridgeSensor]?.attributes?.items || [];
            const tempItems = (this._optimisticBridgeState?.attributes?.items || []).filter(i => i?.id?.startsWith?.('temp-'));
            const realHasSame = tempItems.every(t => fromHass.some(h =>
              h?.entity_id === t?.entity_id && h?.time === t?.time &&
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
      console.warn('Homie Scheduler (climate): Failed to add slot', err.message || err, err);
      return;
    }

    this._closeAddPopup();
  }

  /** Climate duration limits (hours): fixed in code, not from dashboard config. */
  static get CLIMATE_DURATION_MIN() { return 0.5; }
  static get CLIMATE_DURATION_MAX() { return 12; }
  static get CLIMATE_DURATION_STEP() { return 0.5; }

  /** Normalize duration_range or min_duration/max_duration into target (climate: hours). Clamped to 0.5–12. */
  _normalizeDurationConfig(source, target) {
    if (!source || !target) return;
    const minH = this.constructor.CLIMATE_DURATION_MIN;
    const maxH = this.constructor.CLIMATE_DURATION_MAX;
    if (source.duration_range && Array.isArray(source.duration_range) && source.duration_range.length === 2) {
      target.min_duration = Math.max(minH, Number(source.duration_range[0]) || minH);
      target.max_duration = Math.min(maxH, Number(source.duration_range[1]) || maxH);
    } else {
      target.min_duration = Math.max(minH, source.min_duration ?? minH);
      target.max_duration = Math.min(maxH, source.max_duration ?? maxH);
    }
    target.duration_step = source.duration_step ?? this.constructor.CLIMATE_DURATION_STEP;
  }

  /** Duration config in hours: fixed 0.5–12, step 0.5 (same role as boiler _getDurationConfig but values hardcoded for climate). */
  _getDurationConfig() {
    const minDuration = this.constructor.CLIMATE_DURATION_MIN;
    const maxDuration = this.constructor.CLIMATE_DURATION_MAX;
    const durationStep = this.constructor.CLIMATE_DURATION_STEP;
    return { minDuration, maxDuration, durationStep };
  }

  /** Display label for HVAC mode: Heat_cool -> Auto, Fan_only -> Fan Only, other_with_underscore -> space + title case */
  _formatHvacModeLabel(mode) {
    if (!mode || typeof mode !== 'string') return mode || '';
    const m = mode.toLowerCase();
    if (m === 'heat_cool') return 'Auto';
    if (mode.includes('_')) {
      return mode.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    }
    return mode.charAt(0).toUpperCase() + mode.slice(1);
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
          
          // Run countdown timer whenever we show relative time ("in 2m", "in 45s") so it updates without reload
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
      if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): _updateHeaderStatus failed', err);
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
      if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): _syncSlotsFromBridgeSensor failed', err);
    }
  }
  
  _syncAllCardsForEntity(itemId = null, updatedItem = null, optimisticBridgeState = null) {
    if (!window._homieScheduleCards || !this._hass || this._getEntities().length === 0) return;
    const ourEntities = new Set(this._getEntities());
    
    window._homieScheduleCards.forEach(card => {
      if (card === this) return;
      const cardEntities = new Set(card._getEntities?.() || []);
      const shouldSync = optimisticBridgeState
        ? ourEntities.size > 0 && [...ourEntities].some(e => cardEntities.has(e))
        : (updatedItem && cardEntities.has(updatedItem.entity_id)) || (!updatedItem && [...ourEntities].some(e => cardEntities.has(e)));
      if (!shouldSync || !card._hass) return;
        if (optimisticBridgeState) {
          card._optimisticBridgeState = optimisticBridgeState;
        }
        
        if (itemId && updatedItem && card._updateSlotElement) {
          card._updateSlotElement(itemId, updatedItem);
          card._updateHeaderStatus();
        } else {
          if (card._syncSlotsFromBridgeSensor) {
            card._syncSlotsFromBridgeSensor();
          }
          if (card.render) {
            card.render().catch(() => {});
          }
        }
        
        card.hass = { ...card._hass };
    });
  }

  _updateSlotElement(itemId, updatedItem) {
    // Update only the changed slot element without full re-render
    const slotCard = this.shadowRoot.querySelector(`[data-item-id="${itemId}"]`);
    if (!slotCard) return;

    // Set flag to prevent event handlers from firing during programmatic updates
    slotCard.dataset.updating = 'true';

    // Update slot status text
    const statusEl = slotCard.querySelector('.slot-status');
    if (statusEl) {
      const daysText = WeekdaySelector.formatWeekdays(updatedItem.weekdays);
      
      // Get HVAC mode from service_start for climate entities
      let statusPrefix = updatedItem.enabled ? 'On' : 'Off';
      if (updatedItem.service_start && updatedItem.service_start.value && updatedItem.service_start.value.hvac_mode) {
        const hvacMode = updatedItem.service_start.value.hvac_mode;
        statusPrefix = updatedItem.enabled ? this._formatHvacModeLabel(hvacMode) : 'Off';
      }
      
      const showDuration = updatedItem.service_start?.value?.hvac_mode !== 'off';
      const durationStr = showDuration ? this._formatDuration(updatedItem.duration) : '';
      const slotStatus = `${statusPrefix}, ${daysText} on ${updatedItem.time}${durationStr}`;
      statusEl.textContent = slotStatus;
    }

    // Update time selects
    const [hours, minutes] = updatedItem.time.split(':');
    const minsNum = parseInt(minutes, 10);
    const roundedMinutes = String((Number.isNaN(minsNum) ? 0 : Math.round(minsNum / 5) * 5)).padStart(2, '0');
    const hoursSelect = slotCard.querySelector('[data-slot-form="time-hours"]');
    const minutesSelect = slotCard.querySelector('[data-slot-form="time-minutes"]');
    if (hoursSelect && hoursSelect.value !== hours) {
      hoursSelect.value = hours;
    }
    if (minutesSelect && minutesSelect.value !== roundedMinutes) {
      minutesSelect.value = roundedMinutes;
    }

    // Duration: keep switch and wrapper in sync with item (only update when not focused in duration input)
    const durationWrapper = slotCard.querySelector('[data-slot-form="duration-wrapper"]');
    const durationEnabledSwitch = slotCard.querySelector('[data-slot-form="duration-enabled"]');
    const currentHvacMode = updatedItem.service_start?.value?.hvac_mode;
    const hasDuration = currentHvacMode !== 'off' && updatedItem.duration != null;
    // Avoid unnecessary programmatic updates that can emit change on ha-switch.
    if (durationEnabledSwitch && durationEnabledSwitch.checked !== !!hasDuration) {
      durationEnabledSwitch.checked = !!hasDuration;
    }
    if (durationWrapper) {
      durationWrapper.style.display = hasDuration ? 'block' : 'none';
      if (hasDuration) {
        const durationInput = durationWrapper.querySelector('[data-action="update-duration"]');
        const activeEl = this.shadowRoot && this.shadowRoot.activeElement;
        if (!durationInput || activeEl !== durationInput) {
          DurationSelector.setDurationInSlot(slotCard, updatedItem.duration != null ? (ScheduleHelper && ScheduleHelper.durationMinutesToHours ? ScheduleHelper.durationMinutesToHours(updatedItem.duration) : updatedItem.duration / 60) : null, this._config);
        }
      }
    }

    // Update HVAC mode select - use data-action selector to match template
    const hvacModeSelect = slotCard.querySelector('[data-slot-form="mode"]');
    if (hvacModeSelect) {
      const currentHvacMode = updatedItem.service_start?.value?.hvac_mode;
      if (currentHvacMode && hvacModeSelect.value !== currentHvacMode) {
        hvacModeSelect.value = currentHvacMode;
        hvacModeSelect.dispatchEvent(new Event('input', { bubbles: false }));
      }
    }

    // Update Fan and Temp from service_start
    const fanSelect = slotCard.querySelector('[data-slot-form="fan"]');
    if (fanSelect && updatedItem.service_start?.value?.fan_mode != null) {
      if (fanSelect.querySelector(`option[value="${updatedItem.service_start.value.fan_mode}"]`)) {
        fanSelect.value = updatedItem.service_start.value.fan_mode;
      }
    }
    const tempInput = slotCard.querySelector('[data-slot-form="temp"]');
    if (tempInput && updatedItem.service_start?.value?.temperature != null) {
      const t = Number(updatedItem.service_start.value.temperature);
      if (!Number.isNaN(t)) tempInput.value = t;
    }

    // Update weekday selector state
    WeekdaySelector.setSelectedWeekdays(this.shadowRoot, updatedItem.weekdays, slotCard);

    // Do not update slot title input from state here — leave whatever the user typed (including trailing space) so editing is not interrupted by trim

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

  /** All item IDs in the same slot (same time + weekdays) for our entities. Used so time/duration/weekdays change applies to all entities in the slot. */
  _getSameSlotItemIds(bridgeState, itemId) {
    const allItems = bridgeState?.attributes?.items || [];
    const item = allItems.find(i => i && i.id === itemId);
    if (!item) return [itemId];
    const entitySet = new Set(this._getEntities());
    const sameSlot = allItems.filter(i =>
      i && i.temporary !== true && entitySet.has(i.entity_id) &&
      i.time === item.time && JSON.stringify(i.weekdays || []) === JSON.stringify(item.weekdays || [])
    );
    return sameSlot.map(i => i.id).filter(Boolean);
  }

  /** True if another slot (different items) exists at (newTime) for the same entity with at least one weekday overlapping. */
  _hasSlotConflictForEdit(bridgeState, itemId, newTime, newWeekdays) {
    const allItems = bridgeState?.attributes?.items || [];
    if (!allItems.length) return false;
    const itemIdsInThisSlot = this._getSameSlotItemIds(bridgeState, itemId);
    const entityIdsInThisSlot = new Set(
      allItems.filter(i => i && itemIdsInThisSlot.includes(i.id)).map(i => i.entity_id).filter(Boolean)
    );
    const hasOtherSlot = allItems.some(i =>
      i && !i.temporary && entityIdsInThisSlot.has(i.entity_id) &&
      i.time === newTime && this._weekdaysOverlap(newWeekdays, i.weekdays) &&
      !itemIdsInThisSlot.includes(i.id)
    );
    return hasOtherSlot;
  }

  _showSlotError(itemId, message) {
    const slotCard = this.shadowRoot?.querySelector(`[data-item-id="${itemId}"]`);
    const errEl = slotCard?.querySelector('[data-slot-error]');
    if (errEl) {
      errEl.textContent = message;
      errEl.style.display = '';
    }
  }

  _clearSlotError(itemId) {
    const slotCard = this.shadowRoot?.querySelector(`[data-item-id="${itemId}"]`);
    const errEl = slotCard?.querySelector('[data-slot-error]');
    if (errEl) {
      errEl.textContent = '';
      errEl.style.display = 'none';
    }
  }

  async _updateItem(itemId, updates) {
    const bridgeState = this._getBridgeState();
    const isSlotWideUpdate = bridgeState && (
      updates.time !== undefined ||
      updates.duration !== undefined ||
      updates.weekdays !== undefined ||
      updates.title !== undefined ||
      updates.enabled !== undefined ||
      updates.service_start !== undefined ||
      updates.service_end !== undefined
    );
    const itemIdsToUpdate = isSlotWideUpdate && bridgeState ? this._getSameSlotItemIds(bridgeState, itemId) : [itemId];

    // When editing time or weekdays: if another slot already exists at that time for these entities, show error and do not save
    if (bridgeState?.attributes?.items && (updates.time !== undefined || updates.weekdays !== undefined)) {
      const currentItem = bridgeState.attributes.items.find(i => i && i.id === itemId);
      if (currentItem) {
        const newTime = updates.time !== undefined ? updates.time : currentItem.time;
        const newWeekdays = updates.weekdays !== undefined ? updates.weekdays : currentItem.weekdays;
        if (this._hasSlotConflictForEdit(bridgeState, itemId, newTime, newWeekdays)) {
          this._showSlotError(itemId, 'A slot already exists at this time and days for the selected entities.');
          return;
        }
        const oldKey = (currentItem.time || '') + '|' + JSON.stringify(currentItem.weekdays || []);
        const newKey = (newTime || '') + '|' + JSON.stringify(newWeekdays || []);
        if (oldKey !== newKey && this._expandedSlots.has(oldKey)) {
          this._expandedSlots.delete(oldKey);
          this._expandedSlots.add(newKey);
        }
      }
    }

    this._clearSlotError(itemId);

    // Optimistically update (using overlay, no hass mutation)
    if (this._hass && this._bridgeSensor && bridgeState?.attributes?.items) {
      const items = [...bridgeState.attributes.items];
      let anyUpdated = false;
      for (const id of itemIdsToUpdate) {
        const itemIndex = items.findIndex(item => item && item.id === id);
        if (itemIndex === -1) continue;
        const currentItem = items[itemIndex];
        const effectiveUpdates = { ...updates };
        // For slot-wide mode updates, bind service payload entity_id to each item's entity.
        if (effectiveUpdates.service_start && effectiveUpdates.service_start.value && currentItem?.entity_id) {
          effectiveUpdates.service_start = {
            ...effectiveUpdates.service_start,
            value: {
              ...effectiveUpdates.service_start.value,
              entity_id: currentItem.entity_id
            }
          };
        }
        if (effectiveUpdates.service_end && effectiveUpdates.service_end.value && currentItem?.entity_id) {
          effectiveUpdates.service_end = {
            ...effectiveUpdates.service_end,
            value: {
              ...effectiveUpdates.service_end.value,
              entity_id: currentItem.entity_id
            }
          };
        }
        const updatedItem = { ...currentItem };
        if (effectiveUpdates.service_start) {
          updatedItem.service_start = effectiveUpdates.service_start;
        }
        if (effectiveUpdates.clear_duration) {
          delete updatedItem.duration;
          delete updatedItem.service_end;
        } else {
          if (effectiveUpdates.service_end !== undefined) {
            if (effectiveUpdates.service_end === null) {
              delete updatedItem.service_end;
            } else {
              updatedItem.service_end = effectiveUpdates.service_end;
            }
          }
        }
        Object.keys(effectiveUpdates).forEach(key => {
          if (key !== 'service_start' && key !== 'service_end' && key !== 'clear_duration') {
            updatedItem[key] = effectiveUpdates[key];
          }
        });
        items[itemIndex] = updatedItem;
        anyUpdated = true;
      }
      if (anyUpdated) {
        this._optimisticBridgeState = {
          ...bridgeState,
          attributes: {
            ...bridgeState.attributes,
            items: items
          }
        };
        // Update all slot cards in the same slot (multi-entity slots have multiple cards)
        const firstUpdated = items.find(i => i && i.id === itemId) || items.find(i => i && itemIdsToUpdate.includes(i.id));
        for (const id of itemIdsToUpdate) {
          const updated = items.find(i => i && i.id === id);
          if (updated) this._updateSlotElement(id, updated);
        }
        this._updateHeaderStatus();
        this.hass = { ...this._hass };
        this._syncAllCardsForEntity(itemId, firstUpdated || bridgeState.attributes.items.find(i => i && i.id === itemId), this._optimisticBridgeState);
      }
    }

    for (const id of itemIdsToUpdate) {
      const current = bridgeState?.attributes?.items?.find(i => i && i.id === id);
      const effectiveUpdates = { ...updates };
      if (effectiveUpdates.service_start && effectiveUpdates.service_start.value && current?.entity_id) {
        effectiveUpdates.service_start = {
          ...effectiveUpdates.service_start,
          value: {
            ...effectiveUpdates.service_start.value,
            entity_id: current.entity_id
          }
        };
      }
      if (effectiveUpdates.service_end && effectiveUpdates.service_end.value && current?.entity_id) {
        effectiveUpdates.service_end = {
          ...effectiveUpdates.service_end,
          value: {
            ...effectiveUpdates.service_end.value,
            entity_id: current.entity_id
          }
        };
      }
      const serviceData = { id, ...effectiveUpdates };
      if (serviceData.duration !== undefined && serviceData.duration !== null && typeof serviceData.duration !== 'number') {
        const d = parseInt(serviceData.duration, 10);
        if (!Number.isNaN(d) && d >= 0) serviceData.duration = d;
      }
      // Integration expects service_end to be a dict when present; omit key when null to avoid schema error
      if (serviceData.service_end === null || serviceData.service_end === undefined) {
        delete serviceData.service_end;
      } else if (typeof serviceData.service_end !== 'object' || serviceData.service_end === null || !('name' in serviceData.service_end) || !('value' in serviceData.service_end)) {
        delete serviceData.service_end;
      }
      await this._callService('update_item', serviceData);
    }
    
    if (this._hass && this._bridgeSensor) {
      try {
        await this._hass.callService('homeassistant', 'update_entity', {
          entity_id: this._bridgeSensor
        });
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): update_entity after _updateItem failed', e);
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
          // Skip full re-render if user is typing in a duration input (would steal focus; focus is inside shadow DOM)
          const activeEl = this.shadowRoot && this.shadowRoot.activeElement;
          const isDurationInput = activeEl && activeEl.getAttribute && activeEl.getAttribute('data-action') === 'update-duration';
          if (!isDurationInput) {
            this.render().catch(() => {});
          }
        }
      }, 500);
    }
  }

  /** Delete all items in the same slot (same time + weekdays) so the whole slot is removed. */
  async _deleteSlot(itemId) {
    const bridgeState = this._getBridgeState();
    const itemIdsToDelete = bridgeState ? this._getSameSlotItemIds(bridgeState, itemId) : [itemId];
    for (const id of itemIdsToDelete) {
      await this._callService('delete_item', { id });
    }
    if (this._hass && this._bridgeSensor) {
      try {
        await this._hass.callService('homeassistant', 'update_entity', {
          entity_id: this._bridgeSensor
        });
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): update_entity after _deleteSlot failed', e);
      }
      setTimeout(() => {
        if (this._hass) {
          try {
            this._hass.callService('homeassistant', 'update_entity', {
              entity_id: this._bridgeSensor
            });
          } catch (e) {
            if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): update_entity (delayed after _deleteSlot) failed', e);
          }
          setTimeout(() => {
            if (this._hass) {
              this._optimisticBridgeState = null;
              this.hass = { ...this._hass };
              this.render().catch(() => {});
              setTimeout(() => this._syncAllCardsForEntity(), 100);
            }
          }, 200);
        }
      }, 500);
    }
  }

  /** Delete a single item (e.g. when user unchecks one entity in the slot). Does not delete the whole slot. */
  async _deleteItem(itemId) {
    await this._callService('delete_item', { id: itemId });
    if (this._hass && this._bridgeSensor) {
      try {
        await this._hass.callService('homeassistant', 'update_entity', {
          entity_id: this._bridgeSensor
        });
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): update_entity after _deleteItem failed', e);
      }
      setTimeout(() => {
        if (this._hass) {
          try {
            this._hass.callService('homeassistant', 'update_entity', {
              entity_id: this._bridgeSensor
            });
          } catch (e) {
            if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): update_entity (delayed after _deleteItem) failed', e);
          }
          setTimeout(() => {
            if (this._hass) {
              this._optimisticBridgeState = null;
              this.hass = { ...this._hass };
              this.render().catch(() => {});
              setTimeout(() => this._syncAllCardsForEntity(), 100);
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
      if (!this._config || this._getEntities().length === 0) {
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
    
    // Get HVAC modes for popup (include 'off' so user can schedule turn-off)
    let hvacModesOptions = '';
    if (this._config && this._config.entity && this._hass) {
      const entityState = this._hass.states[this._config.entity];
      if (entityState && entityState.attributes && entityState.attributes.hvac_modes) {
        const hvacModes = [...entityState.attributes.hvac_modes];
        hvacModesOptions = hvacModes.map(mode => 
          `<option value="${mode}">${this._formatHvacModeLabel(mode)}</option>`
        ).join('');
      }
    }
    if (!hvacModesOptions) {
      // Fallback if entity not found or no modes available
      hvacModesOptions = '<option value="off">Off</option><option value="cool">Cool</option>';
    }
    
    const { minDuration, maxDuration } = this._getDurationConfig();
    const defaultDurationHours = 1;
    let processedTemplate = template
      .replace(/\{\{DURATION_LABEL\}\}/g, 'Duration (hours)')
      .replace(/\{\{DURATION_MIN\}\}/g, minDuration)
      .replace(/\{\{DURATION_MAX\}\}/g, maxDuration)
      .replace(/\{\{DURATION_VALUE\}\}/g, defaultDurationHours)
      .replace(/\{\{ITEM_ID\}\}/g, ''); // Empty for popup
    
    const entities = this._getEntities();
    const entityDisplayName = entities.length > 1
      ? (this._config?.title || `${entities.length} entities`)
      : (this._hass?.states?.[entities[0]]?.attributes?.friendly_name || entities[0] || 'entity');
    
    // Replace placeholders (icon is now fixed in template)
    const htmlContent = processedTemplate
      .replace(/\{\{TITLE\}\}/g, title)
      .replace(/\{\{HEADER_TITLE_CLASS\}\}/g, headerTitleClass)
      .replace(/\{\{STATUS_TEXT\}\}/g, statusText)
      .replace(/\{\{ENABLED_CLASS\}\}/g, enabledClass)
      .replace(/\{\{SLOTS_CONTAINER_CLASS\}\}/g, items.length === 0 ? ' slots-container--empty' : '')
      .replace(/\{\{ITEMS_CONTENT\}\}/g, itemsContentHtml)
      .replace(/\{\{HVAC_MODES_OPTIONS\}\}/g, hvacModesOptions)
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
    
    const entities = this._getEntities();
    const bridgeState = this._getBridgeState();
    const allItems = bridgeState?.attributes?.items || [];
    const entitySet = new Set(entities);
    const sameSlotItems = entities.length > 1 ? allItems.filter(i =>
      i && i.temporary !== true && entitySet.has(i.entity_id) &&
      i.time === item.time && JSON.stringify(i.weekdays || []) === JSON.stringify(item.weekdays || [])
    ) : [];
    let entityLabel = '';
    if (entities.length > 1) {
      const names = sameSlotItems.map(i => this._hass?.states?.[i.entity_id]?.attributes?.friendly_name || i.entity_id);
      entityLabel = names.length > 0 ? names.join(', ') : (this._hass?.states?.[item.entity_id]?.attributes?.friendly_name || item.entity_id);
    }
    const slotTitle = item.title || '';
    const baseName = slotTitle || `Slot ${slotNumber}`;
    const slotName = baseName + (entityLabel ? ` (${entityLabel})` : '');
    
    // Format slot status
    const daysText = WeekdaySelector.formatWeekdays(item.weekdays);
    
    // Get HVAC mode from service_start for climate entities
    let statusPrefix = item.enabled ? 'On' : 'Off';
    let currentHvacMode = null;
    if (item.service_start && item.service_start.value && item.service_start.value.hvac_mode) {
      currentHvacMode = item.service_start.value.hvac_mode;
      statusPrefix = item.enabled ? this._formatHvacModeLabel(currentHvacMode) : 'Off';
    }
    
    const entityForMode = item.entity_id || this._config?.entity;
    let hvacModeOptions = '';
    if (this._config && entityForMode && this._hass) {
      const entityState = this._hass.states[entityForMode];
      if (entityState && entityState.attributes && entityState.attributes.hvac_modes) {
        let hvacModes = [...entityState.attributes.hvac_modes]; // include 'off' to allow schedule turn-off
        if (currentHvacMode && !hvacModes.includes(currentHvacMode)) {
          hvacModes = [currentHvacMode, ...hvacModes];
        }
        hvacModeOptions = hvacModes.map(mode => {
          const selected = currentHvacMode === mode ? 'selected' : '';
          const label = this._formatHvacModeLabel(mode);
          return `<option value="${mode}" ${selected}>${label}</option>`;
        }).join('');
      }
    }
    if (!hvacModeOptions) {
      // Fallback if entity not found or no modes available
      const offSelected = currentHvacMode === 'off' ? 'selected' : '';
      const coolSelected = currentHvacMode === 'cool' ? 'selected' : '';
      hvacModeOptions = `<option value="off" ${offSelected}>Off</option><option value="cool" ${coolSelected}>Cool</option>`;
    }

    // Fan options from entity fan_modes
    let fanOptions = '<option value="">—</option>';
    const currentFanMode = item.service_start?.value?.fan_mode ?? '';
    if (entityForMode && this._hass) {
      const entityState = this._hass.states[entityForMode];
      const fanModes = entityState?.attributes?.fan_modes;
      if (Array.isArray(fanModes) && fanModes.length) {
        fanOptions = fanModes.map(fm => {
          const sel = currentFanMode === fm ? 'selected' : '';
          const label = (fm || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          return `<option value="${fm}" ${sel}>${label}</option>`;
        }).join('');
        if (currentFanMode && !fanModes.includes(currentFanMode)) {
          fanOptions = `<option value="${currentFanMode}" selected>${currentFanMode}</option>` + fanOptions;
        }
      }
    }

    // Temp min/max/value from entity
    let tempMin = 5, tempMax = 35, tempValue = 21;
    if (entityForMode && this._hass) {
      const entityState = this._hass.states[entityForMode];
      const attrs = entityState?.attributes || {};
      if (attrs.min_temp != null) tempMin = attrs.min_temp;
      if (attrs.max_temp != null) tempMax = attrs.max_temp;
      const savedTemp = item.service_start?.value?.temperature;
      if (savedTemp != null && savedTemp !== '') {
        tempValue = Number(savedTemp);
        if (Number.isNaN(tempValue)) tempValue = attrs.temperature ?? 21;
      } else if (attrs.temperature != null) {
        tempValue = attrs.temperature;
      }
      tempValue = Math.max(tempMin, Math.min(tempMax, tempValue));
    }
    
    const showDuration = currentHvacMode !== 'off';
    const durationStr = showDuration ? this._formatDuration(item.duration) : '';
    const slotStatus = `${statusPrefix}, ${daysText} on ${item.time}${durationStr}`;
    
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

    const { minDuration, maxDuration } = this._getDurationConfig();
    const durationValueHours = item.duration != null ? (ScheduleHelper && ScheduleHelper.durationMinutesToHours ? ScheduleHelper.durationMinutesToHours(item.duration) : item.duration / 60) : '';
    
    // Replace placeholders
    let result = template
      .replace(/\{\{ITEM_ID\}\}/g, item.id)
      .replace(/\{\{SLOT_NUMBER\}\}/g, slotNumber)
      .replace(/\{\{SLOT_NAME\}\}/g, slotName)
      .replace(/\{\{SLOT_NAME_REMOVE\}\}/g, baseName)
      .replace(/\{\{SLOT_TITLE\}\}/g, slotTitle)
      .replace(/\{\{DISABLED_CLASS\}\}/g, (slotEnabled && item.enabled) ? '' : 'disabled')
      .replace(/\{\{ICON_CLASS\}\}/g, (slotEnabled && item.enabled) ? 'enabled' : 'disabled')
      .replace(/\{\{SLOT_STATUS\}\}/g, slotStatus)
      .replace(/\{\{ITEM_TIME\}\}/g, item.time)
      .replace(/\{\{DURATION_LABEL\}\}/g, 'Duration (hours)')
      .replace(/\{\{DURATION_MIN\}\}/g, minDuration)
      .replace(/\{\{DURATION_MAX\}\}/g, maxDuration)
      .replace(/\{\{DURATION_VALUE\}\}/g, durationValueHours)
      .replace(/\{\{HVAC_MODE_OPTIONS\}\}/g, hvacModeOptions)
      .replace(/\{\{FAN_OPTIONS\}\}/g, fanOptions)
      .replace(/\{\{TEMP_MIN\}\}/g, tempMin)
      .replace(/\{\{TEMP_MAX\}\}/g, tempMax)
      .replace(/\{\{TEMP_VALUE\}\}/g, tempValue);
    
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
    
    // Create a temporary DOM element to set weekday selector state and verify HVAC mode select
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = result;
    const slotCard = tempDiv.querySelector(`[data-item-id="${item.id}"]`);
    if (slotCard) {
      WeekdaySelector.setSelectedWeekdays(tempDiv, item.weekdays, slotCard);
      
      // Hide duration when mode is 'off' or duration not set
      const durationEl = slotCard.querySelector('[data-slot-form="duration-wrapper"]');
      if (durationEl) {
        if (showDuration && item.duration) {
          durationEl.style.display = '';
        } else {
          durationEl.style.display = 'none';
        }
      }
      
      // Verify and set HVAC mode select value explicitly
      const hvacModeSelect = slotCard.querySelector('[data-slot-form="mode"]');
      if (hvacModeSelect && currentHvacMode) {
        hvacModeSelect.value = currentHvacMode;
      }
      const fanSelect = slotCard.querySelector('[data-slot-form="fan"]');
      if (fanSelect && currentFanMode !== undefined) {
        const opt = Array.from(fanSelect.querySelectorAll('option')).find(o => o.value === currentFanMode);
        if (opt) fanSelect.value = opt.value;
      }
      const tempInput = slotCard.querySelector('[data-slot-form="temp"]');
      if (tempInput) {
        tempInput.value = tempValue;
      }
      
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

    // Popup weekday selection - scope to add form only so Custom opens in popup, not in a slot
    const addRoot = this._getAddFormRoot();
    if (addRoot) WeekdaySelector.attachEventListeners(addRoot);
    
    // Popup duration selection - attach listeners only when wrapper is visible
    // (will be attached when checkbox is checked)
    
    // Duration enabled (ha-switch) - show/hide duration selector (addRoot already from weekday block above)
    const durationEnabledCheckbox = addRoot?.querySelector('[data-slot-form="duration-enabled"]');
    const durationWrapper = addRoot?.querySelector('[data-slot-form="duration-wrapper"]');
    const durationRow = addRoot?.querySelector('.slot-form-duration-row');
    if (durationEnabledCheckbox && durationWrapper) {
      const syncDurationWrapper = () => {
        if (durationEnabledCheckbox.checked) {
          durationWrapper.style.display = 'block';
          const durationInput = durationWrapper.querySelector('[data-action="update-duration"]');
          const durationSlider = durationWrapper.querySelector('[data-action="update-duration-slider"]');
          const { minDuration, maxDuration } = this._getDurationConfig();
          if (durationInput) {
            durationInput.min = minDuration;
            durationInput.max = maxDuration;
            durationInput.step = '0.5';
          }
          if (durationSlider) {
            durationSlider.min = minDuration;
            durationSlider.max = maxDuration;
            durationSlider.step = '0.5';
          }
          DurationSelector.setSelectedDuration(durationWrapper, minDuration);
          DurationSelector.attachEventListeners(durationWrapper);
        } else {
          durationWrapper.style.display = 'none';
          DurationSelector.reset(durationWrapper, null);
        }
      };
      durationEnabledCheckbox.addEventListener('change', () => syncDurationWrapper());
      if (durationRow) {
        durationRow.addEventListener('click', (e) => {
          if (e.target.closest('ha-switch')) return;
          e.preventDefault();
          durationEnabledCheckbox.checked = !durationEnabledCheckbox.checked;
          durationEnabledCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }
    }

    const hvacModeSelect = addRoot?.querySelector('[data-slot-form="mode"]');
    if (hvacModeSelect) {
      hvacModeSelect.addEventListener('change', () => {
        this._updateHvacModeWarning();
        this._syncPopupDurationVisibility();
      });
    }
    this._syncPopupDurationVisibility();
    
    // Ensure Everyday is active in popup after attaching listeners (reset only popup form, not slots)
    const popup = this.shadowRoot.getElementById('add-popup');
    if (popup && popup.style.display !== 'none' && addRoot) {
      requestAnimationFrame(() => {
        WeekdaySelector.reset(addRoot);
      });
    }

    // Item actions
    this.shadowRoot.querySelectorAll('.slot-card').forEach(itemEl => {
      const itemId = itemEl.dataset.itemId;
      const items = this._getItems();
      const item = items.find(i => i.id === itemId);
      if (!item) return;

      // Toggle item enabled (via icon) - save immediately
      const itemIcon = itemEl.querySelector('.slot-icon[data-action="toggle-item"]');
      if (itemIcon) {
        itemIcon.addEventListener('click', () => {
          const currentItems = this._getItems();
          const currentItem = currentItems.find(i => i.id === itemId);
          if (currentItem) this._updateItem(itemId, { enabled: !currentItem.enabled });
        });
      }

      const slotKey = (item.time || '') + '|' + JSON.stringify(item.weekdays || []);

      // Toggle expand/collapse
      const expandBtn = itemEl.querySelector('[data-action="toggle-expand"]');
      if (expandBtn) {
        expandBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isExpanded = itemEl.classList.contains('expanded');
          if (isExpanded) {
            itemEl.classList.remove('expanded');
            this._expandedSlots.delete(slotKey);
          } else {
            itemEl.classList.add('expanded');
            this._expandedSlots.add(slotKey);
          }
          const icon = expandBtn.querySelector('ha-icon');
          if (icon) {
            icon.setAttribute('icon', itemEl.classList.contains('expanded') ? 'mdi:chevron-up' : 'mdi:chevron-down');
          }
        });
      }

      // Restore expanded state if this slot was expanded before (by time+weekdays so it survives entity add/remove)
      if (this._expandedSlots.has(slotKey)) {
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
          this._deleteSlot(itemId);
        });
      }

      // Slot title input - save on blur
      const titleInput = itemEl.querySelector('[data-slot-form="title"]');
      if (titleInput) {
        const saveTitle = () => {
          if (itemEl.dataset.updating === 'true') return;
          const newTitle = titleInput.value.trim() || null;
          this._updateItem(itemId, { title: newTitle });
        };
        titleInput.addEventListener('blur', saveTitle);
        titleInput.addEventListener('click', (e) => e.stopPropagation());
      }

      // Time selects - save on change (blur equivalent for select)
      const hoursSelect = itemEl.querySelector('[data-slot-form="time-hours"]');
      const minutesSelect = itemEl.querySelector('[data-slot-form="time-minutes"]');
      if (hoursSelect) {
        const newHoursSelect = hoursSelect.cloneNode(true);
        hoursSelect.parentNode.replaceChild(newHoursSelect, hoursSelect);
        newHoursSelect.addEventListener('change', () => {
          if (itemEl.dataset.updating === 'true') return;
          const currentItems = this._getItems();
          const currentItem = currentItems.find(i => i.id === itemId);
          if (!currentItem) return;
          const [, oldMinutes] = currentItem.time.split(':');
          const newTime = `${newHoursSelect.value}:${oldMinutes}`;
          this._updateItem(itemId, { time: newTime });
        });
        newHoursSelect.addEventListener('click', (e) => e.stopPropagation());
        const [hours] = item.time.split(':');
        newHoursSelect.value = hours;
      }
      if (minutesSelect) {
        const newMinutesSelect = minutesSelect.cloneNode(true);
        minutesSelect.parentNode.replaceChild(newMinutesSelect, minutesSelect);
        newMinutesSelect.addEventListener('change', () => {
          if (itemEl.dataset.updating === 'true') return;
          const currentItems = this._getItems();
          const currentItem = currentItems.find(i => i.id === itemId);
          if (!currentItem) return;
          const [oldHours] = currentItem.time.split(':');
          const newTime = `${oldHours}:${newMinutesSelect.value}`;
          this._updateItem(itemId, { time: newTime });
        });
        newMinutesSelect.addEventListener('click', (e) => e.stopPropagation());
        const [, minutes] = item.time.split(':');
        const minsVal = parseInt(minutes, 10); const roundedMinutes = String((Number.isNaN(minsVal) ? 0 : Math.round(minsVal / 5) * 5)).padStart(2, '0');
        newMinutesSelect.value = roundedMinutes;
      }

      // Duration - save on blur (DurationSelector calls callback on blur). Only touched when user changes it or mode=off.
      const durationWrapper = itemEl.querySelector('[data-slot-form="duration-wrapper"]');
      const durationEnabledSwitch = itemEl.querySelector('[data-slot-form="duration-enabled"]');
      const durationRow = itemEl.querySelector('.slot-form-duration-row');
      const slotHvacMode = item.service_start?.value?.hvac_mode;
      const hasDuration = slotHvacMode !== 'off' && item.duration != null;
      if (durationEnabledSwitch) durationEnabledSwitch.checked = !!hasDuration;
      if (durationWrapper) {
        durationWrapper.style.display = hasDuration ? 'block' : 'none';
        if (hasDuration) {
          DurationSelector.setDurationInSlot(itemEl, item.duration != null ? (ScheduleHelper && ScheduleHelper.durationMinutesToHours ? ScheduleHelper.durationMinutesToHours(item.duration) : item.duration / 60) : null, this._config);
          DurationSelector.attachEventListenersInSlot(itemEl, (durationHours) => {
            if (itemEl.dataset.updating === 'true') return;
            const modeSelect = itemEl.querySelector('[data-slot-form="mode"]');
            if (modeSelect?.value === 'off') return;
            const currentItems = this._getItems();
            const currentItem = currentItems.find(i => i.id === itemId);
            const hvacMode = modeSelect?.value || 'heat';
            const durationMins = (ScheduleHelper && ScheduleHelper.durationHoursToMinutes) ? ScheduleHelper.durationHoursToMinutes(durationHours) : (durationHours != null ? Math.round(Number(durationHours) * 60) : null);
            const serviceEnd = durationMins ? ScheduleHelper.createClimateServices(currentItem?.entity_id || this._config?.entity, hvacMode).service_end : null;
            this._updateItem(itemId, { duration: durationMins, service_end: serviceEnd });
          }, this._config);
        }
      }
      if (durationEnabledSwitch && durationWrapper) {
        const syncSlotDurationUI = () => {
          const checked = !!durationEnabledSwitch.checked;
          if (checked) {
            durationWrapper.style.display = 'block';
            const { minDuration } = this._getDurationConfig();
            const currentItems = this._getItems();
            const currentItem = currentItems.find(i => i.id === itemId);
            const keepDuration = currentItem?.service_start?.value?.hvac_mode !== 'off' && currentItem?.duration != null;
            const durationValHours = keepDuration ? (ScheduleHelper && ScheduleHelper.durationMinutesToHours ? ScheduleHelper.durationMinutesToHours(currentItem.duration) : currentItem.duration / 60) : minDuration;
            DurationSelector.setSelectedDuration(durationWrapper, durationValHours);
            DurationSelector.attachEventListenersInSlot(itemEl, (durationHours) => {
              if (itemEl.dataset.updating === 'true') return;
              const modeSelect = itemEl.querySelector('[data-slot-form="mode"]');
              if (modeSelect?.value === 'off') return;
              const hvacMode = modeSelect?.value || 'heat';
              const durationMins = (ScheduleHelper && ScheduleHelper.durationHoursToMinutes) ? ScheduleHelper.durationHoursToMinutes(durationHours) : (durationHours != null ? Math.round(Number(durationHours) * 60) : null);
              const serviceEnd = durationMins ? ScheduleHelper.createClimateServices(currentItem?.entity_id || this._config?.entity, hvacMode).service_end : null;
              this._updateItem(itemId, { duration: durationMins, service_end: serviceEnd });
            }, this._config);
            const hvacMode = currentItem?.service_start?.value?.hvac_mode || 'heat';
            const serviceEnd = ScheduleHelper.createClimateServices(currentItem?.entity_id || this._config?.entity, hvacMode).service_end;
            const durationMinsVal = (ScheduleHelper && ScheduleHelper.durationHoursToMinutes) ? ScheduleHelper.durationHoursToMinutes(durationValHours) : (durationValHours != null ? Math.round(Number(durationValHours) * 60) : null);
            this._updateItem(itemId, { duration: durationMinsVal, service_end: serviceEnd });
          } else {
            durationWrapper.style.display = 'none';
            DurationSelector.reset(itemEl, null);
            this._updateItem(itemId, { clear_duration: true });
          }
        };
        durationEnabledSwitch.addEventListener('change', () => syncSlotDurationUI());
        durationEnabledSwitch.addEventListener('click', (e) => e.stopPropagation());
        if (durationRow) {
          durationRow.addEventListener('click', (e) => {
            const path = e.composedPath && e.composedPath();
            if (path && path.some(el => el && el.tagName && el.tagName.toLowerCase() === 'ha-switch')) return;
            e.stopPropagation();
            e.preventDefault();
            durationEnabledSwitch.checked = !durationEnabledSwitch.checked;
            syncSlotDurationUI();
          });
        }
      }

      // Build service_start from slot form (mode, fan, temp)
      const getServiceStartFromSlotForm = () => {
        const currentItems = this._getItems();
        const currentItem = currentItems.find(i => i.id === itemId);
        if (!currentItem) return null;
        const modeSelect = itemEl.querySelector('[data-slot-form="mode"]');
        const fanSelect = itemEl.querySelector('[data-slot-form="fan"]');
        const tempInput = itemEl.querySelector('[data-slot-form="temp"]');
        const hvacMode = modeSelect?.value || currentItem.service_start?.value?.hvac_mode || 'heat';
        const value = { entity_id: currentItem.entity_id, hvac_mode: hvacMode };
        if (fanSelect?.value) value.fan_mode = fanSelect.value;
        if (tempInput && tempInput.value !== '' && !Number.isNaN(Number(tempInput.value))) {
          value.temperature = parseFloat(tempInput.value);
        }
        return { name: 'climate.set_hvac_mode', value };
      };

      // HVAC mode - save on change. When off: clear duration. When heat/cool: keep duration, never reset it.
      const hvacModeSelect = itemEl.querySelector('[data-slot-form="mode"]');
      if (hvacModeSelect) {
        const hvacModeHandler = (e) => {
          if (itemEl.dataset.updating === 'true') return;
          e.stopPropagation();
          const newHvacMode = e.target.value;
          const currentItems = this._getItems();
          const currentItem = currentItems.find(i => i.id === itemId);
          if (!currentItem) return;
          const durationWrapper = itemEl.querySelector('[data-slot-form="duration-wrapper"]');
          const durationEnabledSwitch = itemEl.querySelector('[data-slot-form="duration-enabled"]');
          if (newHvacMode === 'off') {
            if (durationEnabledSwitch) durationEnabledSwitch.checked = false;
            if (durationWrapper) {
              durationWrapper.style.display = 'none';
              DurationSelector.reset(itemEl, null);
            }
            const serviceStart = { name: 'climate.set_hvac_mode', value: { entity_id: currentItem.entity_id, hvac_mode: 'off' } };
            this._updateItem(itemId, { service_start: serviceStart, clear_duration: true });
          } else {
            if (durationEnabledSwitch) durationEnabledSwitch.checked = true;
            if (durationWrapper) {
              durationWrapper.style.display = 'block';
              const { minDuration } = this._getDurationConfig();
              const hadDuration = currentItem.service_start?.value?.hvac_mode !== 'off' && currentItem.duration != null;
              DurationSelector.setDurationInSlot(itemEl, hadDuration ? (ScheduleHelper && ScheduleHelper.durationMinutesToHours ? ScheduleHelper.durationMinutesToHours(currentItem.duration) : currentItem.duration / 60) : minDuration, this._config);
              DurationSelector.attachEventListenersInSlot(itemEl, (durationHours) => {
                if (itemEl.dataset.updating === 'true') return;
                const durationMins = (ScheduleHelper && ScheduleHelper.durationHoursToMinutes) ? ScheduleHelper.durationHoursToMinutes(durationHours) : (durationHours != null ? Math.round(Number(durationHours) * 60) : null);
                this._updateItem(itemId, { duration: durationMins });
              }, this._config);
            }
            const serviceStart = getServiceStartFromSlotForm();
            if (serviceStart) {
              const updates = { service_start: serviceStart };
              if (currentItem.duration != null) {
                updates.service_end = ScheduleHelper.createClimateServices(currentItem.entity_id, newHvacMode).service_end;
              }
              this._updateItem(itemId, updates);
            }
          }
          const wrap = itemEl.querySelector('[data-slot-form="entities-wrap"]');
          if (wrap) this._updateSlotEntitiesForMode(wrap, itemEl);
        };
        const newHvacModeSelect = hvacModeSelect.cloneNode(true);
        hvacModeSelect.parentNode.replaceChild(newHvacModeSelect, hvacModeSelect);
        newHvacModeSelect.addEventListener('change', hvacModeHandler);
        newHvacModeSelect.addEventListener('click', (e) => e.stopPropagation());
      }

      // Fan - save on change
      const fanSelect = itemEl.querySelector('[data-slot-form="fan"]');
      if (fanSelect) {
        const newFanSelect = fanSelect.cloneNode(true);
        fanSelect.parentNode.replaceChild(newFanSelect, fanSelect);
        newFanSelect.addEventListener('change', () => {
          if (itemEl.dataset.updating === 'true') return;
          const serviceStart = getServiceStartFromSlotForm();
          if (serviceStart) this._updateItem(itemId, { service_start: serviceStart });
        });
        newFanSelect.addEventListener('click', (e) => e.stopPropagation());
      }

      // Temp - save on blur
      const tempInput = itemEl.querySelector('[data-slot-form="temp"]');
      if (tempInput) {
        const saveTemp = () => {
          if (itemEl.dataset.updating === 'true') return;
          const serviceStart = getServiceStartFromSlotForm();
          if (serviceStart) this._updateItem(itemId, { service_start: serviceStart });
        };
        tempInput.addEventListener('change', saveTemp);
        tempInput.addEventListener('blur', saveTemp);
        tempInput.addEventListener('click', (e) => e.stopPropagation());
      }

      const slotEntitiesWrap = itemEl.querySelector('[data-slot-form="entities-wrap"]');
      if (slotEntitiesWrap) {
        const entities = this._getEntities();
        slotEntitiesWrap.style.display = '';
        if (window.EntitiesSelector && window.EntitiesSelector.attachEntitiesList && entities.length >= 1) {
          const bridgeState = this._getBridgeState();
          const allItems = bridgeState?.attributes?.items || [];
          const entitySet = new Set(entities);
          const sameSlotItems = allItems.filter(i =>
            i && i.temporary !== true && entitySet.has(i.entity_id) &&
            i.time === item.time && JSON.stringify(i.weekdays || []) === JSON.stringify(item.weekdays || [])
          );
          const entityIdsToItemIds = {};
          sameSlotItems.forEach(i => { entityIdsToItemIds[i.entity_id] = i.id; });
          slotEntitiesWrap.dataset.slotEntityIds = JSON.stringify(entityIdsToItemIds);
          const slotHvacSelect = itemEl.querySelector('[data-slot-form="mode"]');
          const isEntityDisabled = (entityId) => {
            if (!slotHvacSelect || !slotHvacSelect.value || !this._hass) return false;
            const state = this._hass.states[entityId];
            const modes = state?.attributes?.hvac_modes;
            return Array.isArray(modes) && !modes.includes(slotHvacSelect.value);
          };
          window.EntitiesSelector.attachEntitiesList(slotEntitiesWrap, {
            entities,
            checkedEntityIds: sameSlotItems.map(i => i.entity_id),
            hass: this._hass,
            isEntityDisabled,
            onCheck: () => { /* API and render only when dropdown is closed */ },
            onUncheck: () => { /* API and render only when dropdown is closed */ }
          });
          this._updateModeOptionsForWrap(slotEntitiesWrap, slotHvacSelect);
          this._updateModeWarningForWrap(slotEntitiesWrap, slotHvacSelect, null);
          const trigger = slotEntitiesWrap.querySelector('[data-slot-form="entities-trigger"]');
          const dropdown = slotEntitiesWrap.querySelector('[data-slot-form="entities-dropdown"]');
          const selectAllInput = slotEntitiesWrap.querySelector('[data-slot-form="entities-select-all"]');
          if (trigger && dropdown) {
            if (!dropdown._slotClickStopped) {
              dropdown.addEventListener('click', (e) => e.stopPropagation());
              dropdown._slotClickStopped = true;
            }
            trigger.addEventListener('click', (e) => {
              e.stopPropagation();
              e.preventDefault();
              const open = dropdown.classList.toggle('open');
              trigger.classList.toggle('open', open);
              if (open) {
                const bridgeState = this._getBridgeState();
                const allItems = bridgeState?.attributes?.items || [];
                const sameSlotItemsNow = allItems.filter(i =>
                  i && i.temporary !== true && entitySet.has(i.entity_id) &&
                  i.time === item.time && JSON.stringify(i.weekdays || []) === JSON.stringify(item.weekdays || [])
                );
                const initialChecked = new Set(sameSlotItemsNow.map(i => i.entity_id));
                const initialIds = {};
                sameSlotItemsNow.forEach(i => { initialIds[i.entity_id] = i.id; });
                const close = async (ev) => {
                  const path = ev.composedPath && ev.composedPath();
                  const inside = path && path.some(el => el === slotEntitiesWrap || el === dropdown || (el && el.nodeType === 1 && (slotEntitiesWrap.contains(el) || dropdown.contains(el))));
                  if (inside) return;
                  document.removeEventListener('mousedown', close);
                  dropdown.classList.remove('open');
                  trigger.classList.remove('open');
                  const listEl = slotEntitiesWrap.querySelector('.entities-selector-list');
                  const checkedInputs = listEl ? listEl.querySelectorAll('input[name="entities-selector-entity"]:checked') : [];
                  const currentChecked = new Set(Array.from(checkedInputs).map(inp => inp.value));
                  const toRemove = [...initialChecked].filter(eid => !currentChecked.has(eid));
                  const toAdd = [...currentChecked].filter(eid => !initialChecked.has(eid));
                  for (const entityId of toRemove) {
                    const itemId = initialIds[entityId];
                    if (itemId) await this._deleteItem(itemId);
                  }
                  const timeHours = itemEl.querySelector('[data-slot-form="time-hours"]');
                  const timeMinutes = itemEl.querySelector('[data-slot-form="time-minutes"]');
                  const time = (timeHours && timeMinutes) ? `${timeHours.value}:${timeMinutes.value}` : item.time;
                  const selectedWeekdays = WeekdaySelector.getSelectedWeekdays(itemEl);
                  const weekdays = selectedWeekdays.length > 0 ? selectedWeekdays : item.weekdays;
                  const hvacSelect = itemEl.querySelector('[data-slot-form="mode"]');
                  const fanSelect = itemEl.querySelector('[data-slot-form="fan"]');
                  const tempInput = itemEl.querySelector('[data-slot-form="temp"]');
                  const hvacMode = hvacSelect && hvacSelect.value ? hvacSelect.value : (item.service_start?.value?.hvac_mode || 'heat');
                  const fanMode = fanSelect?.value || undefined;
                  let temperature = undefined;
                  if (tempInput && tempInput.value !== '' && !Number.isNaN(Number(tempInput.value))) {
                    temperature = parseFloat(tempInput.value);
                  }
                  let durationHours = null;
                  if (hvacMode !== 'off' && window.DurationSelector) {
                    const wrapper = itemEl.querySelector('.duration-selector-wrapper');
                    if (wrapper) durationHours = DurationSelector.getSelectedDuration(itemEl);
                  }
                  const durationMins = (ScheduleHelper && ScheduleHelper.durationHoursToMinutes) ? ScheduleHelper.durationHoursToMinutes(durationHours) : (durationHours != null ? Math.round(Number(durationHours) * 60) : null);
                  for (const entityId of toAdd) {
                    const service_start = ScheduleHelper.createClimateServices(entityId, hvacMode, { temperature, fan_mode: fanMode }).service_start;
                    const service_end = (hvacMode !== 'off' && durationMins) ? ScheduleHelper.createClimateServices(entityId, hvacMode).service_end : null;
                    await ScheduleHelper.addScheduleSlot({
                      hass: this._hass,
                      callService: async (service, data) => this._callService(service, data),
                      getBridgeState: () => this._getBridgeState(),
                      entity_id: entityId,
                      time,
                      duration: durationMins || undefined,
                      weekdays,
                      service_start,
                      service_end,
                      bridgeSensor: this._bridgeSensor,
                      onRender: () => {}
                    });
                  }
                  if (toAdd.length > 0 || toRemove.length > 0) {
                    this._optimisticBridgeState = null;
                    this.hass = { ...this._hass };
                    await this.render();
                  }
                };
                setTimeout(() => document.addEventListener('mousedown', close), 0);
              }
            });
          }
          if (selectAllInput) {
            const listEl = slotEntitiesWrap.querySelector('.entities-selector-list');
            selectAllInput.addEventListener('change', () => {
              if (!listEl) return;
              const inputs = listEl.querySelectorAll('input[name="entities-selector-entity"]:not(:disabled)');
              inputs.forEach(inp => { inp.checked = selectAllInput.checked; });
              this._updateEntityChipsForWrap(slotEntitiesWrap, { updateSlotTitle: true });
              this._updateModeOptionsForWrap(slotEntitiesWrap, slotHvacSelect);
              this._updateModeWarningForWrap(slotEntitiesWrap, slotHvacSelect, null);
            });
          }
          const listElForSync = slotEntitiesWrap.querySelector('.entities-selector-list');
          if (listElForSync && selectAllInput) {
            listElForSync.addEventListener('change', () => {
              this._updateEntityChipsForWrap(slotEntitiesWrap, { updateSlotTitle: true });
              this._updateModeOptionsForWrap(slotEntitiesWrap, slotHvacSelect);
              this._updateModeWarningForWrap(slotEntitiesWrap, slotHvacSelect, null);
              const all = listElForSync.querySelectorAll('input[name="entities-selector-entity"]:not(:disabled)');
              const checkedCount = Array.from(all).filter(inp => inp.checked).length;
              selectAllInput.checked = checkedCount === all.length;
              selectAllInput.indeterminate = checkedCount > 0 && checkedCount < all.length;
            });
          }
        }
      }

      // Weekday selector - use shared component
      // First, set the initial weekdays value
      WeekdaySelector.setSelectedWeekdays(this.shadowRoot, item.weekdays, itemEl);
      // Attach event listeners for this specific slot's weekday selector
      // NOTE: In slots, weekday selector is NOT wrapped in .popup-field (unlike in popup)
      
      // Check if weekday selector exists BEFORE attachEventListeners
      const modeBtnsBefore = itemEl.querySelectorAll('.weekday-mode-btn');
      const weekdayBtnsBefore = itemEl.querySelectorAll('.popup-weekday');
      
      // In slots, weekday selector is directly in itemEl, not in .popup-field
      if (modeBtnsBefore.length > 0 || weekdayBtnsBefore.length > 0) {
        const updateWeekdays = () => {
          if (itemEl.dataset.updating === 'true') return;
          const selectedWeekdays = WeekdaySelector.getSelectedWeekdays(itemEl);
          if (selectedWeekdays.length === 0) {
            const currentItems = this._getItems();
            const currentItem = currentItems.find(i => i.id === itemId);
            if (currentItem) WeekdaySelector.setSelectedWeekdays(this.shadowRoot, currentItem.weekdays, itemEl);
            return;
          }
          this._updateItem(itemId, { weekdays: selectedWeekdays });
        };
        
        // Attach shared component listeners (handles mode switch + show/hide custom weekdays)
        WeekdaySelector.attachEventListeners(itemEl);
        
        // Add only updateWeekdays and Custom-mode day sync; do NOT clone (cloning removed shared handler → first-click glitch)
        const addWeekdayHandlers = () => {
          const modeBtns = itemEl.querySelectorAll('.weekday-mode-btn');
          const weekdayBtns = itemEl.querySelectorAll('.popup-weekday');
          if (modeBtns.length === 0 && weekdayBtns.length === 0) {
            setTimeout(addWeekdayHandlers, 50);
            return;
          }
          modeBtns.forEach((btn) => {
            btn.addEventListener('click', () => {
              if (btn.dataset.mode === 'custom') {
                requestAnimationFrame(() => {
                  const slotCard = btn.closest('.slot-card') || itemEl;
                  const customWeekdays = slotCard.querySelector('#popup-weekdays-custom') || slotCard.querySelector('.popup-weekdays');
                  if (customWeekdays) {
                    const currentItems = this._getItems();
                    const currentItem = currentItems.find(i => i.id === itemId);
                    if (currentItem && currentItem.weekdays) {
                      slotCard.querySelectorAll('.popup-weekday').forEach(dayEl => {
                        const day = parseInt(dayEl.dataset.day, 10);
                        dayEl.classList.toggle('active', !Number.isNaN(day) && currentItem.weekdays.includes(day));
                      });
                    }
                  }
                });
                return;
              }
              setTimeout(updateWeekdays, 100);
            });
          });
          weekdayBtns.forEach((dayEl) => {
            dayEl.addEventListener('click', () => setTimeout(updateWeekdays, 100));
          });
        };
        setTimeout(addWeekdayHandlers, 0);
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
        if (typeof console !== 'undefined' && console.warn) console.warn('Homie Scheduler (climate): unsubscribe in disconnectedCallback failed', e);
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
if (typeof customElements !== 'undefined' && !customElements.get('homie-scheduler-climate-slots')) {
  customElements.define('homie-scheduler-climate-slots', HomieClimateScheduleSlotsCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'custom:homie-scheduler-climate-slots',
    name: 'Homie Scheduler Climate',
    description: 'Climate schedule slots card',
    icon: 'https://brands.home-assistant.io/custom_integrations/homie_scheduler/icon.png',
    preview: false
  });
  window.logCardInfo('climate-slots-card');
}
