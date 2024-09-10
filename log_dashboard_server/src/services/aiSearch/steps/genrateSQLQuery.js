const { ChatAnthropic } = require('@langchain/anthropic');
const {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  SystemMessagePromptTemplate
} = require('@langchain/core/prompts');
const { StructuredOutputParser } = require("langchain/output_parsers");
const { z } = require('zod');

async function generateSQLQueryStep(message, tableJsonString) {
  console.log("Starting generateSQLQueryStep...");
  console.log("Message received:", message);
  console.log("Table JSON Schema received:", tableJsonString);

  const model = new ChatAnthropic({
    apiKey: process.env.CLAUDE_KEY,
    model: 'claude-3-5-sonnet-20240620',
    temperature: 0.5
  });

  console.log("Model initialized with API Key:", process.env.CLAUDE_KEY ? "API Key present" : "API Key missing");

  const outputParser = StructuredOutputParser.fromZodSchema(
    z.object({
      sql: z.string().describe('A string value representing the SQL query to be later executed on the Clickhouse DB'),
    })
  );

  console.log("Output parser initialized with schema.");

  const prompt = ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate(
      "You are an intelligent agent whose expertise is in generating Clickhouse DB SQL queries related to logs data stored in the table with Schema {tableColumnsDescriptionSchema}. From the user query, you will have to generate a SQL query which can help in retrieving relevant data related to the search query. Make sure the SQL query adheres to the table schema provided, and gives concise output related to the search query.\n{format_instructions}"
    ),
    HumanMessagePromptTemplate.fromTemplate("{message}")
  ]);

  console.log("Prompt template initialized.");

  const chain = prompt.pipe(model).pipe(outputParser);

  try {
    console.log("Invoking chain with the following inputs:");
    console.log({
      tableColumnsDescriptionSchema: tableJsonString,
      format_instructions: outputParser.getFormatInstructions(),
      message: message
    });

    const result = await chain.invoke({
      tableColumnsDescriptionSchema: tableJsonString,
      format_instructions: outputParser.getFormatInstructions(),
      message: message
    });

    console.log("Chain invocation result:", result);
    return result.sql;
  } catch (error) {
    console.error("Error during chain invocation:", error.message, error.stack);
    throw error; // Re-throw the error after logging it
  }
}

module.exports = { generateSQLQueryStep };