# Test Summary

This document details each test being run in the Dodolist frontend workspace.

---

## TodoListPage.test.tsx
**File:** `src/tests/TodoListPage.test.tsx`

- Renders the list name and input to add tasks
- Calls `addTodo` when a new task is submitted
- Displays existing todos and allows toggling and deleting them
- Allows editing the list name

---

## useTodoLists.test.ts
**File:** `src/tests/useTodoLists.test.ts`

- Fetches initial lists and sets the active list
- Creates a new list optimistically and queues the backend operation
- Deletes a list optimistically and queues the backend operation
- Queues operations when offline and processes them when back online

---

## useYjsTodoList.test.ts
**File:** `src/tests/useYjsTodoList.test.ts`

- Initializes with default data when listId is provided
- Adds a todo item and updates the state
- Toggles a todo item
- Deletes a todo item
- Updates list metadata (name, color, pinned, archived)
- Initializes list metadata correctly

---

## authService.test.ts
**File:** `src/tests/authService.test.ts`

- Registers a new user successfully
- Handles registration errors
- Logs in user successfully
- Handles login errors
- Checks if user is authenticated
- Returns null for unauthenticated user
- Logs out user
- Gets auth token
- Requests password reset
- Handles password reset request errors
- Confirms password reset
- Handles password reset confirmation errors
- Requests email verification
- Handles verification request errors
- Confirms email verification
- Handles verification confirmation errors
- Subscribes to auth changes

---

## auth.test.ts
**File:** `src/tests/auth.test.ts`

- Registers a new user successfully
- Handles registration errors
- Logs in user with email and password
- Handles invalid credentials
- Checks if user is authenticated
- Logs out user
- Requests password reset

---

## yjsPocketBase.queue.test.ts
**File:** `src/tests/yjsPocketBase.queue.test.ts`

- Queues sync operations when document is updated

---

## yjsPocketBase.test.ts
**File:** `src/tests/yjsPocketBase.test.ts`

- Connects, fetches initial state, and syncs local changes
- Applies remote updates to the local document
- Queues changes when offline and syncs upon reconnection

---