import { useState } from "react";
import ChatView from "@/components/ChatView";
import HomeView from "@/components/HomeView";
import RemoteDesktopView from "@/components/RemoteDesktopView";
import SessionsView from "@/components/SessionsView";
import SettingsView from "@/components/SettingsView";
import TabBar from "@/components/TabBar";
import { loadConnection, saveConnection, type RemoteConnection } from "@/lib/remote";

export type Tab = "home" | "sessions" | "settings";

export type ActiveChat = { id: string | null; title: string };

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [chat, setChat] = useState<ActiveChat | null>(null);
  const [conn, setConn] = useState<RemoteConnection | null>(() => loadConnection());
  const [desktopOpen, setDesktopOpen] = useState(false);

  function onConnected(next: RemoteConnection | null) {
    setConn(next);
    saveConnection(next);
  }

  function openSession(id: string | null, title: string) {
    setChat({ id, title });
  }

  if (desktopOpen && conn) {
    return (
      <div className="mx-auto h-dvh max-w-[430px] bg-black text-foreground">
        <RemoteDesktopView conn={conn} onBack={() => setDesktopOpen(false)} />
      </div>
    );
  }

  if (chat) {
    return (
      <div className="mx-auto h-dvh max-w-[430px] bg-background text-foreground">
        <ChatView id={chat.id} title={chat.title} conn={conn} onBack={() => setChat(null)} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-dvh max-w-[430px] flex-col bg-background text-foreground">
      <main className="no-scrollbar flex-1 overflow-y-auto">
        {tab === "home" && (
          <HomeView
            onOpenSession={openSession}
            connected={conn !== null}
            onOpenDesktop={conn ? () => setDesktopOpen(true) : undefined}
          />
        )}
        {tab === "sessions" && <SessionsView onOpenSession={openSession} />}
        {tab === "settings" && (
          <SettingsView
            conn={conn}
            onConnected={onConnected}
            onOpenDesktop={conn ? () => setDesktopOpen(true) : undefined}
          />
        )}
      </main>
      <TabBar tab={tab} onChange={setTab} />
    </div>
  );
}
