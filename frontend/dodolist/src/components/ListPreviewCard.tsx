import React from "react";
import { Card } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import { type Color } from "@/lib/colors";
import { type Todo } from "@/lib/types";

interface ListPreviewCardProps {
  name: string;
  color: Color;
  todos: Todo[];
  archived?: boolean;
  pinned?: boolean;
}

export const ListPreviewCard: React.FC<ListPreviewCardProps> = ({ name, color, todos, archived, pinned }) => {
  const activeTodos = todos.filter(t => !t.completed);
  const completedTodos = todos.filter(t => t.completed);

  return (
    <Card className={`p-3 rounded-lg shadow border ${color.border} ${color.light} max-w-md w-full`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-3 h-3 rounded-full ${color.value}`} />
        <h3 className={`text-base font-semibold truncate ${color.text}`}>{name || "Untitled List"}</h3>
        {archived && <span className="text-xs text-amber-600 ml-2">(Archived)</span>}
        {pinned && <span className="text-xs text-blue-600 ml-2">(Pinned)</span>}
      </div>
      <div className="mb-1">
        <span className="text-xs text-slate-500">{activeTodos.length} active, {completedTodos.length} completed</span>
      </div>
      <ul className="space-y-0.5 mb-1">
        {activeTodos.slice(0, 2).map(todo => (
          <li key={todo.id} className="flex items-center gap-1 text-sm text-slate-700">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-1" />
            <span className="truncate">{todo.text}</span>
          </li>
        ))}
        {activeTodos.length === 0 && (
          <li className="text-xs text-slate-400 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> No active tasks
          </li>
        )}
      </ul>
      {completedTodos.length > 0 && (
        <div className="text-xs text-slate-400">+ {completedTodos.length} completed</div>
      )}
    </Card>
  );
};
