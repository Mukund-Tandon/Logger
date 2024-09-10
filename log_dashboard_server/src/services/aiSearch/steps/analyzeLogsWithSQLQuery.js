const { ChatAnthropic } = require('@langchain/anthropic');
const {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  SystemMessagePromptTemplate
} = require('@langchain/core/prompts');
const { StructuredOutputParser } = require("langchain/output_parsers");
const { z } = require('zod');

async function analyzeLogsWithSQLQuery(message, logs) {
    console.log("Starting analyzeLogsWithSQLQuery...");
    console.log("User Query:", message);
    console.log("Logs Data Sample:", JSON.stringify(logs.slice(0, 2))); // Log a sample of the logs

    const model = new ChatAnthropic({
        apiKey: process.env.CLAUDE_KEY,
        model: 'claude-3-5-sonnet-20240620',
        temperature: 0.5
    });

    console.log("Model initialized with API Key:", process.env.CLAUDE_KEY ? "API Key present" : "API Key missing");

    const outputParser = StructuredOutputParser.fromZodSchema(
        z.object({
            analysis: z.string().describe('Summary of findings and insights based on the logs analysis'),
        })
    );

    console.log("Output parser initialized with schema.");

    const prompt = ChatPromptTemplate.fromMessages([
        SystemMessagePromptTemplate.fromTemplate(
            "You are an intelligent agent specializing in analyzing log data. Adhere to the following steps:\n\n" +
            "1. Analyze the provided logs data.\n" +
            "2. Provide a summary of findings and insights based on the logs analysis and the user query.\n" +
            "{format_instructions}"
        ),
        HumanMessagePromptTemplate.fromTemplate("User Query: {message}\n\nLogs Data: {logs}")
    ]);

    console.log("Prompt template initialized.");

    const chain = prompt.pipe(model).pipe(outputParser);

    try {
        console.log("Invoking chain...");
        const result = await chain.invoke({
            format_instructions: outputParser.getFormatInstructions(),
            message: message,
            logs: JSON.stringify(logs)
        });

        console.log("Chain invocation result:", result);
        return result.analysis;
    } catch (error) {
        console.error("Error in analyzing logs:", error.message, error.stack);
        throw error;
    }
}

module.exports = { analyzeLogsWithSQLQuery };