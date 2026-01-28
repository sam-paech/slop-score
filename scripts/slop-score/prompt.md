# Task Execution Instructions

**You must complete exactly ONE task, then exit.**

## Task Execution Steps

1. **Find an available task** by reading JSON files in `scripts/slop-score/tasks/`
   - A task is available if:
     - `status` is `"pending"`
     - All task IDs in `blockedBy` array have `status: "completed"` in their respective JSON files
   - Pick the first available task (alphabetically by filename)

2. **Claim the task** by updating the JSON file:
   - Set `status` to `"in_progress"`

3. **Read the CLAUDE.md file** in `scripts/slop-score/` for project context and conventions

4. **Complete the work** described in the task's `description` field

5. **Mark the task complete** by updating the JSON file:
   - Set `status` to `"completed"`

6. **Exit immediately** - Do NOT look for another task

## Critical Rules

- **ONE TASK ONLY** - Never process more than one task per invocation
- **Exit when done** - After marking complete, stop working
- **Update status atomically** - Always update the JSON file before and after work

---

## REMINDER: ONE TASK ONLY

**After completing your task, update its status to `"completed"` and EXIT IMMEDIATELY.**

Do NOT:
- Look for another task
- Start additional work
- Continue processing

Your job is done. Exit now.
