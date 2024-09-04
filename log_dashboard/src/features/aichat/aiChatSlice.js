import { createSlice } from '@reduxjs/toolkit';
import { getAiResponse } from './services/aiCHatService';
import { useDispatch } from "react-redux";
import { replaceLogs } from '../logs/logSlice';
const initState = {
    messages: [],
}


const aiChatSlice = createSlice({
    name: 'aiChat',
    initialState: initState,
    reducers: {
        addMessage: (state, action) => {
            state.messages.push(action.payload["message"]);
            if(action.payload["userType"] == "user") {
                const dispatch = useDispatch();
                dispatch(getAiResponse({message: action.payload["message"]}));
            }
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(getAiResponse.fulfilled, (state, action) => {
                state.messages.push(action.payload["message"]);
                if(action.payload["logs"] != null && action.payload["logs"].length > 0) {
                    const dispatch = useDispatch();
                    dispatch(replaceLogs(action.payload["logs"]));
                }
            })
    }
});


export const { addMessage } = aiChatSlice.actions;
export default aiChatSlice.reducer;