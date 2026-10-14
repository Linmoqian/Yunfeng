/* 写作右栏内容通过共享工作台插槽展示。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { PaperOperations } from "./PaperOperations";
import styles from "./PaperWriting.module.css";
export function PaperMaterials() {
  return <aside className={styles.sidebar} aria-label="图文素材"><PaperOperations /></aside>;
}
