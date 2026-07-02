import { createAsyncThunk } from "@reduxjs/toolkit";
import { replaceLogs } from '../../logs/logSlice';
import {
    startAssistant,
    appendAssistantDelta,
    setAssistantMessage,
    setActivity,
    finishAssistant,
    chatError,
} from '../aiChatSlice';

const API_BASE = 'http://localhost:3000';

// Human-friendly progress labels for each agent tool.
const TOOL_LABELS = {
    run_sql: 'Running query…',
    get_schema: 'Reading schema…',
    find_patterns: 'Finding patterns…',
    get_changes: 'Correlating deploys…',
};

/**
 * Parse one raw SSE frame ("event: <type>\ndata: <json>") into its data object.
 * The `data:` payload already carries `type`, so we return the parsed JSON (or
 * null if the frame has no usable data line). Pure — exported for testing.
 */
export function parseSSEFrame(frame) {
    const dataLine = frame.split('\n').find((line) => line.startsWith('data:'));
    if (!dataLine) return null;
    const json = dataLine.slice('data:'.length).trim();
    if (!json) return null;
    try {
        return JSON.parse(json);
    } catch {
        return null;
    }
}

/**
 * Build the v2 `history` (neutral, text-only) from prior chat messages, so
 * follow-up questions keep conversational context. Tool internals are omitted
 * on purpose — the model just needs prior Q&A as context.
 */
function buildHistory(priorMessages) {
    return priorMessages
        .filter((m) => m.message && (m.userType === 'user' || m.userType === 'ai'))
        .map((m) => ({
            role: m.userType === 'user' ? 'user' : 'assistant',
            content: [{ type: 'text', text: m.message }],
        }));
}

/**
 * Stream an answer from the v2 agent over SSE, dispatching incremental updates:
 * live text deltas, tool-step activity, final logs, and errors/rejections.
 *
 * SSE runs over `fetch` + ReadableStream (not `EventSource`, which is GET-only)
 * because the v2 endpoint is a POST with a JSON body.
 */
export const streamAiResponse = createAsyncThunk(
    'aiChat/streamAiResponse',
    async ({ message }, thunkAPI) => {
        const { dispatch, getState } = thunkAPI;

        // History = everything before the just-added user message (the last item).
        const allMessages = getState().aichat.messages;
        const history = buildHistory(allMessages.slice(0, -1));

        dispatch(startAssistant());

        try {
            const response = await fetch(`${API_BASE}/api/ai_search/v2`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'text/event-stream',
                },
                body: JSON.stringify({ message, history, stream: true }),
            });

            if (!response.ok || !response.body) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            // Read the SSE stream, splitting on the blank-line frame delimiter.
            for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                let sep;
                while ((sep = buffer.indexOf('\n\n')) !== -1) {
                    const frame = buffer.slice(0, sep);
                    buffer = buffer.slice(sep + 2);
                    const event = parseSSEFrame(frame);
                    if (!event) continue;

                    switch (event.type) {
                        case 'text':
                            dispatch(appendAssistantDelta(event.delta || ''));
                            break;
                        case 'tool_call':
                            dispatch(setActivity(TOOL_LABELS[event.name] || `Running ${event.name}…`));
                            break;
                        case 'tool_result':
                            dispatch(setActivity('Analyzing results…'));
                            break;
                        case 'answer':
                            if (Array.isArray(event.logs) && event.logs.length > 0) {
                                dispatch(replaceLogs(event.logs));
                            }
                            // Authoritative final text (also covers non-streaming providers).
                            if (event.message) dispatch(setAssistantMessage(event.message));
                            dispatch(finishAssistant());
                            break;
                        case 'rejected':
                            dispatch(setAssistantMessage(event.message || 'I can only help with questions about your logs.'));
                            dispatch(finishAssistant());
                            break;
                        case 'error':
                            dispatch(chatError(event.message || 'Something went wrong.'));
                            return thunkAPI.rejectWithValue('stream error');
                        case 'done':
                        default:
                            break;
                    }
                }
            }

            // Stream ended cleanly; make sure we're not stuck in the streaming state.
            dispatch(finishAssistant());
            return { ok: true };
        } catch (error) {
            console.error('Error in streamAiResponse:', error);
            dispatch(chatError('Could not reach the AI search service.'));
            return thunkAPI.rejectWithValue(error.message);
        }
    }
);
