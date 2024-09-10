const { ChatAnthropic } = require('@langchain/anthropic');
const {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  SystemMessagePromptTemplate
} = require('@langchain/core/prompts');
const { StructuredOutputParser } = require("langchain/output_parsers");
const { z } = require('zod');

async function validateInputStep(message, tableJsonString) {
  console.log("Starting validateInputStep...");
  console.log("Message received:", message);
  console.log("Table JSON Schema received:", tableJsonString);

  const model = new ChatAnthropic({
    apiKey: process.env.CLAUDE_KEY,
    model: 'claude-3-haiku-20240307',
    temperature: 0.5
  });

  console.log("Model initialized with API Key:", process.env.CLAUDE_KEY ? "API Key present" : "API Key missing");

  const outputParser = StructuredOutputParser.fromZodSchema(
    z.object({
      isValidInput: z.boolean().describe('A boolean value indicating if the input is valid or not'),
      message: z.string().describe('A message that will be sent to the user if the validation is false, explaining what is wrong in the search query')
    })
  );

  console.log("Output parser initialized with schema.");

  const prompt = ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate(
      "You are an intelligent agent whose expertise is in answering queries related to logs data. Here is the schema of the logs table for your context: {tableColumnsDescriptionSchema}. You will be given a user query, and you will have to validate whether it is relevant to the logs or just something random. Reply back with a validation or a message stating why the query is invalid.\n{format_instructions}"
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
    return result;
  } catch (error) {
    console.error("Error during chain invocation:", error);
    throw error; // Re-throw the error after logging it
  }
}

module.exports = { validateInputStep };