const fs = require('fs').promises;
const path = require('path');

async function getTableConfigurationJson() {
    const tableConfigurationPath = path.join(__dirname, '../../tableSchema.json');

    try {
        // Read the file
        const fileContent = await fs.readFile(tableConfigurationPath, 'utf8');
        
        // Parse the JSON content
        const tableConfiguration = JSON.parse(fileContent);
        
        // Log the successful read (optional)
        console.log('Table configuration loaded successfully');
        
        // Return the parsed configuration
        return JSON.stringify(tableConfiguration);
    } catch (error) {
        // Log the error (optional)
        console.error('Error reading or parsing table configuration:', error);
        
        // Rethrow the error to be handled by the caller
        throw error;
    }
}

module.exports = { getTableConfigurationJson };