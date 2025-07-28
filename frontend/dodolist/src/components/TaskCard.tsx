import React from "react";
import { Button } from "@/components/ui/button"; 
import { Card } from '@/components/ui/card';
import { CheckCircle2, Circle, Clock, Trash2 } from "lucide-react";
import type { Todo } from "@/lib/types";

interface TaskCardProps {
  todo: Todo;
  isCompleted?: boolean;
  readOnly?: boolean;
  activeList: any;
  activeColor: any;
  setShowTaskOptions: (id: string) => void;
  handleToggleTodo: (id: string) => void;
  handleDeleteTodo: (id: string) => void;
  getDeadlineColor: (date: Date) => string;
  formatDateTime: (date: Date, includeTime?: boolean) => string;
  isOverdue: (date: Date) => boolean;
  isDueToday: (date: Date) => boolean;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  todo,
  isCompleted = false,
  readOnly = false,
  activeList,
  activeColor,
  setShowTaskOptions,
  handleToggleTodo,
  handleDeleteTodo,
  getDeadlineColor,
  formatDateTime,
  isOverdue,
  isDueToday,
}) => {
  const colorClass = (activeList && typeof activeList.color === 'string')
    ? activeList.color.replace("bg-", "text-")
    : "text-blue-500";
  const borderClass = (activeColor && typeof activeColor.border === 'string') ? activeColor.border : "border-slate-200";
  const lightClass = (activeColor && typeof activeColor.light === 'string') ? activeColor.light : "bg-slate-50";

  const todoText = typeof todo.text === 'string' ? todo.text : '';
  const recurring = typeof todo.recurring === 'string' ? todo.recurring : undefined;
  const completed = Boolean(todo.completed);
  const deadline = todo.deadline instanceof Date && !isNaN(todo.deadline.getTime()) ? todo.deadline : undefined;
  const reminder = todo.reminder instanceof Date && !isNaN(todo.reminder.getTime()) ? todo.reminder : undefined;
  const isDueTodayTask = !!deadline && isDueToday(deadline);

  return (
    <Card
      key={todo.id}
      className={`p-3 transition-all duration-300 hover:shadow-md will-change-transform 
        ${isCompleted
          ? `${lightClass} ${borderClass} border opacity-60`
          : `${lightClass} ${borderClass} border backdrop-blur-sm`}
        ${isDueTodayTask && !isCompleted ? "border-red-500 border-2" : ""}`}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={() => todo.id && handleToggleTodo(todo.id)}
          className="mt-0.5 text-slate-400 hover:text-slate-600 transition-colors min-w-[20px]"
          disabled={readOnly}
        >
          {completed ? (
            <CheckCircle2 className={`w-4 h-4 ${colorClass}`} />
          ) : (
            <Circle className="w-4 h-4" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-slate-800 leading-snug ${completed ? "line-through text-slate-400" : ""}`}>
              {todoText}
            </p>
            {recurring && recurring !== "none" && (
              <span
                className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-full"
                title={`Repeats ${recurring}`}
              >
                {recurring}
              </span>
            )}
          </div>

          {(deadline || (reminder && !completed)) && (
            <div className="flex flex-wrap gap-3 mt-1.5 text-xs">
              {deadline && (
                <span className={`font-medium ${getDeadlineColor(deadline)}`}>
                  Due{" "}
                  {deadline.getHours && deadline.getMinutes && deadline.getHours() === 0 && deadline.getMinutes() === 0
                    ? formatDateTime(deadline, false)
                    : formatDateTime(deadline, true)}
                  {isOverdue(deadline) && " (Overdue)"}
                  {isDueToday(deadline) && " (Today)"}
                </span>
              )}
              {reminder && !completed && (
                <span className="text-slate-500">
                  Remind{" "}
                  {reminder.getHours && reminder.getMinutes && reminder.getHours() === 0 && reminder.getMinutes() === 0
                    ? formatDateTime(reminder, false)
                    : formatDateTime(reminder, true)}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {!isCompleted && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => todo.id && setShowTaskOptions(todo.id)}
              className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600"
              title="Set deadline and reminder"
              disabled={readOnly}
            >
              <Clock className="w-3.5 h-3.5" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => todo.id && handleDeleteTodo(todo.id)}
            className="text-slate-400 hover:text-red-500 hover:bg-red-50 h-7 w-7 p-0"
            disabled={readOnly}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
};
