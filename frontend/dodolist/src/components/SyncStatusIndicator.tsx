import React from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CloudOff, Loader2, CheckCircle, AlertTriangle, WifiOff } from "lucide-react";
import { type SyncStatusInfo } from "@/services/yjsPocketBase";
import { Button } from "./ui/button";

interface SyncStatusIndicatorProps {
  syncStatus: SyncStatusInfo;
  activeColor: { value: string; light: string; border: string; text: string; dark: string; darkText: string; texture: string; };
  onRetry?: () => void;
}

const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({ syncStatus, activeColor, onRetry }) => {
  const getStatusConfig = () => {
    const { status, queueLength, lastSyncTime, canRetry } = syncStatus;

    let whatIsSyncing = "";
    if (queueLength > 0) {
      whatIsSyncing = ` (${queueLength} change${queueLength > 1 ? 's' : ''} pending)`;
    }

    switch (status) {
      case 'synced':
        return {
          icon: <CheckCircle className={`w-4 h-4 ${activeColor.text}`} />,
          label: "Synced",
          message: lastSyncTime 
            ? `Last synced: ${lastSyncTime.toLocaleTimeString()}`
            : `Your data is up-to-date.`,
          className: `${activeColor.light} ${activeColor.border}`,
        };
      
      case 'syncing':
        return {
          icon: <Loader2 className={`w-4 h-4 animate-spin ${activeColor.text}`} />,
          label: "Syncing...",
          message: `Syncing your latest changes${whatIsSyncing}...`,
          className: `${activeColor.light} ${activeColor.border}`,
        };
      
      case 'error':
        return {
          icon: <AlertTriangle className="w-4 h-4 text-red-500" />,
          label: "Error",
          message: canRetry
            ? `Connection failed. Will retry automatically.`
            : `Could not connect to the server. Please check your internet connection or try again later.`,
          className: "bg-red-50 border-red-200",
        };
      
      case 'offline':
      default:
        return {
          icon: <WifiOff className="w-4 h-4 text-slate-500" />,
          label: "Offline",
          message: `You are offline. Changes are saved locally${whatIsSyncing}.`,
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
        <TooltipContent className="flex flex-col gap-2">
          <p>{message}</p>
          {syncStatus.status === 'error' && !syncStatus.canRetry && onRetry && (
            <Button size="sm" onClick={onRetry} className="w-full">
              Retry Now
            </Button>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default SyncStatusIndicator;
