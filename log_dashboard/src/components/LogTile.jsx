import { FaCaretRight } from "react-icons/fa6";
import { FaCaretDown } from "react-icons/fa6";
import { useState } from "react";
export const LogTile = ({ log }) => {
    const [isOpen, setIsOpen] = useState(false); 
  return (
    <div className="w-full border border-1 rounded-lg shadow-md my-1 flex items-start shrink-0">
      <div className="bg-gray-700 text-white rounded-md px-2 py-1 mr-4">
        {new Date(log.Timestamp).toLocaleString()}
      </div>
      <div className="flex">
        <div>
            {isOpen ? (
                <FaCaretDown color="gray"
                className="cursor-pointer text-2xl mt-1"
                onClick={() => setIsOpen(!isOpen)}
                />
            ) : (
                <FaCaretRight color="gray"
                className="text-2xl cursor-pointer mt-1"
                onClick={() => setIsOpen(!isOpen)}
                />
            )}
        </div>
        {isOpen ? (
                    <div className="text-gray-300 mt-6">
                        <div className="my-2">
                            <span className="bg-gray-800 text-white rounded-md px-2 py-1 mr-2">
                                <strong>Timestamp:</strong>
                            </span> 
                            <span>{new Date(log.Timestamp).toLocaleString()}</span>
                        </div>
                        <div className="my-2">
                            <span className="bg-gray-800 text-white rounded-md px-2 py-1 mr-2">
                                <strong>Level:</strong>
                            </span> 
                            <span>{log.Level}</span>
                        </div>
                        <div className="my-2">
                            <span className="bg-gray-800 text-white rounded-md px-2 py-1 mr-2">
                                <strong>Message:</strong>
                            </span> 
                            <span>{log.Message}</span>
                        </div>
                        <div className="my-2">
                            <span className="bg-gray-800 text-white rounded-md px-2 py-1 mr-2">
                                <strong>ResourceId:</strong>
                            </span> 
                            <span>{log.ResourceID}</span>
                        </div>
                    </div>
                ) : (
                    <p className="text-gray-300 mt-1 truncate">
                        {JSON.stringify(log, null, 2)}
                    </p>
                )}
      </div>
    </div>
  );
};
