import { createAsyncThunk } from "@reduxjs/toolkit";
import { replaceLogs } from '../../logs/logSlice'
export const getAiResponse = createAsyncThunk(
    'aiChat/getAiResponse',
    async ({ message }, thunkAPI) => {
        console.log("Getting response for:", message);
        try {
            const response = await fetch('http://localhost:3000/api/ai_search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log(data);

            if (data.logs && data.logs.length > 0) {
                console.log("Logs found");
                const { logs } = data;
                thunkAPI.dispatch(replaceLogs(logs));
            }

            return data;
        } catch (error) {
            console.error("Error in getAiResponse:", error);
            return thunkAPI.rejectWithValue(error.message);
        }
    }
);