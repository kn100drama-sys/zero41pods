(function () {
  'use strict';

  const state = {
    config: {},
    categories: [],
    products: [],
    search: '',
    categoryFilter: 'all'
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function toast(msg, isError = false) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.toggle('error', isError);
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  function formatPrice(value) {
    return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  async function api(url, options = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      ...options
    });
    if (res.status === 401) {
      showLogin();
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erro na requisição.');
    return data;
  }

  async function uploadImage(file) {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch('/api/upload', { method: 'POST', body: formData, credentials: 'same-origin' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha no upload.');
    return data.url;
  }

  // ================= AUTH =================
  function showLogin() {
    $('#login-screen').classList.remove('hidden');
    $('#dashboard').classList.add('hidden');
  }
  function showDashboard() {
    $('#login-screen').classList.add('hidden');
    $('#dashboard').classList.remove('hidden');
  }

  async function checkAuth() {
    const { isAdmin } = await api('/api/auth/status');
    if (isAdmin) {
      showDashboard();
      await bootDashboard();
    } else {
      showLogin();
    }
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = $('#login-password').value;
    $('#login-error').textContent = '';
    try {
      await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) });
      showDashboard();
      await bootDashboard();
    } catch (err) {
      $('#login-error').textContent = 'Senha incorreta. Tente novamente.';
    }
  });

  $('#logout-btn').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    showLogin();
  });

  // ================= NAVIGATION =================
  $$('.side-link').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.side-link').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $$('.view').forEach(v => v.classList.add('hidden'));
      $(`#view-${btn.dataset.view}`).classList.remove('hidden');
    });
  });

  // ================= DATA LOAD =================
  async function loadAll() {
    const [config, categories, products] = await Promise.all([
      api('/api/config'),
      api('/api/categories'),
      api('/api/products')
    ]);
    state.config = config;
    state.categories = categories;
    state.products = products;
  }

  async function bootDashboard() {
    await loadAll();
    renderCategoryFilterSelect();
    renderCategoriesView();
    renderProductsView();
    fillConfigForm();
  }

  // ================= PRODUTOS =================
  function renderCategoryFilterSelect() {
    const select = $('#admin-cat-filter');
    const sorted = [...state.categories].sort((a, b) => a.order - b.order);
    select.innerHTML = `<option value="all">Todas as categorias</option>` +
      sorted.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }

  function filteredProducts() {
    const term = state.search.trim().toLowerCase();
    return state.products.filter(p => {
      const matchesSearch = !term || p.name.toLowerCase().includes(term);
      const matchesCat = state.categoryFilter === 'all' || p.categoryId === state.categoryFilter;
      return matchesSearch && matchesCat;
    });
  }

  function categoryName(id) {
    return state.categories.find(c => c.id === id)?.name || 'Sem categoria';
  }

  function renderProductsView() {
    const container = $('#admin-products-table');
    const list = filteredProducts();
    if (list.length === 0) {
      container.innerHTML = `<div class="empty-state">Nenhum produto encontrado.</div>`;
      return;
    }
    container.innerHTML = list.map(p => `
      <div class="admin-product-card" data-id="${p.id}">
        <div class="thumb">
          ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}" loading="lazy">` : `<div class="placeholder">Sem imagem</div>`}
        </div>
        <div class="body">
          <div class="name">${p.name}</div>
          <div class="muted small">${categoryName(p.categoryId)}</div>
          <div class="meta-row">
            <span class="price">${formatPrice(p.price)}</span>
            <span class="status-pill ${p.available ? 'on' : 'off'}">${p.available ? 'Disponível' : 'Indisponível'}</span>
          </div>
        </div>
      </div>
    `).join('');

    $$('.admin-product-card').forEach(card => {
      card.addEventListener('click', () => openProductModal(card.dataset.id));
    });
  }

  $('#admin-search').addEventListener('input', (e) => {
    state.search = e.target.value;
    renderProductsView();
  });
  $('#admin-cat-filter').addEventListener('change', (e) => {
    state.categoryFilter = e.target.value;
    renderProductsView();
  });

  // ---- Product modal ----
  function fillProductCategorySelect() {
    const select = $('#product-category');
    const sorted = [...state.categories].sort((a, b) => a.order - b.order);
    select.innerHTML = sorted.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }

  function openProductModal(id) {
    fillProductCategorySelect();
    const form = $('#product-form');
    form.reset();
    $('#product-image-preview').src = '';
    $('#product-image-preview').style.display = 'none';

    if (id) {
      const p = state.products.find(x => x.id === id);
      $('#product-form-title').textContent = 'Editar produto';
      $('#product-id').value = p.id;
      $('#product-name').value = p.name;
      $('#product-description').value = p.description || '';
      $('#product-price').value = p.price;
      $('#product-category').value = p.categoryId;
      $('#product-available').checked = !!p.available;
      $('#product-image-url').value = p.imageUrl || '';
      if (p.imageUrl) {
        $('#product-image-preview').src = p.imageUrl;
        $('#product-image-preview').style.display = 'block';
      }
      $('#product-delete-btn').classList.remove('hidden');
    } else {
      $('#product-form-title').textContent = 'Novo produto';
      $('#product-id').value = '';
      $('#product-image-url').value = '';
      $('#product-delete-btn').classList.add('hidden');
    }
    $('#product-modal-overlay').classList.add('open');
  }

  function closeProductModal() {
    $('#product-modal-overlay').classList.remove('open');
  }

  $('#new-product-btn').addEventListener('click', () => openProductModal(null));
  $('#product-modal-close').addEventListener('click', closeProductModal);
  $('#product-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'product-modal-overlay') closeProductModal();
  });

  $('#product-image-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      toast('Enviando imagem...');
      const url = await uploadImage(file);
      $('#product-image-url').value = url;
      $('#product-image-preview').src = url;
      $('#product-image-preview').style.display = 'block';
      toast('Imagem enviada!');
    } catch (err) {
      toast(err.message, true);
    }
  });

  $('#product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#product-id').value;
    const payload = {
      name: $('#product-name').value.trim(),
      description: $('#product-description').value.trim(),
      price: parseFloat($('#product-price').value) || 0,
      categoryId: $('#product-category').value,
      imageUrl: $('#product-image-url').value,
      available: $('#product-available').checked
    };
    try {
      if (id) {
        await api(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
        toast('Produto atualizado!');
      } else {
        await api('/api/products', { method: 'POST', body: JSON.stringify(payload) });
        toast('Produto criado!');
      }
      await loadAll();
      renderProductsView();
      closeProductModal();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $('#product-delete-btn').addEventListener('click', async () => {
    const id = $('#product-id').value;
    if (!id) return;
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;
    try {
      await api(`/api/products/${id}`, { method: 'DELETE' });
      toast('Produto excluído.');
      await loadAll();
      renderProductsView();
      closeProductModal();
    } catch (err) {
      toast(err.message, true);
    }
  });

  // ================= CATEGORIAS =================
  function renderCategoriesView() {
    const container = $('#categories-list');
    const sorted = [...state.categories].sort((a, b) => a.order - b.order);
    container.innerHTML = sorted.map((c, i) => `
      <div class="category-row" data-id="${c.id}">
        <input type="text" value="${c.name}" data-field="name">
        <div class="cat-actions">
          <button class="icon-btn" data-action="up" ${i === 0 ? 'disabled' : ''} title="Mover para cima">↑</button>
          <button class="icon-btn" data-action="down" ${i === sorted.length - 1 ? 'disabled' : ''} title="Mover para baixo">↓</button>
          <button class="icon-btn" data-action="save" title="Salvar nome">💾</button>
          <button class="icon-btn danger" data-action="delete" title="Excluir">🗑️</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.category-row').forEach(row => {
      const id = row.dataset.id;
      row.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const name = row.querySelector('input').value.trim();
        if (!name) return toast('Nome não pode ser vazio.', true);
        try {
          await api(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
          toast('Categoria atualizada.');
          await loadAll();
          renderCategoriesView();
          renderCategoryFilterSelect();
        } catch (err) { toast(err.message, true); }
      });
      row.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        if (!confirm('Excluir esta categoria?')) return;
        try {
          await api(`/api/categories/${id}`, { method: 'DELETE' });
          toast('Categoria excluída.');
          await loadAll();
          renderCategoriesView();
          renderCategoryFilterSelect();
        } catch (err) { toast(err.message, true); }
      });
      const upBtn = row.querySelector('[data-action="up"]');
      const downBtn = row.querySelector('[data-action="down"]');
      if (upBtn) upBtn.addEventListener('click', () => moveCategory(id, -1));
      if (downBtn) downBtn.addEventListener('click', () => moveCategory(id, 1));
    });
  }

  async function moveCategory(id, direction) {
    const sorted = [...state.categories].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex(c => c.id === id);
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= sorted.length) return;
    [sorted[index], sorted[swapIndex]] = [sorted[swapIndex], sorted[index]];
    const orderedIds = sorted.map(c => c.id);
    try {
      await api('/api/categories/reorder', { method: 'POST', body: JSON.stringify({ orderedIds }) });
      await loadAll();
      renderCategoriesView();
      renderCategoryFilterSelect();
    } catch (err) { toast(err.message, true); }
  }

  $('#new-category-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#new-category-name').value.trim();
    if (!name) return;
    try {
      await api('/api/categories', { method: 'POST', body: JSON.stringify({ name }) });
      $('#new-category-name').value = '';
      toast('Categoria adicionada!');
      await loadAll();
      renderCategoriesView();
      renderCategoryFilterSelect();
    } catch (err) { toast(err.message, true); }
  });

  // ================= CONFIGURAÇÕES =================
  function fillConfigForm() {
    const c = state.config;
    $('#cfg-companyName').value = c.companyName || '';
    $('#cfg-whatsappNumber').value = c.whatsappNumber || '';
    $('#cfg-openingHours').value = c.openingHours || '';
    $('#cfg-primaryColor').value = c.primaryColor || '#1E90FF';
    $('#cfg-heroTitle').value = c.heroTitle || '';
    $('#cfg-heroSubtitle').value = c.heroSubtitle || '';

    const logoPreview = $('#cfg-logo-preview');
    const heroPreview = $('#cfg-hero-preview');
    logoPreview.src = c.logoUrl || '';
    logoPreview.style.display = c.logoUrl ? 'block' : 'none';
    heroPreview.src = c.heroImageUrl || '';
    heroPreview.style.display = c.heroImageUrl ? 'block' : 'none';

    $('#cfg-logo-file').dataset.url = c.logoUrl || '';
    $('#cfg-hero-file').dataset.url = c.heroImageUrl || '';
  }

  $('#cfg-logo-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      toast('Enviando logo...');
      const url = await uploadImage(file);
      e.target.dataset.url = url;
      $('#cfg-logo-preview').src = url;
      $('#cfg-logo-preview').style.display = 'block';
      toast('Logo enviada!');
    } catch (err) { toast(err.message, true); }
  });

  $('#cfg-hero-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      toast('Enviando banner...');
      const url = await uploadImage(file);
      e.target.dataset.url = url;
      $('#cfg-hero-preview').src = url;
      $('#cfg-hero-preview').style.display = 'block';
      toast('Banner enviado!');
    } catch (err) { toast(err.message, true); }
  });

  $('#config-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      companyName: $('#cfg-companyName').value.trim(),
      whatsappNumber: $('#cfg-whatsappNumber').value.trim(),
      openingHours: $('#cfg-openingHours').value.trim(),
      primaryColor: $('#cfg-primaryColor').value,
      heroTitle: $('#cfg-heroTitle').value.trim(),
      heroSubtitle: $('#cfg-heroSubtitle').value.trim(),
      logoUrl: $('#cfg-logo-file').dataset.url || state.config.logoUrl || '',
      heroImageUrl: $('#cfg-hero-file').dataset.url || state.config.heroImageUrl || ''
    };
    try {
      await api('/api/config', { method: 'PUT', body: JSON.stringify(payload) });
      toast('Configurações salvas!');
      $('#config-saved-msg').textContent = 'Salvo com sucesso.';
      setTimeout(() => $('#config-saved-msg').textContent = '', 3000);
      await loadAll();
      fillConfigForm();
    } catch (err) { toast(err.message, true); }
  });

  $('#password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPassword = $('#new-admin-password').value;
    try {
      await api('/api/config/password', { method: 'PUT', body: JSON.stringify({ newPassword }) });
      $('#new-admin-password').value = '';
      $('#password-saved-msg').textContent = 'Senha atualizada.';
      setTimeout(() => $('#password-saved-msg').textContent = '', 3000);
    } catch (err) { toast(err.message, true); }
  });

  document.addEventListener('DOMContentLoaded', checkAuth);
})();
