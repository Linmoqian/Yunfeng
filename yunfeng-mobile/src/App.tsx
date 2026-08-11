import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import ChatView from "@/components/ChatView";
import { createSidecarClient } from "@/lib/client";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { useSessionStore } from "@/hooks/useSessionStore";
import HomeView from "@/components/HomeView";
import SessionsView from "@/components/SessionsView";
import SettingsView from "@/components/SettingsView";
import { TaskboardView } from "@/components/TaskboardView";
import TabBar from "@/components/TabBar";

export type Tab = "home" | "taskboard" | "sessions" | "settings";

export type ActiveChat = { id: string | null; title: string };

export default function App() {
  const client = useMemo(() => createSidecarClient(), []);
  const store = useSessionStore();
  const agentPanel = useAgentStatus();
  const [tab, setTab] = useState<Tab>("home");
  const [chat, setChat] = useState<ActiveChat | null>(null);

  function openSession(id: string | null, title: string) {
    setChat({ id, title });
  }

  /** 聊天产生内容时回写会话元数据；新会话返回创建的 id。 */
  function onActivity(id: string | null, prompt: string): string | null {
    const t = prompt.trim();
    if (!t) return id;
    if (id) {
      store.touch(id, { snippet: t });
      return id;
    }
    const newId = `s-${Date.now().toString(36)}`;
    store.create({
      id: newId,
      title: t.length > 16 ? `${t.slice(0, 16)}…` : t,
      snippet: t,
    });
    return newId;
  }

  if (chat) {
    return (
      <div className="mx-auto h-dvh max-w-[430px] bg-background text-foreground">
        <ChatView
          id={chat.id}
          title={chat.title}
          onBack={() => setChat(null)}
          client={client}
          onActivity={onActivity}
          onAgentEvent={agentPanel.applyEvent}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-dvh max-w-[430px] flex-col bg-background text-foreground">
      <main className={cn("flex-1", tab === "taskboard" ? "overflow-hidden" : "no-scrollbar overflow-y-auto")}>
        {tab === "home" && (
          <HomeView
            onOpenSession={openSession}
            recent={store.active}
            agents={agentPanel.agents}
          />
        )}
        {tab === "taskboard" && <TaskboardView />}
        {tab === "sessions" && (
          <SessionsView
            store={store}
            onOpenSession={openSession}
            onNewChat={() => openSession(null, "新对话")}
          />
        )}
        {tab === "settings" && <SettingsView />}
      </main>
      <TabBar tab={tab} onChange={setTab} />
    </div>
  );
}
