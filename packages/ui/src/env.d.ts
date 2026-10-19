/* 云枫跨客户端共享入口。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
declare module "*.module.css" {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
declare module "*.png" {
  const url: string;
  export default url;
}
