(async () => {
  try {
    const res = await fetch('http://127.0.0.1:5000/api/scraper/enrich-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 2, apiKey: '98e1aac9815e67bcf19985e7d1f8b9d5' })
    });
    const d = await res.json();
    console.log('Enrich-batch endpoint success:', d.success);
    console.log('Processed Count:', d.count);
    console.log('Checkpoint lastProcessedId:', d.checkpoint?.lastProcessedId);
    (d.items || []).forEach((item, i) => {
      console.log(`\n[${i+1}] #${item.id}: ${item.product_name}`);
      console.log('   Uses:', (item.uses || '').slice(0, 100));
      console.log('   Side Effects:', (item.side_effects || '').slice(0, 100));
      console.log('   Live Enriched:', item.liveEnriched);
    });
  } catch (err) {
    console.error('API Batch Test Error:', err.message);
  }
})();
