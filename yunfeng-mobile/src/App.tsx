import { useMemo, useState } from "react";
import ChatView from "@/components/ChatView";
import { createSidecarClient } from "@/lib/client";
import HomeView from "@/components/HomeView";
import SessionsView from "@/components/SessionsView";
import SettingsView from "@/components/SettingsView";
import TabBar from "@/components/TabBar";

export type Tab = "home" | "sessions" | "settings";

export type ActiveChat = { id: string | null; title: string };

export default function App() {
  const client = useMemo(() => createSidecarClient(), []);
  const [tab, setTab] = useState<Tab>("home");
  const [chat, setChat] = useState<ActiveChat | null>(null);

  function openSession(id: string | null, title: string) {
    setChat({ id, title });
  }

  if (chat) {
    return (
      <div className="mx-auto h-dvh max-w-[430px] bg-background text-foreground">
        <ChatView id={chat.id} title={chat.title} onBack={() => setChat(null)} client={client} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-dvh max-w-[430px] flex-col bg-background text-foreground">
      <main className="no-scrollbar flex-1 overflow-y-auto">
        {tab === "home" && <HomeView onOpenSession={openSession} />}
        {tab === "sessions" && <SessionsView onOpenSession={openSession} />}
        {tab === "settings" && <SettingsView />}
      </main>
      <TabBar tab={tab} onChange={setTab} />
    </div>
  );
}
