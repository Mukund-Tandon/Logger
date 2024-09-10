const { validateInputStep } = require('./steps/validateInput');
const { generateSQLQueryStep } = require('./steps/genrateSQLQuery');
const { validateIfQueryIsOnlyReadOnly } = require('./steps/validateSQLQuery');
const { executeSQLQueryStep } = require('./steps/executeSQLQuery');
const { fixSQLQueryErrors } = require('./steps/fixSQLQueryErrors');
const { getTableConfigurationJson } = require('../tableConfiguration');
const { analyzeLogsWithSQLQuery } = require('./steps/analyzeLogsWithSQLQuery');

async function executeAISearchChain(message) {
    console.log("Starting AI search chain execution...");
    
    // Get the table configuration JSON
    const tableJsonString = await getTableConfigurationJson();
    console.log("Loaded table configuration JSON.");

    let logs = [];
    const MAX_ATTEMPTS = 5;
    let attempts = 0;

    // Step 1: Validate the input
    console.log("Validating input...");
    const stepOneOutput = await validateInputStep(message, tableJsonString);
    if (!stepOneOutput.isValidInput) {
        console.error("Input validation failed:", stepOneOutput.message);
        return {
            type: "error",
            message: stepOneOutput.message
        };
    }
    console.log("Input validation passed.");

    // Step 2: Generate a SQL query
    console.log("Generating SQL query...");
    let sqlQuery = await generateSQLQueryStep(message, tableJsonString);
    console.log("SQL query generated:", sqlQuery);

    // Step 3: Validate if the SQL query is read-only
    console.log("Validating if SQL query is read-only...");
    if (validateIfQueryIsOnlyReadOnly(sqlQuery)) {
        console.log("SQL query is read-only, proceeding to execution...");

        // Step 4: Execute the SQL query
        while (attempts < MAX_ATTEMPTS) {
            try {
                console.log(`Executing SQL query (Attempt ${attempts + 1})...`);
                logs = await executeSQLQueryStep(sqlQuery);
                console.log("SQL query executed successfully.");
                break;
            } catch (error) {
                attempts++;
                console.error(`Attempt ${attempts}: Query execution failed. Error:`, error);
                
                // Step 5: Attempt to fix the SQL query
                console.log("Trying to fix the SQL query...");
                sqlQuery = await fixSQLQueryErrors(sqlQuery, error, tableJsonString);
                console.log("Fixed SQL query:", sqlQuery);

                if (attempts === MAX_ATTEMPTS) {
                    console.error("Max attempts reached. Could not fix the query.");
                    return {
                        type: "error",
                        message: "Failed to execute query after multiple attempts",
                    };
                }
            }
        }

        // Step 6: Analyze logs if fewer than 150 results are returned
        if (logs.length < 150) {
            console.log(`Only ${logs.length} logs retrieved. Analyzing logs...`);
            const analysis = await analyzeLogsWithSQLQuery(message, logs);
            console.log("Log analysis complete.");
            console.log("Analysis:", analysis);
            return {
                type: "success",
                logs: logs,
                message: analysis,
            };
        } else {
            console.log(`Retrieved ${logs.length} logs.`);
            return {
                type: "success",
                logs: logs,
                message: "Here are your logs",
            };
        }
    } else {
        console.error("The generated SQL query is not read-only.");
        return {
            type: "error",
            message: "The generated SQL query is not read-only",
        };
    }
}

module.exports = { executeAISearchChain };
