import { createSlice } from "@reduxjs/toolkit"

const initstate = {
    date: {},
    resourceId : '',
    level: '',
    containsText: ''
}


export const filterSlice = createSlice({
    name: 'filter',
    initialState: initstate,
    reducers: {
        setDateFilter: (state, action) => {
            console.log("Setting date filter");
            console.log(action.payload);
            state.date = action.payload;
        },
        setResourceFilter: (state, action) => {
            state.resourceId = action.payload;
        },
        setLevelFilter: (state, action) => {
            state.level = action.payload;
        },
        setTextFilter: (state, action) => {
            state.containsText = action.payload;
        }
    }
});


export const { setDateFilter } = filterSlice.actions;
export const { setResourceFilter } = filterSlice.actions;
export const { setLevelFilter } = filterSlice.actions;
export const { setTextFilter } = filterSlice.actions;
export default filterSlice.reducer;

