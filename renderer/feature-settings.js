(function (root) {
  let onSaved, flags = Features.defaults;
  const node = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  function chips(values) {
    const list = node('div', 'format-chips');
    values.forEach(value => list.appendChild(node('span', 'format-chip', value)));
    return list;
  }
  function item(feature) {
    const el = node('article', 'feature-item');
    el.dataset.feature = feature.id;
    const top = node('div', 'feature-top'), heading = node('h3', '', feature.name);
    heading.appendChild(node('span', 'feature-on', 'On'));
    const button = node('button', 'switch');
    button.type = 'button'; button.setAttribute('role', 'switch');
    button.setAttribute('aria-label', feature.name); button.setAttribute('aria-checked', 'true');
    button.onclick = () => save({ [feature.id]: flags[feature.id] === false }, button);
    top.append(heading, button); el.append(top, node('p', '', feature.description));
    if (feature.kind) {
      const inputs = Formats.KINDS[feature.kind], route = node('label', 'feature-route', 'From');
      const select = node('select'); select.setAttribute('aria-label', `${feature.name} input format`);
      inputs.forEach(ext => select.appendChild(new Option(ext.toUpperCase(), ext)));
      const outputs = node('div', 'route-output');
      const updateRoute = () => outputs.replaceChildren(chips(Formats.targetsFor(feature.kind, select.value).map(Formats.nameFor)));
      select.onchange = updateRoute; route.append(select, node('span', '', 'to')); updateRoute();
      const details = node('details'); details.append(node('summary', '', `${inputs.length} supported input extensions`), chips(inputs.map(ext => ext.toUpperCase())));
      el.append(route, outputs, details);
    }
    if (feature.kinds) {
      const names = feature.tool === 'ZIP' ? 'Non-archive files and mixed selections' : feature.kinds.map(kind => Features.families.find(f => f.kind === kind).name).join(', ');
      el.appendChild(node('div', 'feature-kinds', names));
    }
    return el;
  }
  async function save(patch, button) {
    button.disabled = true;
    try {
      onSaved(await api.setSettings({ features: patch }));
      document.getElementById('featureStatus').textContent = 'Changes saved.';
    } catch {
      document.getElementById('featureStatus').textContent = 'Could not save this change. Try again.';
    } finally { button.disabled = false; }
  }
  function filter() {
    const query = document.getElementById('featureSearch').value.trim().toLowerCase();
    let visible = 0;
    document.querySelectorAll('#catalogue .feature-item').forEach(el => {
      el.hidden = !el.textContent.toLowerCase().includes(query);
      if (!el.hidden) visible++;
    });
    for (const id of ['conversionFeatures', 'toolFeatures']) {
      const section = document.getElementById(id);
      section.hidden = !section.querySelector('.feature-item:not([hidden])');
    }
    for (const id of ['includedFeatures']) {
      const section = document.getElementById(id);
      section.hidden = !!query && !section.textContent.toLowerCase().includes(query);
      if (!section.hidden) visible++;
    }
    document.getElementById('featureEmpty').hidden = visible > 0;
  }
  function init(callback) {
    onSaved = callback;
    for (const [id, items] of [['conversionList', Features.families], ['toolList', Features.tools], ['controlList', Features.controls]])
      document.getElementById(id).replaceChildren(...items.map(item));
    document.getElementById('featureSearch').oninput = filter;
    document.querySelector('.feature-nav').onclick = event => {
      const link = event.target.closest('a');
      if (!link) return;
      event.preventDefault();
      document.getElementById('featureSearch').value = ''; filter();
      document.querySelector(link.getAttribute('href')).scrollIntoView();
    };
    document.getElementById('enableAll').onclick = event => save(Features.defaults, event.currentTarget);
  }
  function update(settings) {
    flags = Features.sanitize(settings.features);
    document.querySelectorAll('.feature-item').forEach(el => {
      const on = flags[el.dataset.feature];
      el.dataset.enabled = String(on);
      el.querySelector('[role=switch]').setAttribute('aria-checked', String(on));
      el.querySelector('.feature-on').textContent = on ? 'On' : 'Off';
    });
  }
  root.FeatureSettings = { init, update };
})(this);
