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

    const [total] = await conn.query('SELECT COUNT(*) as count FROM zepmed_medicines');
    console.log('Total medicines in DB:', total[0].count);

    const [withUrl] = await conn.query('SELECT COUNT(*) as count FROM zepmed_medicines WHERE product_url IS NOT NULL AND product_url != ""');
    console.log('Medicines with product_url:', withUrl[0].count);

    const [sample] = await conn.query('SELECT id, product_id, product_name, product_url, uses, side_effects, description, dosage FROM zepmed_medicines WHERE product_url IS NOT NULL AND product_url != "" ORDER BY id ASC LIMIT 5');
    console.log('Sample rows with product_url:');
    sample.forEach(s => console.log(JSON.stringify(s, null, 2)));

    const [templated] = await conn.query('SELECT COUNT(*) as count FROM zepmed_medicines WHERE uses LIKE "%therapeutic medical management%" OR uses LIKE "%as prescribed by licensed%" OR uses IS NULL OR uses = ""');
    console.log('Medicines needing refill:', templated[0].count);

    await conn.end();
  } catch (err) {
    console.error('Error:', err);
  }
})();
