import { createLocalTask } from "../src/shell/local-task-client";

void createLocalTask("device-1", "fs.list", { path: "/allowed" });

// @ts-expect-error — protocol §4 is closed; arbitrary action kinds must not compile.
void createLocalTask("device-1", "fs.delete", { path: "/allowed" });
