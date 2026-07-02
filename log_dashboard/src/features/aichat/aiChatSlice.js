import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  messages: [],   // [{ message, userType: 'user' | 'ai', streaming? }]
  status: 'idle', // 'idle' | 'loading' | 'error'
  activity: null, // current tool-step label while the agent works, e.g. "Running query…"
};

// The assistant message currently being streamed is always the last one.
function lastAssistant(state) {
  const last = state.messages[state.messages.length - 1];
  return last && last.userType === 'ai' ? last : null;
}

const aiChatSlice = createSlice({
  name: 'aiChat',
  initialState,
  reducers: {
    addMessage: (state, action) => {
      state.messages.push(action.payload);
    },
    setStatus: (state, action) => {
      state.status = action.payload;
    },
    // Begin a new streamed assistant turn.
    startAssistant: (state) => {
      state.status = 'loading';
      state.activity = null;
      state.messages.push({ message: '', userType: 'ai', streaming: true });
    },
    // Append a streamed text delta to the in-flight assistant message.
    appendAssistantDelta: (state, action) => {
      const ai = lastAssistant(state);
      if (ai) {
        ai.message += action.payload;
        state.activity = null; // text is flowing; drop the tool-progress label
      }
    },
    // Replace the assistant message text (authoritative final answer / rejection).
    setAssistantMessage: (state, action) => {
      const ai = lastAssistant(state);
      if (ai) ai.message = action.payload;
    },
    // Current tool-step progress label (or null).
    setActivity: (state, action) => {
      state.activity = action.payload;
    },
    // The assistant turn is complete.
    finishAssistant: (state) => {
      const ai = lastAssistant(state);
      if (ai) delete ai.streaming;
      state.status = 'idle';
      state.activity = null;
    },
    // Surface an error in the in-flight assistant bubble.
    chatError: (state, action) => {
      const ai = lastAssistant(state);
      if (ai) {
        ai.message = action.payload;
        delete ai.streaming;
      } else {
        state.messages.push({ message: action.payload, userType: 'ai' });
      }
      state.status = 'error';
      state.activity = null;
    },
  },
});

export const {
  addMessage,
  setStatus,
  startAssistant,
  appendAssistantDelta,
  setAssistantMessage,
  setActivity,
  finishAssistant,
  chatError,
} = aiChatSlice.actions;

export default aiChatSlice.reducer;
