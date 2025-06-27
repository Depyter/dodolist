import React from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CloudOff, Loader2, CheckCircle } from "lucide-react";

interface SyncStatusIndicatorProps {
  status: 'synced' | 'syncing' | 'offline';
  activeColor: { value: string; light: string; border: string; text: string; dark: string; darkText: string; texture: string; };
}

const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({ status, activeColor }) => {
  const statusConfig = {
    synced: {
      icon: <CheckCircle className={`w-4 h-4 ${activeColor.text}`} />,
      label: "Synced",
      message: "Your data is synced with the cloud.",
    },
    syncing: {
      icon: <Loader2 className={`w-4 h-4 animate-spin ${activeColor.text}`} />,
      label: "Syncing...",
      message: "Syncing your latest changes.",
    },
    offline: {
      icon: <CloudOff className="w-4 h-4 text-slate-500" />,
      label: "Offline",
      message: "You are offline. Changes are saved locally.",
    },
  };

  const { icon, label, message } = statusConfig[status];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center gap-2 px-2 py-1 rounded-md ${activeColor.light} ${activeColor.border} border`}>
            {icon}
            <span className="text-xs font-medium text-slate-700 hidden sm:inline">{label}</span>
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
