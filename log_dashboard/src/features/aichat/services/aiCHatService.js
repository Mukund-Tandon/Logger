import { createAsyncThunk } from "@reduxjs/toolkit";

export const getAiResponse = createAsyncThunk(
    'aiChat/getAiResponse',
    async ({message},thunkAPI) => {
        const response = await fetch('http://localhost:3000/api/ai_search');

        return response.json();
    }
)
