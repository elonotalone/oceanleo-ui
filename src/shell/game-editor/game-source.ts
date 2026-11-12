/** New games are file projects; historical HTML is opened read-only by readGameProject. */
export {
  readGameProject, gameProjectEdits, validGameFilePath, isGameTextFile,
  GAME_PROJECT_SCHEMA, GAME_PROJECT_MAX_BYTES, GAME_FILE_MAX_BYTES,
} from "./game-project";
export type { GameProject, GameProjectFile } from "./game-project";
