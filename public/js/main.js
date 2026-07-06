(function () {
  'use strict';

  const state = {
    config: {},
    categories: [],
    products: [],
    search: '',
    activeCategory: 'all'
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function formatPrice(value) {
    return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function whatsappLink(number, message) {
    const clean = (number || '').replace(/\D/g, '');
    return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
  }

  function buildOrderMessage(product) {
    return `Olá! Tenho interesse no produto:\n*${product.name}*\nValor: ${formatPrice(product.price)}\nGostaria de fazer meu pedido.`;
  }

  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Falha ao buscar ${url}`);
    return res.json();
  }

  async function loadData() {
    const [config, categories, products] = await Promise.all([
      fetchJSON('/api/config'),
      fetchJSON('/api/categories'),
      fetchJSON('/api/products')
    ]);
    state.config = config;
    state.categories = categories;
    state.products = products;
  }

  function renderBrand() {
    const { companyName, logoUrl } = state.config;
    const brand = $('#brand');
    brand.innerHTML = `
      ${logoUrl
        ? `<img class="logo" src="${logoUrl}" alt="${companyName}">`
        : `<div class="logo-fallback">${(companyName || 'C').charAt(0).toUpperCase()}</div>`
      }
      <span class="brand-name">${companyName || 'Cardápio Online'}</span>
    `;
    document.title = `${companyName || 'Cardápio Online'} — Cardápio Digital`;
    $('#footer-brand-name').textContent = `© ${new Date().getFullYear()} ${companyName || ''}`;
  }

  function renderWhatsappLinks() {
    const genericMsg = 'Olá! Vim pelo cardápio online e gostaria de fazer um pedido.';
    const link = whatsappLink(state.config.whatsappNumber, genericMsg);
    ['whatsapp-header-btn', 'whatsapp-drawer-btn', 'whatsapp-hero-btn', 'whatsapp-footer-btn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.href = link;
    });
  }

  function renderHero() {
    $('#hero-title').textContent = state.config.heroTitle || '';
    $('#hero-subtitle').textContent = state.config.heroSubtitle || '';
    $('#meta-hours').textContent = state.config.openingHours || '—';
    $('#meta-count').textContent = state.products.filter(p => p.available).length;

    const heroImg = $('#hero-image');
    const featured = state.products.find(p => p.available && p.imageUrl) || state.products[0];
    heroImg.src = state.config.heroImageUrl || (featured ? featured.imageUrl : '');
    heroImg.alt = featured ? featured.name : 'Produto em destaque';
    heroImg.loading = 'eager';
    $('#hero-chip-name').textContent = featured ? featured.name : '—';
  }

  function renderCategoryTabs() {
    const tabs = $('#category-tabs');
    const sorted = [...state.categories].sort((a, b) => a.order - b.order);
    const allTab = `<button class="cat-tab ${state.activeCategory === 'all' ? 'active' : ''}" data-cat="all">Todos</button>`;
    const catTabs = sorted.map(c =>
      `<button class="cat-tab ${state.activeCategory === c.id ? 'active' : ''}" data-cat="${c.id}">${c.name}</button>`
    ).join('');
    tabs.innerHTML = allTab + catTabs;

    tabs.querySelectorAll('.cat-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        state.activeCategory = btn.dataset.cat;
        renderCategoryTabs();
        renderProducts();
      });
    });
  }

  function filteredProducts() {
    const term = state.search.trim().toLowerCase();
    return state.products.filter(p => {
      const matchesSearch = !term ||
        p.name.toLowerCase().includes(term) ||
        (state.categories.find(c => c.id === p.categoryId)?.name || '').toLowerCase().includes(term);
      const matchesCategory = state.activeCategory === 'all' || p.categoryId === state.activeCategory;
      return matchesSearch && matchesCategory;
    });
  }

  function productCardHTML(p) {
    const unavailable = !p.available;
    return `
      <article class="product-card" data-id="${p.id}" tabindex="0" role="button" aria-label="Ver detalhes de ${p.name}">
        <div class="thumb">
          ${unavailable ? '<span class="badge-unavailable">Indisponível</span>' : ''}
          ${p.imageUrl
            ? `<img src="${p.imageUrl}" alt="${p.name}" loading="lazy">`
            : `<div class="placeholder">Sem imagem</div>`
          }
        </div>
        <div class="body">
          <h3 class="name">${p.name}</h3>
          <p class="desc-preview">${p.description || ''}</p>
          <div class="row">
            <span class="price">${formatPrice(p.price)}</span>
            <button class="btn-buy ${unavailable ? 'disabled' : ''}" data-buy-id="${p.id}" ${unavailable ? 'disabled' : ''}>
              ${unavailable ? 'Indisponível' : 'Comprar'}
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function renderProducts() {
    const container = $('#products-container');
    const list = filteredProducts();

    if (list.length === 0) {
      container.innerHTML = `<div class="empty-state">Nenhum produto encontrado para essa busca.</div>`;
      return;
    }

    if (state.activeCategory !== 'all' || state.search.trim()) {
      container.innerHTML = `<div class="product-grid">${list.map(productCardHTML).join('')}</div>`;
    } else {
      const sorted = [...state.categories].sort((a, b) => a.order - b.order);
      container.innerHTML = sorted.map(cat => {
        const items = list.filter(p => p.categoryId === cat.id);
        if (items.length === 0) return '';
        return `
          <div class="category-block">
            <h3 class="category-title">${cat.name}</h3>
            <div class="product-grid">${items.map(productCardHTML).join('')}</div>
          </div>
        `;
      }).join('');
    }

    bindProductEvents();
  }

  function bindProductEvents() {
    $$('.product-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-buy')) return;
        openModal(card.dataset.id);
      });
      card.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') openModal(card.dataset.id);
      });
    });
    $$('.btn-buy:not(.disabled)').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        buyProduct(btn.dataset.buyId);
      });
    });
  }

  function buyProduct(id) {
    const product = state.products.find(p => p.id === id);
    if (!product || !product.available) return;
    const link = whatsappLink(state.config.whatsappNumber, buildOrderMessage(product));
    window.open(link, '_blank', 'noopener');
  }

  function openModal(id) {
    const product = state.products.find(p => p.id === id);
    if (!product) return;

    $('#modal-img-wrap').innerHTML = product.imageUrl
      ? `<img src="${product.imageUrl}" alt="${product.name}">`
      : `<div class="placeholder">Sem imagem</div>`;
    $('#modal-name').textContent = product.name;
    $('#modal-desc').textContent = product.description || 'Sem descrição disponível.';
    $('#modal-price').innerHTML = formatPrice(product.price);

    const buyBtn = $('#modal-buy-btn');
    if (!product.available) {
      buyBtn.textContent = 'Indisponível no momento';
      buyBtn.disabled = true;
      buyBtn.classList.add('disabled');
    } else {
      buyBtn.textContent = 'Comprar';
      buyBtn.disabled = false;
      buyBtn.classList.remove('disabled');
      buyBtn.onclick = () => buyProduct(product.id);
    }

    $('#modal-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    $('#modal-overlay').classList.remove('open');
    document.body.style.overflow = '';
  }

  function bindGlobalEvents() {
    $('#modal-close').addEventListener('click', closeModal);
    $('#modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

    $('#search-input').addEventListener('input', (e) => {
      state.search = e.target.value;
      renderProducts();
    });

    $('#burger-btn').addEventListener('click', () => $('#mobile-drawer').classList.add('open'));
    $('#close-drawer').addEventListener('click', () => $('#mobile-drawer').classList.remove('open'));
    $$('#mobile-drawer a.drawer-link').forEach(a => {
      a.addEventListener('click', () => $('#mobile-drawer').classList.remove('open'));
    });
  }

  async function init() {
    try {
      await loadData();
      renderBrand();
      renderWhatsappLinks();
      renderHero();
      renderCategoryTabs();
      renderProducts();
      bindGlobalEvents();
    } catch (err) {
      console.error(err);
      $('#products-container').innerHTML = `<div class="empty-state">Não foi possível carregar o cardápio. Tente novamente em instantes.</div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
