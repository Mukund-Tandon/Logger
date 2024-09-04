import { configureStore } from "@reduxjs/toolkit";
import logreducer from "../features/logs/logSlice";
import filterReducer from "../features/filters/filterSlice";
export const store = configureStore({
    reducer: {
        log: logreducer,
        filter: filterReducer
    }
});