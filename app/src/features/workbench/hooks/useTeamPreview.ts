/* 团队交互状态仅驻留前端，不请求团队网络或修改后端。
 * Created on 2026-10-13
 * @author: https://github.com/Linmoqian
 */
import { useState } from "react";
export function useTeamPreview() {
  const [team, setTeam] = useState<{ name: string; owner: string; members: string[] } | null>(null);
  const [running, setRunning] = useState(false);
  const [messages, setMessages] = useState<{ id: string; name: string; text: string }[]>([]);
  const [notice, setNotice] = useState("");
  const [board, setBoard] = useState("");
  const [links, setLinks] = useState<{ title: string; url: string }[]>([]);
  const [files, setFiles] = useState<{ name: string; size: number }[]>([]);
  return { team, setTeam, running, setRunning, messages, setMessages, notice, setNotice, board, setBoard, links, setLinks, files, setFiles };
}
export type TeamPreview = ReturnType<typeof useTeamPreview>;
