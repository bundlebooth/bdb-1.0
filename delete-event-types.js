const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const API_BASE_URL = 'https://api.cal.com/v1';
const JSON_FILE_PATH = 'packages-delete.json';
const LOG_FILE_PATH = 'delete-event-types.log';
const REQUEST_DELAY_MS = 1000; // 1 second delay between requests
const MAX_RETRIES = 3; // Max retry attempts for 429 errors
const BASE_RETRY_DELAY_MS = 5000; // Base retry delay for 429 errors

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

// Helper function to add delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to fetch event type by slug
async function fetchEventTypes(apiKey, slug, retryCount = 0) {
    try {
        await logMessage(`API Key (first 4 chars): ${apiKey.slice(0, 4)}..., Length: ${apiKey.length}`);
        if (!apiKey) throw new Error('API key is empty or undefined');

        await logMessage(`Fetching event type for slug: ${slug}`);
        const config = {
            headers: {
                Authorization: `Bearer ${apiKey}`
            },
            params: {
                slug
            }
        };
        await logMessage(`Request config: ${JSON.stringify(config, (key, value) => key === 'Authorization' ? '***' : value, 2)}`);

        const response = await axios.get(`${API_BASE_URL}/event-types`, config);
        await logMessage(`API Response status: ${response.status}`);
        await logMessage(`Full API response: ${JSON.stringify(response.data, null, 2)}`);

        const eventTypeGroups = response.data.eventTypeGroups || [];
        const eventTypes = eventTypeGroups.flatMap(group => group.eventTypes || []);
        await logMessage(`Found ${eventTypes.length} event types`);

        const targetEvent = eventTypes.find(event => event.slug === slug && event.userId === 1576969);
        if (targetEvent) {
            await logMessage(`Matched event type: ID ${targetEvent.id}, Slug ${targetEvent.slug}, UserID ${targetEvent.userId}, Profile ${targetEvent.profile?.slug || 'none'}`);
        } else {
            await logMessage(`No event type found for slug: ${slug} with userId 1576969`);
        }
        return targetEvent;
    } catch (error) {
        if (error.response?.status === 429 && retryCount < MAX_RETRIES) {
            const retryAfter = error.response.headers['retry-after'] ? parseInt(error.response.headers['retry-after']) * 1000 : BASE_RETRY_DELAY_MS;
            await logMessage(`Rate limit exceeded, retrying after ${retryAfter}ms (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
            await delay(retryAfter);
            return fetchEventTypes(apiKey, slug, retryCount + 1);
        } else if (error.response?.status === 403) {
            await logMessage(`Authorization error for slug ${slug}: ${error.message}`);
            await logMessage(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
            return null; // Skip this slug
        }
        await logMessage(`Error fetching event types for slug ${slug}: ${error.message}`);
        if (error.response) {
            await logMessage(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
        }
        return null; // Skip on other errors
    }
}

// Helper function to delete an event type
async function deleteEventType(apiKey, eventId, slug, retryCount = 0) {
    try {
        await logMessage(`Deleting event type: ID ${eventId}, Slug ${slug}`);
        const response = await axios.delete(`${API_BASE_URL}/event-types/${eventId}`, {
            headers: {
                Authorization: `Bearer ${apiKey}`
            }
        });
        await logMessage(`Successfully deleted event type: ${slug} (ID: ${eventId})`);
        return true;
    } catch (error) {
        if (error.response?.status === 429 && retryCount < MAX_RETRIES) {
            const retryAfter = error.response.headers['retry-after'] ? parseInt(error.response.headers['retry-after']) * 1000 : BASE_RETRY_DELAY_MS;
            await logMessage(`Rate limit exceeded, retrying after ${retryAfter}ms (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
            await delay(retryAfter);
            return deleteEventType(apiKey, eventId, slug, retryCount + 1);
        } else if (error.response?.status === 403) {
            await logMessage(`Authorization error deleting event type ${slug} (ID: ${eventId}): ${error.message}`);
            await logMessage(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
            return false; // Skip this deletion
        }
        await logMessage(`Error deleting event type ${slug} (ID: ${eventId}): ${error.message}`);
        if (error.response) {
            await logMessage(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
        }
        return false; // Skip on other errors
    }
}

// Main function to process deletions
async function main() {
    const apiKey = (process.env.CALCOM_API_KEY || '').trim();
    if (!apiKey) {
        await logMessage('Error: CALCOM_API_KEY environment variable is not set or empty');
        process.exit(1);
    }

    await logMessage(`CALCOM_API_KEY length: ${apiKey.length}`);

    try {
        const eventTypesToDelete = await readJsonFile(JSON_FILE_PATH);
        await logMessage(`File contents: ${JSON.stringify(eventTypesToDelete, null, 2)}`);

        let successCount = 0;
        let failureCount = 0;

        for (const eventType of eventTypesToDelete) {
            const slug = eventType.slug;
            if (!slug) {
                await logMessage(`Skipping event type with missing slug: ${JSON.stringify(eventType)}`);
                failureCount++;
                continue;
            }

            const targetEvent = await fetchEventTypes(apiKey, slug);
            if (!targetEvent) {
                await logMessage(`No event type found or access denied for slug: ${slug}`);
                failureCount++;
                continue;
            }

            const deleted = await deleteEventType(apiKey, targetEvent.id, slug);
            if (deleted) {
                successCount++;
            } else {
                failureCount++;
            }
            await delay(REQUEST_DELAY_MS); // Delay between deletions
        }

        await logMessage(`Deletion process completed: ${successCount} successful, ${failureCount} failed`);
        process.exit(failureCount > 0 ? 1 : 0); // Exit with error code if any failures
    } catch (error) {
        await logMessage(`Main process encountered an error: ${error.message}`);
        process.exit(1);
    }
}

// Run the script
main().catch(async (error) => {
    await logMessage(`Unhandled error: ${error.message}`);
    process.exit(1);
});
