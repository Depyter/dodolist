import React, { useEffect } from "react";

export interface NotificationProps {
  message: string;
  description?: string;
  type?: "success" | "error" | "info" | "warning";
  onClose?: () => void;
  duration?: number; // ms
}

const typeStyles = {
  success: "bg-green-50 border-green-200 text-green-800",
  error: "bg-rose-50 border-rose-200 text-rose-800",
  info: "bg-blue-50 border-blue-200 text-blue-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
};

export const Notification: React.FC<NotificationProps> = ({
  message,
  description,
  type = "info",
  onClose,
  duration = 3500,
}) => {
  useEffect(() => {
    if (!onClose) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div
      className={`shadow-lg border rounded-lg px-4 py-3 mb-3 flex flex-col min-w-[260px] max-w-xs ${typeStyles[type]} animate-in fade-in-0 slide-in-from-top-4 duration-300`}
      style={{ pointerEvents: "auto" }}
      role="alert"
    >
      <div className="font-medium truncate">{message}</div>
      {description && <div className="text-sm mt-1 text-opacity-80 truncate">{description}</div>}
      {onClose && (
        <button
          className="absolute top-2 right-2 text-slate-400 hover:text-slate-600"
          onClick={onClose}
          aria-label="Close notification"
        >
          ×
        </button>
      )}
    </div>
  );
};
