import React from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorMessageProps {
  error: Error | null;
  onReload?: () => void;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ error, onReload }) => {
  if (!error) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white/50 z-50">
      <div className="bg-white p-6 rounded-lg shadow-lg max-w-md">
        <div className="flex items-center gap-3 text-red-500 mb-4">
          <AlertCircle className="w-6 h-6" />
          <h3 className="text-lg font-semibold">Error Loading Data</h3>
        </div>
        <p className="text-slate-600 mb-4">{error.message || "Failed to load your tasks. Please try refreshing the page."}</p>
        {onReload && (
          <Button onClick={onReload} className="w-full">
            Refresh Page
          </Button>
        )}
      </div>
    </div>
  );
};
