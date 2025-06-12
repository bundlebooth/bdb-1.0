
const fs = require('fs');
const https = require('https');

const CALCOM_API_KEY = process.env.CALCOM_API_KEY;

// Transform weekday strings to numeric values (Mon=1)
const dayMap = {
  'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4,
  'Friday': 5, 'Saturday': 6, 'Sunday': 7
};

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

async function syncPackages() {
  const packages = JSON.parse(fs.readFileSync('./packages.json', 'utf8'));

  for (const pkg of packages) {
    const slug = (pkg.name || 'placeholder').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

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

    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`Response for [${slug}] - ${res.statusCode}: ${body}`);
      });
    });

    req.on('error', err => {
      console.error(`Request failed for [${slug}]:`, err.message);
    });

    req.write(JSON.stringify(payload));
    req.end();
  }
}

syncPackages().catch(console.error);
