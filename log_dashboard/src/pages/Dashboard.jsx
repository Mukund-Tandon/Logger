import { useDispatch, useSelector } from "react-redux";
import { LogViewer } from "../components/LogViewer";
import { SideBar } from "../components/Sidebar"
import { useEffect } from "react";
import { addLogs } from "../features/logs/logSlice";
import { fetchLogs } from "../features/logs/services/fetch";
export const  Dashboard = () => {
  const dispatch = useDispatch();

  return (
    <div className="w-screen h-screen flex bg-main-background overflow-hidden">
      <SideBar></SideBar>
      
      <LogViewer></LogViewer>
    </div>
  );
};
