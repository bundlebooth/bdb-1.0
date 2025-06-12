const fetch = require('node-fetch');

async function fetchServices() {
  const response = await fetch('https://raw.githubusercontent.com/bundlebooth/bdb-1.0/refs/heads/main/packages.json');
  if (!response.ok) throw new Error('Failed to fetch JSON from GitHub');
  return response.json();
}

async function syncServicesToCalcom() {
  const calcomApiUrl = process.env.CALCOM_API_URL;
  const calcomApiKey = process.env.CALCOM_API_KEY;

  try {
    const services = await fetchServices();

    // Fetch existing event types to check for updates
    const existingEventTypes = await fetch(calcomApiUrl, {
      headers: { 'Authorization': `Bearer ${calcomApiKey}` }
    }).then(res => res.json());

    for (const service of services) {
      const payload = {
        title: service.name,
        description: `${service.description}${service.note ? `\n\nNote: ${service.note}` : ''}`,
        length: service.maxDuration * 60, // Convert hours to minutes
        price: service.price * 100, // Convert dollars to cents
        currency: 'usd', // Update to 'cad' if needed
        slug: service.name.toLowerCase().replace(/\s+/g, '-'),
        requiresConfirmation: false,
        locations: [{ type: 'integrations:google:calendar' }]
      };

      // Check if event type exists
      const existingEvent = existingEventTypes.data.find(e => e.slug === payload.slug);
      const method = existingEvent ? 'PATCH' : 'POST';
      const url = existingEvent ? `${calcomApiUrl}/${existingEvent.id}` : calcomApiUrl;

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${calcomApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      console.log(`${method === 'POST' ? 'Created' : 'Updated'} event type: ${service.name}`, result);
    }

    // Delete event types not in JSON
    const serviceSlugs = services.map(s => s.name.toLowerCase().replace(/\s+/g, '-'));
    for (const eventType of existingEventTypes.data) {
      if (!serviceSlugs.includes(eventType.slug)) {
        await fetch(`${calcomApiUrl}/${eventType.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${calcomApiKey}` }
        });
        console.log(`Deleted event type: ${eventType.title}`);
      }
    }
  } catch (error) {
    console.error('Error syncing services:', error);
    process.exit(1); // Exit with error to fail the GitHub Action
  }
}

syncServicesToCalcom();
