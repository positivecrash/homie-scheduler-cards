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
      
      // Normalize duration configuration
      // Support both duration_range: [min, max] and separate min_duration/max_duration
      // Duration is optional for climate cards, but if specified, normalize it
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
      modePrefix = `${hvacMode.charAt(0).toUpperCase() + hvacMode.slice(1)}, `;
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
        } catch (e) {}
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
      } catch (e) {}
      setTimeout(() => { if (this._hass) this.hass = { ...this._hass }; }, 500);
    }
  }

  _getPopupSelectedEntityIds() {
    const entities = this._getEntities();
    if (entities.length === 0) return [];
    const container = this.shadowRoot.getElementById('popup-entities-container');
    if (container && container.style.display !== 'none') {
      const listEl = container.querySelector('.entities-selector-list');
      if (listEl) {
        const checked = listEl.querySelectorAll('input[name="entities-selector-entity"]:checked');
        return Array.from(checked).map(el => el.value);
      }
    }
    return entities;
  }

  _updateHvacModeWarning() {
    const warningEl = this.shadowRoot.getElementById('popup-hvac-mode-warning');
    const hvacModeSelect = this.shadowRoot.getElementById('popup-hvac-mode');
    const container = this.shadowRoot.getElementById('popup-entities-container');
    const listEl = container ? container.querySelector('.entities-selector-list') : null;
    if (!warningEl || !hvacModeSelect || !this._hass) return;
    const mode = hvacModeSelect.value;
    if (!mode) {
      warningEl.textContent = '';
      if (listEl) listEl.querySelectorAll('.entities-selector-row').forEach(row => { row.classList.remove('entities-selector-row-unsupported'); const inp = row.querySelector('input'); if (inp) inp.disabled = false; });
      return;
    }
    const entities = this._getEntities();
    const unsupportedNames = [];
    const unsupportedIds = new Set();
    entities.forEach(entityId => {
      const state = this._hass.states[entityId];
      const modes = state?.attributes?.hvac_modes;
      if (Array.isArray(modes) && !modes.includes(mode)) {
        unsupportedIds.add(entityId);
        const name = state?.attributes?.friendly_name || entityId;
        unsupportedNames.push(name);
      }
    });
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
    if (unsupportedNames.length === 0) {
      warningEl.textContent = '';
    } else {
      warningEl.textContent = unsupportedNames.length === 1
        ? `This mode is not supported for: ${unsupportedNames[0]}`
        : `This mode is not supported for: ${unsupportedNames.join(', ')}`;
    }
    this._updateEntitiesChips();
    const selectAll = this.shadowRoot.getElementById('popup-entities-select-all');
    if (listEl && selectAll) {
      const all = listEl.querySelectorAll('.entities-selector-row:not(.entities-selector-row-unsupported) input[name="entities-selector-entity"]');
      const checkedCount = Array.from(all).filter(inp => inp.checked).length;
      selectAll.checked = checkedCount === all.length;
      selectAll.indeterminate = checkedCount > 0 && checkedCount < all.length;
    }
  }

  _updateEntitiesChips() {
    const chipsEl = this.shadowRoot.getElementById('popup-entities-chips');
    if (!chipsEl) return;
    const container = this.shadowRoot.getElementById('popup-entities-container');
    const listEl = container ? container.querySelector('.entities-selector-list') : null;
    if (!listEl) return;
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
  }

  _updateSlotEntitiesChips(slotEntitiesWrap) {
    if (!slotEntitiesWrap) return;
    const chipsEl = slotEntitiesWrap.querySelector('.slot-entities-chips');
    const listEl = slotEntitiesWrap.querySelector('.entities-selector-list');
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
    this._updateSlotTitleFromEntities(slotEntitiesWrap, names);
  }

  /** Update slot header name and remove button text to match current entity selection and optional custom title. */
  _updateSlotTitleFromEntities(slotEntitiesWrap, entityNames) {
    if (!slotEntitiesWrap) return;
    const slotCard = slotEntitiesWrap.closest('.slot-card');
    if (!slotCard) return;
    const slotCards = this.shadowRoot.querySelectorAll('.slot-card');
    const slotNumber = slotCards.length ? Array.from(slotCards).indexOf(slotCard) + 1 : 1;
    const entityLabel = (entityNames && entityNames.length > 0) ? entityNames.join(', ') : '';
    const titleInput = slotCard.querySelector('.slot-title-input');
    const baseName = (titleInput && titleInput.value.trim()) || `Slot ${slotNumber}`;
    const slotName = baseName + (entityLabel ? ` (${entityLabel})` : '');
    const nameEl = slotCard.querySelector('.slot-name');
    if (nameEl) nameEl.textContent = slotName;
    const removeSpan = slotCard.querySelector('.slot-delete span');
    if (removeSpan) removeSpan.textContent = 'Remove ' + baseName;
  }

  _updateSlotEntitiesForMode(slotEntitiesWrap, itemEl) {
    if (!slotEntitiesWrap || !this._hass) return;
    const listEl = slotEntitiesWrap.querySelector('.entities-selector-list');
    const hvacSelect = itemEl.querySelector('[data-action="update-hvac-mode"]');
    const mode = hvacSelect && hvacSelect.value ? hvacSelect.value : null;
    if (!listEl || !mode) return;
    listEl.querySelectorAll('.entities-selector-row').forEach(row => {
      const input = row.querySelector('input[name="entities-selector-entity"]');
      if (!input) return;
      const entityId = input.value;
      const state = this._hass.states[entityId];
      const modes = state?.attributes?.hvac_modes;
      const unsupported = Array.isArray(modes) && !modes.includes(mode);
      row.classList.toggle('entities-selector-row-unsupported', unsupported);
      input.disabled = !!unsupported;
      if (unsupported) input.checked = false;
    });
    this._updateSlotEntitiesChips(slotEntitiesWrap);
    const selectAllInput = slotEntitiesWrap.querySelector('.slot-entities-select-all-input');
    if (selectAllInput && listEl) {
      const all = listEl.querySelectorAll('input[name="entities-selector-entity"]:not(:disabled)');
      const checkedCount = Array.from(all).filter(inp => inp.checked).length;
      selectAllInput.checked = all.length > 0 && checkedCount === all.length;
      selectAllInput.indeterminate = checkedCount > 0 && checkedCount < all.length;
    }
  }

  _entitiesDropdownCloseOnOutside(e) {
    const container = this.shadowRoot.getElementById('popup-entities-container');
    const dropdown = this.shadowRoot.getElementById('popup-entities-dropdown');
    const trigger = this.shadowRoot.getElementById('popup-entities-trigger');
    if (!container || !dropdown || !trigger) return;
    if (container.contains(e.target)) return;
    dropdown.classList.remove('open');
    trigger.classList.remove('open');
    document.removeEventListener('click', this._boundEntitiesCloseOnOutside);
  }

  _attachEntitiesDropdownListeners() {
    const trigger = this.shadowRoot.getElementById('popup-entities-trigger');
    const dropdown = this.shadowRoot.getElementById('popup-entities-dropdown');
    const selectAll = this.shadowRoot.getElementById('popup-entities-select-all');
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

    if (selectAll && listEl) {
      selectAll.closest('label').onclick = (e) => e.stopPropagation();
      selectAll.onchange = () => {
        const checked = selectAll.checked;
        listEl.querySelectorAll('.entities-selector-row input[name="entities-selector-entity"]:not([disabled])').forEach(inp => { inp.checked = checked; });
        this._updateEntitiesChips();
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
          this._updateHvacModeWarning();
        });
      });
    }
  }

  _openAddPopup() {
    const popup = this.shadowRoot.getElementById('add-popup');
    if (popup) {
      popup.style.display = 'flex';
      const hoursSelect = this.shadowRoot.getElementById('popup-time-hours');
      const minutesSelect = this.shadowRoot.getElementById('popup-time-minutes');
      const hvacModeSelect = this.shadowRoot.getElementById('popup-hvac-mode');
      const durationEnabledCheckbox = this.shadowRoot.getElementById('popup-duration-enabled');
      const durationWrapper = this.shadowRoot.getElementById('popup-duration-wrapper');
      const entitiesContainer = this.shadowRoot.getElementById('popup-entities-container');
      const entitiesList = this.shadowRoot.getElementById('popup-entities');
      const now = new Date();
      const hour = String(now.getHours()).padStart(2, '0');
      const minute = String(Math.round(now.getMinutes() / 5) * 5).padStart(2, '0');
      if (hoursSelect) hoursSelect.value = hour;
      if (minutesSelect) minutesSelect.value = minute;
      if (durationEnabledCheckbox) durationEnabledCheckbox.checked = false;
      if (durationWrapper) durationWrapper.style.display = 'none';
      DurationSelector.reset(this.shadowRoot, null);

      const entities = this._getEntities();
      const dropdown = this.shadowRoot.getElementById('popup-entities-dropdown');
      if (dropdown && entities.length > 1) {
        entitiesContainer.style.display = '';
        const trigger = this.shadowRoot.getElementById('popup-entities-trigger');
        if (trigger) trigger.classList.remove('open');
        dropdown.classList.remove('open');
        const selectAllInput = this.shadowRoot.getElementById('popup-entities-select-all');
        if (selectAllInput) { selectAllInput.checked = true; selectAllInput.indeterminate = false; }
        const hvacModeSelect = this.shadowRoot.getElementById('popup-hvac-mode');
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
            onCheck: () => { this._updateEntitiesChips(); this._updateHvacModeWarning(); },
            onUncheck: () => { this._updateEntitiesChips(); this._updateHvacModeWarning(); },
            isEntityDisabled
          });
        }
        this._updateEntitiesChips();
        this._updateHvacModeWarning();
        this._attachEntitiesDropdownListeners();
      } else if (entitiesContainer) {
        entitiesContainer.style.display = 'none';
      }

      if (hvacModeSelect && this._config?.entity && this._hass) {
        const entityState = this._hass.states[this._config.entity];
        if (entityState?.attributes?.hvac_modes) {
          const hvacModes = entityState.attributes.hvac_modes.filter(mode => mode !== 'off');
          hvacModeSelect.innerHTML = '';
          hvacModes.forEach(mode => {
            const option = document.createElement('option');
            option.value = mode;
            option.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
            hvacModeSelect.appendChild(option);
          });
          if (hvacModes.length > 0) hvacModeSelect.value = hvacModes[0];
        }
      }
      this._updateHvacModeWarning();
    }
  }

  _closeAddPopup() {
    const popup = this.shadowRoot.getElementById('add-popup');
    if (popup) {
      popup.style.display = 'none';
    }
    const trigger = this.shadowRoot.getElementById('popup-entities-trigger');
    const dropdown = this.shadowRoot.getElementById('popup-entities-dropdown');
    if (trigger) trigger.classList.remove('open');
    if (dropdown) dropdown.classList.remove('open');
    if (this._boundEntitiesCloseOnOutside) {
      document.removeEventListener('click', this._boundEntitiesCloseOnOutside);
      this._boundEntitiesCloseOnOutside = null;
    }
  }


  async _saveSlot() {
    const hoursSelect = this.shadowRoot.getElementById('popup-time-hours');
    const minutesSelect = this.shadowRoot.getElementById('popup-time-minutes');
    const hvacModeSelect = this.shadowRoot.getElementById('popup-hvac-mode');
    const titleInput = this.shadowRoot.getElementById('popup-title');
    const durationEnabledCheckbox = this.shadowRoot.getElementById('popup-duration-enabled');
    const durationWrapper = this.shadowRoot.getElementById('popup-duration-wrapper');
    const selectedDays = WeekdaySelector.getSelectedWeekdays(this.shadowRoot);
    
    // Get duration only if checkbox is enabled
    let duration = null;
    if (durationEnabledCheckbox && durationEnabledCheckbox.checked && durationWrapper) {
      duration = DurationSelector.getSelectedDuration(durationWrapper);
    }

    if (!hoursSelect || !minutesSelect) return;
    if (selectedDays.length === 0) {
      alert('Please select at least one day');
      return;
    }
    
    if (!hvacModeSelect || !hvacModeSelect.value) {
      alert('Please select an HVAC mode');
      return;
    }

    const time = `${hoursSelect.value}:${minutesSelect.value}`;
    const hvacMode = hvacModeSelect.value;
    const title = titleInput?.value?.trim() || null;

    const entities = this._getEntities();
    if (!this._config || entities.length === 0) return;

    const selectedEntityIds = this._getPopupSelectedEntityIds();
    if (selectedEntityIds.length === 0) {
      alert('Select at least one entity for this slot.');
      return;
    }

    const durationValue = duration && duration !== '' ? parseInt(duration) : null;
    const climateServicesByEntity = {};
    selectedEntityIds.forEach(eid => {
      climateServicesByEntity[eid] = ScheduleHelper.createClimateServices(eid, hvacMode);
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
        statusPrefix = updatedItem.enabled ? hvacMode.charAt(0).toUpperCase() + hvacMode.slice(1) : 'Off';
      }
      
      const durationStr = this._formatDuration(updatedItem.duration);
      const slotStatus = `${statusPrefix}, ${daysText} on ${updatedItem.time}${durationStr}`;
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

    // Update duration select (only if duration is set)
    const durationEl = slotCard.querySelector('.slot-duration');
    if (durationEl) {
      if (updatedItem.duration) {
        durationEl.style.display = '';
        DurationSelector.setDurationInSlot(slotCard, updatedItem.duration, this._config);
      } else {
        durationEl.style.display = 'none';
      }
    }

    // Update HVAC mode select - use data-action selector to match template
    const hvacModeSelect = slotCard.querySelector('[data-action="update-hvac-mode"]');
    if (hvacModeSelect) {
      const currentHvacMode = updatedItem.service_start?.value?.hvac_mode;
      if (currentHvacMode && hvacModeSelect.value !== currentHvacMode) {
        hvacModeSelect.value = currentHvacMode;
        // Trigger input event for visual update without change event
        hvacModeSelect.dispatchEvent(new Event('input', { bubbles: false }));
      }
    }

    // Update weekday selector state
    WeekdaySelector.setSelectedWeekdays(this.shadowRoot, updatedItem.weekdays, slotCard);

    // Update slot title input and slot name in header
    const titleInput = slotCard.querySelector('.slot-title-input');
    if (titleInput && titleInput.value !== (updatedItem.title || '')) {
      titleInput.value = updatedItem.title || '';
    }
    const slotNameEl = slotCard.querySelector('.slot-name');
    const removeSpan = slotCard.querySelector('.slot-delete span');
    if (slotNameEl || removeSpan) {
      const entities = this._getEntities();
      const bridgeState = this._getBridgeState();
      const allItems = bridgeState?.attributes?.items || [];
      const entitySet = new Set(entities);
      const sameSlotItems = allItems.filter(i =>
        i && i.temporary !== true && entitySet.has(i.entity_id) &&
        i.time === updatedItem.time && JSON.stringify(i.weekdays || []) === JSON.stringify(updatedItem.weekdays || [])
      );
      const entityLabel = sameSlotItems.length > 0
        ? sameSlotItems.map(i => this._hass?.states?.[i.entity_id]?.attributes?.friendly_name || i.entity_id).join(', ')
        : '';
      const slotNumber = Array.from(this.shadowRoot.querySelectorAll('.slot-card')).indexOf(slotCard) + 1;
      const baseName = updatedItem.title || `Slot ${slotNumber}`;
      const slotName = baseName + (entityLabel ? ` (${entityLabel})` : '');
      if (slotNameEl) slotNameEl.textContent = slotName;
      if (removeSpan) removeSpan.textContent = 'Remove ' + baseName;
    }

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

  async _updateItem(itemId, updates) {
    const bridgeState = this._getBridgeState();
    const isSlotWideUpdate = bridgeState && (updates.time !== undefined || updates.duration !== undefined || updates.weekdays !== undefined || updates.title !== undefined);
    const itemIdsToUpdate = isSlotWideUpdate && bridgeState ? this._getSameSlotItemIds(bridgeState, itemId) : [itemId];

    // Keep slot expanded when time or weekdays change: migrate expanded state from old slotKey to new
    if (bridgeState?.attributes?.items && (updates.time !== undefined || updates.weekdays !== undefined)) {
      const currentItem = bridgeState.attributes.items.find(i => i && i.id === itemId);
      if (currentItem) {
        const oldKey = (currentItem.time || '') + '|' + JSON.stringify(currentItem.weekdays || []);
        const newTime = updates.time !== undefined ? updates.time : currentItem.time;
        const newWeekdays = updates.weekdays !== undefined ? updates.weekdays : currentItem.weekdays;
        const newKey = (newTime || '') + '|' + JSON.stringify(newWeekdays || []);
        if (oldKey !== newKey && this._expandedSlots.has(oldKey)) {
          this._expandedSlots.delete(oldKey);
          this._expandedSlots.add(newKey);
        }
      }
    }

    // Optimistically update (using overlay, no hass mutation)
    if (this._hass && this._bridgeSensor && bridgeState?.attributes?.items) {
      const items = [...bridgeState.attributes.items];
      let anyUpdated = false;
      for (const id of itemIdsToUpdate) {
        const itemIndex = items.findIndex(item => item && item.id === id);
        if (itemIndex === -1) continue;
        const currentItem = items[itemIndex];
        const updatedItem = { ...currentItem };
        if (updates.service_start) {
          updatedItem.service_start = updates.service_start;
        }
        if (updates.service_end !== undefined) {
          if (updates.service_end === null) {
            delete updatedItem.service_end;
          } else {
            updatedItem.service_end = updates.service_end;
          }
        }
        Object.keys(updates).forEach(key => {
          if (key !== 'service_start' && key !== 'service_end') {
            updatedItem[key] = updates[key];
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
        const firstUpdated = items.find(i => i && itemIdsToUpdate.includes(i.id));
        if (firstUpdated) {
          this._updateSlotElement(itemId, firstUpdated);
        }
        this._updateHeaderStatus();
        this.hass = { ...this._hass };
        this._syncAllCardsForEntity(itemId, firstUpdated || bridgeState.attributes.items.find(i => i && i.id === itemId), this._optimisticBridgeState);
      }
    }

    for (const id of itemIdsToUpdate) {
      const serviceData = { id, ...updates };
      await this._callService('update_item', serviceData);
    }
    
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
          this.render().catch(() => {});
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
      }
      setTimeout(() => {
        if (this._hass) {
          try {
            this._hass.callService('homeassistant', 'update_entity', {
              entity_id: this._bridgeSensor
            });
          } catch (e) {
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
      }
      setTimeout(() => {
        if (this._hass) {
          try {
            this._hass.callService('homeassistant', 'update_entity', {
              entity_id: this._bridgeSensor
            });
          } catch (e) {
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
    
    // Get HVAC modes for popup (exclude 'off')
    let hvacModesOptions = '';
    if (this._config && this._config.entity && this._hass) {
      const entityState = this._hass.states[this._config.entity];
      if (entityState && entityState.attributes && entityState.attributes.hvac_modes) {
        const hvacModes = entityState.attributes.hvac_modes.filter(mode => mode !== 'off');
        hvacModesOptions = hvacModes.map(mode => 
          `<option value="${mode}">${mode.charAt(0).toUpperCase() + mode.slice(1)}</option>`
        ).join('');
      }
    }
    if (!hvacModesOptions) {
      // Fallback if entity not found or no modes available
      hvacModesOptions = '<option value="heat">Heat</option><option value="cool">Cool</option>';
    }
    
    // Replace duration placeholders (step computed so slider can reach max)
    const minDuration = this._config.min_duration || 15;
    const maxDuration = this._config.max_duration || 1440;
    const durationStep = window.DurationSelector && typeof window.DurationSelector.computeStep === 'function'
      ? window.DurationSelector.computeStep(minDuration, maxDuration, this._config.duration_step || 15)
      : (this._config.duration_step || 15);
    // For climate, default duration is null (empty)
    const defaultDuration = '';
    
    let processedTemplate = template
      .replace(/\{\{DURATION_MIN\}\}/g, minDuration)
      .replace(/\{\{DURATION_MAX\}\}/g, maxDuration)
      .replace(/\{\{DURATION_STEP\}\}/g, durationStep)
      .replace(/\{\{DURATION_VALUE\}\}/g, defaultDuration)
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
      statusPrefix = item.enabled ? currentHvacMode.charAt(0).toUpperCase() + currentHvacMode.slice(1) : 'Off';
    }
    
    const entityForMode = item.entity_id || this._config?.entity;
    let hvacModeOptions = '';
    if (this._config && entityForMode && this._hass) {
      const entityState = this._hass.states[entityForMode];
      if (entityState && entityState.attributes && entityState.attributes.hvac_modes) {
        let hvacModes = entityState.attributes.hvac_modes.filter(mode => mode !== 'off');
        if (currentHvacMode && !hvacModes.includes(currentHvacMode)) {
          hvacModes = [currentHvacMode, ...hvacModes];
        }
        hvacModeOptions = hvacModes.map(mode => {
          const selected = currentHvacMode === mode ? 'selected' : '';
          const label = mode.charAt(0).toUpperCase() + mode.slice(1);
          return `<option value="${mode}" ${selected}>${label}</option>`;
        }).join('');
      }
    }
    if (!hvacModeOptions) {
      // Fallback if entity not found or no modes available
      const heatSelected = currentHvacMode === 'heat' ? 'selected' : '';
      const coolSelected = currentHvacMode === 'cool' ? 'selected' : '';
      hvacModeOptions = `<option value="heat" ${heatSelected}>Heat</option><option value="cool" ${coolSelected}>Cool</option>`;
    }
    
    //     
    const durationStr = this._formatDuration(item.duration);
    const slotStatus = `${statusPrefix}, ${daysText} on ${item.time}${durationStr}`;
    
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

    // Replace duration placeholders (step computed so slider can reach max)
    const minDuration = this._config.min_duration || 15;
    const maxDuration = this._config.max_duration || 1440;
    const durationStep = window.DurationSelector && typeof window.DurationSelector.computeStep === 'function'
      ? window.DurationSelector.computeStep(minDuration, maxDuration, this._config.duration_step || 15)
      : (this._config.duration_step || 15);
    const durationValue = item.duration || '';
    
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
      .replace(/\{\{DURATION_MIN\}\}/g, minDuration)
      .replace(/\{\{DURATION_MAX\}\}/g, maxDuration)
      .replace(/\{\{DURATION_STEP\}\}/g, durationStep)
      .replace(/\{\{DURATION_VALUE\}\}/g, durationValue)
      .replace(/\{\{HVAC_MODE_OPTIONS\}\}/g, hvacModeOptions);
    
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
      
      // Hide duration selector if duration is not set
      const durationEl = slotCard.querySelector('.slot-duration');
      if (durationEl) {
        if (item.duration) {
          durationEl.style.display = '';
        } else {
          durationEl.style.display = 'none';
        }
      }
      
      // Verify and set HVAC mode select value explicitly
      const hvacModeSelect = slotCard.querySelector('[data-action="update-hvac-mode"]');
      if (hvacModeSelect && currentHvacMode) {
        hvacModeSelect.value = currentHvacMode;
      } else if (hvacModeSelect) {
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

    // Popup weekday selection - use shared component
    // Note: attachEventListeners will fix the active state if Custom is selected
    WeekdaySelector.attachEventListeners(this.shadowRoot);
    
    // Popup duration selection - attach listeners only when wrapper is visible
    // (will be attached when checkbox is checked)
    
    // Duration enabled (ha-switch) - show/hide duration selector
    const durationEnabledCheckbox = this.shadowRoot.getElementById('popup-duration-enabled');
    const durationWrapper = this.shadowRoot.getElementById('popup-duration-wrapper');
    const durationRow = this.shadowRoot.querySelector('.popup-duration-row');
    if (durationEnabledCheckbox && durationWrapper) {
      const syncDurationWrapper = () => {
        if (durationEnabledCheckbox.checked) {
          durationWrapper.style.display = 'block';
          const durationInput = durationWrapper.querySelector('[data-action="update-duration"]');
          const durationSlider = durationWrapper.querySelector('[data-action="update-duration-slider"]');
          const minDuration = this._config.min_duration || 15;
          const maxDuration = this._config.max_duration || 1440;
          const allowedValues = window.DurationSelector && typeof window.DurationSelector.computeAllowedValues === 'function'
            ? window.DurationSelector.computeAllowedValues(minDuration, maxDuration, 5)
            : (() => { const a = []; for (let i = minDuration; i <= maxDuration; i += 5) a.push(i); if (a[a.length - 1] < maxDuration) a.push(maxDuration); return a; })();
          durationWrapper.dataset.durationValues = allowedValues.join(',');
          if (durationInput) {
            durationInput.min = minDuration;
            durationInput.max = maxDuration;
            durationInput.step = 1;
          }
          if (durationSlider) {
            durationSlider.min = 0;
            durationSlider.max = Math.max(0, allowedValues.length - 1);
            durationSlider.step = 1;
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

    const hvacModeSelect = this.shadowRoot.getElementById('popup-hvac-mode');
    if (hvacModeSelect) {
      hvacModeSelect.addEventListener('change', () => this._updateHvacModeWarning());
    }
    
    // Ensure Everyday is active after attaching listeners (in case popup is already open)
    const popup = this.shadowRoot.getElementById('add-popup');
    if (popup && popup.style.display !== 'none') {
      requestAnimationFrame(() => {
        WeekdaySelector.reset(this.shadowRoot);
      });
    }

    // Item actions
    this.shadowRoot.querySelectorAll('.slot-card').forEach(itemEl => {
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

      // Slot title input - same pattern as boiler slots; update display on input, save on blur/debounce
      const titleInput = itemEl.querySelector('.slot-title-input');
      if (titleInput) {
        let titleDebounce = null;
        const applyTitle = () => {
          if (itemEl.dataset.updating === 'true') return;
          const newTitle = titleInput.value.trim() || null;
          this._updateItem(itemId, { title: newTitle });
        };
        const refreshSlotNameDisplay = () => {
          const slotEntitiesWrap = itemEl.querySelector('.slot-entities-wrap');
          const listEl = slotEntitiesWrap?.querySelector('.entities-selector-list');
          const names = listEl ? Array.from(listEl.querySelectorAll('input[name="entities-selector-entity"]:checked')).map(inp => {
            const row = inp.closest('.entities-selector-row');
            const nameEl = row?.querySelector('.entities-selector-entity-name');
            return nameEl ? nameEl.textContent : inp.value;
          }) : [];
          const slotNumber = Array.from(this.shadowRoot.querySelectorAll('.slot-card')).indexOf(itemEl) + 1;
          const baseName = titleInput.value.trim() || `Slot ${slotNumber}`;
          const entityLabel = names.length > 0 ? names.join(', ') : '';
          const slotName = baseName + (entityLabel ? ` (${entityLabel})` : '');
          const nameEl = itemEl.querySelector('.slot-name');
          if (nameEl) nameEl.textContent = slotName;
          const removeSpan = itemEl.querySelector('.slot-delete span');
          if (removeSpan) removeSpan.textContent = 'Remove ' + baseName;
        };
        titleInput.addEventListener('blur', () => {
          clearTimeout(titleDebounce);
          applyTitle();
        });
        titleInput.addEventListener('input', () => {
          refreshSlotNameDisplay();
          clearTimeout(titleDebounce);
          titleDebounce = setTimeout(applyTitle, 500);
        });
        titleInput.addEventListener('click', (e) => e.stopPropagation());
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

      // Update duration - use shared component (only if duration is set)
      const durationEl = itemEl.querySelector('.slot-duration');
      if (durationEl) {
        if (item.duration) {
          durationEl.style.display = '';
          // First, set the initial duration value
          DurationSelector.setDurationInSlot(itemEl, item.duration, this._config);
          // Then attach event listeners
          DurationSelector.attachEventListenersInSlot(itemEl, (duration) => {
            if (itemEl.dataset.updating === 'true') return;
            this._updateItem(itemId, { duration });
          }, this._config);
        } else {
          durationEl.style.display = 'none';
        }
      }

      // Update HVAC mode - use data-action selector to match template
      const hvacModeSelect = itemEl.querySelector('[data-action="update-hvac-mode"]');
      if (hvacModeSelect) {
        const hvacModeHandler = (e) => {
          if (itemEl.dataset.updating === 'true') return;
          e.stopPropagation();
          const currentItems = this._getItems();
          const currentItem = currentItems.find(i => i.id === itemId);
          if (!currentItem) {
            return;
          }
          
          const newHvacMode = e.target.value;
          
          const serviceStart = {
            name: 'climate.set_hvac_mode',
            value: {
              entity_id: currentItem.entity_id,
              hvac_mode: newHvacMode
            }
          };
          
          // If item has duration and service_end, keep service_end as is
          const updates = { service_start: serviceStart };
          if (currentItem.duration && currentItem.service_end) {
            // Keep service_end as is (it should be 'off' mode)
            updates.service_end = currentItem.service_end;
          }
          
          this._updateItem(itemId, updates);
          const wrap = itemEl.querySelector('.slot-entities-wrap');
          if (wrap) this._updateSlotEntitiesForMode(wrap, itemEl);
        };
        // Clone node to remove all event listeners
        const newHvacModeSelect = hvacModeSelect.cloneNode(true);
        hvacModeSelect.parentNode.replaceChild(newHvacModeSelect, hvacModeSelect);
        newHvacModeSelect.addEventListener('change', hvacModeHandler);
        newHvacModeSelect.addEventListener('click', (e) => {
          e.stopPropagation();
        });
      }

      const slotEntitiesWrap = itemEl.querySelector('.slot-entities-wrap');
      if (slotEntitiesWrap) {
        const entities = this._getEntities();
        if (entities.length <= 1) {
          slotEntitiesWrap.style.display = 'none';
        } else {
          slotEntitiesWrap.style.display = '';
        }
        if (window.EntitiesSelector && window.EntitiesSelector.attachEntitiesList && entities.length > 1) {
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
          const slotHvacSelect = itemEl.querySelector('[data-action="update-hvac-mode"]');
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
            onCheck: async (entityId) => {
              const timeHours = itemEl.querySelector('[data-action="update-time-hours"]');
              const timeMinutes = itemEl.querySelector('[data-action="update-time-minutes"]');
              const time = (timeHours && timeMinutes) ? `${timeHours.value}:${timeMinutes.value}` : item.time;
              const selectedWeekdays = WeekdaySelector.getSelectedWeekdays(itemEl);
              const weekdays = selectedWeekdays.length > 0 ? selectedWeekdays : item.weekdays;
              const hvacSelect = itemEl.querySelector('[data-action="update-hvac-mode"]');
              const hvacMode = hvacSelect && hvacSelect.value ? hvacSelect.value : (item.service_start?.value?.hvac_mode || 'heat');
              let duration = null;
              if (window.DurationSelector) {
                const wrapper = itemEl.querySelector('.duration-selector-wrapper');
                if (wrapper) duration = DurationSelector.getSelectedDuration(itemEl);
              }
              const service_start = ScheduleHelper.createClimateServices(entityId, hvacMode).service_start;
              const service_end = duration ? ScheduleHelper.createClimateServices(entityId, hvacMode).service_end : null;
              await ScheduleHelper.addScheduleSlot({
                hass: this._hass,
                callService: async (service, data) => this._callService(service, data),
                getBridgeState: () => this._getBridgeState(),
                entity_id: entityId,
                time,
                duration: duration || undefined,
                weekdays,
                service_start,
                service_end,
                bridgeSensor: this._bridgeSensor,
                onRender: () => { this.hass = { ...this._hass }; this.render().catch(() => {}); }
              });
              this._optimisticBridgeState = null;
              this.hass = { ...this._hass };
              await this.render();
            },
            onUncheck: async (entityId) => {
              const ids = JSON.parse(slotEntitiesWrap.dataset.slotEntityIds || '{}');
              const itemIdToDelete = ids[entityId];
              if (itemIdToDelete) await this._deleteItem(itemIdToDelete);
            }
          });
          this._updateSlotEntitiesChips(slotEntitiesWrap);
          const trigger = slotEntitiesWrap.querySelector('.slot-entities-trigger');
          const dropdown = slotEntitiesWrap.querySelector('.slot-entities-dropdown');
          const selectAllInput = slotEntitiesWrap.querySelector('.slot-entities-select-all-input');
          if (trigger && dropdown) {
            trigger.addEventListener('click', (e) => {
              e.stopPropagation();
              const open = dropdown.classList.toggle('open');
              trigger.classList.toggle('open', open);
              if (open) {
                const close = (ev) => {
                  if (slotEntitiesWrap.contains(ev.target)) return;
                  document.removeEventListener('click', close);
                  dropdown.classList.remove('open');
                  trigger.classList.remove('open');
                };
                setTimeout(() => document.addEventListener('click', close), 0);
              }
            });
          }
          if (selectAllInput) {
            const listEl = slotEntitiesWrap.querySelector('.entities-selector-list');
            selectAllInput.addEventListener('change', () => {
              if (!listEl) return;
              const inputs = listEl.querySelectorAll('input[name="entities-selector-entity"]:not(:disabled)');
              inputs.forEach(inp => { inp.checked = selectAllInput.checked; });
              this._updateSlotEntitiesChips(slotEntitiesWrap);
            });
          }
          const listElForSync = slotEntitiesWrap.querySelector('.entities-selector-list');
          if (listElForSync && selectAllInput) {
            listElForSync.addEventListener('change', () => {
              this._updateSlotEntitiesChips(slotEntitiesWrap);
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
          const selectedWeekdays = WeekdaySelector.getSelectedWeekdays(itemEl);
          
          if (selectedWeekdays.length === 0) {
            // Don't allow empty weekdays - restore previous state
            WeekdaySelector.setSelectedWeekdays(this.shadowRoot, currentItem.weekdays, itemEl);
            return;
          }
          
          // Only update if weekdays actually changed
          const currentWeekdaysSorted = (currentItem.weekdays || []).slice().sort();
          const selectedWeekdaysSorted = selectedWeekdays.slice().sort();
          const weekdaysChanged = JSON.stringify(selectedWeekdaysSorted) !== JSON.stringify(currentWeekdaysSorted);
          
          if (weekdaysChanged) {
            this._updateItem(itemId, { weekdays: selectedWeekdays });
          } else {
          }
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
                        const day = parseInt(dayEl.dataset.day);
                        dayEl.classList.toggle('active', currentItem.weekdays.includes(day));
                      });
                    }
                  }
                });
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
