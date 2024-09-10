const { ChatAnthropic } = require('@langchain/anthropic');
const {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  SystemMessagePromptTemplate
} = require('@langchain/core/prompts');
const { StructuredOutputParser } = require("langchain/output_parsers");
const { z } = require('zod');

async function fixSQLQueryErrors(sql, errorMessage, tableJsonString) {
    console.log("Starting fixSQLQueryErrors...");
    console.log("SQL Query:", sql);
    console.log("Error Message:", errorMessage);
    console.log("Table JSON Schema:", tableJsonString);

    const model = new ChatAnthropic({
        apiKey: process.env.CLAUDE_KEY,
        model: 'claude-3-5-sonnet-20240620',
        temperature: 0.5
    });

    console.log("Model initialized with API Key:", process.env.CLAUDE_KEY ? "API Key present" : "API Key missing");

    const outputParser = StructuredOutputParser.fromZodSchema(
        z.object({
            sql: z.string().describe('A string value representing the SQL query after fixing the errors'),
        })
    );

    console.log("Output parser initialized with schema.");

    const prompt = ChatPromptTemplate.fromMessages([
        SystemMessagePromptTemplate.fromTemplate(
            "You are an intelligent agent specializing in fixing SQL errors which are run for ClickHouse DB. Adhere to the following steps:\n\n" +
            "1. Understand the table schema JSON which describes the table on which the SQL query is run\n" +
            "2. Understand the SQL query provided\n" +
            "3. Identify the error in the SQL query and fix it\n" +
            "{format_instructions}"
        ),
        HumanMessagePromptTemplate.fromTemplate("SQL Query: {sql}\n\nError Message: {errorMessage}\n\nTable Schema: {tableJsonString}")
    ]);

    console.log("Prompt template initialized.");

    const chain = prompt.pipe(model).pipe(outputParser);

    try {
        console.log("Invoking chain with the following inputs:");
        console.log({
            format_instructions: outputParser.getFormatInstructions(),
            sql: sql,
            errorMessage: errorMessage,
            tableJsonString: tableJsonString
        });

        const result = await chain.invoke({
            format_instructions: outputParser.getFormatInstructions(),
            sql: sql,
            errorMessage: errorMessage,
            tableJsonString: tableJsonString
        });

        console.log("Chain invocation result:", result);
        return result.sql;
    } catch (error) {
        console.error("Error in fixing SQL query:", error.message, error.stack);
        throw error;
    }
}

module.exports = { fixSQLQueryErrors };