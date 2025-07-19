import * as Y from 'yjs';
// Define the structure of a Todo item within Yjs
export type YTodo = Y.Map<any>;

// Define the structure of the entire list document, including metadata fields
export interface YListDoc {
    name: Y.Text;
    color: Y.Text;
    todos: Y.Array<YTodo>;
    pinned?: boolean;
    archived?: boolean;
    deleted?: boolean;
}
