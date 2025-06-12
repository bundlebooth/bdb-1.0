const fs = require('fs');
const https = require('https');

const CALCOM_API_KEY = process.env.CALCOM_API_KEY;

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getEventTypeId(slug) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.cal.com',
      path: '/v2/event-types',
      method: 'GET',
      headers: { Authorization: 'Bearer ' + CALCOM_API_KEY }
    };
    https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data).event_types || [];
          const match = parsed.find(e => e.slug === slug);
          resolve(match ? match.id : null);
        } catch (err) {
          console.error('Error parsing response:', err);
          resolve(null);
        }
      });
    }).on('error', (err) => {
      console.error('Error fetching event types:', err);
      resolve(null);
    }).end();
  });
}

async function sendRequestWithRetry(options, payload, slug) {
  return new Promise((resolve) => {
    const req = https.request(options, async (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', async () => {
        if (res.statusCode >= 400) {
          if (res.statusCode === 429 || body.includes('ThrottlerException')) {
            console.warn(`⚠️ Throttled on ${slug}, retrying after 3 seconds...`);
            await delay(3000);
            await sendRequestWithRetry(options, payload, slug);
          } else {
            console.error(`❌ Error [${res.statusCode}] for ${slug}: ${body}`);
          }
        } else {
          console.log(`✅ Success for ${slug}: ${body}`);
        }
        resolve();
      });
    });

    req.on('error', err => {
      console.error(`Request failed for [${slug}]:`, err.message);
      resolve();
    });

    req.write(JSON.stringify(payload));
    req.end();
  });
}

async function syncPackages() {
  const packages = JSON.parse(fs.readFileSync('./packages.json', 'utf8'));
  const seenSlugs = new Set();

  for (const pkg of packages) {
    const slug = (pkg.name || 'placeholder').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (seenSlugs.has(slug)) {
      console.warn(`Duplicate slug skipped: ${slug}`);
      continue;
    }
    seenSlugs.add(slug);

    const payload = {
      title: pkg.name || 'Placeholder Title',
      slug,
      length: pkg.maxDuration ? pkg.maxDuration * 60 : 180,
      description: pkg.description || 'No description provided',
      locations: [{ type: 'inPerson', address: 'Toronto, ON' }],
      availability: {
        days: [1, 2, 3, 4, 5],
        startTime: '09:00',
        endTime: '17:00'
      },
      price: pkg.price ? pkg.price * 100 : 0,
      currency: 'cad',
      tags: [
        ...(pkg.eventType || []),
        pkg.packageType,
        pkg.Sale === 'Y' ? 'On Sale' : '',
        pkg.New === 'Y' ? 'New' : ''
      ].filter(Boolean)
    };

    const eventTypeId = await getEventTypeId(slug);
    const method = eventTypeId ? 'PUT' : 'POST';
    const path = eventTypeId ? `/v2/event-types/${eventTypeId}` : '/v2/event-types';

    const options = {
      hostname: 'api.cal.com',
      path,
      method,
      headers: {
        Authorization: 'Bearer ' + CALCOM_API_KEY,
        'Content-Type': 'application/json'
      }
    };

    await sendRequestWithRetry(options, payload, slug);
    await delay(1500);
  }
}

syncPackages().catch(console.error);
