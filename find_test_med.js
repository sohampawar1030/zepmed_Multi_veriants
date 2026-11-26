import mysql from 'mysql2/promise';

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: '82.25.121.184',
      user: 'u869403905_zepemd_DB',
      password: 'zepemd_DB@7030',
      database: 'u869403905_zepemd_DB',
      port: 3306
    });

    const [rows] = await conn.query('SELECT id, product_id, product_name, product_url, uses, side_effects, description, dosage FROM zepmed_medicines WHERE uses LIKE "%therapeutic medical management%" OR uses LIKE "%as prescribed by licensed%" LIMIT 3');
    console.log('Medicines to test with ScraperAPI:', JSON.stringify(rows, null, 2));

    await conn.end();
  } catch (err) {
    console.error('Error:', err);
  }
})();
