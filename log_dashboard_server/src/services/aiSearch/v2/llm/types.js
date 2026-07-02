/**
 * Neutral, provider-agnostic LLM shapes. App code (agent/tools/eval) speaks
 * ONLY these; each vendor SDK lives behind an adapter in `providers/`.
 * See CLAUDE.md → "LLM provider abstraction". JSDoc-only; no runtime code.
 *
 * @typedef {{ type: "text", text: string }} TextBlock
 * @typedef {{ type: "tool_call", id: string, name: string, input: Object }} ToolCallBlock
 * @typedef {{ type: "tool_result", toolCallId: string, content: string, isError?: boolean }} ToolResultBlock
 * @typedef {TextBlock | ToolCallBlock | ToolResultBlock} ContentBlock
 * @typedef {{ role: "user"|"assistant"|"tool", content: ContentBlock[] }} LLMMessage
 * @typedef {{ name: string, description: string, parameters: Object }} ToolDef
 * @typedef {{ system?: string, messages: LLMMessage[], tools?: ToolDef[], maxTokens?: number, temperature?: number }} LLMRequest
 * @typedef {{ text: string, toolCalls: {id:string,name:string,input:Object}[], stopReason: "end"|"tool_use"|"max_tokens"|"other", usage: {inputTokens:number,outputTokens:number} }} LLMResponse
 */

module.exports = {};
