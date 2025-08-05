import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Color } from "@/lib/colors";

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  activeColor: Color;
}

export const CollapsibleSection = ({ title, children, defaultOpen = true, activeColor }: CollapsibleSectionProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between w-full px-2 py-1 text-xs font-semibold uppercase tracking-wide text-left rounded-md hover:bg-white/10 focus:outline-none ${activeColor.darkText} opacity-70`}
      >
        <span>{title}</span>
        <ChevronDown
          className={`w-4 h-4 transform transition-transform ${isOpen ? '' : '-rotate-90'}`}
        />
      </button>
      {isOpen && <div className="pt-1">{children}</div>}
    </div>
  );
};
