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

6. **Append your progress** to `tasks/progress.txt` using this format:

   ```markdown
   ## [Date/Time] - [Task ID]
   Iteration: [use path from "This iteration" below]
   - What was implemented
   - Files changed
   - **Learnings for future iterations:**
     - Patterns discovered (e.g., "this codebase uses X for Y")
     - Gotchas encountered (e.g., "don't forget to update Z when changing W")
     - Useful context (e.g., "the evaluation panel is in component X")
   ---
   ```

   **Important:**
   - ALWAYS append, never replace existing content
   - Use the iteration path provided at the end of this prompt (under "This iteration:")
   - The **learnings section is critical** - it helps future iterations avoid repeating mistakes and understand the codebase better

7. **Exit immediately** - Do NOT look for another task

## Critical Rules

- **ONE TASK ONLY** - Never process more than one task per invocation
- **Exit when done** - After logging progress, stop working
- **Update status atomically** - Always update the JSON file before and after work
- **Always log progress** - Append to tasks/progress.txt with learnings for future iterations

---

## REMINDER: ONE TASK ONLY

**After completing your task:**
1. Update its status to `"completed"`
2. Append your progress to `tasks/progress.txt` (include learnings!)
3. **EXIT IMMEDIATELY**

Do NOT:
- Look for another task
- Start additional work
- Continue processing

Your job is done. Exit now.
