import { useDispatch, useSelector } from "react-redux";
import { useEffect } from "react";
import { addLogs } from "../features/logs/logSlice";
import { fetchLogs } from "../features/logs/services/fetch";
import { LogTile } from "./LogTile";
import { LineChart } from "@mui/x-charts/LineChart";
import { FilterBar } from "./FilterBar";
//in last stemp add  rovider in main.jsx
export const LogViewer = () => {
  const dispatch = useDispatch();
  const addLogHandler = (e) => {
    dispatch(addLogs());
  };
  const { logs, state } = useSelector((state) => state.log);

  useEffect(() => {
    if (state == "idle") {
      dispatch(fetchLogs());
    }
  },[state,dispatch]);
  let content;
  if (state == "loading") {
    content = <div>Loading...</div>;
  } else if (state == "success") {
    content = logs.map((log, index) => {
      return <LogTile key={index} log={log}></LogTile>;
    });
  } else if (state == "failed") {
    content = <div>Failed to fetch logs</div>;
  }
  return (
    <div className="h-full w-full flex flex-col ">
      <div className="h-1/6 border-b border-solid border-border-white flex justify-center items-center flex-none">
        <LineChart
          xAxis={[{ data: [1, 2, 3, 5, 8, 10] }]}
          series={[
            {
              data: [2, 5.5, 2, 8.5, 1.5, 5],
            },
          ]}
          height={200}
        />
      </div>
      <FilterBar></FilterBar>
      <div className="w-full h-4/6 flex flex-col items-start flex-grow px-2">
            <div className="flex w-full my-2 px-4">
                <div className="w-1/4">
                    <p className="text-white font-bold">Timestamp</p>
                </div>
                <div className="w-3/4">
                    <p className="text-white font-bold">Summary</p>
                </div>
            </div>
            <div className="w-full h-full overflow-auto">
                {content}
            </div>
            
        </div>
    </div>
    );
};
