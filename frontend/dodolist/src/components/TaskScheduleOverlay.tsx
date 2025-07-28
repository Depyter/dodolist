import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clock, Calendar, Bell, Repeat, X } from "lucide-react";

interface TaskScheduleOverlayProps {
  todo: any;
  readOnly?: boolean;
  handleUpdateTodo: (id: string, updates: any) => void;
  setShowTaskOptions: (val: string | null) => void;
  activeList?: any;
  getDeadlineColor: (date: Date) => string;
  formatDateTime: (date: Date, includeTime?: boolean) => string;
  isValidDate: (date: any) => boolean;
  isOverdue: (date: Date) => boolean;
  isDueToday: (date: Date) => boolean;
}

export const TaskScheduleOverlay: React.FC<TaskScheduleOverlayProps> = ({
  todo,
  readOnly = false,
  handleUpdateTodo,
  setShowTaskOptions,
  activeList,
  getDeadlineColor,
  formatDateTime,
  isValidDate,
  isOverdue,
  isDueToday,
}) => {
  const [deadlineHasTime, setDeadlineHasTime] = useState(!!todo.deadline);
  const [reminderHasTime, setReminderHasTime] = useState(!!todo.reminder);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 font-sans-serif antialiased">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Schedule Task
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setShowTaskOptions(null)}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-6">
            {/* Task Preview */}
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-700 font-medium">{todo.text}</p>
            </div>

            {/* Recurring Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Repeat className="w-4 h-4 text-slate-600" />
                <h4 className="font-medium text-slate-800">Repeat</h4>
              </div>

              <select
                value={todo.recurring || "none"}
                onChange={(e) => handleUpdateTodo(todo.id, { recurring: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-md text-sm"
                disabled={readOnly}
              >
                <option value="none">Don't repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>

              {todo.recurring && todo.recurring !== "none" && (
                <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center gap-2">
                    <Repeat className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700">This task will repeat {todo.recurring}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Deadline Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-600" />
                <h4 className="font-medium text-slate-800">Deadline</h4>
              </div>

              <div className="space-y-3">
                <Input
                  type="date"
                  value={isValidDate(todo.deadline) && todo.deadline.toISOString() !== 'Invalid Date' ? todo.deadline.toISOString().split("T")[0] : ""}
                  onChange={(e) => {
                    if (e.target.value) {
                      const newDate = new Date(e.target.value);
                      if (deadlineHasTime && isValidDate(todo.deadline)) {
                        newDate.setHours(todo.deadline.getHours(), todo.deadline.getMinutes());
                      } else {
                        newDate.setHours(9, 0);
                      }
                      handleUpdateTodo(todo.id, { deadline: newDate });
                    } else {
                      handleUpdateTodo(todo.id, { deadline: undefined });
                      setDeadlineHasTime(false);
                    }
                  }}
                  className="w-full"
                  disabled={readOnly}
                />

                {todo.deadline && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="deadline-time"
                        checked={deadlineHasTime}
                        onChange={(e) => {
                          setDeadlineHasTime(e.target.checked);
                          if (e.target.checked && todo.deadline) {
                            const newDeadline = new Date(todo.deadline);
                            newDeadline.setHours(9, 0);
                            handleUpdateTodo(todo.id, { deadline: newDeadline });
                          }
                        }}
                        className="rounded"
                        disabled={readOnly}
                      />
                      <label htmlFor="deadline-time" className="text-sm text-slate-600">
                        Set specific time
                      </label>
                    </div>

                    {deadlineHasTime && (
                      <div className="space-y-2">
                        <Input
                          type="time"
                          value={todo.deadline ? todo.deadline.toTimeString().slice(0, 5) : "09:00"}
                          onChange={(e) => {
                            if (todo.deadline && e.target.value) {
                              const newDeadline = new Date(todo.deadline);
                              const [hours, minutes] = e.target.value.split(":");
                              newDeadline.setHours(Number.parseInt(hours), Number.parseInt(minutes));
                              handleUpdateTodo(todo.id, { deadline: newDeadline });
                            }
                          }}
                          className="w-full"
                          disabled={readOnly}
                        />
                        <div className="flex flex-wrap gap-1">
                          {["09:00", "12:00", "17:00", "20:00"].map((time) => (
                            <Button
                              key={time}
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (todo.deadline) {
                                  const newDeadline = new Date(todo.deadline);
                                  const [hours, minutes] = time.split(":");
                                  newDeadline.setHours(Number.parseInt(hours), Number.parseInt(minutes));
                                  handleUpdateTodo(todo.id, { deadline: newDeadline });
                                }
                              }}
                              className="text-xs h-6 px-2"
                              disabled={readOnly}
                            >
                              {time}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {todo.deadline && (
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-blue-600" />
                      <span className={`text-sm font-medium ${getDeadlineColor(todo.deadline)}`}>
                        Due{" "}
                        {deadlineHasTime
                          ? formatDateTime(todo.deadline)
                          : todo.deadline.toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "long",
                              day: "numeric",
                            })}
                        {isOverdue(todo.deadline) && " (Overdue)"}
                        {isDueToday(todo.deadline) && " (Today)"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Reminder Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-slate-600" />
                <h4 className="font-medium text-slate-800">Reminder</h4>
              </div>

              <div className="space-y-3">
                <Input
                  type="date"
                  value={isValidDate(todo.reminder) && todo.reminder.toISOString() !== 'Invalid Date' ? todo.reminder.toISOString().split("T")[0] : ""}
                  onChange={(e) => {
                    if (e.target.value) {
                      const newDate = new Date(e.target.value);
                      if (reminderHasTime && isValidDate(todo.reminder)) {
                        newDate.setHours(todo.reminder.getHours(), todo.reminder.getMinutes());
                      } else {
                        newDate.setHours(8, 0);
                      }
                      handleUpdateTodo(todo.id, { reminder: newDate });
                    } else {
                      handleUpdateTodo(todo.id, { reminder: undefined });
                      setReminderHasTime(false);
                    }
                  }}
                  className="w-full"
                  disabled={readOnly}
                />

                {todo.reminder && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="reminder-time"
                        checked={reminderHasTime}
                        onChange={(e) => {
                          setReminderHasTime(e.target.checked);
                          if (e.target.checked && todo.reminder) {
                            const newReminder = new Date(todo.reminder);
                            newReminder.setHours(8, 0);
                            handleUpdateTodo(todo.id, { reminder: newReminder });
                          }
                        }}
                        className="rounded"
                        disabled={readOnly}
                      />
                      <label htmlFor="reminder-time" className="text-sm text-slate-600">
                        Set specific time
                      </label>
                    </div>

                    {reminderHasTime && (
                      <div className="space-y-2">
                        <Input
                          type="time"
                          value={todo.reminder ? todo.reminder.toTimeString().slice(0, 5) : "08:00"}
                          onChange={(e) => {
                            if (todo.reminder && e.target.value) {
                              const newReminder = new Date(todo.reminder);
                              const [hours, minutes] = e.target.value.split(":");
                              newReminder.setHours(Number.parseInt(hours), Number.parseInt(minutes));
                              handleUpdateTodo(todo.id, { reminder: newReminder });
                            }
                          }}
                          className="w-full"
                          disabled={readOnly}
                        />
                        <div className="flex flex-wrap gap-1">
                          {["08:00", "09:00", "12:00", "18:00"].map((time) => (
                            <Button
                              key={time}
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (todo.reminder) {
                                  const newReminder = new Date(todo.reminder);
                                  const [hours, minutes] = time.split(":");
                                  newReminder.setHours(Number.parseInt(hours), Number.parseInt(minutes));
                                  handleUpdateTodo(todo.id, { reminder: newReminder });
                                }
                              }}
                              className="text-xs h-6 px-2"
                              disabled={readOnly}
                            >
                              {time}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {todo.reminder && (
                  <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-purple-600" />
                      <span className="text-sm font-medium text-purple-700">
                        Remind{" "}
                        {reminderHasTime
                          ? formatDateTime(todo.reminder)
                          : todo.reminder.toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "long",
                              day: "numeric",
                            })}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  handleUpdateTodo(todo.id, { deadline: undefined, reminder: undefined, recurring: "none" });
                  setDeadlineHasTime(false);
                  setReminderHasTime(false);
                }}
                className="flex-1"
                disabled={readOnly}
              >
                Clear All
              </Button>
              <Button onClick={() => setShowTaskOptions(null)} className={`flex-1 ${activeList?.color} text-white`}>
                Done
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
