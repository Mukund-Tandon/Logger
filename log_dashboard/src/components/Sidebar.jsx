import { useState, useEffect } from "react";
import { useDispatch } from "react-redux";
import { fetchLogsBetween,fetchLogsWithFilters } from "../features/logs/services/fetch";
import { setDateFilter, setLevelFilter, setResourceFilter, setTextFilter } from "../features/filters/filterSlice";
import { AIChat } from "./AIChat";
export const SideBar = () => {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [containsText, setContainsText] = useState("");
  const [level, setLevel] = useState("");
  const dispatch = useDispatch();
  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toISOString().slice(0, 19).replace("T", " ");
  };
  useEffect(() => {
    console.log("useEffect");
    handleDateFilterChange();
  }, [startDate, endDate]);

  useEffect(() => {
    console.log("useEffect");
    handleFilterChange();
  }, [resourceId, containsText, level]);
  

   const handleFilterChange = () => {
    console.log(resourceId, containsText, level);
    dispatch(
      setResourceFilter(resourceId)
    );
    dispatch(
      setTextFilter(containsText)
    );
    dispatch(
      setLevelFilter(level)
    );

   };
  const handleDateFilterChange = () => {
    console.log(startDate, endDate);
    dispatch(
      setDateFilter({
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
      })
    );
  };
  const handleSubmit = () => {
    dispatch(fetchLogsWithFilters());
  };
  return (
    <div className="h-full w-60 w-max-40 border-r border-solid border-gray-300 flex flex-col">
      <div className="h-16 bg-gray-800 flex items-center justify-center">
        <h1 className="text-white text-2xl font-bold">Logs</h1>
      </div>
      <div className="w-full h-max px-4 py-4 border-b flex flex-col justify-between">
        <div className="flex flex-col mb-4">
          <div className="flex flex-col">
            <label className="text-gray-300 mb-1" htmlFor="fromDateTime">
              From:
            </label>
            <input
              id="fromDateTime"
              type="datetime-local"
              className="border border-solid border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              onChange={(e) => {
                setStartDate(e.target.value);
              }}
            />
          </div>
          <div className="flex flex-col mt-2">
            <label className="text-gray-300 mb-1" htmlFor="toDateTime">
              To:
            </label>
            <input
              id="toDateTime"
              type="datetime-local"
              className="border border-solid border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              onChange={(e) => {
                setEndDate(e.target.value);
              }}
            />
          </div>
          <div className="flex flex-col mt-2">
            <label className="text-gray-300 mb-1">Recource ID:</label>
            <input
              id="resourceId"
              type="text"
              className="border border-solid border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              onChange={(e) => {
                setResourceId(e.target.value);
              }}
            />
          </div>
          <div className="flex flex-col mt-2">
            <label className="text-gray-300 mb-1">Contains Text:</label>
            <input
              id="containsText"
              type="text"
              className="border border-solid border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              onChange={(e) => {
                setContainsText(e.target.value);
              }}
            />
          </div>
          <div className="flex flex-col mt-2">
      <label className="text-gray-300 mb-1">Level :</label>
      <select
        id="level"
        className="border border-solid border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        value={level}
        onChange={(e) => {
          setLevel(e.target.value);
        }}
      >
        <option value="">Select a level</option>
        <option value="error">Error</option>
        <option value="info">Info</option>
        <option value="warn">Warn</option>
      </select>
      </div>
    </div>
        <div className="flex flex-col items-center justify-end">
          <button
            onClick={handleSubmit}
            className="h-8 bg-blue-500 text-white rounded-lg px-4 focus:outline-none hover:bg-blue-600"
          >
            Search
          </button>
        </div>
      </div>
      <AIChat></AIChat>
    </div>
  );
};
