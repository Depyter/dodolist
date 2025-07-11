export interface Todo {
  id: string;
  text: string;
  description?: string;
  completed: boolean;
  createdAt: Date;
  completedAt?: Date;
  deadline?: Date;
  reminder?: Date;
  recurring?: "none" | "daily" | "weekly" | "monthly";
  listId: string;
}

export interface UserProfile {
  name: string;
  email: string;
  avatar?: string;
}
