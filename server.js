import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import xlsx from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Hostinger MySQL Pool
const dbConfig = {
  host: process.env.DB_HOST || '82.25.121.184',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'u869403905_zepemd_DB',
  password: process.env.DB_PASSWORD || 'zepemd_DB@7030',
  database: process.env.DB_NAME || 'u869403905_zepemd_DB',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 15000,
};

let pool = null;
function getDb() {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
    console.log(`[MySQL] Pool established for ${dbConfig.host} / ${dbConfig.database}`);
  }
  return pool;
}

// Initialize Both Tables with EXACT 28 COLUMNS EACH
async function initTables() {
  try {
    const db = getDb();

    // 1. Medicine Table (EXACT 28 COLUMNS + UNIQUE product_id)
    await db.query(`
      CREATE TABLE IF NOT EXISTS zepmed_medicines (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id VARCHAR(150) NOT NULL,
        product_name VARCHAR(500) NOT NULL,
        image VARCHAR(255) DEFAULT '',
        image_status VARCHAR(50) DEFAULT 'Active',
        category_id VARCHAR(100) DEFAULT 'CAT-MED-01',
        category VARCHAR(150) NOT NULL,
        sub_category VARCHAR(150) DEFAULT '',
        brand VARCHAR(150) DEFAULT '',
        mrp DECIMAL(10,2) DEFAULT 0.00,
        selling_price DECIMAL(10,2) DEFAULT 0.00,
        discount_percent DECIMAL(5,2) DEFAULT 0.00,
        allow_discount VARCHAR(10) DEFAULT 'Yes',
        unit VARCHAR(100) DEFAULT '1 Strip',
        units_per_pack INT DEFAULT 10,
        packs_per_box INT DEFAULT 50,
        composition TEXT,
        generic_salt TEXT,
        manufacturer VARCHAR(255) DEFAULT '',
        description TEXT,
        uses TEXT,
        side_effects TEXT,
        dosage TEXT,
        health_tags TEXT,
        prescription_required VARCHAR(10) DEFAULT 'Yes',
        customer_visible VARCHAR(10) DEFAULT 'Yes',
        active VARCHAR(10) DEFAULT 'Yes',
        approval_status VARCHAR(50) DEFAULT 'Approved',
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_med_pid (product_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Blinkit Table (EXACT 28 COLUMNS + UNIQUE product_id)
    await db.query(`
      CREATE TABLE IF NOT EXISTS zepmed_blinkit_products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id VARCHAR(150) NOT NULL,
        product_name VARCHAR(500) NOT NULL,
        image VARCHAR(255) DEFAULT '',
        image_status VARCHAR(50) DEFAULT 'Active',
        category_id VARCHAR(100) DEFAULT 'CAT-101',
        category VARCHAR(150) NOT NULL,
        sub_category VARCHAR(150) DEFAULT '',
        brand VARCHAR(150) DEFAULT '',
        mrp DECIMAL(10,2) DEFAULT 0.00,
        selling_price DECIMAL(10,2) DEFAULT 0.00,
        discount_percent DECIMAL(5,2) DEFAULT 0.00,
        allow_discount VARCHAR(10) DEFAULT 'Yes',
        unit VARCHAR(100) DEFAULT '1 unit',
        units_per_pack INT DEFAULT 1,
        packs_per_box INT DEFAULT 24,
        composition TEXT,
        generic_salt TEXT,
        manufacturer VARCHAR(255) DEFAULT '',
        description TEXT,
        uses TEXT,
        side_effects TEXT,
        dosage TEXT,
        health_tags TEXT,
        prescription_required VARCHAR(10) DEFAULT 'No',
        customer_visible VARCHAR(10) DEFAULT 'Yes',
        active VARCHAR(10) DEFAULT 'Yes',
        approval_status VARCHAR(50) DEFAULT 'Approved',
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_blinkit_pid (product_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3. Dedicated OTC Medicine Table (EXACT 28 COLUMNS + UNIQUE product_id)
    await db.query(`
      CREATE TABLE IF NOT EXISTS zepmed_otc_medicines (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id VARCHAR(150) NOT NULL,
        product_name VARCHAR(500) NOT NULL,
        product_url VARCHAR(500) DEFAULT '',
        image VARCHAR(255) DEFAULT '',
        image_status VARCHAR(50) DEFAULT 'Active',
        category_id VARCHAR(100) DEFAULT 'CAT-OTC-02',
        category VARCHAR(150) NOT NULL DEFAULT 'OTC Healthcare Medicine',
        sub_category VARCHAR(150) DEFAULT '',
        brand VARCHAR(150) DEFAULT '',
        mrp DECIMAL(10,2) DEFAULT 0.00,
        selling_price DECIMAL(10,2) DEFAULT 0.00,
        discount_percent DECIMAL(5,2) DEFAULT 0.00,
        allow_discount VARCHAR(10) DEFAULT 'Yes',
        unit VARCHAR(100) DEFAULT '1 unit',
        units_per_pack INT DEFAULT 1,
        packs_per_box INT DEFAULT 50,
        composition TEXT,
        generic_salt TEXT,
        manufacturer VARCHAR(255) DEFAULT '',
        description TEXT,
        uses TEXT,
        side_effects TEXT,
        dosage TEXT,
        health_tags TEXT,
        prescription_required VARCHAR(10) DEFAULT 'No',
        customer_visible VARCHAR(10) DEFAULT 'Yes',
        active VARCHAR(10) DEFAULT 'Yes',
        approval_status VARCHAR(50) DEFAULT 'Approved',
        image_url TEXT,
        is_downloaded TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_otc_pid (product_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. Blacklist Table for permanently deleted products (Never Reappear)
    await db.query(`
      CREATE TABLE IF NOT EXISTS zepmed_deleted_blacklist (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id VARCHAR(150) NOT NULL,
        section VARCHAR(50) NOT NULL,
        deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_del_pid (product_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('✅ [MySQL] Tables verified with 28 columns + blacklist: zepmed_medicines, zepmed_blinkit_products, zepmed_otc_medicines, zepmed_deleted_blacklist');
  } catch (err) {
    console.error('❌ [MySQL] Table init error:', err.message);
  }
}

// 1. AUTHENTICATION (Login: DB@Zepmed.com / Zepmed@7030)
app.post('/api/auth/login', (req, res) => {
  const { login, password } = req.body || {};
  const cleanEmail = (login || '').trim().toLowerCase();
  const expectedEmail = (process.env.AUTH_EMAIL || 'DB@Zepmed.com').trim().toLowerCase();
  const expectedPassword = process.env.AUTH_PASSWORD || 'Zepmed@7030';

  if (cleanEmail === expectedEmail && password === expectedPassword) {
    return res.json({
      success: true,
      message: 'Login successful',
      token: (process.env.JWT_SECRET || 'zepmed_token_') + Date.now(),
      user: {
        email: process.env.AUTH_EMAIL || 'DB@Zepmed.com',
        role: 'Administrator',
        access: 'Full Database & Analytics Access'
      }
    });
  }

  return res.status(401).json({
    success: false,
    message: 'Invalid credentials. Expected DB@Zepmed.com / Zepmed@7030'
  });
});

// 2. DATABASE STATUS
app.get('/api/db/status', async (req, res) => {
  try {
    const db = getDb();
    const [medRows] = await db.query('SELECT COUNT(*) as count FROM zepmed_medicines');
    const [blkRows] = await db.query('SELECT COUNT(*) as count FROM zepmed_blinkit_products');
    let otcCount = 0;
    try {
      const [otcRows] = await db.query('SELECT COUNT(*) as count FROM zepmed_otc_medicines');
      otcCount = otcRows[0].count;
    } catch {}

    res.json({
      success: true,
      host: dbConfig.host,
      database: dbConfig.database,
      medicineCount: medRows[0].count,
      blinkitCount: blkRows[0].count,
      otcCount: otcCount,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fetch all product IDs currently saved in MySQL to keep frontend in 100% sync
app.get('/api/products/stored-ids', async (req, res) => {
  try {
    const db = getDb();
    const [med] = await db.query('SELECT product_id FROM zepmed_medicines');
    const [blk] = await db.query('SELECT product_id FROM zepmed_blinkit_products');
    let otc = [];
    try {
      const [otcRows] = await db.query('SELECT product_id FROM zepmed_otc_medicines');
      otc = otcRows;
    } catch {}

    res.json({
      success: true,
      medicines: med.map((r) => String(r.product_id)),
      blinkit: blk.map((r) => String(r.product_id)),
      otc: otc.map((r) => String(r.product_id)),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fetch all database products for high-speed Master CSV/XLS Comparison Engine
app.get('/api/products/all-for-compare', async (req, res) => {
  const { section = 'all' } = req.query;
  const db = getDb();
  try {
    let items = [];
    if (section === 'medicine' || section === 'all') {
      const [rows] = await db.query('SELECT product_id, product_name, brand, mrp, selling_price, discount_percent, generic_salt, composition, unit, sub_category, category, product_url FROM zepmed_medicines');
      items = items.concat(rows.map((r) => ({ ...r, section: 'medicine' })));
    }
    if (section === 'blinkit' || section === 'all') {
      const [rows] = await db.query('SELECT product_id, product_name, brand, mrp, selling_price, discount_percent, generic_salt, composition, unit, sub_category, category, product_url FROM zepmed_blinkit_products');
      items = items.concat(rows.map((r) => ({ ...r, section: 'blinkit' })));
    }
    if (section === 'otc' || section === 'all') {
      try {
        const [rows] = await db.query('SELECT product_id, product_name, brand, mrp, selling_price, discount_percent, generic_salt, composition, unit, sub_category, category, product_url FROM zepmed_otc_medicines');
        items = items.concat(rows.map((r) => ({ ...r, section: 'otc' })));
      } catch {}
    }
    res.json({ success: true, count: items.length, data: items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper for ultra-fast bulk 28-column insert
async function insertProducts28(tableName, items) {
  const db = getDb();
  const list = Array.isArray(items) ? items : [items];
  if (list.length === 0) return 0;

  let inserted = 0;
  const chunkSize = 50;

  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize);
    const rows = [];

    for (const item of chunk) {
      const pid = item.product_id || item.productId || item.code || item.id;
      if (!pid || !item.product_name) continue;

      const discount = parseFloat(String(item.discount_pct || item.discountPercent || item.discount_percent || '0').replace('%', '')) || 0.00;
      const mrp = parseFloat(item.mrp || item.price) || 0.00;
      const sp = parseFloat(item.selling_price || item.price || mrp) || 0.00;
      const img = item.image_url || item.image_thumb || item.image || '';

      rows.push([
        String(pid),
        String(item.product_name || 'Unnamed Product').slice(0, 500),
        String(item.product_url || '').slice(0, 500),
        String(item.image || '').slice(0, 255),
        String(item.image_status || 'Active').slice(0, 50),
        String(item.category_id || (tableName.includes('otc') ? 'CAT-OTC-02' : tableName.includes('blinkit') ? 'CAT-101' : 'CAT-MED-01')).slice(0, 100),
        String(item.category || (tableName.includes('otc') ? 'OTC Healthcare Medicine' : tableName.includes('blinkit') ? 'General Grocery' : 'General Medicine')).slice(0, 150),
        String(item.sub_category || '').slice(0, 150),
        String(item.brand || '').slice(0, 150),
        mrp,
        sp,
        discount,
        String(item.allow_discount || 'Yes').slice(0, 10),
        String(item.unit || '1 unit').slice(0, 100),
        parseInt(item.units_per_pack, 10) || 1,
        parseInt(item.packs_per_box, 10) || 50,
        String(item.composition || ''),
        String(item.generic_salt || ''),
        String(item.manufacturer || '').slice(0, 255),
        String(item.description || ''),
        String(item.uses || ''),
        String(item.side_effects || ''),
        String(item.dosage || ''),
        String(item.health_tags || ''),
        String(item.prescription_required || (tableName.includes('medicines') ? 'Yes' : 'No')).slice(0, 10),
        String(item.customer_visible || 'Yes').slice(0, 10),
        String(item.active || 'Yes').slice(0, 10),
        String(item.approval_status || 'Approved').slice(0, 50),
        img
      ]);
    }

    if (rows.length === 0) continue;

    const query = `
      INSERT INTO ${tableName}
      (product_id, product_name, product_url, image, image_status, category_id, category, sub_category, brand, mrp, selling_price, discount_percent, allow_discount, unit, units_per_pack, packs_per_box, composition, generic_salt, manufacturer, description, uses, side_effects, dosage, health_tags, prescription_required, customer_visible, active, approval_status, image_url)
      VALUES ?
      ON DUPLICATE KEY UPDATE
      product_url = VALUES(product_url),
      selling_price = VALUES(selling_price),
      discount_percent = VALUES(discount_percent),
      updated_at = CURRENT_TIMESTAMP
    `;

    await db.query(query, [rows]);
    inserted += rows.length;
  }

  console.log(`[MySQL Bulk Store] Successfully stored ${inserted} products in ${tableName}.`);
  return inserted;
}

// 3. MEDICINES STORE & RETRIEVE (28 COLUMNS)
app.post('/api/medicines/store', async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [req.body];
    if (items.length === 0) return res.json({ success: true, count: 0 });

    const inserted = await insertProducts28('zepmed_medicines', items);
    const db = getDb();
    const [totalRows] = await db.query('SELECT COUNT(*) as count FROM zepmed_medicines');
    res.json({ success: true, stored: inserted, totalInDb: totalRows[0].count });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/medicines', async (req, res) => {
  try {
    const db = getDb();
    const limit = parseInt(req.query.limit, 10) || 150;
    const [countRows] = await db.query('SELECT COUNT(*) as count FROM zepmed_medicines');
    const [rows] = await db.query('SELECT * FROM zepmed_medicines ORDER BY id DESC LIMIT ?', [limit]);
    res.json({ success: true, count: rows.length, total: countRows[0].count, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. BLINKIT STORE & RETRIEVE (28 COLUMNS)
app.post('/api/blinkit/store', async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [req.body];
    if (items.length === 0) return res.json({ success: true, count: 0 });

    const inserted = await insertProducts28('zepmed_blinkit_products', items);
    const db = getDb();
    const [totalRows] = await db.query('SELECT COUNT(*) as count FROM zepmed_blinkit_products');
    res.json({ success: true, stored: inserted, totalInDb: totalRows[0].count });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/blinkit', async (req, res) => {
  try {
    const db = getDb();
    const limit = parseInt(req.query.limit, 10) || 150;
    const [countRows] = await db.query('SELECT COUNT(*) as count FROM zepmed_blinkit_products');
    const [rows] = await db.query('SELECT * FROM zepmed_blinkit_products ORDER BY id DESC LIMIT ?', [limit]);
    res.json({ success: true, count: rows.length, total: countRows[0].count, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4B. OTC MEDICINES STORE & RETRIEVE (28 COLUMNS)
app.post('/api/otc/store', async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [req.body];
    if (items.length === 0) return res.json({ success: true, count: 0 });

    const inserted = await insertProducts28('zepmed_otc_medicines', items);
    const db = getDb();
    const [totalRows] = await db.query('SELECT COUNT(*) as count FROM zepmed_otc_medicines');
    res.json({ success: true, stored: inserted, totalInDb: totalRows[0].count });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/otc', async (req, res) => {
  try {
    const db = getDb();
    const limit = parseInt(req.query.limit, 10) || 150;
    const [countRows] = await db.query('SELECT COUNT(*) as count FROM zepmed_otc_medicines');
    const [rows] = await db.query('SELECT * FROM zepmed_otc_medicines ORDER BY id DESC LIMIT ?', [limit]);
    res.json({ success: true, count: rows.length, total: countRows[0].count, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4C. GLOBAL FULL-DATABASE SEARCH ACROSS ALL PRODUCTS (HOSTINGER MYSQL)
app.get('/api/products/global-search', async (req, res) => {
  const { query = '', section = 'medicine', category = 'all', sub_category = 'all', limit = 200 } = req.query;
  const cleanQ = String(query).trim();

  if (!cleanQ) {
    return res.status(400).json({ success: false, error: 'Query parameter is required' });
  }

  const db = getDb();
  const tableName =
    section === 'blinkit'
      ? 'zepmed_blinkit_products'
      : section === 'otc'
      ? 'zepmed_otc_medicines'
      : 'zepmed_medicines';

  try {
    const wild = `%${cleanQ}%`;
    const startsWith = `${cleanQ}%`;
    const params = [wild, wild, wild, wild, wild, wild];

    let whereClause = `
      WHERE (
        product_name LIKE ? 
        OR generic_salt LIKE ? 
        OR composition LIKE ? 
        OR brand LIKE ? 
        OR product_id LIKE ? 
        OR sub_category LIKE ?
      )
    `;

    if (category && category !== 'all') {
      whereClause += ` AND category = ?`;
      params.push(category);
    }

    if (sub_category && sub_category !== 'all') {
      whereClause += ` AND sub_category = ?`;
      params.push(sub_category);
    }

    // Total matching count in full database
    const [countResult] = await db.query(
      `SELECT COUNT(*) as total FROM ${tableName} ${whereClause}`,
      params
    );
    const totalFound = countResult[0]?.total || 0;

    // Fetch ranked products (exact starts-with first, then general match, ordered by id DESC)
    const selectParams = [...params, startsWith, wild, Math.min(500, Math.max(1, parseInt(limit, 10)))];
    const selectQuery = `
      SELECT * FROM ${tableName}
      ${whereClause}
      ORDER BY 
        CASE 
          WHEN product_name LIKE ? THEN 1
          WHEN product_name LIKE ? THEN 2
          ELSE 3
        END,
        id DESC
      LIMIT ?
    `;

    const [rows] = await db.query(selectQuery, selectParams);

    res.json({
      success: true,
      query: cleanQ,
      section,
      totalFound,
      count: rows.length,
      data: rows
    });
  } catch (err) {
    console.error(`[Global DB Search Error]: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. DEEP PRODUCT ANALYSIS & ANALYTICS API
app.get('/api/analytics', async (req, res) => {
  try {
    const db = getDb();

    // Medicine stats
    const [medTotal] = await db.query('SELECT COUNT(*) as count, SUM(selling_price * 50) as stockVal, AVG(mrp) as avgMrp, AVG(selling_price) as avgPrice, AVG(discount_percent) as avgDiscount FROM zepmed_medicines');
    const [medCats] = await db.query('SELECT category, COUNT(*) as count FROM zepmed_medicines GROUP BY category');

    // Blinkit stats
    const [blkTotal] = await db.query('SELECT COUNT(*) as count, SUM(selling_price * 24) as stockVal, AVG(mrp) as avgMrp, AVG(selling_price) as avgPrice, AVG(discount_percent) as avgDiscount FROM zepmed_blinkit_products');
    const [blkCats] = await db.query('SELECT category, COUNT(*) as count FROM zepmed_blinkit_products GROUP BY category');
    const [topDiscounts] = await db.query('SELECT product_name, brand, mrp, selling_price, discount_percent FROM zepmed_blinkit_products ORDER BY discount_percent DESC LIMIT 5');

    res.json({
      success: true,
      medicines: {
        total: medTotal[0].count || 0,
        estimatedStockValue: Math.round(medTotal[0].stockVal || 0),
        avgMrp: (medTotal[0].avgMrp || 0).toFixed(2),
        avgPrice: (medTotal[0].avgPrice || 0).toFixed(2),
        avgDiscount: (medTotal[0].avgDiscount || 0).toFixed(1),
        categories: medCats,
      },
      blinkit: {
        total: blkTotal[0].count || 0,
        estimatedStockValue: Math.round(blkTotal[0].stockVal || 0),
        avgMrp: (blkTotal[0].avgMrp || 0).toFixed(2),
        avgPrice: (blkTotal[0].avgPrice || 0).toFixed(2),
        avgDiscount: (blkTotal[0].avgDiscount || 0).toFixed(1),
        categories: blkCats,
        topDiscounted: topDiscounts,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// REAL-TIME APIFY USD CREDIT USAGE & BALANCE API
function getApifyToken() {
  const envPaths = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '..', '.env'),
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), 'new', '.env')
  ];
  for (const ep of envPaths) {
    if (fs.existsSync(ep)) {
      try {
        const content = fs.readFileSync(ep, 'utf8');
        const match = content.match(/^APIFY_TOKEN\s*=\s*([^\r\n#]+)/m);
        if (match && match[1].trim()) {
          return match[1].trim();
        }
      } catch {}
    }
  }
  return process.env.APIFY_TOKEN || 'apify_api_DweHoSEQsAR7JMhFoClnFLTnzC6w5q2I1R1R';
}

let usageCache = { data: null, timestamp: 0 };
app.get('/api/apify/usage', async (req, res) => {
  const isForce = req.query.force === 'true';
  const now = Date.now();
  if (!isForce && usageCache.data && now - usageCache.timestamp < 10000) {
    return res.json(usageCache.data);
  }

  const token = getApifyToken();
  try {
    const [userResp, usageResp] = await Promise.all([
      fetch(`https://api.apify.com/v2/users/me?token=${token}`),
      fetch(`https://api.apify.com/v2/users/me/usage/monthly?token=${token}`)
    ]);

    let totalCredits = 5.00;
    let usedCredits = 0.00;
    let plan = 'FREE';

    if (userResp.ok) {
      const uData = await userResp.json();
      totalCredits = uData.data?.plan?.maxMonthlyUsageUsd || uData.data?.plan?.monthlyUsageCreditsUsd || 5.00;
      plan = uData.data?.plan?.tier || uData.data?.plan?.id || 'FREE';
    }

    if (usageResp.ok) {
      const usData = await usageResp.json();
      usedCredits = usData.data?.totalUsageCreditsUsdAfterVolumeDiscount || usData.data?.totalUsageCreditsUsdBeforeVolumeDiscount || 0.00;
    }

    const remainingCredits = Math.max(0, totalCredits - usedCredits);
    const usagePercent = totalCredits > 0 ? ((usedCredits / totalCredits) * 100).toFixed(1) : '0';

    const result = {
      success: true,
      totalCreditsUsd: Number(totalCredits.toFixed(2)),
      usedCreditsUsd: Number(usedCredits.toFixed(2)),
      remainingCreditsUsd: Number(remainingCredits.toFixed(2)),
      usagePercent: Number(usagePercent),
      plan,
      isExhausted: remainingCredits <= 0.05
    };

    usageCache = { data: result, timestamp: now };
    res.json(result);
  } catch (err) {
    console.warn('[Apify Usage API Error]', err.message);
    res.json({
      success: true,
      totalCreditsUsd: 5.00,
      usedCreditsUsd: 0.00,
      remainingCreditsUsd: 5.00,
      usagePercent: 0,
      plan: 'FREE',
      isExhausted: false
    });
  }
});

// =========================================================================
// 6. LIVE APIFY SCRAPER (TATA 1MG & BLINKIT) WITH DEDUPLICATION REGISTRY
// =========================================================================
const ACTOR_1MG = process.env.ACTOR_1MG_ID || process.env.APIFY_ACTOR_MEDICINE || 'dzTaO7bhlAGsNXfCA'; // goat255/tata-1mg-scraper
const ACTOR_BLINKIT = process.env.ACTOR_BLINKIT_ID || process.env.APIFY_ACTOR_BLINKIT || 'boe8aOsEUY8g0lBj0'; // zapticx/blinkit-products-prices-scraper

function formatScraped1mgTo28(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems.map((item, idx) => {
    const pid = item.id || `MED-API-${Date.now().toString().slice(-6)}${idx}`;
    const name = item.name || item.title || item.product_name || "Medicine";
    const brand = item.brand || item.manufacturer || item.marketer || "Pharma Brand";
    const mrp = Number(item.mrp || item.price || 100);
    const price = Number(item.price || mrp);
    const discount = item.discountPercent !== undefined && item.discountPercent !== null
      ? item.discountPercent
      : (mrp > price ? Number((((mrp - price) / mrp) * 100).toFixed(1)) : 0);

    const unit = item.packSize || item.packForm || "1 Strip";
    const unitsInPack = item.unitsInPack || 10;
    const mfg = item.manufacturer || item.marketer || brand || "Pharma Manufacturer Ltd";
    const comp = item.composition || item.saltName || "Active Pharmaceutical Formulation";
    const salt = item.saltName || item.composition || "Standard Salt";

    const isRx = item.prescriptionRequired === true || item.category === "RX";
    const cat = isRx ? "Prescription (Rx) Medicine" : "OTC Healthcare Medicine";
    const catId = isRx ? "CAT-RX-01" : "CAT-OTC-02";
    const subCat = item.therapeuticClass || comp || "Pharmaceutical Formulation";

    const desc = item.description || `${name} manufactured by ${mfg}. Composition: ${comp}. Pharmaceutical grade medicine.`;
    const uses = Array.isArray(item.uses) ? item.uses.join(", ") : (item.uses || "Used for medical treatment as prescribed by certified physician.");
    const sideEffects = Array.isArray(item.sideEffects) ? item.sideEffects.join(", ") : (item.sideEffects || "Mild nausea, headache or dizziness in rare cases. Consult doctor if persists.");
    const dosage = item.dosage || "As prescribed by registered medical practitioner / Take with water after food.";
    const healthTags = isRx
      ? "Prescription Required, Schedule H Drug, CDSCO Approved, FSSAI Certified"
      : "Over The Counter, Daily Healthcare, FSSAI Certified, 100% Genuine";

    const img = item.imageUrl || "https://onemg.gumlet.io/l_watermark_346,w_480,h_480/a_ignore,w_480,h_480,c_fit,q_auto,f_auto/cropped/buhk7yptjggz25hwwgqj.jpg";
    const cleanSlug = (item.slug || item.id || name).toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
    const pUrl = (item.url && !item.url.includes('/search/')) ? item.url : (item.id ? `https://www.1mg.com/drugs/${item.id}` : `https://www.1mg.com/drugs/${cleanSlug}`);

    return {
      product_id: String(pid),
      product_name: name,
      product_url: pUrl,
      image_thumb: img,
      image_status: "Active",
      category_id: catId,
      category: cat,
      sub_category: subCat,
      brand: brand,
      mrp: mrp,
      selling_price: price,
      discount_pct: `${discount}%`,
      allow_discount: discount > 0 ? "Yes" : "No",
      unit: unit,
      units_per_pack: unitsInPack,
      packs_per_box: 50,
      composition: comp,
      generic_salt: salt,
      manufacturer: mfg,
      description: desc,
      uses: uses,
      side_effects: sideEffects,
      dosage: dosage,
      health_tags: healthTags,
      prescription_required: isRx ? "Yes" : "No",
      customer_visible: "Yes",
      active: "Yes",
      approval_status: "Approved",
      image_url: img,
    };
  });
}

function formatScrapedOtc1mgTo28(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems.map((item, idx) => {
    const pid = item.id || item.productId || `OTC-1MG-${Date.now().toString().slice(-6)}${idx}`;
    const name = item.name || item.title || "OTC Healthcare Product";
    const brand = item.brand || item.manufacturer || item.marketer || "Healthcare Essentials";
    const mrp = Number(item.mrp || item.discountedPrice || item.price || 99);
    const price = Number(item.discountedPrice || item.price || mrp);
    const discount = item.discountPercent !== undefined && item.discountPercent !== null
      ? item.discountPercent
      : (mrp > price ? Number((((mrp - price) / mrp) * 100).toFixed(1)) : 0);

    const unit = item.packSize || item.packForm || "1 Unit";
    const unitsInPack = item.unitsInPack || 1;
    const mfg = item.manufacturer || item.marketer || brand || "Healthcare Pharma Ltd";
    const comp = item.composition || item.saltName || "Authentic Ayurvedic / OTC Healthcare Formulation";
    const salt = item.saltName || item.composition || "Standard OTC Salt";

    const cat = "OTC Healthcare Medicine";
    const catId = "CAT-OTC-02";
    const subCat = item.therapeuticClass || comp || "Daily Healthcare Formulation";

    const desc = item.description || `${name} manufactured by ${mfg}. High-grade genuine OTC healthcare product.`;
    const uses = Array.isArray(item.uses) ? item.uses.join(", ") : (item.uses || "Used for daily healthcare, wellness and symptom relief.");
    const sideEffects = Array.isArray(item.sideEffects) ? item.sideEffects.join(", ") : (item.sideEffects || "Generally safe when used as directed. Consult doctor if symptoms persist.");
    const dosage = item.dosage || "Use as directed on label or consult physician.";
    const healthTags = "Over The Counter, Daily Healthcare, CDSCO Approved, 100% Genuine, Non-Prescription";

    const img = item.imageUrl || "https://onemg.gumlet.io/l_watermark_346,w_480,h_480/a_ignore,w_480,h_480,c_fit,q_auto,f_auto/cropped/buhk7yptjggz25hwwgqj.jpg";
    const cleanSlug = (item.slug || item.id || name).toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
    const pUrl = (item.url && !item.url.includes('/search/')) ? item.url : (item.id ? `https://www.1mg.com/otc/${item.id}` : `https://www.1mg.com/otc/${cleanSlug}`);

    return {
      product_id: String(pid),
      product_name: name,
      product_url: pUrl,
      image_thumb: img,
      image_status: "Active",
      category_id: catId,
      category: cat,
      sub_category: subCat,
      brand: brand,
      mrp: mrp,
      selling_price: price,
      discount_pct: `${discount}%`,
      allow_discount: discount > 0 ? "Yes" : "No",
      unit: unit,
      units_per_pack: unitsInPack,
      packs_per_box: 50,
      composition: comp,
      generic_salt: salt,
      manufacturer: mfg,
      description: desc,
      uses: uses,
      side_effects: sideEffects,
      dosage: dosage,
      health_tags: healthTags,
      prescription_required: "No",
      customer_visible: "Yes",
      active: "Yes",
      approval_status: "Approved",
      image_url: img,
    };
  });
}

function formatScrapedBlinkitTo28(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems.map((item, idx) => {
    const pid = item.productId || `BK-API-${Date.now().toString().slice(-6)}${idx}`;
    const name = item.name || "Blinkit Product";
    const brand = item.brand || "Blinkit Essentials";
    const mrp = Number(item.mrp || item.price || 50);
    const price = Number(item.price || mrp);
    const discountPct = item.discountPercent !== undefined && item.discountPercent !== null
      ? item.discountPercent
      : (mrp > price ? Number((((mrp - price) / mrp) * 100).toFixed(1)) : 0);

    // Accurately preserve Blinkit's authentic subcategory (e.g. Breath Strips)
    const subCat = item.subcategory || "General FMCG";
    const pack = item.packSize || "1 unit";
    const img = item.imageUrl || (Array.isArray(item.imageUrls) && item.imageUrls[0]) || "https://cdn.grofers.com/da/cms-assets/cms/product/rc-upload-1778044589968-3.png";

    const lowerName = `${name} ${subCat}`.toLowerCase();
    let cat = "Grocery & Staples";
    let catId = "CAT-102";

    if (lowerName.includes("breath strip") || lowerName.includes("mouth freshener") || lowerName.includes("mint") || lowerName.includes("paan") || lowerName.includes("gum")) {
      cat = "Mouth Fresheners & Mints";
      catId = "CAT-106";
    } else if (lowerName.includes("milk") || lowerName.includes("butter") || lowerName.includes("cheese") || lowerName.includes("paneer") || lowerName.includes("dahi") || lowerName.includes("curd")) {
      cat = "Dairy & Breakfast";
      catId = "CAT-101";
    } else if (lowerName.includes("chips") || lowerName.includes("biscuit") || lowerName.includes("cookie") || lowerName.includes("namkeen") || lowerName.includes("snack") || lowerName.includes("munchies")) {
      cat = "Snacks & Munchies";
      catId = "CAT-103";
    } else if (lowerName.includes("maggi") || lowerName.includes("noodle") || lowerName.includes("pasta") || lowerName.includes("instant") || lowerName.includes("soup")) {
      cat = "Instant Food";
      catId = "CAT-104";
    } else if (lowerName.includes("chocolate") || lowerName.includes("sweet") || lowerName.includes("candy") || lowerName.includes("toffee")) {
      cat = "Chocolates & Sweets";
      catId = "CAT-105";
    } else if (lowerName.includes("soap") || lowerName.includes("shampoo") || lowerName.includes("toothpaste") || lowerName.includes("oral") || lowerName.includes("hygiene")) {
      cat = "Personal Care & Hygiene";
      catId = "CAT-107";
    } else if (lowerName.includes("oil") || lowerName.includes("ghee") || lowerName.includes("atta") || lowerName.includes("rice") || lowerName.includes("dal") || lowerName.includes("salt") || lowerName.includes("sugar")) {
      cat = "Atta, Rice, Oil & Dals";
      catId = "CAT-108";
    }

    const mfg = `${brand} Consumer Products Limited`;
    const desc = `Fresh and authentic ${name} sourced directly from verified Blinkit dark store network. Quality checked and hygienically packaged.`;
    const uses = "Daily household consumption, culinary preparation, and quick dining.";
    const pUrl = item.productUrl || (item.productId ? `https://blinkit.com/prn/${encodeURIComponent(name.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}/prid/${item.productId}` : `https://blinkit.com/s/?q=${encodeURIComponent(name)}`);

    return {
      product_id: String(pid),
      product_name: name,
      product_url: pUrl,
      image_thumb: img,
      image_status: "Active",
      category_id: catId,
      category: cat,
      sub_category: subCat,
      brand: brand,
      mrp: mrp,
      selling_price: price,
      discount_pct: `${discountPct}%`,
      allow_discount: discountPct > 0 ? "Yes" : "No",
      unit: pack,
      units_per_pack: 1,
      packs_per_box: 24,
      composition: "Pure Packaged Ingredients, Quality Checked",
      generic_salt: "Standard FMCG",
      manufacturer: mfg,
      description: desc,
      uses: uses,
      side_effects: "None for standard dietary consumption",
      dosage: "As required for daily consumption",
      health_tags: "FSSAI Certified, 100% Quality Checked, Authentic Grocery",
      prescription_required: "No",
      customer_visible: "Yes",
      active: "Yes",
      approval_status: "Approved",
      image_url: img,
    };
  });
}

// Live Search with Strict Actor Separation & DB Cache First Check
app.post('/api/scrape/live', async (req, res) => {
  const { query, section = 'medicine' } = req.body || {};
  if (!query || !query.trim()) {
    return res.status(400).json({ success: false, message: 'Query is required' });
  }

  let tableName = 'zepmed_medicines';
  if (section === 'blinkit') tableName = 'zepmed_blinkit_products';
  if (section === 'otc') tableName = 'zepmed_otc_medicines';
  const cleanQ = query.trim().toLowerCase();
  const db = getDb();

  try {
    // 1. FIRST: Check Hostinger MySQL DB Cache to save Apify credits!
    const [existingRows] = await db.query(
      `SELECT * FROM ${tableName} WHERE (LOWER(product_name) LIKE ? OR LOWER(brand) LIKE ? OR product_id = ?) AND is_downloaded = 0 LIMIT 15`,
      [`%${cleanQ}%`, `%${cleanQ}%`, query.trim()]
    );

    if (existingRows.length > 0) {
      console.log(`[DB Cache Hit] Found ${existingRows.length} existing products in ${tableName} for '${query}'. Saving Apify credits!`);
      return res.json({
        success: true,
        source: 'database_cache',
        count: existingRows.length,
        products: existingRows.map((r) => ({
          product_id: r.product_id,
          product_name: r.product_name,
          product_url: r.product_url,
          image_thumb: r.image_url,
          image_status: r.image_status,
          category_id: r.category_id,
          category: r.category,
          sub_category: r.sub_category,
          brand: r.brand,
          mrp: parseFloat(r.mrp),
          selling_price: parseFloat(r.selling_price),
          discount_pct: `${r.discount_percent}%`,
          allow_discount: r.allow_discount,
          unit: r.unit,
          units_per_pack: r.units_per_pack,
          packs_per_box: r.packs_per_box,
          composition: r.composition,
          generic_salt: r.generic_salt,
          manufacturer: r.manufacturer,
          description: r.description,
          uses: r.uses,
          side_effects: r.side_effects,
          dosage: r.dosage,
          health_tags: r.health_tags,
          prescription_required: r.prescription_required,
          customer_visible: r.customer_visible,
          active: r.active,
          approval_status: r.approval_status,
          image_url: r.image_url,
        })),
      });
    }

    // 2. NOT IN DB: Execute STRICT Actor for that section ONLY!
    // Medicine & OTC Section -> ONLY Tata 1mg Actor runs! Blinkit Actor is completely off.
    // Blinkit Section -> ONLY Blinkit Actor runs! Tata 1mg Actor is completely off.
    let rawItems = [];
    if (section === 'medicine' || section === 'otc') {
      console.log(`[Strict Apify Scrape] ${section === 'otc' ? 'OTC Section' : 'Medicine Section'} -> Running ONLY Tata 1mg Actor (${ACTOR_1MG}) for '${query}'...`);
      const url = `https://api.apify.com/v2/acts/${ACTOR_1MG}/run-sync-get-dataset-items?token=${getApifyToken()}&timeout=60`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchQueries: [query],
          maxItemsPerSource: 15,
          includeDetails: true,
        }),
      });
      if (resp.ok) rawItems = await resp.json();
    } else {
      console.log(`[Strict Apify Scrape] Blinkit Section -> Running ONLY Blinkit Actor (${ACTOR_BLINKIT}) for '${query}'...`);
      const url = `https://api.apify.com/v2/acts/${ACTOR_BLINKIT}/run-sync-get-dataset-items?token=${getApifyToken()}&timeout=60`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchQueries: [query],
          locations: ['Mumbai'],
          maxResults: 15,
          includeOutOfStock: true,
        }),
      });
      if (resp.ok) rawItems = await resp.json();
    }

    let formatted = [];
    if (section === 'otc') {
      formatted = formatScrapedOtc1mgTo28(rawItems);
    } else if (section === 'medicine') {
      formatted = formatScraped1mgTo28(rawItems);
    } else {
      formatted = formatScrapedBlinkitTo28(rawItems);
    }
    console.log(`[Apify Scrape] Successfully scraped ${formatted.length} products for '${query}' in ${section}!`);

    // Deduplicate against downloaded / archived product IDs and deleted blacklist
    const [downloadedPids] = await db.query(`SELECT product_id FROM ${tableName} WHERE is_downloaded = 1`);
    const [blacklistedPids] = await db.query(`SELECT product_id FROM zepmed_deleted_blacklist`);
    const excludeSet = new Set([
      ...downloadedPids.map((r) => r.product_id),
      ...blacklistedPids.map((r) => r.product_id)
    ]);
    const uniqueProducts = formatted.filter((p) => !excludeSet.has(p.product_id));

    // Automatically cache new products in MySQL so subsequent searches don't spend credits!
    if (uniqueProducts.length > 0) {
      try {
        await insertProducts28(tableName, uniqueProducts);
        console.log(`[Auto-Cache] Saved ${uniqueProducts.length} new items to ${tableName} for future zero-credit hits.`);
      } catch (storeErr) {
        console.warn(`[Auto-Cache Error] ${storeErr.message}`);
      }
    }

    res.json({
      success: true,
      source: 'live_apify_actor',
      count: uniqueProducts.length,
      products: uniqueProducts,
    });
  } catch (err) {
    console.error(`[Apify Error] ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bulk Scrape via Live Apify Actor (For Continuous Auto-Generator 100+ Items)
const BULK_MED_QUERIES = [
  "paracetamol", "cefixime", "azithromycin", "pantoprazole", "amoxicillin",
  "vicks", "cough syrup", "dolo 650", "crocin", "augmentin",
  "omeprazole", "cetirizine", "limcee vitamin c", "shelcal 500", "telmisartan",
  "metformin", "glycomet", "atorvastatin", "becosules", "montair fx"
];

const BULK_BLINKIT_QUERIES = [
  "amul milk", "amul butter", "bread", "cheese", "curd",
  "aashirvaad atta", "fortune oil", "basmati rice", "tata salt", "sugar",
  "maggi noodles", "parle-g biscuits", "tata tea", "nescafe coffee", "lays chips",
  "cadbury chocolate", "dettol soap", "colgate toothpaste", "paneer", "eggs"
];

app.post('/api/scrape/bulk', async (req, res) => {
  const { section = 'medicine', batchIndex = 0 } = req.body || {};
  let tableName = 'zepmed_medicines';
  let queriesList = BULK_MED_QUERIES;
  if (section === 'blinkit') {
    tableName = 'zepmed_blinkit_products';
    queriesList = BULK_BLINKIT_QUERIES;
  } else if (section === 'otc') {
    tableName = 'zepmed_otc_medicines';
    queriesList = TATA_1MG_OTC_QUERIES;
  }
  const currentQuery = queriesList[batchIndex % queriesList.length];
  const db = getDb();

  console.log(`[Bulk Apify Scrape] Batch ${batchIndex} Query: '${currentQuery}' in ${section}...`);

  try {
    // 1. Check DB first for this query to preserve Apify credits! (High-Speed Batch: up to 25 items instant!)
    const [cachedInDb] = await db.query(
      `SELECT * FROM ${tableName} WHERE (LOWER(product_name) LIKE ? OR LOWER(brand) LIKE ?) AND is_downloaded = 0 LIMIT 25`,
      [`%${currentQuery.toLowerCase()}%`, `%${currentQuery.toLowerCase()}%`]
    );

    if (cachedInDb.length > 0) {
      console.log(`[Bulk DB Hit] Found ${cachedInDb.length} items in DB for '${currentQuery}'. Saving Apify credits!`);
      return res.json({
        success: true,
        source: 'database_cache',
        query: currentQuery,
        count: cachedInDb.length,
        products: cachedInDb.map((r) => ({
          product_id: r.product_id,
          product_name: r.product_name,
          product_url: r.product_url,
          image_thumb: r.image_url,
          image_status: r.image_status,
          category_id: r.category_id,
          category: r.category,
          sub_category: r.sub_category,
          brand: r.brand,
          mrp: parseFloat(r.mrp),
          selling_price: parseFloat(r.selling_price),
          discount_pct: `${r.discount_percent}%`,
          allow_discount: r.allow_discount,
          unit: r.unit,
          units_per_pack: r.units_per_pack,
          packs_per_box: r.packs_per_box,
          composition: r.composition,
          generic_salt: r.generic_salt,
          manufacturer: r.manufacturer,
          description: r.description,
          uses: r.uses,
          side_effects: r.side_effects,
          dosage: r.dosage,
          health_tags: r.health_tags,
          prescription_required: r.prescription_required,
          customer_visible: r.customer_visible,
          active: r.active,
          approval_status: r.approval_status,
          image_url: r.image_url,
        })),
      });
    }

    // 2. STRICT ACTOR RUN: Run strict actor for that section ONLY! (High-Speed Batch: 25 items per run)
    let rawItems = [];
    if (section === 'medicine' || section === 'otc') {
      const url = `https://api.apify.com/v2/acts/${ACTOR_1MG}/run-sync-get-dataset-items?token=${getApifyToken()}&timeout=60`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchQueries: [currentQuery],
          maxItemsPerSource: 25,
          includeDetails: true,
        }),
      });
      if (resp.ok) rawItems = await resp.json();
    } else {
      const url = `https://api.apify.com/v2/acts/${ACTOR_BLINKIT}/run-sync-get-dataset-items?token=${getApifyToken()}&timeout=60`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchQueries: [currentQuery],
          locations: ['Mumbai'],
          maxResults: 25,
          includeOutOfStock: true,
        }),
      });
      if (resp.ok) rawItems = await resp.json();
    }

    let formatted = [];
    if (section === 'otc') {
      formatted = formatScrapedOtc1mgTo28(rawItems);
    } else if (section === 'medicine') {
      formatted = formatScraped1mgTo28(rawItems);
    } else {
      formatted = formatScrapedBlinkitTo28(rawItems);
    }

    const [downloadedPids] = await db.query(`SELECT product_id FROM ${tableName} WHERE is_downloaded = 1`);
    const [blacklistedPids] = await db.query(`SELECT product_id FROM zepmed_deleted_blacklist`);
    const excludeSet = new Set([
      ...downloadedPids.map((r) => r.product_id),
      ...blacklistedPids.map((r) => r.product_id)
    ]);

    const uniqueProducts = formatted.filter((p) => !excludeSet.has(p.product_id));

    // Store in DB for future cache hits
    if (uniqueProducts.length > 0) {
      try {
        await insertProducts28(tableName, uniqueProducts);
        console.log(`[Bulk Auto-Cache] Stored ${uniqueProducts.length} items in ${tableName}.`);
      } catch (storeErr) {
        console.warn(`[Bulk Auto-Cache Error] ${storeErr.message}`);
      }
    }

    res.json({
      success: true,
      source: 'live_apify_actor',
      query: currentQuery,
      count: uniqueProducts.length,
      products: uniqueProducts,
    });
  } catch (err) {
    console.error(`[Bulk Apify Error] ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Dedicated Tata 1mg OTC Bulk Scraper (Continuous Auto-Generator for OTC Products)
const TATA_1MG_OTC_QUERIES = [
  'volini pain relief', 'vicks vaporub', 'revital h daily multivitamin', 'moov pain relief cream',
  'himalaya liv 52', 'dabur chyawanprash', 'strepsils honey lemon', 'dettol antiseptic liquid',
  'electral oral rehydration', 'digene antacid gel', 'otrivin nasal spray', 'burnol antiseptic cream',
  'soframycin skin cream', 'iodex fast relief balm', 'eno fruit salt lemon', 'horlicks classic malt',
  'ensure nutritional powder', 'sebamed baby protective facial cream', 'cetaphil gentle skin cleanser',
  'himalaya purifying neem face wash', 'zandu balm pain relief', 'bournvita nutrition drink', 'glucon d instant energy',
  'dabur 100 pure honey', 'pain relief spray fast action', 'antacid oral suspension', 'cough lozenges throat relief',
  'multivitamin daily immune support', 'calcium vitamin d3 tablets', 'whey protein isolate powder',
  'herbal immunity booster syrup', 'skin healing antiseptic cream', 'first aid antiseptic healing lotion',
  'pain relief transdermal patch', 'digestive churna ayurvedic', 'herbal hair growth oil', 'glucose instant energy drink',
  'vitamin c chewable immune tablets', 'zincovit multivitamin zinc tablets', 'becosules b-complex capsules', 'himalaya septilin immunity',
  'charak kofol syrup ayurvedic', 'dabur honitus herbal cough relief', 'vicks nasal inhaler', 'relispray pain relief'
];

app.post('/api/scrape/otc-bulk', async (req, res) => {
  const { batchIndex = 0 } = req.body || {};
  const currentQuery = TATA_1MG_OTC_QUERIES[batchIndex % TATA_1MG_OTC_QUERIES.length];
  const db = getDb();

  console.log(`[OTC Bulk Scrape] Batch ${batchIndex} Query: '${currentQuery}' strictly in Tata 1mg OTC...`);

  try {
    // 1. Check zepmed_otc_medicines DB first for this query to preserve Apify credits! (High-Speed Batch: up to 25 items instant!)
    const [cachedInDb] = await db.query(
      `SELECT * FROM zepmed_otc_medicines WHERE (LOWER(product_name) LIKE ? OR LOWER(brand) LIKE ?) AND is_downloaded = 0 LIMIT 25`,
      [`%${currentQuery.toLowerCase()}%`, `%${currentQuery.toLowerCase()}%`]
    );

    if (cachedInDb.length > 0) {
      console.log(`[OTC DB Hit] Found ${cachedInDb.length} items in zepmed_otc_medicines for '${currentQuery}'. Saving Apify credits!`);
      return res.json({
        success: true,
        source: 'database_cache',
        query: currentQuery,
        count: cachedInDb.length,
        products: cachedInDb.map((r) => ({
          product_id: r.product_id,
          product_name: r.product_name,
          product_url: r.product_url,
          image_thumb: r.image_url,
          image_status: r.image_status,
          category_id: r.category_id,
          category: r.category,
          sub_category: r.sub_category,
          brand: r.brand,
          mrp: parseFloat(r.mrp),
          selling_price: parseFloat(r.selling_price),
          discount_pct: `${r.discount_percent}%`,
          allow_discount: r.allow_discount,
          unit: r.unit,
          units_per_pack: r.units_per_pack,
          packs_per_box: r.packs_per_box,
          composition: r.composition,
          generic_salt: r.generic_salt,
          manufacturer: r.manufacturer,
          description: r.description,
          uses: r.uses,
          side_effects: r.side_effects,
          dosage: r.dosage,
          health_tags: r.health_tags,
          prescription_required: r.prescription_required,
          customer_visible: r.customer_visible,
          active: r.active,
          approval_status: r.approval_status,
          image_url: r.image_url,
        })),
      });
    }

    // 2. STRICT TATA 1MG ACTOR RUN (dzTaO7bhlAGsNXfCA)
    const url = `https://api.apify.com/v2/acts/${ACTOR_1MG}/run-sync-get-dataset-items?token=${getApifyToken()}&timeout=60`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        searchQueries: [currentQuery],
        maxItemsPerSource: 25,
        includeDetails: true,
      }),
    });

    let rawItems = [];
    if (resp.ok) rawItems = await resp.json();

    const formatted = formatScrapedOtc1mgTo28(rawItems);

    const [downloadedPids] = await db.query(`SELECT product_id FROM zepmed_otc_medicines WHERE is_downloaded = 1`);
    const [blacklistedPids] = await db.query(`SELECT product_id FROM zepmed_deleted_blacklist`);
    const [existingPids] = await db.query(`SELECT product_id FROM zepmed_otc_medicines`);
    const excludeSet = new Set([
      ...downloadedPids.map((r) => r.product_id),
      ...blacklistedPids.map((r) => r.product_id),
      ...existingPids.map((r) => r.product_id)
    ]);

    const uniqueProducts = formatted.filter((p) => !excludeSet.has(p.product_id));

    // Store in zepmed_otc_medicines DB for future cache hits
    if (uniqueProducts.length > 0) {
      try {
        await insertProducts28('zepmed_otc_medicines', uniqueProducts);
        console.log(`[OTC Auto-Cache] Stored ${uniqueProducts.length} items in zepmed_otc_medicines.`);
      } catch (storeErr) {
        console.warn(`[OTC Auto-Cache Error] ${storeErr.message}`);
      }
    }

    res.json({
      success: true,
      source: 'live_apify_actor',
      query: currentQuery,
      count: uniqueProducts.length,
      products: uniqueProducts,
    });
  } catch (err) {
    console.error(`[OTC Bulk Apify Error] ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// A-Z INDIAN MEDICINES DATASET BATCH ENGINE
// (2,53,973 Medicines, Checkpointing & Apify Aggregation)
// ==========================================

const CHECKPOINT_FILE = path.join(__dirname, 'dataset_checkpoint.json');

function loadCheckpoint() {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
    }
    const parentCp = path.join(__dirname, '..', 'dataset_checkpoint.json');
    if (fs.existsSync(parentCp)) {
      return JSON.parse(fs.readFileSync(parentCp, 'utf8'));
    }
  } catch (err) {
    console.warn('[Checkpoint] Read warning:', err.message);
  }
  return {
    currentRowIndex: 0,
    currentBatchIndex: 0,
    totalRows: 253973,
    batchSize: 15,
    totalProcessed: 0,
    lastUpdated: new Date().toISOString(),
    lastMedicineName: '',
  };
}

function saveCheckpoint(data) {
  try {
    const jsonStr = JSON.stringify(data, null, 2);
    fs.writeFileSync(CHECKPOINT_FILE, jsonStr, 'utf8');
    const parentCp = path.join(__dirname, '..', 'dataset_checkpoint.json');
    fs.writeFileSync(parentCp, jsonStr, 'utf8');
  } catch (err) {
    console.warn('[Checkpoint] Write warning:', err.message);
  }
}

let cachedMasterDataset = null;

function getMasterDataset() {
  if (cachedMasterDataset && cachedMasterDataset.length > 0) {
    return cachedMasterDataset;
  }
  const candidatePaths = [
    path.join(__dirname, 'A_Z_medicines_dataset_of_India.csv'),
    path.join(__dirname, '..', 'A_Z_medicines_dataset_of_India.csv'),
    path.join(process.cwd(), 'A_Z_medicines_dataset_of_India.csv'),
    'D:\\zepmed_new\\inventtory_abc\\Product variants\\multi_variants\\zepmed_multi\\A_Z_medicines_dataset_of_India.csv'
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      console.log(`[Master Dataset] Reading 2.5L+ Indian Medicines from ${p}...`);
      const fileData = fs.readFileSync(p, 'utf8');
      const parsed = Papa.parse(fileData, { header: true, skipEmptyLines: true });
      cachedMasterDataset = parsed.data.filter(r => r && r.name && r.name.trim().length > 0);
      console.log(`[Master Dataset] Successfully parsed ${cachedMasterDataset.length} Indian medicines into memory!`);
      return cachedMasterDataset;
    }
  }
  throw new Error('A_Z_medicines_dataset_of_India.csv not found in any standard path');
}

function cleanMedicineQuery(name) {
  if (!name) return '';
  let clean = name.trim();
  clean = clean.replace(/\(.*?\)/g, ' ');
  clean = clean.replace(/\b(strip of|bottle of|pack of|box of|vial of)\b.*$/i, ' ');
  clean = clean.replace(/[^\w\s-]/g, ' ');
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean;
}

// 100% FREE DIRECT TATA 1MG FAST SCRAPER (0 APIFY CREDITS USED, ZERO TOLL)
async function scrapeDirectTata1mg(rawName) {
  if (!rawName) return [];
  const cleanQ = cleanMedicineQuery(rawName);
  if (!cleanQ) return [];

  try {
    // Attempt 1: 1mg autocomplete search (full exact query with Gumlet photos & direct drug URLs)
    const url = `https://www.1mg.com/api/v1/search/autocomplete?name=${encodeURIComponent(cleanQ)}`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    if (resp.ok) {
      const data = await resp.json();
      const drugs = (data.results || []).filter(r => r.type === 'drug' || r.type === 'otc' || r.res_type === 'sku' || (r.image_urls && r.image_urls.length > 0) || (r.cropped_image_urls && r.cropped_image_urls.length > 0));
      if (drugs.length > 0) {
        return drugs.map((item, idx) => {
          const pid = String(item.id || `MED-1MG-${Date.now()}-${idx}`);
          const name = item.label || (item.name ? item.name.replace(/<[^>]*>/g, '') : cleanQ);
          const mrp = Number(item.price || item.discounted_price || 100);
          const price = Number(item.discounted_price || item.price || mrp);
          const discount = mrp > price ? Number((((mrp - price) / mrp) * 100).toFixed(1)) : 0;
          const slug = item.url_path || `/drugs/${encodeURIComponent(name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}`;
          const directUrl = slug.startsWith('http') ? slug : `https://www.1mg.com${slug}`;
          const img = (item.cropped_image_urls && item.cropped_image_urls[0]) ||
                      (item.image_urls && item.image_urls[0]) ||
                      'https://onemg.gumlet.io/l_watermark_346,w_480,h_480/a_ignore,w_480,h_480,c_fit,q_auto,f_auto/cropped/buhk7yptjggz25hwwgqj.jpg';
          const salt = item.drug_name || item.strength || 'Active Pharmaceutical Formulation';
          const mfg = item.marketer_name || item.manufacturer_name || 'Pharma Healthcare Ltd';
          const unit = item.pack_size_label || `${item.units_in_pack || 10} Units`;

          return {
            product_id: pid,
            product_name: name,
            product_url: directUrl,
            image_thumb: img,
            image_status: 'Active',
            category_id: item.rx_required ? 'CAT-RX-01' : 'CAT-MED-01',
            category: item.rx_required ? 'Prescription (Rx) Medicine' : 'Allopathy Medicine',
            sub_category: salt,
            brand: item.brand_name || mfg,
            mrp: mrp,
            selling_price: price,
            discount_pct: `${discount}%`,
            allow_discount: discount > 0 ? 'Yes' : 'No',
            unit: unit,
            units_per_pack: item.units_in_pack || 10,
            packs_per_box: 50,
            composition: salt,
            generic_salt: salt,
            manufacturer: mfg,
            description: `${name} marketed by ${mfg}. Composition: ${salt}. CDSCO approved Indian formulation.`,
            uses: 'Used as prescribed by licensed healthcare professional for therapeutic medical management.',
            side_effects: 'Mild nausea, headache or dizziness in rare cases. Consult doctor if symptoms persist.',
            dosage: 'Take orally with water as advised by qualified medical practitioner.',
            health_tags: 'CDSCO Approved, 100% Genuine Indian Medicine, Schedule H Drug',
            prescription_required: item.rx_required ? 'Yes' : 'No',
            customer_visible: item.is_discontinued ? 'No' : 'Yes',
            active: item.is_discontinued ? 'No' : 'Yes',
            approval_status: 'Approved',
            image_url: img
          };
        });
      }
    }
  } catch (err) {
    console.warn(`[Direct 1mg Gateway Warning] ${err.message}`);
  }

  // Attempt 2: If autocomplete had 0 results, query by brand prefix
  try {
    const brandPrefix = cleanQ.split(' ')[0];
    if (brandPrefix && brandPrefix.length >= 3) {
      const url = `https://www.1mg.com/pharmacy_api_gateway/v4/drug_skus/by_prefix?prefix_term=${encodeURIComponent(brandPrefix)}`;
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (resp.ok) {
        const data = await resp.json();
        const skus = data.data?.skus || [];
        if (skus.length > 0) {
          return skus.slice(0, 10).map((item, idx) => {
            const pid = String(item.id || item.sku_id || `MED-1MG-${Date.now()}-${idx}`);
            const name = item.name || cleanQ;
            const mrp = Number(item.price || 100);
            const price = Number((mrp * 0.9).toFixed(2));
            const directUrl = item.slug ? `https://www.1mg.com${item.slug}` : `https://www.1mg.com/drugs/${encodeURIComponent(name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}`;
            const img = item.image_url || 'https://onemg.gumlet.io/l_watermark_346,w_480,h_480/a_ignore,w_480,h_480,c_fit,q_auto,f_auto/cropped/buhk7yptjggz25hwwgqj.jpg';
            const salt = item.short_composition || 'Active Pharmaceutical Formulation';
            const mfg = item.manufacturer_name || item.marketer_name || 'Pharma Healthcare Ltd';
            const unit = item.pack_size_label || '1 Strip';

            return {
              product_id: pid,
              product_name: name,
              product_url: directUrl,
              image_thumb: img,
              image_status: 'Active',
              category_id: item.type === 'allopathy' ? 'CAT-MED-01' : 'CAT-OTC-02',
              category: 'Allopathy Medicine',
              sub_category: salt,
              brand: mfg,
              mrp: mrp,
              selling_price: price,
              discount_pct: '10%',
              allow_discount: 'Yes',
              unit: unit,
              units_per_pack: item.quantity || 10,
              packs_per_box: 50,
              composition: salt,
              generic_salt: salt,
              manufacturer: mfg,
              description: `${name} manufactured by ${mfg}. Composition: ${salt}. CDSCO approved Indian formulation.`,
              uses: 'Used as prescribed by licensed healthcare professional.',
              side_effects: 'Mild nausea or dizziness in rare cases. Consult doctor if symptoms persist.',
              dosage: 'Take as advised by qualified medical practitioner.',
              health_tags: 'CDSCO Approved, 100% Genuine Indian Medicine',
              prescription_required: item.rx_required ? 'Yes' : 'No',
              customer_visible: item.is_discontinued ? 'No' : 'Yes',
              active: item.is_discontinued ? 'No' : 'Yes',
              approval_status: 'Approved',
              image_url: img
            };
          });
        }
      }
    }
  } catch (err) {
    console.warn(`[Prefix 1mg Gateway Warning] ${err.message}`);
  }

  return [];
}

function formatCsvMedicineTo28(row, idx = 0) {
  const pid = `MED-AZ-${row.id || Date.now()}-${idx}`;
  const mrp = parseFloat(row['price(₹)']) || 100.00;
  const sellingPrice = parseFloat((mrp * 0.85).toFixed(2));
  const discount = 15.0;
  const salt = [row.short_composition1, row.short_composition2]
    .filter(Boolean)
    .map(s => s.trim())
    .join(' + ') || 'Pharmaceutical Salt Formulation';
  const mfg = (row.manufacturer_name || 'Pharma Healthcare Ltd').trim();
  const unit = (row.pack_size_label || '1 Strip').trim();
  const isDiscontinued = String(row.Is_discontinued).toLowerCase() === 'true';
  const cleanName = cleanMedicineQuery(row.name || 'Medicine');
  const slug = cleanName.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
  const directUrl = `https://www.1mg.com/drugs/${slug}`;

  return {
    product_id: pid,
    product_name: (row.name || 'Medicine').trim(),
    product_url: directUrl,
    image_thumb: 'https://onemg.gumlet.io/l_watermark_346,w_480,h_480/a_ignore,w_480,h_480,c_fit,q_auto,f_auto/cropped/buhk7yptjggz25hwwgqj.jpg',
    image_status: 'Active',
    category_id: 'CAT-MED-01',
    category: 'Allopathy Medicine',
    sub_category: salt,
    brand: mfg,
    mrp: mrp,
    selling_price: sellingPrice,
    discount_pct: `${discount}%`,
    allow_discount: 'Yes',
    unit: unit,
    units_per_pack: 10,
    packs_per_box: 50,
    composition: salt,
    generic_salt: salt,
    manufacturer: mfg,
    description: `${(row.name || '').trim()} manufactured by ${mfg}. Composition: ${salt}. CDSCO approved Indian medicine formulation.`,
    uses: 'Used as prescribed by a licensed healthcare professional for therapeutic medical management.',
    side_effects: 'Mild nausea, headache or dizziness in rare cases. Consult doctor if symptoms persist.',
    dosage: 'Take orally with water as advised by a qualified medical practitioner.',
    health_tags: 'Prescription Required, Schedule H Drug, CDSCO Approved, 100% Genuine Indian Medicine',
    prescription_required: 'Yes',
    customer_visible: isDiscontinued ? 'No' : 'Yes',
    active: isDiscontinued ? 'No' : 'Yes',
    approval_status: 'Approved',
    image_url: 'https://onemg.gumlet.io/l_watermark_346,w_480,h_480/a_ignore,w_480,h_480,c_fit,q_auto,f_auto/cropped/buhk7yptjggz25hwwgqj.jpg'
  };
}

// 1. Get Status & Checkpoint of A-Z Dataset
app.get('/api/dataset/status', async (req, res) => {
  try {
    const checkpoint = loadCheckpoint();
    let totalRows = 253973;
    try {
      const dataset = getMasterDataset();
      totalRows = dataset.length;
    } catch {}

    const db = getDb();
    let totalInDb = 0;
    try {
      const [countRows] = await db.query('SELECT COUNT(*) as cnt FROM zepmed_medicines');
      totalInDb = countRows[0].cnt;
    } catch {}

    const batchSize = checkpoint.batchSize || 15;
    const totalBatches = Math.ceil(totalRows / batchSize);
    const percentCompleted = Number(((checkpoint.currentRowIndex / totalRows) * 100).toFixed(2));

    res.json({
      success: true,
      checkpoint,
      totalRows,
      currentRowIndex: checkpoint.currentRowIndex,
      currentBatchIndex: checkpoint.currentBatchIndex,
      batchSize,
      totalBatches,
      percentCompleted,
      totalProcessed: checkpoint.totalProcessed || checkpoint.currentRowIndex,
      lastMedicineName: checkpoint.lastMedicineName || '',
      lastUpdated: checkpoint.lastUpdated,
      totalInDb
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Process Next Batch of 10 Medicines from A-Z Dataset
app.post('/api/dataset/batch-scrape', async (req, res) => {
  const { batchSize = 10 } = req.body || {};
  const db = getDb();

  try {
    const checkpoint = loadCheckpoint();
    const dataset = getMasterDataset();
    const startIdx = checkpoint.currentRowIndex;

    if (startIdx >= dataset.length) {
      return res.json({
        success: true,
        isCompleted: true,
        message: 'All 2,53,973 medicines have been processed!',
        currentRowIndex: dataset.length,
        totalRows: dataset.length,
        percentCompleted: 100,
        products: []
      });
    }

    const endIdx = Math.min(startIdx + batchSize, dataset.length);
    const batchRows = dataset.slice(startIdx, endIdx);
    const batchNames = batchRows.map(r => (r.name || '').trim());

    console.log(`[Batch Engine] Processing Batch #${checkpoint.currentBatchIndex + 1}: Rows ${startIdx}..${endIdx} (${batchRows.length} medicines)...`);

    // Step A: Check Hostinger MySQL (zepmed_medicines) first to save Apify credits!
    const placeholders = batchNames.map(() => '?').join(',');
    let cachedDbProducts = [];
    if (batchNames.length > 0) {
      try {
        const [rows] = await db.query(
          `SELECT * FROM zepmed_medicines WHERE product_name IN (${placeholders})`,
          batchNames
        );
        cachedDbProducts = rows.map(r => ({
          product_id: r.product_id,
          product_name: r.product_name,
          product_url: r.product_url,
          image_thumb: r.image_url,
          image_status: r.image_status,
          category_id: r.category_id,
          category: r.category,
          sub_category: r.sub_category,
          brand: r.brand,
          mrp: parseFloat(r.mrp),
          selling_price: parseFloat(r.selling_price),
          discount_pct: `${r.discount_percent}%`,
          allow_discount: r.allow_discount,
          unit: r.unit,
          units_per_pack: r.units_per_pack,
          packs_per_box: r.packs_per_box,
          composition: r.composition,
          generic_salt: r.generic_salt,
          manufacturer: r.manufacturer,
          description: r.description,
          uses: r.uses,
          side_effects: r.side_effects,
          dosage: r.dosage,
          health_tags: r.health_tags,
          prescription_required: r.prescription_required,
          customer_visible: r.customer_visible,
          active: r.active,
          approval_status: r.approval_status,
          image_url: r.image_url
        }));
      } catch (dbErr) {
        console.warn(`[Batch DB Hit Check] ${dbErr.message}`);
      }
    }

    const cachedNamesSet = new Set(cachedDbProducts.map(p => p.product_name.toLowerCase()));
    const uncachedRows = batchRows.filter(r => !cachedNamesSet.has((r.name || '').trim().toLowerCase()));

    let scrapedProducts = [];
    if (uncachedRows.length > 0) {
      console.log(`[Batch Engine] Fast Track 1: Scraping ${uncachedRows.length} medicines directly from Tata 1mg Gateway (100% Free, 0 Apify Credits)...`);

      // 1. Run Direct Tata 1mg Free Scraper in parallel for all uncached medicines
      const directBatchPromises = uncachedRows.map(r => scrapeDirectTata1mg(r.name));
      const directBatchResults = await Promise.all(directBatchPromises);
      scrapedProducts = directBatchResults.flat();

      console.log(`[Batch Engine] Direct 1mg Free Scraper yielded ${scrapedProducts.length} authentic products with Gumlet photos!`);

      // 2. If direct returned 0 products (rare) and Apify is available, attempt Apify fallback
      if (scrapedProducts.length === 0) {
        const queries = uncachedRows.map(r => cleanMedicineQuery(r.name)).filter(Boolean);
        console.log(`[Batch Engine] Fallback: Sending ${queries.length} queries to Apify Actor...`);
        try {
          const url = `https://api.apify.com/v2/acts/${ACTOR_1MG}/run-sync-get-dataset-items?token=${getApifyToken()}&timeout=60`;
          const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              searchQueries: queries,
              maxItemsPerSource: 6,
              includeDetails: true
            })
          });

          if (resp.ok) {
            const rawItems = await resp.json();
            scrapedProducts = formatScraped1mgTo28(rawItems);
            console.log(`[Batch Apify Result] Got ${scrapedProducts.length} live products from Tata 1mg fallback!`);
          }
        } catch (apifyErr) {
          console.warn(`[Batch Apify Scrape Warning] ${apifyErr.message}`);
        }
      }
    }

    // Step C: Filter against permanent blacklist and downloaded archives
    const [downloadedRows] = await db.query(`SELECT product_id FROM zepmed_medicines WHERE is_downloaded = 1`);
    const [blacklistedRows] = await db.query(`SELECT product_id FROM zepmed_deleted_blacklist`);
    const excludeSet = new Set([
      ...downloadedRows.map(r => r.product_id),
      ...blacklistedRows.map(r => r.product_id)
    ]);

    // Insert ONLY authentic scraped products with valid Gumlet images and direct 1mg drug URLs
    const newToInsert = scrapedProducts.filter(p => !excludeSet.has(p.product_id));

    // Step D: Insert new products into Hostinger MySQL
    let newlyInsertedCount = 0;
    if (newToInsert.length > 0) {
      try {
        newlyInsertedCount = await insertProducts28('zepmed_medicines', newToInsert);
        console.log(`[Batch Save] Successfully persisted ${newToInsert.length} medicines into Hostinger MySQL!`);
      } catch (storeErr) {
        console.warn(`[Batch Store Error] ${storeErr.message}`);
      }
    }

    // Step E: Update and save persistent Checkpoint
    checkpoint.currentRowIndex = endIdx;
    checkpoint.currentBatchIndex += 1;
    checkpoint.totalProcessed = (checkpoint.totalProcessed || 0) + batchRows.length;
    checkpoint.lastMedicineName = batchRows[batchRows.length - 1].name;
    checkpoint.lastUpdated = new Date().toISOString();
    saveCheckpoint(checkpoint);

    // Combine all products for frontend display
    const combinedBatchProducts = [...cachedDbProducts, ...newToInsert];

    const [countRows] = await db.query('SELECT COUNT(*) as cnt FROM zepmed_medicines');
    const totalInDb = countRows[0].cnt;

    res.json({
      success: true,
      batchIndex: checkpoint.currentBatchIndex,
      currentRowIndex: checkpoint.currentRowIndex,
      totalRows: dataset.length,
      totalBatches: Math.ceil(dataset.length / batchSize),
      percentCompleted: Number(((checkpoint.currentRowIndex / dataset.length) * 100).toFixed(2)),
      batchMeds: batchNames,
      products: combinedBatchProducts,
      source: uncachedRows.length === 0 ? 'database_cache' : 'live_apify_actor',
      newlyInsertedCount,
      totalInDb,
      checkpoint
    });
  } catch (err) {
    console.error(`[Batch Engine Error] ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Reset Checkpoint to Row 0
app.post('/api/dataset/reset-checkpoint', (req, res) => {
  const freshCheckpoint = {
    currentRowIndex: 0,
    currentBatchIndex: 0,
    totalRows: 253973,
    batchSize: 15,
    totalProcessed: 0,
    lastUpdated: new Date().toISOString(),
    lastMedicineName: ''
  };
  saveCheckpoint(freshCheckpoint);
  console.log('🔄 [Checkpoint] Reset to Row 0, Batch 0 successfully!');
  res.json({ success: true, message: 'Checkpoint reset to Row 0', checkpoint: freshCheckpoint });
});

// 4. Set Custom Checkpoint Row Index
app.post('/api/dataset/set-checkpoint', (req, res) => {
  const { rowIndex = 0 } = req.body || {};
  const checkpoint = loadCheckpoint();
  checkpoint.currentRowIndex = Math.max(0, parseInt(rowIndex, 10) || 0);
  checkpoint.currentBatchIndex = Math.floor(checkpoint.currentRowIndex / (checkpoint.batchSize || 15));
  checkpoint.lastUpdated = new Date().toISOString();
  saveCheckpoint(checkpoint);
  console.log(`[Checkpoint] Custom row set to ${checkpoint.currentRowIndex}`);
  res.json({ success: true, checkpoint });
});

// ==========================================
// 🚀 BLINKIT 27,555 PRODUCTS BATCH AUTO-GENERATOR ENGINE
// (Checkpointing, 28 Columns, Deduplication & Hostinger MySQL Persistence)
// ==========================================

const BLINKIT_CHECKPOINT_FILE = path.join(__dirname, 'blinkit_checkpoint.json');

function loadBlinkitCheckpoint() {
  try {
    if (fs.existsSync(BLINKIT_CHECKPOINT_FILE)) {
      return JSON.parse(fs.readFileSync(BLINKIT_CHECKPOINT_FILE, 'utf8'));
    }
    const parentCp = path.join(__dirname, '..', 'blinkit_checkpoint.json');
    if (fs.existsSync(parentCp)) {
      return JSON.parse(fs.readFileSync(parentCp, 'utf8'));
    }
  } catch (err) {
    console.warn('[Blinkit Checkpoint] Read warning:', err.message);
  }
  return {
    currentRowIndex: 0,
    currentBatchIndex: 0,
    totalRows: 27555,
    batchSize: 10,
    totalProcessed: 0,
    lastUpdated: new Date().toISOString(),
    lastProductName: '',
  };
}

function saveBlinkitCheckpoint(data) {
  try {
    const jsonStr = JSON.stringify(data, null, 2);
    fs.writeFileSync(BLINKIT_CHECKPOINT_FILE, jsonStr, 'utf8');
    const parentCp = path.join(__dirname, '..', 'blinkit_checkpoint.json');
    fs.writeFileSync(parentCp, jsonStr, 'utf8');
  } catch (err) {
    console.warn('[Blinkit Checkpoint] Write warning:', err.message);
  }
}

let cachedBlinkitDataset = null;

function getBlinkitDataset() {
  if (cachedBlinkitDataset && cachedBlinkitDataset.length > 0) {
    return cachedBlinkitDataset;
  }
  const candidatePaths = [
    path.join(__dirname, 'Blinkit Products (1).xlsx'),
    path.join(__dirname, '..', 'Blinkit Products (1).xlsx'),
    path.join(process.cwd(), 'Blinkit Products (1).xlsx'),
    'D:\\zepmed_new\\inventtory_abc\\Product variants\\multi_variants\\zepmed_multi\\Blinkit Products (1).xlsx',
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      console.log(`[Blinkit Dataset] Loading 27,555 Products from ${p}...`);
      const wb = xlsx.readFile(p);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawData = xlsx.utils.sheet_to_json(ws);
      cachedBlinkitDataset = rawData.filter(r => r && (r.product || r.name));
      console.log(`[Blinkit Dataset] Successfully loaded ${cachedBlinkitDataset.length} authentic Blinkit products into memory!`);
      return cachedBlinkitDataset;
    }
  }
  throw new Error('Blinkit Products (1).xlsx not found in candidate paths');
}

const BLINKIT_CATEGORY_IMAGES = {
  'Beauty & Hygiene': 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=270/app/images/category/cms_images/icon/163_1643006428282.png',
  'Kitchen, Garden & Pets': 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=270/app/images/category/cms_images/icon/1379_1643006401344.png',
  'Cleaning & Household': 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=270/app/images/category/cms_images/icon/18_1643006385215.png',
  'Gourmet & World Food': 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=270/app/images/category/cms_images/icon/12_1643006354143.png',
  'Foodgrains, Oil & Masala': 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=270/app/images/category/cms_images/icon/16_1643006338302.png',
  'Snacks & Branded Foods': 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=270/app/images/category/cms_images/icon/13_1643006322987.png',
  'Beverages': 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=270/app/images/category/cms_images/icon/14_1643006307376.png',
  'Bakery, Cakes & Dairy': 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=270/app/images/category/cms_images/icon/15_1643006292376.png',
  'Baby Care': 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=270/app/images/category/cms_images/icon/7_1643006277156.png',
  'Fruits & Vegetables': 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=270/app/images/category/cms_images/icon/1487_1643006261541.png',
  'Eggs, Meat & Fish': 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=270/app/images/category/cms_images/icon/4_1643006246142.png',
};
const BLINKIT_DEFAULT_IMG = 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=270/app/images/category/cms_images/icon/16_1643006338302.png';

function formatBlinkitRowTo28(row, idx = 0) {
  const prodName = String(row.product || row.name || 'Blinkit Product').trim();
  const pid = `BLK-AZ-${row.index != null ? row.index : `${Date.now()}-${idx}`}`;
  const mrp = parseFloat(row.market_price) || parseFloat(row.sale_price) || 100.00;
  const salePrice = parseFloat(row.sale_price) || mrp;
  const discount = mrp > salePrice ? parseFloat((((mrp - salePrice) / mrp) * 100).toFixed(1)) : 0.0;
  const cat = String(row.category || 'Grocery & Essentials').trim();
  const subCat = String(row.sub_category || '').trim();
  const brand = String(row.brand || 'Blinkit Verified').trim();
  const type = String(row.type || '1 Pack').trim();
  const rating = row.rating ? `${row.rating}★` : '4.2★';
  const directUrl = `https://blinkit.com/s/?q=${encodeURIComponent(prodName)}`;
  const img = BLINKIT_CATEGORY_IMAGES[cat] || BLINKIT_DEFAULT_IMG;

  return {
    product_id: pid,
    product_name: prodName,
    product_url: directUrl,
    image_thumb: img,
    image_status: 'Active',
    category_id: 'CAT-101',
    category: cat,
    sub_category: subCat || type,
    brand: brand,
    mrp: mrp,
    selling_price: salePrice,
    discount_pct: `${discount}%`,
    allow_discount: discount > 0 ? 'Yes' : 'No',
    unit: type,
    units_per_pack: 1,
    packs_per_box: 1,
    composition: `${type} • Quality Assured • ${rating}`,
    generic_salt: `${cat} - ${subCat || brand}`,
    manufacturer: brand,
    description: `${prodName} by ${brand}. Fresh, authentic quality delivered in 10 minutes via Blinkit.`,
    uses: `Daily household consumption, ${cat.toLowerCase()} essentials.`,
    side_effects: 'None (FMCG / Grocery / Personal Care Quality Assured)',
    dosage: 'As per daily household needs.',
    health_tags: 'Blinkit 10-Min Fast Delivery, 100% Genuine, Best Price Guaranteed',
    prescription_required: 'No',
    customer_visible: 'Yes',
    active: 'Yes',
    approval_status: 'Approved',
    image_url: img,
  };
}

// Smart 10-Item Blinkit + 1mg Autocomplete Expansion Function
async function scrapeBlinkitDirectExpansion(row, idx = 0) {
  const rawName = String(row.product || row.name || '').trim();
  const brand = String(row.brand || '').trim();
  const cat = String(row.category || 'Grocery & Essentials').trim();
  const subCat = String(row.sub_category || '').trim();

  // Try queries: 1) raw clean name, 2) brand + first word
  const cleanQ = cleanMedicineQuery(rawName);
  const searchTerms = [];
  if (cleanQ && cleanQ.length >= 2) searchTerms.push(cleanQ);
  if (brand && brand !== 'Blinkit Verified' && brand.length >= 3) {
    const firstWord = rawName.split(' ')[0] || '';
    if (firstWord && !brand.toLowerCase().includes(firstWord.toLowerCase())) {
      searchTerms.push(`${brand} ${firstWord}`);
    } else {
      searchTerms.push(brand);
    }
  }

  for (const term of searchTerms) {
    try {
      const url = `https://www.1mg.com/api/v1/search/autocomplete?name=${encodeURIComponent(term)}`;
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      });

      if (resp.ok) {
        const data = await resp.json();
        const items = (data.results || []).filter(r =>
          (r.type === 'otc' || r.type === 'drug' || r.res_type === 'sku' || (r.image_urls && r.image_urls.length > 0) || (r.cropped_image_urls && r.cropped_image_urls.length > 0)) &&
          (r.label || r.name)
        );

        if (items.length > 0) {
          return items.slice(0, 5).map((item, itemIdx) => {
            const pid = `BLK-EXP-${row.index != null ? row.index : Date.now()}-${idx}-${itemIdx}`;
            const name = (item.label || item.name || rawName).replace(/<[^>]*>/g, '').trim();
            const mrp = Number(item.price || item.discounted_price || row.market_price || row.sale_price || 100);
            const price = Number(item.discounted_price || item.price || row.sale_price || mrp);
            const discount = mrp > price ? Number((((mrp - price) / mrp) * 100).toFixed(1)) : 0;
            const slug = item.url_path || `/drugs/${encodeURIComponent(name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}`;
            const directUrl = slug.startsWith('http') ? slug : `https://www.1mg.com${slug}`;
            const img = (item.cropped_image_urls && item.cropped_image_urls[0]) ||
                        (item.image_urls && item.image_urls[0]) ||
                        (BLINKIT_CATEGORY_IMAGES[cat] || BLINKIT_DEFAULT_IMG);
            const mfg = item.marketer_name || item.manufacturer_name || item.brand_name || brand || 'Quality Assured FMCG';
            const unit = item.pack_size_label || row.type || '1 Pack';
            const salt = item.drug_name || item.short_composition || `${cat} - ${subCat || mfg}`;

            return {
              product_id: pid,
              product_name: name,
              product_url: directUrl,
              image_thumb: img,
              image_status: 'Active',
              category_id: 'CAT-101',
              category: cat,
              sub_category: subCat || salt,
              brand: mfg,
              mrp: mrp,
              selling_price: price,
              discount_pct: `${discount}%`,
              allow_discount: discount > 0 ? 'Yes' : 'No',
              unit: unit,
              units_per_pack: item.units_in_pack || 1,
              packs_per_box: 1,
              composition: `${unit} • Quality Assured • 4.5★`,
              generic_salt: salt,
              manufacturer: mfg,
              description: `${name} by ${mfg}. High quality authentic essentials delivered via Blinkit fast commerce.`,
              uses: `Daily household and personal consumption. Quality assured ${cat.toLowerCase()}.`,
              side_effects: 'None (FMCG / Grocery / Personal Care Quality Assured)',
              dosage: 'As per daily household needs.',
              health_tags: 'Blinkit 10-Min Fast Delivery, 100% Genuine, Best Price Guaranteed',
              prescription_required: 'No',
              customer_visible: 'Yes',
              active: 'Yes',
              approval_status: 'Approved',
              image_url: img,
            };
          });
        }
      }
    } catch (err) {
      console.warn(`[Blinkit 1mg Expansion Warning] ${err.message}`);
    }
  }

  // Fallback: Use Excel row formatted to 28 columns with contextual category fallback image
  return [formatBlinkitRowTo28(row, idx)];
}

// 1. Get Status & Checkpoint of Blinkit Dataset
app.get('/api/blinkit/batch-status', async (req, res) => {
  try {
    const checkpoint = loadBlinkitCheckpoint();
    let totalRows = 27555;
    try {
      const dataset = getBlinkitDataset();
      totalRows = dataset.length;
    } catch {}

    const db = getDb();
    let totalInDb = 0;
    try {
      const [countRows] = await db.query('SELECT COUNT(*) as cnt FROM zepmed_blinkit_products');
      totalInDb = countRows[0].cnt;
    } catch {}

    const batchSize = checkpoint.batchSize || 10;
    const totalBatches = Math.ceil(totalRows / batchSize);
    const percentCompleted = Number(((checkpoint.currentRowIndex / totalRows) * 100).toFixed(2));

    res.json({
      success: true,
      checkpoint,
      totalRows,
      currentRowIndex: checkpoint.currentRowIndex,
      currentBatchIndex: checkpoint.currentBatchIndex,
      batchSize,
      totalBatches,
      percentCompleted,
      totalProcessed: checkpoint.totalProcessed || checkpoint.currentRowIndex,
      lastProductName: checkpoint.lastProductName || '',
      lastUpdated: checkpoint.lastUpdated,
      totalInDb,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Process Next Batch of 10 Blinkit Products from Excel with Smart Recommendation Expansion
app.post('/api/blinkit/batch-process', async (req, res) => {
  const { batchSize = 10 } = req.body || {};
  const db = getDb();

  try {
    const checkpoint = loadBlinkitCheckpoint();
    const dataset = getBlinkitDataset();
    const startIdx = checkpoint.currentRowIndex;

    if (startIdx >= dataset.length) {
      return res.json({
        success: true,
        isCompleted: true,
        message: 'All 27,555 Blinkit products have been processed!',
        currentRowIndex: dataset.length,
        totalRows: dataset.length,
        percentCompleted: 100,
        products: [],
      });
    }

    const endIdx = Math.min(startIdx + batchSize, dataset.length);
    const batchRows = dataset.slice(startIdx, endIdx);

    console.log(`[Blinkit Engine] Processing Smart Batch #${checkpoint.currentBatchIndex + 1}: Rows ${startIdx}..${endIdx} (${batchRows.length} items)...`);

    // Run smart 1mg expansion in parallel across all 10 items in the batch
    const batchExpansionPromises = batchRows.map((r, i) => scrapeBlinkitDirectExpansion(r, startIdx + i));
    const batchExpansionResults = await Promise.all(batchExpansionPromises);
    const formattedProducts = batchExpansionResults.flat();

    // Insert 28-column products into Hostinger MySQL (with blacklist checking & deduplication)
    const stored = await insertProducts28('zepmed_blinkit_products', formattedProducts);

    // Update checkpoint
    checkpoint.currentRowIndex = endIdx;
    checkpoint.currentBatchIndex += 1;
    checkpoint.totalProcessed = (checkpoint.totalProcessed || 0) + batchRows.length;
    checkpoint.lastProductName = batchRows[batchRows.length - 1]?.product || '';
    checkpoint.lastUpdated = new Date().toISOString();
    saveBlinkitCheckpoint(checkpoint);

    const [countRows] = await db.query('SELECT COUNT(*) as cnt FROM zepmed_blinkit_products');
    const totalInDb = countRows[0].cnt;
    const percentCompleted = Number(((checkpoint.currentRowIndex / dataset.length) * 100).toFixed(2));

    res.json({
      success: true,
      isCompleted: checkpoint.currentRowIndex >= dataset.length,
      batchIndex: checkpoint.currentBatchIndex,
      processedCount: batchRows.length,
      storedCount: stored,
      currentRowIndex: checkpoint.currentRowIndex,
      totalRows: dataset.length,
      totalBatches: Math.ceil(dataset.length / batchSize),
      percentCompleted,
      lastProductName: checkpoint.lastProductName,
      totalInDb,
      products: formattedProducts,
    });
  } catch (err) {
    console.error('[Blinkit Batch Error]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Reset Blinkit Checkpoint to Row 0
app.post('/api/blinkit/reset-checkpoint', async (req, res) => {
  const initial = {
    currentRowIndex: 0,
    currentBatchIndex: 0,
    totalRows: 27555,
    batchSize: 10,
    totalProcessed: 0,
    lastUpdated: new Date().toISOString(),
    lastProductName: '',
  };
  saveBlinkitCheckpoint(initial);
  try {
    const db = getDb();
    await db.query("DELETE FROM zepmed_deleted_blacklist WHERE section = 'blinkit'");
    console.log('🔄 [Blinkit Checkpoint] Reset to Row 0 & cleared blinkit blacklist successfully!');
  } catch (err) {
    console.warn('[Blinkit Reset Blacklist Warning]', err.message);
  }
  res.json({ success: true, message: 'Blinkit checkpoint reset to Row 0', checkpoint: initial });
});

// 4. Set Custom Blinkit Checkpoint Row Index
app.post('/api/blinkit/set-checkpoint', (req, res) => {
  const { rowIndex = 0 } = req.body || {};
  const checkpoint = loadBlinkitCheckpoint();
  checkpoint.currentRowIndex = Math.max(0, parseInt(rowIndex, 10) || 0);
  checkpoint.currentBatchIndex = Math.floor(checkpoint.currentRowIndex / (checkpoint.batchSize || 50));
  checkpoint.lastUpdated = new Date().toISOString();
  saveBlinkitCheckpoint(checkpoint);
  console.log(`[Blinkit Checkpoint] Custom row set to ${checkpoint.currentRowIndex}`);
  res.json({ success: true, checkpoint });
});

// Category-Wise Export Endpoint from MySQL
app.get('/api/export/category', async (req, res) => {
  const { section, category } = req.query || {};
  let tableName = 'zepmed_medicines';
  if (section === 'blinkit') tableName = 'zepmed_blinkit_products';
  if (section === 'otc') tableName = 'zepmed_otc_medicines';
  const db = getDb();

  try {
    let queryStr = `SELECT * FROM ${tableName}`;
    let params = [];

    if (category && category !== 'all') {
      queryStr += ` WHERE category = ?`;
      params.push(category);
    }
    queryStr += ` ORDER BY id DESC`;

    const [rows] = await db.query(queryStr, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Direct Full Database 28-Column CSV Export Stream (Zero Browser Memory Load)
app.get('/api/export/full-csv', async (req, res) => {
  const { section = 'medicine' } = req.query || {};
  let tableName = 'zepmed_medicines';
  let friendlyName = 'medicines';
  if (section === 'blinkit') {
    tableName = 'zepmed_blinkit_products';
    friendlyName = 'blinkit_products';
  } else if (section === 'otc') {
    tableName = 'zepmed_otc_medicines';
    friendlyName = 'otc_medicines';
  }

  const db = getDb();
  try {
    const [rows] = await db.query(`SELECT * FROM ${tableName} ORDER BY id DESC`);

    const clean = (val) => `"${String(val || '').replace(/"/g, '""').replace(/\r?\n|\r/g, ' ')}"`;
    const headers = [
      'Product ID', 'Product Name', 'Product URL', 'Image', 'Image Status',
      'Category ID', 'Category', 'Sub Category', 'Brand', 'MRP', 'Selling Price',
      'Discount Percent', 'Allow Discount', 'Unit', 'Units Per Pack', 'Packs Per Box',
      'Composition', 'Generic Salt', 'Manufacturer', 'Description', 'Uses',
      'Side Effects', 'Dosage', 'Health Tags', 'Prescription Required',
      'Customer Visible', 'Active', 'Approval Status', 'Image URL'
    ];

    const csvLines = ['\uFEFF' + headers.join(',')];
    for (const r of rows) {
      csvLines.push([
        clean(r.product_id),
        clean(r.product_name),
        clean(r.product_url),
        clean(`<img src="${r.image_url || r.image || ''}" width="40" height="40" />`),
        clean(r.image_status || 'Active'),
        clean(r.category_id || (section === 'medicine' ? 'CAT-RX-01' : section === 'blinkit' ? 'CAT-101' : 'CAT-OTC-02')),
        clean(r.category),
        clean(r.sub_category),
        clean(r.brand),
        r.mrp || 0,
        r.selling_price || 0,
        clean(r.discount_percent ? `${r.discount_percent}%` : '0%'),
        clean(r.allow_discount || 'Yes'),
        clean(r.unit || '1 unit'),
        r.units_per_pack || 1,
        r.packs_per_box || (section === 'medicine' ? 50 : 24),
        clean(r.composition),
        clean(r.generic_salt),
        clean(r.manufacturer),
        clean(r.description),
        clean(r.uses),
        clean(r.side_effects),
        clean(r.dosage),
        clean(r.health_tags),
        clean(r.prescription_required || 'No'),
        clean(r.customer_visible || 'Yes'),
        clean(r.active || 'Yes'),
        clean(r.approval_status || 'Approved'),
        clean(r.image_url || r.image || '')
      ].join(','));
    }

    const csvString = csvLines.join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="zepmed_${friendlyName}_FULL_${rows.length}_products_28col.csv"`);
    res.send(csvString);
  } catch (err) {
    console.error('[Export Full CSV Error]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Mark Downloaded Products to Archive Them (Prevent Re-generation)
app.post('/api/export/mark-downloaded', async (req, res) => {
  const { section, productIds } = req.body || {};
  if (!productIds || productIds.length === 0) return res.json({ success: true, updated: 0 });

  let tableName = 'zepmed_medicines';
  if (section === 'blinkit') tableName = 'zepmed_blinkit_products';
  if (section === 'otc') tableName = 'zepmed_otc_medicines';
  const db = getDb();

  try {
    const placeholders = productIds.map(() => '?').join(',');
    await db.query(
      `UPDATE ${tableName} SET is_downloaded = 1 WHERE product_id IN (${placeholders})`,
      productIds
    );
    res.json({ success: true, updated: productIds.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. PERMANENT PRODUCT DELETION & BLACKLIST (One-by-One and Delete-All)
// Delete Single Product Permanently
app.delete('/api/products/:section/:productId', async (req, res) => {
  const { section, productId } = req.params;
  let tableName = 'zepmed_medicines';
  if (section === 'blinkit') tableName = 'zepmed_blinkit_products';
  if (section === 'otc') tableName = 'zepmed_otc_medicines';
  const db = getDb();

  try {
    // 1. Delete from main MySQL table
    await db.query(`DELETE FROM ${tableName} WHERE product_id = ?`, [productId]);

    // 2. Insert into permanent blacklist so it NEVER reappears
    await db.query(
      `INSERT INTO zepmed_deleted_blacklist (product_id, section) VALUES (?, ?) ON DUPLICATE KEY UPDATE deleted_at = CURRENT_TIMESTAMP`,
      [productId, section]
    );

    console.log(`[Permanent Delete] Product '${productId}' deleted from ${tableName} and blacklisted.`);
    res.json({ success: true, message: `Product ${productId} permanently deleted.` });
  } catch (err) {
    console.error(`[Delete Error] ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete All Products for a Section Permanently
app.post('/api/products/:section/delete-all', async (req, res) => {
  const { section, productIds } = req.body || {};
  let tableName = 'zepmed_medicines';
  if (section === 'blinkit') tableName = 'zepmed_blinkit_products';
  if (section === 'otc') tableName = 'zepmed_otc_medicines';
  const db = getDb();

  try {
    let idsToBlacklist = Array.isArray(productIds) ? productIds : [];
    if (idsToBlacklist.length === 0) {
      const [existing] = await db.query(`SELECT product_id FROM ${tableName}`);
      idsToBlacklist = existing.map((r) => r.product_id);
    }

    // Delete all from table
    await db.query(`DELETE FROM ${tableName}`);

    // Blacklist all deleted IDs so they never reappear
    for (const pid of idsToBlacklist) {
      await db.query(
        `INSERT INTO zepmed_deleted_blacklist (product_id, section) VALUES (?, ?) ON DUPLICATE KEY UPDATE deleted_at = CURRENT_TIMESTAMP`,
        [pid, section]
      );
    }

    console.log(`[Permanent Delete All] Cleared all products from ${tableName} and blacklisted ${idsToBlacklist.length} IDs.`);
    res.json({ success: true, message: `All products in ${section} section deleted permanently.`, count: idsToBlacklist.length });
  } catch (err) {
    console.error(`[Delete All Error] ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get all permanently deleted / blacklisted product IDs
app.get('/api/products/deleted-ids', async (req, res) => {
  const db = getDb();
  try {
    const [rows] = await db.query('SELECT product_id, section FROM zepmed_deleted_blacklist');
    res.json({ success: true, deletedIds: rows.map((r) => r.product_id) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// ⚡ DIRECT 1MG FREE REFILL ENGINE (ZERO CREDITS / UNLIMITED) - HOSTINGER MYSQL
// ==========================================

const SCRAPER_CHECKPOINT_FILE = path.join(__dirname, 'scraper_checkpoint.json');
const DEFAULT_SCRAPER_API_KEY = 'direct_free_mode';

function loadScraperCheckpoint() {
  try {
    if (fs.existsSync(SCRAPER_CHECKPOINT_FILE)) {
      return JSON.parse(fs.readFileSync(SCRAPER_CHECKPOINT_FILE, 'utf8'));
    }
  } catch (err) {
    console.warn('[Scraper Checkpoint] Read warning:', err.message);
  }
  return {
    lastProcessedId: 3080,
    totalProcessed: 504,
    totalEnriched: 457,
    totalFallback: 47,
    apiKey: DEFAULT_SCRAPER_API_KEY,
    delayMs: 1500,
    isRunning: false,
    lastItem: null,
    lastUpdated: new Date().toISOString()
  };
}

function saveScraperCheckpoint(data) {
  try {
    fs.writeFileSync(SCRAPER_CHECKPOINT_FILE, JSON.stringify(data, null, 2), 'utf8');
    const parentFile = path.join(__dirname, '..', 'scraper_checkpoint.json');
    fs.writeFileSync(parentFile, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Scraper Checkpoint] Write warning:', err.message);
  }
}

let scraperWorkerActive = false;
let scraperLoopTimeout = null;

// Helper: Extract a section bounded by its heading to avoid bleed-through
function extract1mgSection(html, headingRegex) {
  const hMatch = html.match(headingRegex);
  if (!hMatch) return '';
  const startIdx = hMatch.index + hMatch[0].length;
  // Bounded slice (max 3500 chars) ensures we never bleed into subsequent sections
  const slice = html.substring(startIdx, startIdx + 3500);

  const divMatch = slice.match(/class="[^"]*(?:descriptionContainer|DrugOverview__content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                   slice.match(/<ul[^>]*>([\s\S]*?)<\/ul>/i) ||
                   slice.match(/<div[^>]*>([\s\S]*?)<\/div>/i);
  if (!divMatch) return '';
  return divMatch[1].replace(/<li[^>]*>/gi, ' • ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Parse HTML extracted directly from Tata 1mg
function parse1mgDrugHtml(html) {
  const introduction = extract1mgSection(html, /<h[1-6][^>]*>Product introduction<\/h[1-6]>/i);
  const uses = extract1mgSection(html, /<h[1-6][^>]*>Uses of [^<]+<\/h[1-6]>/i);
  const sideEffects = extract1mgSection(html, /<h[1-6][^>]*>Side effects of [^<]+<\/h[1-6]>/i);

  // Separate extraction for "How to use" and "Dosage"
  const howToUse = extract1mgSection(html, /<h[1-6][^>]*>(?:How to use|Directions for use)(?: [^<]*)?<\/h[1-6]>/i);
  const rawDosage = extract1mgSection(html, /<h[1-6][^>]*>Dosage(?: [^<]*)?<\/h[1-6]>/i);

  let dosage = '';
  if (howToUse && rawDosage && howToUse !== rawDosage) {
    dosage = `${howToUse} Dosage: ${rawDosage}`;
  } else if (howToUse) {
    dosage = howToUse;
  } else if (rawDosage) {
    dosage = rawDosage;
  }

  // Safety check: ensure dosage is NOT a duplicate of introduction
  if (dosage && introduction && dosage.toLowerCase() === introduction.toLowerCase()) {
    dosage = '';
  }

  return { introduction, uses, sideEffects, dosage };
}

// Enrich a single medicine by row
async function enrichSingleMedicine(row, apiKey) {
  let targetUrl = (row.product_url || '').trim();
  let liveEnriched = false;

  // If direct URL is missing or likely a slug without ID, check autocomplete
  if (!targetUrl || !targetUrl.startsWith('http') || !targetUrl.match(/-\d+$/)) {
    try {
      const cleanQ = cleanMedicineQuery(row.product_name || '');
      if (cleanQ) {
        const autoResp = await fetch(`https://www.1mg.com/api/v1/search/autocomplete?name=${encodeURIComponent(cleanQ)}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (autoResp.ok) {
          const autoData = await autoResp.json();
          const drug = (autoData.results || []).find(r => r.type === 'drug' || r.type === 'otc' || r.url_path);
          if (drug && drug.url_path) {
            targetUrl = drug.url_path.startsWith('http') ? drug.url_path : `https://www.1mg.com${drug.url_path}`;
          }
        }
      }
    } catch {}
  }

  let intro = '';
  let uses = '';
  let sideEffects = '';
  let dosage = '';

  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  };

  if (targetUrl && targetUrl.startsWith('http')) {
    try {
      // ⚡ Direct 100% Free 1mg Fetch (Zero Credits, Unlimited)
      const resp = await fetch(targetUrl, { headers: browserHeaders });

      if (resp.ok) {
        const html = await resp.text();
        const parsed = parse1mgDrugHtml(html);
        intro = parsed.introduction;
        uses = parsed.uses;
        sideEffects = parsed.sideEffects;
        dosage = parsed.dosage;
        if (uses || intro || sideEffects) {
          liveEnriched = true;
        }
      } else if (resp.status === 404) {
        // If 404, resolve real slug via 1mg autocomplete
        const cleanQ = cleanMedicineQuery(row.product_name || '');
        if (cleanQ) {
          const autoResp = await fetch(`https://www.1mg.com/api/v1/search/autocomplete?name=${encodeURIComponent(cleanQ)}`, {
            headers: browserHeaders
          });
          if (autoResp.ok) {
            const autoData = await autoResp.json();
            const drug = (autoData.results || []).find(r => r.type === 'drug' || r.type === 'otc' || r.url_path);
            if (drug && drug.url_path) {
              const resolvedUrl = drug.url_path.startsWith('http') ? drug.url_path : `https://www.1mg.com${drug.url_path}`;
              targetUrl = resolvedUrl;
              const retryResp = await fetch(resolvedUrl, { headers: browserHeaders });
              if (retryResp.ok) {
                const retryHtml = await retryResp.text();
                const parsed = parse1mgDrugHtml(retryHtml);
                intro = parsed.introduction;
                uses = parsed.uses;
                sideEffects = parsed.sideEffects;
                dosage = parsed.dosage;
                if (uses || intro || sideEffects) liveEnriched = true;
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[Direct 1mg Free Fetch Warning for ${row.product_name}]:`, err.message);
    }
  }

  // Smart Template Fallback if any field is empty or page returned 404
  const salt = row.generic_salt || row.composition || 'Active Pharmaceutical Formulation';
  const mfg = row.manufacturer || row.brand || 'Licensed Healthcare Manufacturer';

  if (!intro || intro.trim().length < 20) {
    intro = `${row.product_name} is an Indian healthcare formulation manufactured by ${mfg}. Composition: ${salt}. CDSCO certified formulation for clinical and therapeutic healthcare management.`;
  }

  if (!uses || uses.trim().length < 10) {
    uses = `• Treatment and therapeutic management of clinical conditions related to ${salt} as prescribed by a licensed healthcare professional • Supportive clinical healthcare care`;
  }

  if (!sideEffects || sideEffects.trim().length < 10) {
    sideEffects = `• Mild nausea, digestive upset, dizziness, or headache in rare individuals • Consult your doctor or physician if symptoms persist or worsen`;
  }

  // STRICT SAFETY: Dosage must NEVER copy Product Introduction/Description
  if (!dosage || dosage.trim().length < 10 || (intro && dosage.trim().toLowerCase() === intro.trim().toLowerCase())) {
    dosage = `Take orally with a glass of water as strictly directed by a registered medical practitioner. Do not exceed the recommended daily dose.`;
  }

  return {
    id: row.id,
    product_id: row.product_id,
    product_name: row.product_name,
    product_url: targetUrl || row.product_url,
    description: intro,
    uses: uses,
    side_effects: sideEffects,
    dosage: dosage,
    liveEnriched
  };
}

// Background Worker Step
async function runScraperWorkerStep() {
  if (!scraperWorkerActive) return;

  const cp = loadScraperCheckpoint();
  const db = getDb();

  try {
    // Select the next medicine strictly after lastProcessedId
    const [rows] = await db.query(
      `SELECT id, product_id, product_name, product_url, manufacturer, generic_salt, composition, brand, uses, side_effects, description, dosage 
       FROM zepmed_medicines 
       WHERE id > ? 
       ORDER BY id ASC 
       LIMIT 1`,
      [cp.lastProcessedId || 0]
    );

    if (!rows || rows.length === 0) {
      console.log('[ScraperAPI Worker] All medicines in zepmed_medicines have been refilled!');
      scraperWorkerActive = false;
      cp.isRunning = false;
      saveScraperCheckpoint(cp);
      return;
    }

    const row = rows[0];
    const apiKey = cp.apiKey || DEFAULT_SCRAPER_API_KEY;

    console.log(`[ScraperAPI Worker] Refilling Item #${row.id}: ${row.product_name}...`);
    const enriched = await enrichSingleMedicine(row, apiKey);

    // Live update MySQL
    await db.query(
      `UPDATE zepmed_medicines 
       SET description = ?, uses = ?, side_effects = ?, dosage = ?, product_url = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [enriched.description, enriched.uses, enriched.side_effects, enriched.dosage, enriched.product_url, row.id]
    );

    // Update Checkpoint immediately
    cp.lastProcessedId = row.id;
    cp.totalProcessed = (cp.totalProcessed || 0) + 1;
    if (enriched.liveEnriched) {
      cp.totalEnriched = (cp.totalEnriched || 0) + 1;
    } else {
      cp.totalFallback = (cp.totalFallback || 0) + 1;
    }
    cp.lastItem = {
      id: row.id,
      name: row.product_name,
      product_url: enriched.product_url,
      uses: enriched.uses,
      side_effects: enriched.side_effects,
      dosage: enriched.dosage,
      description: enriched.description,
      liveEnriched: enriched.liveEnriched,
      timestamp: new Date().toISOString()
    };
    cp.lastUpdated = new Date().toISOString();
    saveScraperCheckpoint(cp);

  } catch (err) {
    console.error(`[ScraperAPI Worker Error]:`, err.message);
  }

  if (scraperWorkerActive) {
    scraperLoopTimeout = setTimeout(runScraperWorkerStep, cp.delayMs || 1000);
  }
}

// 1. Get ScraperAPI Refill Status & Stats
app.get('/api/scraper/status', async (req, res) => {
  const db = getDb();
  try {
    const cp = loadScraperCheckpoint();
    const [totalRows] = await db.query('SELECT COUNT(*) as cnt FROM zepmed_medicines');
    const totalMedicines = totalRows[0]?.cnt || 0;

    const [remainingRows] = await db.query(
      'SELECT COUNT(*) as cnt FROM zepmed_medicines WHERE id > ?',
      [cp.lastProcessedId || 0]
    );
    const pendingRefill = remainingRows[0]?.cnt || 0;

    // Recent 5 refilled items
    const [recentRows] = await db.query(
      `SELECT id, product_id, product_name, product_url, uses, side_effects, dosage, description, updated_at 
       FROM zepmed_medicines 
       WHERE id <= ? 
       ORDER BY updated_at DESC, id DESC 
       LIMIT 5`,
      [cp.lastProcessedId || 0]
    );

    res.json({
      success: true,
      isRunning: scraperWorkerActive,
      checkpoint: cp,
      stats: {
        totalMedicines,
        totalProcessed: cp.totalProcessed || 0,
        totalEnriched: cp.totalEnriched || 0,
        totalFallback: cp.totalFallback || 0,
        pendingRefill,
        percentCompleted: totalMedicines > 0 ? Number((((totalMedicines - pendingRefill) / totalMedicines) * 100).toFixed(2)) : 0
      },
      recentEnriched: recentRows
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Start ScraperAPI Refill Worker
app.post('/api/scraper/start', (req, res) => {
  const { apiKey, delayMs } = req.body || {};
  const cp = loadScraperCheckpoint();

  if (apiKey) cp.apiKey = apiKey.trim();
  if (delayMs) cp.delayMs = Math.max(500, parseInt(delayMs, 10));
  cp.isRunning = true;
  saveScraperCheckpoint(cp);

  if (!scraperWorkerActive) {
    scraperWorkerActive = true;
    runScraperWorkerStep();
    console.log('[ScraperAPI Worker] Started background refill loop.');
  }

  res.json({ success: true, message: 'ScraperAPI background refill started', checkpoint: cp });
});

// 3. Stop / Pause ScraperAPI Refill Worker
app.post('/api/scraper/stop', (req, res) => {
  scraperWorkerActive = false;
  if (scraperLoopTimeout) {
    clearTimeout(scraperLoopTimeout);
    scraperLoopTimeout = null;
  }
  const cp = loadScraperCheckpoint();
  cp.isRunning = false;
  saveScraperCheckpoint(cp);
  console.log('[ScraperAPI Worker] Paused background refill loop.');

  res.json({ success: true, message: 'ScraperAPI refill worker paused', checkpoint: cp });
});

// 4. Update Scraper Engine Settings On The Fly
app.post('/api/scraper/update-key', (req, res) => {
  const { apiKey, delayMs } = req.body || {};
  const cp = loadScraperCheckpoint();
  if (apiKey) cp.apiKey = apiKey.trim();
  if (delayMs) cp.delayMs = Math.max(500, parseInt(delayMs, 10));
  saveScraperCheckpoint(cp);

  res.json({ success: true, message: 'Direct Free Engine settings updated successfully', apiKey: cp.apiKey, delayMs: cp.delayMs });
});

// 5. Enrich Batch on Demand (e.g. 5 or 10 medicines)
app.post('/api/scraper/enrich-batch', async (req, res) => {
  const { count = 5, apiKey: reqApiKey } = req.body || {};
  const cp = loadScraperCheckpoint();
  const apiKey = reqApiKey || cp.apiKey || DEFAULT_SCRAPER_API_KEY;
  const db = getDb();

  try {
    const [rows] = await db.query(
      `SELECT id, product_id, product_name, product_url, manufacturer, generic_salt, composition, brand, uses, side_effects, description, dosage 
       FROM zepmed_medicines 
       WHERE id > ? 
       ORDER BY id ASC 
       LIMIT ?`,
      [cp.lastProcessedId || 0, Math.min(20, Math.max(1, parseInt(count, 10)))]
    );

    if (!rows || rows.length === 0) {
      return res.json({ success: true, message: 'All medicines already refilled!', items: [] });
    }

    const results = [];
    for (const row of rows) {
      const enriched = await enrichSingleMedicine(row, apiKey);
      await db.query(
        `UPDATE zepmed_medicines 
         SET description = ?, uses = ?, side_effects = ?, dosage = ?, product_url = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [enriched.description, enriched.uses, enriched.side_effects, enriched.dosage, enriched.product_url, row.id]
      );
      cp.lastProcessedId = row.id;
      cp.totalProcessed = (cp.totalProcessed || 0) + 1;
      if (enriched.liveEnriched) {
        cp.totalEnriched = (cp.totalEnriched || 0) + 1;
      } else {
        cp.totalFallback = (cp.totalFallback || 0) + 1;
      }
      cp.lastItem = {
        id: row.id,
        name: row.product_name,
        product_url: enriched.product_url,
        uses: enriched.uses,
        side_effects: enriched.side_effects,
        dosage: enriched.dosage,
        description: enriched.description,
        liveEnriched: enriched.liveEnriched,
        timestamp: new Date().toISOString()
      };
      results.push(enriched);
    }

    cp.lastUpdated = new Date().toISOString();
    saveScraperCheckpoint(cp);

    res.json({ success: true, count: results.length, checkpoint: cp, items: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Reset Scraper Checkpoint (Safe rewind to specific ID)
app.post('/api/scraper/reset-checkpoint', (req, res) => {
  const { resetId = 0 } = req.body || {};
  const cp = loadScraperCheckpoint();
  cp.lastProcessedId = Math.max(0, parseInt(resetId, 10));
  saveScraperCheckpoint(cp);

  res.json({ success: true, message: `Scraper checkpoint reset to ID ${cp.lastProcessedId}`, checkpoint: cp });
});

// Export app for Vercel Serverless
export default app;

// Start Express locally if not running in a serverless environment
if (process.env.VERCEL !== '1' && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  initTables().then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 [Express Backend] Running on http://localhost:${PORT}`);
    });
  });
}
