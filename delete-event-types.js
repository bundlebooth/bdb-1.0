const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const API_BASE_URL = 'https://api.cal.com/v1';
const JSON_FILE_PATH = 'packages-delete.json';
const LOG_FILE_PATH = 'delete-event-types.log';

// Helper function to log messages to console and file
async function logMessage(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - ${message}\n`;
    console.log(logEntry.trim());
    try {
        await fs.appendFile(LOG_FILE_PATH, logEntry);
    } catch (error) {
        console.error(`${timestamp} - Failed to write to log file: ${error.message}`);
    }
}

// Helper function to read JSON file
async function readJsonFile(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        await logMessage(`Reading ${filePath}`);
        return JSON.parse(data);
    } catch (error) {
        await logMessage(`Error reading ${filePath}: ${error.message}`);
        throw error;
    }
}

// Helper function to fetch all event types and match by slug
async function fetchEventTypes(apiKey, slug) {
    try {
        await logMessage(`Fetching all event types to find slug: ${slug}`);
        let allEventTypes = [];
        let page = 1;
        const limit = 100; // Adjust based on API documentation

        // Handle pagination
        while (true) {
            const response = await axios.get(`${API_BASE_URL}/event-types`, {
                headers: { Authorization: `Bearer ${apiKey}` },
                params: { limit, page }
            });
            await logMessage(`API Response status: ${response.status}, Page: ${page}`);
            const eventTypeGroups = response.data.eventTypeGroups || [];
            const eventTypes = eventTypeGroups.flatMap(group => group.eventTypes || []);
            allEventTypes = allEventTypes.concat(eventTypes);

            // Check for pagination (adjust based on API response structure)
            if (!response.data.pagination || !response.data.pagination.nextPage) {
                break;
            }
            page++;
        }

        // Log all event types for debugging
        await logMessage(`Found ${allEventTypes.length} event types`);
        allEventTypes.forEach(event => {
            logMessage(`Event: ID ${event.id}, Slug ${event.slug}, UserID ${event.userId}, Profile ${event.profile?.slug || 'none'}`);
        });

        // Find matching event type
        const targetEvent = allEventTypes.find(event => event.slug === slug && event.userId === 1576969); // Filter by userId from log
        if (targetEvent) {
            await logMessage(`Matched event type: ID ${targetEvent.id}, Slug ${targetEvent.slug}`);
        } else {
            await logMessage(`No event type found for slug: ${slug}`);
        }
        return targetEvent;
    } catch (error) {
        await logMessage(`Error fetching event types for slug ${slug}: ${error.message}`);
        if (error.response) {
            await logMessage(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
        }
        throw error;
    }
}

// Helper function to delete an event type
async function deleteEventType(apiKey, eventId, slug) {
    try {
        await logMessage(`Deleting event type: ID ${eventId}, Slug ${slug}`);
        const response = await axios.delete(`${API_BASE_URL}/event-types/${eventId}`, {
            headers: { Authorization: `Bearer ${apiKey}` }
        });
        await logMessage(`Successfully deleted event type: ${slug} (ID: ${eventId})`);
        return response.data;
    } catch (error) {
        await logMessage(`Error deleting event type ${slug} (ID: ${eventId}): ${error.message}`);
        if (error.response) {
            await logMessage(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
        }
        throw error;
    }
}

// Main function to process deletions
async function main() {
    const apiKey = process.env.CALCOM_API_KEY;
    if (!apiKey) {
        await logMessage('Error: CALCOM_API_KEY environment variable is not set');
        process.exit(1);
    }

    try {
        // Read the JSON file
        const eventTypesToDelete = await readJsonFile(JSON_FILE_PATH);
        await logMessage(`File contents: ${JSON.stringify(eventTypesToDelete, null, 2)}`);

        // Process each event type
        for (const eventType of eventTypesToDelete) {
            const slug = eventType.slug;
            if (!slug) {
                await logMessage(`Skipping event type with missing slug: ${JSON.stringify(eventType)}`);
                continue;
            }

            // Fetch the event type from the API
            const targetEvent = await fetchEventTypes(apiKey, slug);
            if (!targetEvent) {
                await logMessage(`No event type found for slug: ${slug}`);
                continue;
            }

            // Delete the event type
            await deleteEventType(apiKey, targetEvent.id, slug);
        }

        await logMessage('Deletion process completed successfully');
    } catch (error) {
        await logMessage(`Main process failed: ${error.message}`);
        process.exit(1);
    }
}

// Run the script
main().catch(async (error) => {
    await logMessage(`Unhandled error: ${error.message}`);
    process.exit(1);
});
