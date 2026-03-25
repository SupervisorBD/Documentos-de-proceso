(() => {
  'use strict';

  const TYPES = {
    pdf: { label: 'PDF', icon: '📄' },
    excel: { label: 'Excel', icon: '📊' },
    form: { label: 'Formulario', icon: '🧾' },
    link: { label: 'Enlace', icon: '🔗' }
  };

  const VIEWS = [
    { id: 'dashboard', title: 'Panel', small: 'Resumen ejecutivo' },
    { id: 'library', title: 'Biblioteca', small: 'Todos los documentos' },
    { id: 'favorites', title: 'Favoritos', small: 'Accesos guardados' },
    { id: 'editor', title: 'Editor', small: 'Mover, crear y corregir' }
  ];

  const el = (id) => document.getElementById(id);

  const state = {
    data: typeof PORTAL_DEFAULT_DATA !== 'undefined' ? clone(PORTAL_DEFAULT_DATA) : { sections: [] },
    favorites: [],
    user: '',
    role: 'Editor',
    view: 'dashboard',
    search: '',
    sectionFilter: '',
    typeFilter: '',
    currentFileName: 'Base interna',
    editing: { sectionId: null, itemId: null },
    pendingAsset: null,
    pendingAssetName: '',
    viewer: { itemId: null, url: '', name: '' }
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function safeText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function normalize(value) {
    return safeText(value).toLowerCase();
  }

  function escapeHtml(value) {
    return safeText(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function uid(prefix = 'id') {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function nowLabel() {
    return new Date().toLocaleString('es-HN', { dateStyle: 'short', timeStyle: 'short' });
  }

  function toast(message) {
    const node = el('toast');
    if (!node) return;
    node.textContent = message;
    node.classList.add('show');
    window.clearTimeout(window.__portalToastTimer);
    window.__portalToastTimer = window.setTimeout(() => node.classList.remove('show'), 2400);
  }

  function getSections() {
    return Array.isArray(state.data.sections) ? state.data.sections : [];
  }

  function getAllItems() {
    return getSections().flatMap(section =>
      (section.items || []).map(item => ({ ...item, sectionId: section.id, sectionName: section.name }))
    );
  }

  function findSection(sectionId) {
    return getSections().find(section => section.id === sectionId) || null;
  }

  function findItemById(itemId) {
    for (const section of getSections()) {
      const item = (section.items || []).find(entry => entry.id === itemId);
      if (item) return { section, item };
    }
    return null;
  }

  function typeMeta(type) {
    return TYPES[type] || TYPES.link;
  }

  function itemUrl(item) {
    if (item?.asset?.data) return item.asset.data;
    return safeText(item?.url);
  }

  function loadPdfAsset(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ data: reader.result, name: file.name, mime: file.type || 'application/pdf' });
      reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo.'));
      reader.readAsDataURL(file);
    });
  }

  function isOpenable(item) {
    return Boolean(itemUrl(item));
  }

  function filterItems(items) {
    const q = normalize(state.search);
    return items.filter((item) => {
      const matchesSearch = !q || [
        item.name,
        item.note,
        item.url,
        item.sectionName
      ].some(value => normalize(value).includes(q));

      const matchesSection = !state.sectionFilter || item.sectionId === state.sectionFilter;
      const matchesType = !state.typeFilter || item.type === state.typeFilter;
      return matchesSearch && matchesSection && matchesType;
    });
  }

  function sortedItems(items) {
    return [...items].sort((a, b) => {
      const favA = state.favorites.includes(a.id) ? 1 : 0;
      const favB = state.favorites.includes(b.id) ? 1 : 0;
      if (favA !== favB) return favB - favA;
      return a.name.localeCompare(b.name, 'es');
    });
  }

  function setView(view) {
    state.view = view;
    render();
  }

  function setLoginState(user) {
    state.user = user;
    el('loginView').classList.add('hidden');
    el('appView').classList.remove('hidden');
    render();
  }

  function updateStats() {
    const sections = getSections();
    const allItems = getAllItems();
    const filtered = filterItems(allItems);
    const favorites = allItems.filter(item => state.favorites.includes(item.id));

    el('kpiSections').textContent = sections.length;
    el('kpiItems').textContent = allItems.length;
    el('kpiVisible').textContent = filtered.length;
    el('kpiFavs').textContent = favorites.length;

    el('projectSummary').textContent = `${sections.length} secciones · ${allItems.length} elementos`;
    el('sessionName').textContent = state.user || '—';
    el('sessionRole').textContent = state.role;
    el('sessionBadge').textContent = 'Activo';
    el('projectStateLabel').textContent = state.currentFileName ? 'Proyecto cargado' : 'Listo';
    el('lastFileLabel').textContent = state.currentFileName || 'Base interna';
    el('heroTitle').textContent = state.view === 'dashboard'
      ? 'Portal operativo'
      : state.view === 'library'
        ? 'Biblioteca documental'
        : state.view === 'favorites'
          ? 'Favoritos y accesos'
          : 'Editor y reubicación';
    el('heroText').textContent = state.view === 'dashboard'
      ? 'Explora los formatos, abre enlaces, marca favoritos, mueve elementos entre áreas y conserva todo en un archivo portable.'
      : state.view === 'library'
        ? 'Todos los documentos están organizados por sección. Puedes filtrar, abrir y mover cualquier elemento sin perder información.'
        : state.view === 'favorites'
          ? 'Aquí aparecen los accesos marcados. Mantén a mano lo que más usas y vuelve a ordenarlo cuando lo necesites.'
          : 'Edita secciones, corrige títulos, cambia URLs o adjunta PDFs para que el proyecto quede listo para exportar.';
  }

  function renderNav() {
    const nav = el('navButtons');
    nav.innerHTML = VIEWS.map(view => `
      <button class="nav-btn ${state.view === view.id ? 'active' : ''}" data-view="${view.id}">
        <strong>${view.title}</strong>
        <small>${view.small}</small>
      </button>
    `).join('');
    nav.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => setView(btn.dataset.view));
    });
  }

  function renderChips() {
    const chips = el('sectionChips');
    const sections = getSections();
    chips.innerHTML = [
      `<button class="chip ${!state.sectionFilter ? 'active' : ''}" data-section="">Todas</button>`,
      ...sections.map(section => `<button class="chip ${state.sectionFilter === section.id ? 'active' : ''}" data-section="${escapeHtml(section.id)}">${escapeHtml(section.name)}</button>`)
    ].join('');
    chips.querySelectorAll('[data-section]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.sectionFilter = btn.dataset.section || '';
        el('sectionFilter').value = state.sectionFilter;
        render();
      });
    });
  }

  function renderFilters() {
    const sectionFilter = el('sectionFilter');
    sectionFilter.innerHTML = '<option value="">Todas las secciones</option>' + getSections().map(section => (
      `<option value="${escapeHtml(section.id)}">${escapeHtml(section.name)}</option>`
    )).join('');
    sectionFilter.value = state.sectionFilter;

    el('typeFilter').value = state.typeFilter;
    el('searchInput').value = state.search;
  }

  function itemCard(item, section, options = {}) {
    const kind = typeMeta(item.type);
    const fav = state.favorites.includes(item.id);
    const url = itemUrl(item);
    const canOpen = Boolean(url);
    const isPdf = item.type === 'pdf';
    const openLabel = canOpen ? (isPdf ? 'Ver PDF' : 'Abrir') : 'Completar';
    const actionOpen = canOpen ? 'open-item' : 'edit-item';
    const assetLabel = item.asset?.name ? `PDF adjunto: ${item.asset.name}` : '';
    return `
      <article class="item-card ${options.draggable ? 'draggable' : ''}" ${options.draggable ? 'draggable="true"' : ''} data-item-id="${escapeHtml(item.id)}">
        <div class="item-head">
          <div class="drag-handle" title="Arrastrar">⋮⋮</div>
          <div class="item-title-group">
            <div class="item-kicker">${escapeHtml(section.name)}</div>
            <h4>${escapeHtml(item.name)}</h4>
          </div>
          <span class="badge type">${kind.icon} ${kind.label}</span>
        </div>
        <p class="item-note">${escapeHtml(item.note || 'Sin nota')}</p>
        <div class="item-meta">
          <span>${canOpen ? (item.type === 'pdf' ? 'Listo para vista previa' : 'Enlace disponible') : 'Enlace pendiente'}</span>
          ${assetLabel ? `<span>${escapeHtml(assetLabel)}</span>` : ''}
        </div>
        <div class="item-actions">
          <button class="btn btn-soft btn-slim" data-action="${actionOpen}" data-id="${escapeHtml(item.id)}">${openLabel}</button>
          <button class="btn btn-${fav ? 'warning' : 'ghost'} btn-slim" data-action="toggle-fav" data-id="${escapeHtml(item.id)}">${fav ? 'Favorito' : 'Fav'}</button>
          <button class="btn btn-ghost btn-slim" data-action="edit-item" data-id="${escapeHtml(item.id)}">Editar</button>
        </div>
      </article>
    `;
  }

  function sectionBlock(section, items, opts = {}) {
    const itemMarkup = items.length
      ? items.map(item => itemCard(item, section, { draggable: opts.draggable })).join('')
      : `<div class="empty-state">No hay elementos en esta sección.</div>`;

    const dropHint = opts.draggable
      ? `<div class="drop-hint">Suelta aquí para mover elementos a <strong>${escapeHtml(section.name)}</strong>.</div>`
      : '';

    return `
      <section class="section-block" data-section-target="${escapeHtml(section.id)}">
        <div class="section-head">
          <div>
            <h3>${escapeHtml(section.name)}</h3>
            <p>${escapeHtml(section.description || '')}</p>
          </div>
          <div class="section-badge">${(section.items || []).length} elementos</div>
        </div>
        ${dropHint}
        <div class="item-grid ${opts.compact ? 'compact' : ''}">
          ${itemMarkup}
        </div>
      </section>
    `;
  }

  function renderDashboard() {
    const box = el('dashboardBox');
    const sections = getSections();
    const allItems = filterItems(sortedItems(getAllItems()));
    const featured = allItems.slice(0, 6);

    box.innerHTML = `
      <div class="dashboard-grid">
        <div class="hero-panel">
          <div class="hero-capsules">
            <span class="pill">Arrastrar y soltar</span>
            <span class="pill">PDF portable</span>
            <span class="pill">Editar sin perder datos</span>
          </div>
          <h2>Panel corporativo con vista clara y archivos portables</h2>
          <p>Organiza secciones, mueve campos entre áreas, abre documentos y conserva todo en una estructura lista para GitHub Pages.</p>
          <div class="hero-actions">
            <button class="btn btn-primary" id="heroStartBtn" type="button">Ver biblioteca</button>
            <button class="btn btn-soft" id="heroFavBtn" type="button">Ir a favoritos</button>
          </div>
        </div>
        <div class="hero-metrics">
          <div class="metric-card accent">
            <div class="label">Secciones</div>
            <div class="value">${sections.length}</div>
            <div class="sub">Agrupaciones activas</div>
          </div>
          <div class="metric-card">
            <div class="label">Elementos</div>
            <div class="value">${getAllItems().length}</div>
            <div class="sub">Documentos, enlaces y formularios</div>
          </div>
          <div class="metric-card">
            <div class="label">Favoritos</div>
            <div class="value">${state.favorites.length}</div>
            <div class="sub">Accesos guardados</div>
          </div>
        </div>
      </div>

      <div class="section-strip">
        ${sections.map(section => `
          <article class="mini-section-card" data-go-section="${escapeHtml(section.id)}">
            <strong>${escapeHtml(section.name)}</strong>
            <span>${(section.items || []).length} elementos</span>
          </article>
        `).join('')}
      </div>

      <div class="featured-header">
        <h3>Accesos destacados</h3>
        <span>${featured.length} visibles según tus filtros</span>
      </div>
      <div class="item-grid featured-grid">
        ${featured.map(item => {
          const section = findSection(item.sectionId) || { name: item.sectionName || '' };
          return itemCard(item, section, { draggable: false });
        }).join('')}
      </div>
    `;

    box.querySelector('#heroStartBtn').addEventListener('click', () => setView('library'));
    box.querySelector('#heroFavBtn').addEventListener('click', () => setView('favorites'));
    box.querySelectorAll('[data-go-section]').forEach(card => {
      card.addEventListener('click', () => {
        state.sectionFilter = card.dataset.goSection || '';
        el('sectionFilter').value = state.sectionFilter;
        setView('library');
      });
    });
  }

  function renderLibrary() {
    const box = el('libraryBox');
    const filtered = filterItems(sortedItems(getAllItems()));
    const sections = getSections();

    box.innerHTML = sections.map(section => {
      const items = filtered.filter(item => item.sectionId === section.id);
      return sectionBlock(section, items, { compact: false, draggable: false });
    }).join('');
  }

  function renderFavorites() {
    const box = el('favoritesBox');
    const items = filterItems(sortedItems(getAllItems().filter(item => state.favorites.includes(item.id))));
    const sections = getSections();

    if (!items.length) {
      box.innerHTML = `<div class="empty-state large">Aún no tienes favoritos marcados.</div>`;
      return;
    }

    const grouped = sections.map(section => ({
      section,
      items: items.filter(item => item.sectionId === section.id)
    })).filter(group => group.items.length);

    box.innerHTML = grouped.map(group => sectionBlock(group.section, group.items, { compact: false, draggable: false })).join('');
  }

  function renderEditor() {
    const box = el('editorBox');
    const sections = getSections();
    const filtered = filterItems(sortedItems(getAllItems()));

    box.innerHTML = sections.map(section => {
      const items = filtered.filter(item => item.sectionId === section.id);
      const itemsMarkup = items.length
        ? items.map(item => itemCard(item, section, { draggable: true })).join('')
        : `<div class="empty-state">Suelta aquí un elemento para moverlo a esta sección.</div>`;
      return `
        <section class="editor-column" data-drop-section="${escapeHtml(section.id)}">
          <div class="editor-column-head">
            <div>
              <h3>${escapeHtml(section.name)}</h3>
              <p>${escapeHtml(section.description || '')}</p>
            </div>
            <div class="editor-actions">
              <button class="btn btn-soft btn-slim" data-edit-section="${escapeHtml(section.id)}">Editar</button>
              <button class="btn btn-ghost btn-slim" data-add-item="${escapeHtml(section.id)}">Nuevo</button>
            </div>
          </div>
          <div class="drop-zone">Arrastra aquí para reubicar documentos.</div>
          <div class="item-grid editor-grid-items">
            ${itemsMarkup}
          </div>
        </section>
      `;
    }).join('');

    box.querySelectorAll('[data-edit-section]').forEach(btn => {
      btn.addEventListener('click', () => openSectionModal(btn.dataset.editSection));
    });
    box.querySelectorAll('[data-add-item]').forEach(btn => {
      btn.addEventListener('click', () => openItemModal(null, btn.dataset.addItem));
    });

    box.querySelectorAll('[data-drop-section]').forEach(column => {
      column.addEventListener('dragover', (ev) => {
        ev.preventDefault();
        column.classList.add('drag-over');
      });
      column.addEventListener('dragleave', () => column.classList.remove('drag-over'));
      column.addEventListener('drop', (ev) => {
        ev.preventDefault();
        column.classList.remove('drag-over');
        const itemId = ev.dataTransfer.getData('text/plain');
        if (!itemId) return;
        moveItemToSection(itemId, column.dataset.dropSection);
      });
    });

    box.querySelectorAll('[draggable="true"]').forEach(card => {
      card.addEventListener('dragstart', ev => {
        ev.dataTransfer.setData('text/plain', card.dataset.itemId);
        ev.dataTransfer.effectAllowed = 'move';
      });
    });
  }

  function renderSectionsInSelects() {
    const sectionSelect = el('itemSection');
    const sections = getSections();
    sectionSelect.innerHTML = sections.map(section => `<option value="${escapeHtml(section.id)}">${escapeHtml(section.name)}</option>`).join('');
  }

  function bindItemAction(button) {
    button.addEventListener('click', () => {
      const itemId = button.dataset.id;
      const action = button.dataset.action;
      if (action === 'toggle-fav') {
        toggleFavorite(itemId);
        return;
      }
      if (action === 'open-item') {
        openItem(itemId);
        return;
      }
      if (action === 'edit-item') {
        openItemModal(itemId);
      }
    });
  }

  function render() {
    if (!el('appView') || el('appView').classList.contains('hidden')) return;
    renderNav();
    renderChips();
    renderFilters();
    updateStats();

    el('sectionDashboard').classList.toggle('active', state.view === 'dashboard');
    el('sectionLibrary').classList.toggle('active', state.view === 'library');
    el('sectionFavorites').classList.toggle('active', state.view === 'favorites');
    el('sectionEditor').classList.toggle('active', state.view === 'editor');

    if (state.view === 'dashboard') renderDashboard();
    if (state.view === 'library') renderLibrary();
    if (state.view === 'favorites') renderFavorites();
    if (state.view === 'editor') renderEditor();

    renderSectionsInSelects();
  }

  function openViewer(itemId) {
    const found = findItemById(itemId);
    if (!found) return;
    const url = itemUrl(found.item);
    if (!url) {
      openItemModal(itemId);
      toast('Ese documento necesita un enlace o un PDF.');
      return;
    }

    state.viewer = { itemId, url, name: found.item.name || 'Documento' };
    const title = el('viewerTitle');
    const sub = el('viewerSub');
    const frame = el('viewerFrame');
    if (title) title.textContent = found.item.name || 'Vista previa';
    if (sub) sub.textContent = found.item.note || 'PDF listo para imprimir.';
    if (frame) frame.src = encodeURI(url);
    const modal = el('viewerModal');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeViewer() {
    const frame = el('viewerFrame');
    if (frame) frame.src = 'about:blank';
    state.viewer = { itemId: null, url: '', name: '' };
    closeModal('viewerModal');
  }

  function printViewer() {
    const frame = el('viewerFrame');
    if (!frame || !state.viewer.url) return;
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch {
      window.open(encodeURI(state.viewer.url), '_blank', 'noopener,noreferrer');
    }
  }

  function openViewerExternal() {
    if (!state.viewer.url) return;
    window.open(encodeURI(state.viewer.url), '_blank', 'noopener,noreferrer');
  }

  function openItem(itemId) {
    const found = findItemById(itemId);
    if (!found) return;
    const url = itemUrl(found.item);
    if (!url) {
      openItemModal(itemId);
      toast('Ese documento necesita un enlace o un PDF.');
      return;
    }
    const isPdf = found.item.type === 'pdf' || url.toLowerCase().includes('.pdf') || url.startsWith('data:application/pdf');
    if (isPdf) {
      openViewer(itemId);
      return;
    }
    window.open(encodeURI(url), '_blank', 'noopener,noreferrer');
  }

  function toggleFavorite(itemId) {
    const idx = state.favorites.indexOf(itemId);
    if (idx >= 0) state.favorites.splice(idx, 1);
    else state.favorites.push(itemId);
    toast(idx >= 0 ? 'Favorito eliminado.' : 'Guardado en favoritos.');
    render();
  }

  function moveItemToSection(itemId, sectionId) {
    const found = findItemById(itemId);
    if (!found) return;
    const target = findSection(sectionId);
    if (!target) return;
    if (found.section.id === sectionId) return;

    found.section.items = found.section.items.filter(item => item.id !== itemId);
    target.items = target.items || [];
    target.items.push(found.item);
    toast(`Movido a ${target.name}.`);
    render();
  }

  function openItemModal(itemId = null, presetSectionId = null) {
    const modal = el('itemModal');
    const title = el('itemModalTitle');
    const subtitle = el('itemModalSub');
    const sectionSelect = el('itemSection');
    const typeSelect = el('itemType');
    const nameInput = el('itemName');
    const noteInput = el('itemNote');
    const urlInput = el('itemUrl');
    const badge = el('assetStateBadge');
    const fileName = el('assetFileName');

    state.editing.itemId = itemId;
    state.editing.sectionId = presetSectionId || null;
    state.pendingAsset = null;
    state.pendingAssetName = '';

    renderSectionsInSelects();

    const defaultSection = presetSectionId || (findItemById(itemId)?.section.id) || getSections()[0]?.id || '';
    sectionSelect.value = defaultSection;

    if (itemId) {
      const found = findItemById(itemId);
      if (!found) return;
      title.textContent = 'Editar elemento';
      subtitle.textContent = 'Cambia sección, tipo, URL o adjunta un PDF sin perder la información.';
      sectionSelect.value = found.section.id;
      typeSelect.value = found.item.type || 'pdf';
      nameInput.value = found.item.name || '';
      noteInput.value = found.item.note || '';
      urlInput.value = found.item.url || '';
      if (found.item.asset?.name) {
        badge.textContent = 'PDF adjunto';
        badge.className = 'badge success';
        fileName.textContent = found.item.asset.name;
      } else {
        badge.textContent = 'Sin archivo';
        badge.className = 'badge warn';
        fileName.textContent = 'Ningún archivo seleccionado.';
      }
    } else {
      title.textContent = 'Nuevo elemento';
      subtitle.textContent = 'Crea un registro nuevo y elígelo en la sección correcta.';
      typeSelect.value = 'pdf';
      nameInput.value = '';
      noteInput.value = '';
      urlInput.value = '';
      badge.textContent = 'Sin archivo';
      badge.className = 'badge warn';
      fileName.textContent = 'Ningún archivo seleccionado.';
    }

    el('itemAssetInput').value = '';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal(id) {
    const modal = el(id);
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function openSectionModal(sectionId = null) {
    state.editing.sectionId = sectionId;
    const modal = el('sectionModal');
    const title = el('sectionModalTitle');
    const subtitle = el('sectionModalSub');
    const nameInput = el('sectionName');
    const descInput = el('sectionDesc');

    if (sectionId) {
      const section = findSection(sectionId);
      title.textContent = 'Editar sección';
      subtitle.textContent = 'Ajusta el nombre o la descripción sin borrar elementos.';
      nameInput.value = section?.name || '';
      descInput.value = section?.description || '';
    } else {
      title.textContent = 'Nueva sección';
      subtitle.textContent = 'Agrega una agrupación nueva para seguir ordenando el portal.';
      nameInput.value = '';
      descInput.value = '';
    }

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function saveItem() {
    const itemId = state.editing.itemId;
    const sectionId = safeText(el('itemSection').value);
    const type = safeText(el('itemType').value) || 'pdf';
    const name = safeText(el('itemName').value);
    const note = safeText(el('itemNote').value);
    const url = safeText(el('itemUrl').value);

    if (!name) {
      toast('Escribe un título.');
      return;
    }
    const section = findSection(sectionId);
    if (!section) {
      toast('Elige una sección válida.');
      return;
    }

    const payload = {
      id: itemId || uid('item'),
      name,
      type,
      url,
      note,
    };

    const found = itemId ? findItemById(itemId) : null;
    if (found && found.item.asset) {
      payload.asset = found.item.asset;
    }
    if (state.pendingAsset) {
      payload.asset = {
        name: state.pendingAssetName || 'archivo.pdf',
        type: state.pendingAsset.type || 'application/pdf',
        data: state.pendingAsset
      };
    }

    if (itemId && found) {
      if (found.section.id === sectionId) {
        const idx = found.section.items.findIndex(item => item.id === itemId);
        found.section.items[idx] = payload;
      } else {
        found.section.items = found.section.items.filter(item => item.id !== itemId);
        section.items.push(payload);
      }
    } else {
      section.items.push(payload);
    }

    state.pendingAsset = null;
    state.pendingAssetName = '';
    closeModal('itemModal');
    toast('Elemento guardado.');
    render();
  }

  function saveSection() {
    const sectionId = state.editing.sectionId;
    const name = safeText(el('sectionName').value);
    const desc = safeText(el('sectionDesc').value);
    if (!name) {
      toast('Escribe un nombre de sección.');
      return;
    }
    if (sectionId) {
      const section = findSection(sectionId);
      if (section) {
        section.name = name;
        section.description = desc;
      }
    } else {
      getSections().push({ id: uid('sec'), name, description: desc, items: [] });
    }
    closeModal('sectionModal');
    toast('Sección actualizada.');
    render();
  }

  function exportProject(asTemplate = false) {
    const payload = {
      data: asTemplate ? clone(PORTAL_DEFAULT_DATA) : clone(state.data),
      favorites: asTemplate ? [] : clone(state.favorites),
      exportedAt: nowLabel(),
      exportedBy: state.user || 'Sistema local'
    };
    const filename = asTemplate ? 'portal-corporativo-plantilla.json' : 'portal-corporativo-portable.json';
    downloadJson(payload, filename);
    state.currentFileName = filename;
    el('lastFileLabel').textContent = filename;
    toast(asTemplate ? 'Plantilla exportada.' : 'Proyecto exportado.');
  }

  function downloadJson(payload, filename) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importProject(file, merge = false) {
    if (!file) return;
    const text = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      toast('El archivo JSON no se pudo leer.');
      return;
    }
    if (!parsed?.data?.sections) {
      toast('Formato inválido: falta data.sections.');
      return;
    }
    if (merge) {
      mergeProject(parsed);
      toast('Proyecto añadido.');
    } else {
      state.data = parsed.data;
      state.favorites = Array.isArray(parsed.favorites) ? parsed.favorites : [];
      toast('Proyecto reemplazado.');
    }
    state.currentFileName = file.name;
    el('lastFileLabel').textContent = file.name;
    state.view = 'dashboard';
    render();
  }

  function mergeProject(parsed) {
    const incoming = clone(parsed.data);
    const current = getSections();
    const bySection = new Map(current.map(section => [section.id, section]));

    for (const section of incoming.sections || []) {
      const existing = bySection.get(section.id);
      if (!existing) {
        current.push(section);
        continue;
      }
      if (section.name && !existing.name) existing.name = section.name;
      if (section.description && !existing.description) existing.description = section.description;
      existing.items = existing.items || [];
      const currentIds = new Set(existing.items.map(item => item.id));
      for (const item of (section.items || [])) {
        if (!currentIds.has(item.id)) existing.items.push(item);
      }
    }

    if (Array.isArray(parsed.favorites)) {
      const favSet = new Set(state.favorites);
      for (const id of parsed.favorites) favSet.add(id);
      state.favorites = [...favSet];
    }
  }

  function resetProject() {
    if (!confirm('¿Restaurar la base interna? Se perderán los cambios no exportados.')) return;
    state.data = clone(PORTAL_DEFAULT_DATA);
    state.favorites = [];
    state.currentFileName = 'Base interna';
    state.view = 'dashboard';
    state.search = '';
    state.sectionFilter = '';
    state.typeFilter = '';
    state.pendingAsset = null;
    state.pendingAssetName = '';
    toast('Base restaurada.');
    render();
  }

  function attachHandlers() {
    el('loginBtn').addEventListener('click', () => {
      const name = safeText(el('loginName').value);
      if (!name) {
        toast('Escribe tu nombre.');
        return;
      }
      setLoginState(name);
    });

    el('loginName').addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') el('loginBtn').click();
    });

    el('loadDemoBtn').addEventListener('click', () => {
      el('loginName').value = 'Usuario autorizado';
      el('loginBtn').click();
    });

    el('logoutBtn').addEventListener('click', () => {
      el('appView').classList.add('hidden');
      el('loginView').classList.remove('hidden');
      state.user = '';
      toast('Sesión cerrada.');
    });

    el('clearFiltersBtn').addEventListener('click', () => {
      state.search = '';
      state.sectionFilter = '';
      state.typeFilter = '';
      render();
    });

    el('searchInput').addEventListener('input', (ev) => {
      state.search = ev.target.value;
      render();
    });
    el('sectionFilter').addEventListener('change', (ev) => {
      state.sectionFilter = ev.target.value;
      render();
    });
    el('typeFilter').addEventListener('change', (ev) => {
      state.typeFilter = ev.target.value;
      render();
    });

    el('exportBtn').addEventListener('click', () => exportProject(false));
    el('exportTemplateBtn').addEventListener('click', () => exportProject(true));

    el('importReplaceBtn').addEventListener('click', () => {
      el('fileInput').dataset.mode = 'replace';
      el('fileInput').click();
    });
    el('importMergeBtn').addEventListener('click', () => {
      el('fileInput').dataset.mode = 'merge';
      el('fileInput').click();
    });

    el('fileInput').addEventListener('change', async (ev) => {
      const file = ev.target.files?.[0];
      const merge = el('fileInput').dataset.mode === 'merge';
      el('fileInput').value = '';
      await importProject(file, merge);
      el('fileInput').dataset.mode = '';
    });

    el('addSectionBtn').addEventListener('click', () => openSectionModal());
    el('addItemBtn').addEventListener('click', () => openItemModal(null, state.sectionFilter || getSections()[0]?.id || ''));
    el('resetProjectBtn').addEventListener('click', resetProject);

    el('saveItemBtn').addEventListener('click', saveItem);
    el('saveSectionBtn').addEventListener('click', saveSection);

    el('pickPdfBtn').addEventListener('click', () => el('itemAssetInput').click());
    el('clearPdfBtn').addEventListener('click', () => {
      state.pendingAsset = null;
      state.pendingAssetName = '';
      el('assetStateBadge').textContent = 'Sin archivo';
      el('assetStateBadge').className = 'badge warn';
      el('assetFileName').textContent = 'Ningún archivo seleccionado.';
      toast('PDF retirado del elemento.');
    });

    el('itemAssetInput').addEventListener('change', async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        toast('Selecciona un PDF.');
        ev.target.value = '';
        return;
      }
      const asset = await loadPdfAsset(file);
      state.pendingAsset = asset.data;
      state.pendingAssetName = asset.name;
      el('assetStateBadge').textContent = 'PDF adjunto';
      el('assetStateBadge').className = 'badge success';
      el('assetFileName').textContent = asset.name;
      toast('PDF adjunto listo para guardar.');
    });

    const assetDropZone = el('assetDropZone');
    if (assetDropZone) {
      assetDropZone.addEventListener('dragover', (ev) => {
        ev.preventDefault();
        assetDropZone.classList.add('drag-over');
      });
      assetDropZone.addEventListener('dragleave', () => {
        assetDropZone.classList.remove('drag-over');
      });
      assetDropZone.addEventListener('drop', async (ev) => {
        ev.preventDefault();
        assetDropZone.classList.remove('drag-over');
        const file = ev.dataTransfer?.files?.[0];
        if (!file) return;
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
          toast('Selecciona un PDF.');
          return;
        }
        const asset = await loadPdfAsset(file);
        state.pendingAsset = asset.data;
        state.pendingAssetName = asset.name;
        el('assetStateBadge').textContent = 'PDF adjunto';
        el('assetStateBadge').className = 'badge success';
        el('assetFileName').textContent = asset.name;
        toast('PDF adjunto listo para guardar.');
      });
      assetDropZone.addEventListener('click', () => el('itemAssetInput').click());
    }

    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
    });

    el('itemModal').addEventListener('click', (ev) => {
      if (ev.target === el('itemModal')) closeModal('itemModal');
    });
    el('sectionModal').addEventListener('click', (ev) => {
      if (ev.target === el('sectionModal')) closeModal('sectionModal');
    });

    el('itemType').addEventListener('change', (ev) => {
      const kind = ev.target.value;
      if (kind === 'pdf') {
        el('assetStateBadge').textContent = 'Sin archivo';
      }
    });

    const viewerModal = el('viewerModal');
    if (viewerModal) {
      viewerModal.addEventListener('click', (ev) => {
        if (ev.target === viewerModal) closeViewer();
      });
    }
    const viewerPrintBtn = el('viewerPrintBtn');
    if (viewerPrintBtn) viewerPrintBtn.addEventListener('click', printViewer);
    const viewerOpenBtn = el('viewerOpenBtn');
    if (viewerOpenBtn) viewerOpenBtn.addEventListener('click', openViewerExternal);

  }

  function wireItemActionDelegation() {
    document.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === 'toggle-fav') {
        toggleFavorite(id);
      } else if (action === 'open-item') {
        openItem(id);
      } else if (action === 'edit-item') {
        openItemModal(id);
      }
    });
  }

  function attachDragHandlers() {
    document.addEventListener('dragstart', (ev) => {
      const card = ev.target.closest('.item-card[draggable="true"]');
      if (!card) return;
      ev.dataTransfer.setData('text/plain', card.dataset.itemId);
      ev.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });

    document.addEventListener('dragend', (ev) => {
      const card = ev.target.closest('.item-card[draggable="true"]');
      if (card) card.classList.remove('dragging');
      document.querySelectorAll('.drag-over').forEach(node => node.classList.remove('drag-over'));
    });
  }

  function init() {
    if (!el('loginView') || !el('appView')) return;
    attachHandlers();
    wireItemActionDelegation();
    attachDragHandlers();
    renderSectionsInSelects();
    render();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
