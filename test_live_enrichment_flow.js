import mysql from 'mysql2/promise';
import fs from 'fs';

const API_KEY = '98e1aac9815e67bcf19985e7d1f8b9d5';

(async () => {
  console.log('🧪 [LIVE TEST] Testing ScraperAPI Medicine Refill Flow...');
  
  const conn = await mysql.createConnection({
    host: '82.25.121.184',
    user: 'u869403905_zepemd_DB',
    password: 'zepemd_DB@7030',
    database: 'u869403905_zepemd_DB',
    port: 3306
  });

  // Pick one medicine that has templated uses
  const [rows] = await conn.query(
    `SELECT id, product_id, product_name, product_url, generic_salt, manufacturer, uses, side_effects, description, dosage 
     FROM zepmed_medicines 
     WHERE (uses LIKE "%therapeutic medical management%" OR uses LIKE "%as prescribed by licensed%")
       AND product_name != "" 
     ORDER BY id ASC 
     LIMIT 1`
  );

  if (rows.length === 0) {
    console.log('No templated medicines found!');
    await conn.end();
    return;
  }

  const med = rows[0];
  console.log(`\nSelected Medicine #${med.id}: ${med.product_name}`);
  console.log(`Original URL: ${med.product_url}`);
  console.log(`Original Uses: ${med.uses}`);

  // Fetch from 1mg via ScraperAPI
  let targetUrl = med.product_url;
  if (!targetUrl || !targetUrl.startsWith('http') || !targetUrl.match(/-\d+$/)) {
    // try autocomplete to get slug with id
    const cleanQ = med.product_name.replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
    const autoResp = await fetch(`https://www.1mg.com/api/v1/search/autocomplete?name=${encodeURIComponent(cleanQ)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (autoResp.ok) {
      const autoData = await autoResp.json();
      const drug = (autoData.results || []).find(r => r.type === 'drug' || r.type === 'otc' || r.url_path);
      if (drug?.url_path) {
        targetUrl = drug.url_path.startsWith('http') ? drug.url_path : `https://www.1mg.com${drug.url_path}`;
        console.log(`Found direct URL with SKU: ${targetUrl}`);
      }
    }
  }

  const scraperUrl = `https://api.scraperapi.com/?api_key=${API_KEY}&url=${encodeURIComponent(targetUrl)}`;
  console.log(`Calling ScraperAPI...`);
  const t0 = Date.now();
  const resp = await fetch(scraperUrl);
  console.log(`ScraperAPI HTTP ${resp.status} in ${((Date.now() - t0) / 1000).toFixed(2)}s`);

  let intro = '';
  let uses = '';
  let sideEffects = '';
  let dosage = '';
  let liveEnriched = false;

  if (resp.ok) {
    const html = await resp.text();
    console.log(`Received HTML: ${html.length} bytes`);

    const introMatch = html.match(/Product introduction<\/h[1-6]>[\s\S]*?<div[^>]*class="[^"]*DrugOverview__content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                       html.match(/Product introduction<\/div>[\s\S]*?<div[^>]*class="[^"]*DrugOverview__content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                       html.match(/Product introduction[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
    if (introMatch) intro = introMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    const usesMatch = html.match(/Uses of [^<]*<\/h[1-6]>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/i) ||
                      html.match(/Uses of [^<]*<\/div>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/i) ||
                      html.match(/Uses of [^<]*[\s\S]*?<div[^>]*class="[^"]*DrugOverview__content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (usesMatch) uses = usesMatch[1].replace(/<li[^>]*>/gi, ' • ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    const seMatch = html.match(/Side effects of [^<]*<\/h[1-6]>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/i) ||
                    html.match(/Side effects of [^<]*<\/div>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/i) ||
                    html.match(/Side effects of [^<]*[\s\S]*?<div[^>]*class="[^"]*DrugOverview__content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (seMatch) sideEffects = seMatch[1].replace(/<li[^>]*>/gi, ' • ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    const dosageMatch = html.match(/How to use [^<]*<\/h[1-6]>[\s\S]*?<div[^>]*class="[^"]*DrugOverview__content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                        html.match(/How to use [^<]*[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
    if (dosageMatch) dosage = dosageMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    if (uses || intro || sideEffects) liveEnriched = true;
  }

  // Fallbacks if not found
  const salt = med.generic_salt || med.composition || 'Active Pharmaceutical Formulation';
  const mfg = med.manufacturer || 'Licensed Healthcare Manufacturer';
  if (!intro) intro = `${med.product_name} manufactured by ${mfg}. Composition: ${salt}. CDSCO certified Indian formulation.`;
  if (!uses) uses = `• Treatment and therapeutic management of conditions related to ${salt} as prescribed by doctor`;
  if (!sideEffects) sideEffects = `• Mild nausea or dizziness in rare cases. Consult doctor if symptoms persist`;
  if (!dosage) dosage = `Take orally as prescribed by registered medical practitioner.`;

  console.log('\n--- NEW EXTRACTED DATA ---');
  console.log(`Live Enriched: ${liveEnriched}`);
  console.log(`Uses: ${uses}`);
  console.log(`Side Effects: ${sideEffects}`);
  console.log(`Dosage: ${dosage.slice(0, 100)}...`);

  // Update MySQL
  await conn.query(
    `UPDATE zepmed_medicines 
     SET description = ?, uses = ?, side_effects = ?, dosage = ?, product_url = ?, updated_at = CURRENT_TIMESTAMP 
     WHERE id = ?`,
    [intro, uses, sideEffects, dosage, targetUrl, med.id]
  );
  console.log(`\n✅ MySQL Database Row #${med.id} UPDATED successfully!`);

  // Verify in MySQL
  const [verify] = await conn.query('SELECT id, product_name, product_url, uses, side_effects, dosage, updated_at FROM zepmed_medicines WHERE id = ?', [med.id]);
  console.log('Verified from MySQL:', JSON.stringify(verify[0], null, 2));

  // Update Checkpoint file
  const cpPath = './new/scraper_checkpoint.json';
  const cp = JSON.parse(fs.readFileSync(cpPath, 'utf8'));
  cp.lastProcessedId = med.id;
  cp.totalProcessed = (cp.totalProcessed || 0) + 1;
  if (liveEnriched) cp.totalEnriched = (cp.totalEnriched || 0) + 1;
  else cp.totalFallback = (cp.totalFallback || 0) + 1;
  cp.lastItem = {
    id: med.id,
    name: med.product_name,
    product_url: targetUrl,
    uses,
    side_effects: sideEffects,
    dosage,
    description: intro,
    liveEnriched,
    timestamp: new Date().toISOString()
  };
  cp.lastUpdated = new Date().toISOString();
  fs.writeFileSync(cpPath, JSON.stringify(cp, null, 2), 'utf8');
  console.log(`✅ Checkpoint updated to ID #${med.id}!`);

  await conn.end();
})();
