import { createLocalTask } from "../src/shell/local-task-client";

void createLocalTask("device-1", "fs.list", { path: "/allowed" });
void createLocalTask("device-1", "fs.read_summary", { path: "/allowed/a.csv" });
void createLocalTask("device-1", "file.write", {
  path: "/allowed/out.txt",
  content_b64: "aGVsbG8=",
});
void createLocalTask("device-1", "python.run", { cwd: "/allowed", code: "print(1)" });
void createLocalTask("device-1", "shell.run", { cwd: "/allowed", command: "pwd" });
void createLocalTask("device-1", "app.open", { path: "/Applications/Numbers.app" });

// @ts-expect-error — protocol §4 is closed; arbitrary action kinds must not compile.
void createLocalTask("device-1", "fs.delete", { path: "/allowed" });

// @ts-expect-error — fs.list requires its protocol §4.1 path field.
void createLocalTask("device-1", "fs.list", {});

// @ts-expect-error — python.run requires cwd + code, not an fs-style path.
void createLocalTask("device-1", "python.run", { path: "/allowed/script.py" });
