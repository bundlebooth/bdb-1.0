const fs = require('fs').promises;
const axios = require('axios');

async function getEventTypeId(slug, apiKey) {
  try {
    console.log(`Fetching event types for slug: ${slug}`);
    const response = await axios.get('https://api.cal.com/v2/event-types', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    // Log the full response for debugging
    console.log('API Response:', JSON.stringify(response.data, null, 2));

    const eventTypes = response.data.event_types || [];
    if (!eventTypes.length) {
      console.warn('No event types returned by API');
      return null;
    }

    // Log all slugs for comparison
    const availableSlugs = eventTypes.map((et) => et.slug);
    console.log('Available slugs in Cal.com:', availableSlugs);

    const eventType = eventTypes.find((et) => et.slug === slug);
    if (!eventType) {
      console.warn(`No event type found for slug: ${slug}`);
      return null;
    }

    console.log(`Found event type ID: ${eventType.id} for slug: ${slug}`);
    return eventType.id;
  } catch (error) {
    console.error(`Error fetching event type ID for slug ${slug}: ${error.message}`);
    if (error.response) {
      console.error('Error Response:', JSON.stringify(error.response.data, null, 2));
    }
    return null;
  }
}

async function deleteEventTypes() {
  try {
    // Read packages-delete.json
    console.log('Reading packages-delete.json');
    const data = await fs.readFile('packages-delete.json', 'utf8');
    console.log('File contents:', data);
    const packages = JSON.parse(data);

    // Cal.com API base URL
    const apiBaseUrl = 'https://api.cal.com/v2';
    const apiKey = process.env.CALCOM_API_KEY;

    if (!apiKey) {
      throw new Error('CALCOM_API_KEY environment variable is not set');
    }

    // Ensure packages is an array
    const packageArray = Array.isArray(packages) ? packages : [packages];

    // Iterate through packages and delete each event type
    for (const pkg of packageArray) {
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
        if (error.response) {
          console.error('Error Response:', JSON.stringify(error.response.data, null, 2));
        }
      }
    }
  } catch (error) {
    console.error('Error processing packages-delete.json:', error.message);
    process.exit(1); // Exit with error to fail the workflow
  }
}

deleteEventTypes();
