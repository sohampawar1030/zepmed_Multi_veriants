const API_KEY = '98e1aac9815e67bcf19985e7d1f8b9d5';
const targetUrl = 'https://www.1mg.com/drugs/zifi-200-tablet-51344';

(async () => {
  console.log(`[ScraperAPI Test] Testing real target: ${targetUrl}...`);
  const scraperUrl = `https://api.scraperapi.com/?api_key=${API_KEY}&url=${encodeURIComponent(targetUrl)}`;
  
  const startTime = Date.now();
  try {
    const res = await fetch(scraperUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml'
      }
    });

    console.log(`[ScraperAPI Status] HTTP ${res.status} in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
    if (!res.ok) {
      const txt = await res.text();
      console.error('Response error:', txt.slice(0, 300));
      return;
    }

    const html = await res.text();
    console.log(`[HTML Received] Length: ${html.length} bytes`);

    // Extract Product introduction
    let introduction = '';
    const introMatch = html.match(/Product introduction<\/h[1-6]>[\s\S]*?<div[^>]*class="[^"]*DrugOverview__content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                       html.match(/Product introduction<\/div>[\s\S]*?<div[^>]*class="[^"]*DrugOverview__content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                       html.match(/Product introduction[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
    if (introMatch) {
      introduction = introMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Extract Uses
    let uses = '';
    const usesMatch = html.match(/Uses of [^<]*<\/h[1-6]>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/i) ||
                      html.match(/Uses of [^<]*<\/div>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/i) ||
                      html.match(/Uses of [^<]*[\s\S]*?<div[^>]*class="[^"]*DrugOverview__content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (usesMatch) {
      uses = usesMatch[1].replace(/<li[^>]*>/gi, ' • ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Extract Side effects
    let sideEffects = '';
    const seMatch = html.match(/Side effects of [^<]*<\/h[1-6]>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/i) ||
                    html.match(/Side effects of [^<]*<\/div>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/i) ||
                    html.match(/Side effects of [^<]*[\s\S]*?<div[^>]*class="[^"]*DrugOverview__content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (seMatch) {
      sideEffects = seMatch[1].replace(/<li[^>]*>/gi, ' • ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Extract Dosage / How to use
    let dosage = '';
    const dosageMatch = html.match(/How to use [^<]*<\/h[1-6]>[\s\S]*?<div[^>]*class="[^"]*DrugOverview__content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                        html.match(/How to use [^<]*[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
    if (dosageMatch) {
      dosage = dosageMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    console.log('\n--- EXTRACTED LIVE DATA ---');
    console.log('Intro:', introduction ? introduction.slice(0, 160) + '...' : '(Not matched)');
    console.log('Uses:', uses || '(Not matched)');
    console.log('Side Effects:', sideEffects || '(Not matched)');
    console.log('Dosage:', dosage || '(Not matched)');

  } catch (err) {
    console.error('Fetch error:', err.message);
  }
})();
