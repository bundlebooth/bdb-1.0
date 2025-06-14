const fs = require('fs').promises;
const axios = require('axios');

async function getEventTypeId(slug, apiKey) {
  try {
    const response = await axios.get('https://api.cal.com/v2/event-types', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    const eventTypes = response.data.event_types || [];
    const eventType = eventTypes.find((et) => et.slug === slug);
    return eventType ? eventType.id : null;
  } catch (error) {
    console.error(`Error fetching event type ID for slug ${slug}: ${error.message}`);
    return null;
  }
}

async function deleteEventTypes() {
  try {
    // Read packages-delete.json
    const data = await fs.readFile('packages-delete.json', 'utf8');
    const packages = JSON.parse(data);

    // Cal.com API base URL
    const apiBaseUrl = 'https://api.cal.com/v2';
    const apiKey = process.env.CALCOM_API_KEY;

    if (!apiKey) {
      throw new Error('CALCOM_API_KEY environment variable is not set');
    }

    // Iterate through packages and delete each event type
    for (const pkg of Array.isArray(packages) ? packages : [packages]) {
      const { slug } = pkg;

      if (!slug) {
        console.warn(`Skipping package - no slug provided: ${JSON.stringify(pkg)}`);
        continue;
      }

      // Fetch event type ID
      const eventTypeId = await getEventTypeId(slug, apiKey);
      if (!eventTypeId) {
        console.warn(`No event type found for slug: ${slug}`);
        continue;
      }

      try {
        await axios.delete(`${apiBaseUrl}/event-types/${eventTypeId}`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        });
        console.log(`Successfully deleted event type: ${slug} (ID: ${eventTypeId})`);
      } catch (error) {
        console.error(`Failed to delete event type: ${slug} (ID: ${eventTypeId}) - ${error.message}`);
      }
    }
  } catch (error) {
    console.error('Error processing packages-delete.json:', error.message);
    process.exit(1); // Exit with error to fail the workflow
  }
}

deleteEventTypes();
