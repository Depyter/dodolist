import React from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CloudOff, Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { type SyncStatusInfo } from "@/services/yjsPocketBase";

interface SyncStatusIndicatorProps {
  syncStatus: SyncStatusInfo;
  activeColor: { value: string; light: string; border: string; text: string; dark: string; darkText: string; texture: string; };
}

const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({ syncStatus, activeColor }) => {
  const getStatusConfig = () => {
    const { status, queueLength, lastSyncTime } = syncStatus;

    // New: Add more descriptive info about what is being synced
    let whatIsSyncing = "";
    if (queueLength > 0) {
      whatIsSyncing = ` (${queueLength} change${queueLength > 1 ? 's' : ''} to tasks/lists)`;
    }

    switch (status) {
      case 'synced':
        return {
          icon: <CheckCircle className={`w-4 h-4 ${activeColor.text}`} />,
          label: "Synced",
          message: lastSyncTime 
            ? `Last synced: ${lastSyncTime.toLocaleTimeString()}${whatIsSyncing}`
            : `Your data is synced with the cloud.${whatIsSyncing}`,
          className: `${activeColor.light} ${activeColor.border}`,
        };
      
      case 'syncing':
        return {
          icon: <Loader2 className={`w-4 h-4 animate-spin ${activeColor.text}`} />,
          label: "Syncing...",
          message: queueLength > 0 
            ? `Syncing ${queueLength} change${queueLength > 1 ? 's' : ''} to tasks/lists...`
            : "Syncing your latest changes.",
          className: `${activeColor.light} ${activeColor.border}`,
        };
      
      case 'error':
        return {
          icon: <AlertTriangle className="w-4 h-4 text-red-500" />,
          label: "Error",
          message: queueLength > 0
            ? `Failed to sync ${queueLength} change${queueLength > 1 ? 's' : ''} to tasks/lists. Will retry automatically.`
            : "Sync error occurred. Will retry automatically.",
          className: "bg-red-50 border-red-200",
        };
      
      case 'offline':
      default:
        return {
          icon: <CloudOff className="w-4 h-4 text-slate-500" />,
          label: "Offline",
          message: queueLength > 0
            ? `You are offline. ${queueLength} change${queueLength > 1 ? 's' : ''} to tasks/lists saved locally.`
            : "You are offline. Changes are saved locally.",
          className: "bg-slate-100 border-slate-200",
        };
    }
  };

  const { icon, label, message, className } = getStatusConfig();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center gap-2 px-2 py-1 rounded-md border ${className}`}>
            {icon}
            <span className="text-xs font-medium text-slate-700 hidden sm:inline">{label}</span>
            {syncStatus.queueLength > 0 && (
              <span className="text-xs bg-slate-200 text-slate-600 px-1 rounded-full min-w-[16px] text-center">
                {syncStatus.queueLength}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{message}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default SyncStatusIndicator;
