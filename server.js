const express = require('express');
const session = require('express-session');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const DB_PATH = path.join(__dirname, 'data', 'db.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ---------- DB helpers (arquivo JSON local, sem dependências externas) ----------
function readDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}
function uid(prefix) {
  return `${prefix}-${crypto.randomBytes(5).toString('hex')}`;
}

// ---------- Middlewares ----------
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(session({
  secret: 'cardapio-online-secret-troque-em-producao',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8h
}));
app.use(express.static(path.join(__dirname, 'public')));

// Upload de imagens (multer)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uid('img')}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  }
});

function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Não autenticado.' });
}

// ---------- Auth ----------
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  const db = readDB();
  if (password && password === db.config.adminPassword) {
    req.session.isAdmin = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Senha incorreta.' });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/status', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// ---------- Config (pública para o site, edição protegida) ----------
app.get('/api/config', (req, res) => {
  const db = readDB();
  const { adminPassword, ...publicConfig } = db.config;
  res.json(publicConfig);
});

app.put('/api/config', requireAuth, (req, res) => {
  const db = readDB();
  db.config = { ...db.config, ...req.body };
  writeDB(db);
  res.json(db.config);
});

app.put('/api/config/password', requireAuth, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Senha deve ter ao menos 4 caracteres.' });
  }
  const db = readDB();
  db.config.adminPassword = newPassword;
  writeDB(db);
  res.json({ ok: true });
});

// ---------- Categorias ----------
app.get('/api/categories', (req, res) => {
  const db = readDB();
  res.json(db.categories.sort((a, b) => a.order - b.order));
});

app.post('/api/categories', requireAuth, (req, res) => {
  const db = readDB();
  const cat = {
    id: uid('cat'),
    name: req.body.name,
    order: db.categories.length + 1
  };
  db.categories.push(cat);
  writeDB(db);
  res.json(cat);
});

app.put('/api/categories/:id', requireAuth, (req, res) => {
  const db = readDB();
  const cat = db.categories.find(c => c.id === req.params.id);
  if (!cat) return res.status(404).json({ error: 'Categoria não encontrada.' });
  Object.assign(cat, req.body);
  writeDB(db);
  res.json(cat);
});

app.delete('/api/categories/:id', requireAuth, (req, res) => {
  const db = readDB();
  const hasProducts = db.products.some(p => p.categoryId === req.params.id);
  if (hasProducts) {
    return res.status(400).json({ error: 'Existem produtos nesta categoria. Mova ou exclua-os antes.' });
  }
  db.categories = db.categories.filter(c => c.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

app.post('/api/categories/reorder', requireAuth, (req, res) => {
  const { orderedIds } = req.body;
  const db = readDB();
  orderedIds.forEach((id, index) => {
    const cat = db.categories.find(c => c.id === id);
    if (cat) cat.order = index + 1;
  });
  writeDB(db);
  res.json(db.categories.sort((a, b) => a.order - b.order));
});

// ---------- Produtos ----------
app.get('/api/products', (req, res) => {
  const db = readDB();
  res.json(db.products);
});

app.post('/api/products', requireAuth, (req, res) => {
  const db = readDB();
  const product = {
    id: uid('prod'),
    name: req.body.name || 'Novo produto',
    description: req.body.description || '',
    price: Number(req.body.price) || 0,
    categoryId: req.body.categoryId || null,
    imageUrl: req.body.imageUrl || '',
    available: req.body.available !== undefined ? !!req.body.available : true
  };
  db.products.push(product);
  writeDB(db);
  res.json(product);
});

app.put('/api/products/:id', requireAuth, (req, res) => {
  const db = readDB();
  const product = db.products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });
  Object.assign(product, req.body);
  writeDB(db);
  res.json(product);
});

app.delete('/api/products/:id', requireAuth, (req, res) => {
  const db = readDB();
  db.products = db.products.filter(p => p.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// ---------- Upload de imagem ----------
app.post('/api/upload', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo inválido. Use png, jpg, jpeg, webp ou gif até 5MB.' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Cardápio Online rodando em http://localhost:${PORT}`);
  console.log(`📋 Painel administrativo em http://localhost:${PORT}/admin.html`);
  console.log(`🔑 Senha padrão do admin: admin123 (altere em Configurações)\n`);
});
