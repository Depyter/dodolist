import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { MoreVertical, Pin, PinOff, Palette, Archive, ArchiveRestore, Copy, Trash2 } from "lucide-react";
import React from "react";
import type { Color } from "@/lib/colors";

interface ListOptionsDropdownProps {
  readOnly?: boolean;
  pinned?: boolean;
  archived?: boolean;
  onPinToggle: () => void;
  onArchiveToggle: () => void;
  onClone: () => void;
  onDelete: () => void;
  onColorSelect: (color: string) => void;
  colors: Color[];
  currentColor: string;
}

export const ListOptionsDropdown: React.FC<ListOptionsDropdownProps> = ({
  readOnly,
  pinned,
  archived,
  onPinToggle,
  onArchiveToggle,
  onClone,
  onDelete,
  onColorSelect,
  colors,
  currentColor,
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="List settings"
          className="h-8 w-8 p-0 text-slate-600 hover:text-slate-800"
          disabled={readOnly}
        >
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-white/95 backdrop-blur-sm">
        {/* Pin/Unpin */}
        <DropdownMenuItem onClick={onPinToggle} disabled={readOnly}>
          {pinned ? (
            <>
              <PinOff className="w-4 h-4 mr-2" />
              <span>Unpin List</span>
            </>
          ) : (
            <>
              <Pin className="w-4 h-4 mr-2" />
              <span>Pin List</span>
            </>
          )}
        </DropdownMenuItem>
        {/* Color Palette */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <DropdownMenuItem>
              <Palette className="w-4 h-4 mr-2" />
              Change Color
            </DropdownMenuItem>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right">
            <div className="grid grid-cols-4 gap-2 p-2">
              {colors.map((color) => (
                <button
                  key={color.value}
                  className={`w-6 h-6 rounded-full ${color.value} hover:scale-110 transition-transform border-2 ${currentColor === color.value ? 'border-blue-500' : 'border-transparent'}`}
                  onClick={() => onColorSelect(color.value)}
                  aria-label={color.name}
                />
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenuSeparator />
        {/* Archive/Unarchive */}
        <DropdownMenuItem onClick={onArchiveToggle} disabled={readOnly}>
          {archived ? (
            <>
              <ArchiveRestore className="w-4 h-4 mr-2" />
              <span>Unarchive List</span>
            </>
          ) : (
            <>
              <Archive className="w-4 h-4 mr-2" />
              <span>Archive List</span>
            </>
          )}
        </DropdownMenuItem>
        {/* Clone */}
        <DropdownMenuItem onClick={onClone} disabled={readOnly}>
          <Copy className="w-4 h-4 mr-2" />
          <span>Clone List</span>
        </DropdownMenuItem>
        {/* Delete */}
        <DropdownMenuItem
          onClick={onDelete}
          className="text-red-500 hover:!text-red-600 focus:!bg-red-50 focus:!text-red-600"
          disabled={readOnly}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          <span>Delete List</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
