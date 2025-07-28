import React from "react";
import { Database } from "lucide-react";

interface StorageTypeIndicatorProps {
  persistenceType: 'memory' | 'indexeddb' | 'opfs' | null;
  showPersistenceWarning: boolean;
}

export const StorageTypeIndicator: React.FC<StorageTypeIndicatorProps> = ({ persistenceType, showPersistenceWarning }) => {
  if (!persistenceType || showPersistenceWarning) return null;
  let message = '';
  switch (persistenceType) {
    case 'opfs':
      message = 'Using Origin Private File System for storage';
      break;
    case 'indexeddb':
      message = 'Using IndexedDB for storage';
      break;
    default:
      message = 'Using in-memory storage (data will be lost when page is closed)';
  }
  return (
    <div className="px-4 py-1 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
      <Database className="w-4 h-4 text-slate-500" />
      <span className="text-xs text-slate-600">{message}</span>
    </div>
  );
};
