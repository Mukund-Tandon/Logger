const { ChatAnthropic } = require('@langchain/anthropic');
const {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  SystemMessagePromptTemplate
} = require('@langchain/core/prompts');
const { StructuredOutputParser } = require("langchain/output_parsers");
const { z } = require('zod');

async function generateSQLQueryStep(message, tableJsonString) {
  const model = new ChatAnthropic({
    apiKey: process.env.CLAUDE_KEY,
    model: 'claude-3-5-sonnet-20240620',
    temperature: 0.5
  });

  const prompt = new ChatPromptTemplate({
    messages: [
      SystemMessagePromptTemplate.fromTemplate(
        "You are an intelligent agent whose expertise is in genrating Clickhouse DB SQL queries related to logs data stored in the table with Schema{tableColumnsDescriptionSchema}. From the user query you will have to genrate a sql query which can help in retriveing relavant data related the search query. make sure the sql query adhere to the table schema provided, and gives conside output related to the search query \n{format_instructions}"
      ),
      HumanMessagePromptTemplate.fromTemplate("{message}")
    ]
  });

  const outputParser = StructuredOutputParser.fromZodSchema(
    z.object({
      sql: z.string().describe('A string value representing the SQL query to be later executed on the Clickhouse DB'),
    })
  );

  const chain = prompt.pipe(model).pipe(outputParser);

  return await chain.invoke({
    tableColumnsDescriptionSchema: tableJsonString,
    format_instructions: outputParser.getFormatInstructions(),
    message: message
  });
}