async function fetchServices() {
  const response = await fetch('https://raw.githubusercontent.com/bundlebooth/bdb-1.0/refs/heads/main/packages.json');
  if (!response.ok) throw new Error(`Failed to fetch JSON from GitHub: ${response.status} ${response.statusText}`);
  return response.json();
}

async function syncServicesToCalcom() {
  const calcomApiBaseUrl = process.env.CALCOM_API_URL;
  const calcomApiKey = process.env.CALCOM_API_KEY;

  if (!calcomApiBaseUrl || !calcomApiKey) {
    throw new Error('Missing CALCOM_API_URL or CALCOM_API_KEY environment variables');
  }

  // Append /event-types to the base URL for fetching event types
  const calcomApiUrl = `${calcomApiBaseUrl}/event-types`.replace(/\/+$/, ''); // Remove trailing slashes

  try {
    const services = await fetchServices();

    // Validate services data
    if (!Array.isArray(services)) {
      throw new Error('Fetched services data is not an array');
    }

    // Fetch existing event types
    console.log(`Fetching event types from: ${calcomApiUrl}`);
    const response = await fetch(calcomApiUrl, {
      headers: { 'Authorization': `Bearer ${calcomApiKey}` }
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No additional error details');
      throw new Error(`Failed to fetch event types: ${response.status} ${response.statusText}\nDetails: ${errorText}`);
    }
    const existingEventTypes = await response.json();

    for (const service of services) {
      if (!service.name || !service.maxDuration || !service.price) {
        console.warn(`Skipping invalid service: ${JSON.stringify(service)}`);
        continue;
      }

      const payload = {
        title: service.name,
        description: `${service.description || ''}${service.note ? `\n\nNote: ${service.note}` : ''}`,
        length: service.maxDuration * 60, // Convert hours to minutes
        price: service.price * 100, // Convert dollars to cents
        currency: 'usd', // Update to 'cad' if needed
        slug: service.name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-'),
        requiresConfirmation: false,
        locations: [{ type: 'integrations:google:calendar' }]
      };

      // Check if event type exists
      const existingEvent = existingEventTypes.data?.find(e => e.slug === payload.slug);
      const method = existingEvent ? 'PATCH' : 'POST';
      const url = existingEvent ? `${calcomApiUrl}/${existingEvent.id}` : calcomApiUrl;

      console.log(`Sending ${method} request to: ${url}`);
      const eventResponse = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${calcomApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!eventResponse.ok) {
        const errorText = await eventResponse.text().catch(() => 'No additional error details');
        throw new Error(`Failed to ${method} event type ${service.name}: ${eventResponse.status} ${eventResponse.statusText}\nDetails: ${errorText}`);
      }

      const result = await eventResponse.json();
      console.log(`${method === 'POST' ? 'Created' : 'Updated'} event type: ${service.name}`, result);
    }

    // Delete event types not in JSON
    const serviceSlugs = services.map(s => s.name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-'));
    for (const eventType of existingEventTypes.data || []) {
      if (!serviceSlugs.includes(eventType.slug)) {
        const deleteUrl = `${calcomApiUrl}/${eventType.id}`;
        console.log(`Sending DELETE request to: ${deleteUrl}`);
        const deleteResponse = await fetch(deleteUrl, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${calcomApiKey}` }
        });
        if (!deleteResponse.ok) {
          const errorText = await deleteResponse.text().catch(() => 'No additional error details');
          throw new Error(`Failed to delete event type ${eventType.title}: ${deleteResponse.status} ${deleteResponse.statusText}\nDetails: ${errorText}`);
        }
        console.log(`Deleted event type: ${eventType.title}`);
      }
    }
  } catch (error) {
    console.error('Error syncing services:', error.message);
    process.exit(1); // Exit with error to fail the GitHub Action
  }
}

syncServicesToCalcom();
