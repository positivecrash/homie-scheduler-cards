/**
 * Shared: entities-selector
 * Fills an entities list from HTML template and attaches change handlers.
 * All HTML structure is in entities-selector.html (list container + row template).
 *
 * @param {Element} root - Container that has .entities-selector-list and .entities-selector-row-tpl
 * @param {Object} options
 * @param {string[]} options.entities - Entity IDs to show
 * @param {string[]|Set<string>} options.checkedEntityIds - Which entities are checked
 * @param {Object} options.hass - Home Assistant state object (for friendly_name)
 * @param {function(string)} [options.onCheck] - Called when an entity is checked
 * @param {function(string)} [options.onUncheck] - Called when an entity is unchecked
 * @param {function(string): boolean} [options.isEntityDisabled] - If true, row is disabled and unchecked
 */
function attachEntitiesList(root, options) {
  if (!root) return;
  const listEl = root.querySelector('.entities-selector-list');
  const rowTpl = root.querySelector('.entities-selector-row-tpl');
  if (!listEl || !rowTpl || !rowTpl.content) return;

  const {
    entities = [],
    checkedEntityIds = [],
    hass = null,
    onCheck = null,
    onUncheck = null,
    isEntityDisabled = null
  } = options;

  const checkedSet = checkedEntityIds instanceof Set
    ? checkedEntityIds
    : new Set(Array.isArray(checkedEntityIds) ? checkedEntityIds : []);

  listEl.innerHTML = '';
  entities.forEach(entityId => {
    const clone = rowTpl.content.cloneNode(true);
    const row = clone.querySelector('.entities-selector-row');
    const input = clone.querySelector('input[name="entities-selector-entity"]');
    const nameEl = clone.querySelector('.entities-selector-entity-name');
    if (!input || !nameEl) return;

    const name = (hass && hass.states && hass.states[entityId] && hass.states[entityId].attributes && hass.states[entityId].attributes.friendly_name) || entityId;
    const disabled = typeof isEntityDisabled === 'function' && isEntityDisabled(entityId);
    const checked = !disabled && checkedSet.has(entityId);

    input.value = entityId;
    input.checked = checked;
    input.disabled = !!disabled;
    nameEl.textContent = name;
    if (disabled) row.classList.add('entities-selector-row-unsupported');

    input.addEventListener('change', () => {
      if (input.checked && onCheck) onCheck(entityId);
      if (!input.checked && onUncheck) onUncheck(entityId);
    });
    listEl.appendChild(clone);
  });
}

// Expose for cards (build strips export)
if (typeof window !== 'undefined') {
  window.EntitiesSelector = { attachEntitiesList };
}
