import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PersistenceWarningProps {
  show: boolean;
  persistenceType: 'memory' | 'indexeddb' | 'opfs' | null;
  persistenceError: string | null;
  onClose: () => void;
}

export const PersistenceWarning: React.FC<PersistenceWarningProps> = ({ show, persistenceType, persistenceError, onClose }) => {
  if (!show) return null;
  return (
    <div className="px-4 py-2 bg-amber-50 border-b border-amber-200">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-800">Your data is not being saved permanently</p>
          <p className="text-xs text-amber-700 mt-0.5">
            {persistenceError ?
              `Database error: ${persistenceError}` :
              "Your browser doesn't support persistent storage. Your tasks will be lost when you close this tab or refresh the page."}
          </p>
          {persistenceType === 'memory' && !persistenceError && (
            <div className="mt-1 text-xs text-amber-700">
              <p>For persistent storage, try:</p>
              <ul className="list-disc list-inside mt-0.5">
                <li>Using a modern browser like Chrome or Firefox</li>
                <li>Enable third-party cookies in your browser settings</li>
                <li>Try using a private/incognito window if storage is restricted</li>
              </ul>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-6 w-6 p-0 text-amber-600"
        >
          <span className="sr-only">Close</span>
          ×
        </Button>
      </div>
    </div>
  );
};
