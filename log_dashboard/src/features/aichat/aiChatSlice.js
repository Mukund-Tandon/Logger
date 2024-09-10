import { createSlice } from '@reduxjs/toolkit';
import { getAiResponse } from './services/aiCHatService';

const initialState = {
  messages: [],
  status: 'idle'
};

const aiChatSlice = createSlice({
  name: 'aiChat',
  initialState,
  reducers: {
    addMessage: (state, action) => {
      state.messages.push(action.payload);
    },
    setStatus: (state, action) => {
      state.status = action.payload;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(getAiResponse.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(getAiResponse.fulfilled, (state, action) => {
        state.status = 'idle';
        state.messages.push({ message: action.payload.message, userType: 'ai' });
      })
      .addCase(getAiResponse.rejected, (state) => {
        state.status = 'error';
      });
  }
});

export const { addMessage, setStatus } = aiChatSlice.actions;
export default aiChatSlice.reducer;