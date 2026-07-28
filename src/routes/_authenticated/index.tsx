import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChefHat, Send, SlidersHorizontal, LogOut, Loader2, MessageSquarePlus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getMessages, clearMessages } from "@/lib/household.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { HouseholdSheet } from "@/components/HouseholdSheet";
import { PendingActionCard } from "@/components/PendingActionCard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/")({
  component: ChatApp,
});

const SUGGESTIONS = [
  "My child has a fever — what should I get?",
  "Guests arriving in 30 minutes!",
  "We need groceries for the weekend",
  "Plan a simple veg dinner for tonight",
];

function ChatApp() {
  const navigate = useNavigate();
  const fetchMessages = useServerFn(getMessages);
  const clearMessagesFn = useServerFn(clearMessages);
  const queryClient = useQueryClient();
  const [profileOpen, setProfileOpen] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: savedMessages, isLoading: loadingHistory } = useQuery({
    queryKey: ["messages"],
    queryFn: () => fetchMessages(),
  });

  const initialMessages = useMemo<UIMessage[]>(
    () =>
      (savedMessages ?? [])
        .filter((m) => m.client_id)
        .map((m) => ({
          id: m.client_id as string,
          role: m.role as UIMessage["role"],
          parts: (m.parts as UIMessage["parts"]) ?? [],
        })),
    [savedMessages],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: async (): Promise<Record<string, string>> => {
          const { data } = await supabase.auth.getSession();
          return data.session
            ? { Authorization: `Bearer ${data.session.access_token}` }
            : {};
        },
      }),
    [],
  );

  const { messages, sendMessage, setMessages, status } = useChat({
    transport,
    onError: () => {},
  });

  useEffect(() => {
    if (initialMessages.length) setMessages(initialMessages);
  }, [initialMessages, setMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const busy = status === "submitted" || status === "streaming";

  const submit = (text: string) => {
    const value = text.trim();
    if (!value || busy) return;
    sendMessage({ text: value });
    setInput("");
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const handleNewChat = async () => {
    await clearMessagesFn();
    setMessages([]);
    await queryClient.invalidateQueries({ queryKey: ["messages"] });
    setConfirmClearOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const isEmpty = messages.length === 0 && !loadingHistory;

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border bg-card/80 px-4 py-3 backdrop-blur">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <ChefHat className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold text-foreground">Chief of Staff</h1>
          <p className="truncate text-xs text-muted-foreground">Your household concierge</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmClearOpen(true)}
            disabled={messages.length === 0 || busy}
            title="Start a new chat"
          >
            <MessageSquarePlus className="mr-1.5 h-4 w-4" /> New
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setProfileOpen(true)}>
            <SlidersHorizontal className="mr-1.5 h-4 w-4" /> Household
          </Button>
          <Button variant="ghost" size="icon" onClick={signOut} title="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
          {isEmpty && (
            <div className="flex flex-col items-center pt-10 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ChefHat className="h-8 w-8" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-foreground">
                One message to run your household
              </h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Describe a situation. I'll prepare a cart based on your family's preferences — you
                approve before anything is ordered.
              </p>
              <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => submit(s)}
                    className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm text-foreground transition-colors hover:border-primary hover:bg-secondary"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {status === "submitted" && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 rounded-2xl bg-card px-4 py-3 shadow-sm">
                <Dot /> <Dot /> <Dot />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-card/80 px-4 py-3 backdrop-blur">
        <form
          className="mx-auto flex w-full max-w-2xl items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
        >
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
            placeholder="Describe what your household needs…"
            rows={1}
            className="max-h-32 min-h-[44px] resize-none bg-background"
          />
          <Button type="submit" size="icon" className="h-11 w-11 shrink-0" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>

      <HouseholdSheet open={profileOpen} onOpenChange={setProfileOpen} />

      <AlertDialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears the current conversation so the assistant starts fresh. Your household
              preferences and past orders are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleNewChat}>Start new chat</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div className={isUser ? "max-w-[85%] space-y-2" : "max-w-[90%] space-y-2"}>
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            if (!part.text) return null;
            return (
              <div
                key={i}
                className={
                  "whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm shadow-sm " +
                  (isUser
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-card-foreground")
                }
              >
                {part.text}
              </div>
            );
          }
          if (part.type === "tool-draft_cart") {
            const output = (part as { output?: { pendingActionId?: string } }).output;
            if (output?.pendingActionId) {
              return <PendingActionCard key={i} pendingActionId={output.pendingActionId} />;
            }
            return (
              <div
                key={i}
                className="flex items-center gap-2 rounded-xl bg-card px-4 py-2.5 text-sm text-muted-foreground shadow-sm"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing your cart…
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

function Dot() {
  return <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60" />;
}