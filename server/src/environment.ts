/* 服务端加载项目本地环境；宿主变量优先，凭据不进入前端构建。
 * Created on 2026-10-15
 * @author: https://github.com/Linmoqian
 */
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const configured = process.env.YUNFENG_ENV_FILE;
const envFile = configured ?? fileURLToPath(new URL("../../.env", import.meta.url));
try { loadEnvFile(envFile); }
catch (error) {
  if (configured !== undefined || (error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("无法加载 Yunfeng 本地环境文件，请检查文件路径与权限");
}
