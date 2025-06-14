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
        await logMessage(`API Key present: ${!!apiKey}, Length: ${apiKey ? apiKey.length : 0}`);
        await logMessage(`Fetching all event types to find slug: ${slug}`);

        let allEventTypes = [];
        let page = 1;
        const limit = 100;

        // Try fetching all event types
        while (true) {
            const response = await axios.get(`${API_BASE_URL}/event-types`, {
                headers: { 
                    Authorization: `Bearer ${apiKey}`
                },
                params: { 
                    limit, 
                    page,
                    includeHidden: true, // Try fetching hidden events
                    userId: 1576969 // Filter by userId from log
                }
            });
            await logMessage(`API Response status: ${response.status}, Page: ${page}`);
            // Log full response for debugging
            await logMessage(`Full API response: ${JSON.stringify(response.data, null, 2)}`);

            const eventTypeGroups = response.data.eventTypeGroups || [];
            const eventTypes = eventTypeGroups.flatMap(group => group.eventTypes || []);
            allEventTypes = allEventTypes.concat(eventTypes);

            // Check pagination
            const pagination = response.data.pagination || {};
            await logMessage(`Pagination: ${JSON.stringify(pagination)}`);
            if (!pagination.nextPage && (!pagination.total || allEventTypes.length >= pagination.total)) {
                break;
            }
            page++;
        }

        await logMessage(`Found ${allEventTypes.length} event types`);
        allEventTypes.forEach(event => {
            logMessage(`Event: ID ${event.id}, Slug ${event.slug}, UserID ${event.userId || 'none'}, Profile ${event.profile?.slug || 'none'}, Hidden ${event.hidden || false}`);
        });

        // Try matching without userId filter
        let targetEvent = allEventTypes.find(event => event.slug === slug);
        if (targetEvent) {
            await logMessage(`Matched event type: ID ${targetEvent.id}, Slug ${targetEvent.slug}, UserID ${targetEvent.userId || 'none'}`);
        } else {
            await logMessage(`No event type found for slug: ${slug} in all event types`);
        }

        // Fallback: Try slug-filtered query
        if (!targetEvent) {
            await logMessage(`Falling back to slug-filtered query for: ${slug}`);
            const response = await axios.get(`${API_BASE_URL}/event-types`, {
                headers: { Authorization: `Bearer ${apiKey}` },
                params: { slug, includeHidden: true }
            });
            await logMessage(`Slug query response: ${JSON.stringify(response.data, null, 2)}`);
            const eventTypeGroups = response.data.eventTypeGroups || [];
            const eventTypes = eventTypeGroups.flatMap(group => group.eventTypes || []);
            targetEvent = eventTypes.find(event => event.slug === slug);
            if (targetEvent) {
                await logMessage(`Matched event type in slug query: ID ${targetEvent.id}, Slug ${targetEvent.slug}, UserID ${targetEvent.userId || 'none'}`);
            } else {
                await logMessage(`No event type found for slug: ${slug} in slug-filtered query`);
            }
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
        await logMessage(`API Key present for deletion: ${!!apiKey}, Length: ${apiKey ? apiKey.length : 0}`);
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
        await logMessage('Error: CALCOM_API_KEY environment variable is not set or empty');
        process.exit(1);
    }

    await logMessage(`CALCOM_API_KEY length: ${apiKey.length}`);

    try {
        const eventTypesToDelete = await readJsonFile(JSON_FILE_PATH);
        await logMessage(`File contents: ${JSON.stringify(eventTypesToDelete, null, 2)}`);

        for (const eventType of eventTypesToDelete) {
            const slug = eventType.slug;
            if (!slug) {
                await logMessage(`Skipping event type with missing slug: ${JSON.stringify(eventType)}`);
                continue;
            }

            const targetEvent = await fetchEventTypes(apiKey, slug);
            if (!targetEvent) {
                await logMessage(`No event type found for slug: ${slug}`);
                continue;
            }

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
