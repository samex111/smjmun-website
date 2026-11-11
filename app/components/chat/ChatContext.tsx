"use client";

import React, { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { ChatMessage, ChatState } from "./types";

interface ChatContextValue extends ChatState {
  toggleChat: () => void;
  sendMessage: (content: string) => Promise<void>;
  resetChat: () => void;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export function ChatProvider({
  children,
  initialSuggestedQuestions = [],
  greetingMessage = "Hello! I am Tejas AI. How can I help you today?",
}: {
  children: ReactNode;
  initialSuggestedQuestions?: string[];
  greetingMessage?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId] = useState(() => Math.random().toString(36).substring(2, 15) + Date.now().toString(36));
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "initial-greeting",
      role: "assistant",
      content: greetingMessage,
      timestamp: new Date().toISOString(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleChat = useCallback(() => setIsOpen((prev) => !prev), []);

  const resetChat = useCallback(() => {
    setMessages([
      {
        id: "initial-greeting",
        role: "assistant",
        content: greetingMessage,
        timestamp: new Date().toISOString(),
      },
    ]);
    setError(null);
  }, [greetingMessage]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;

    const newUserMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, newUserMsg]);
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: content,
          sessionId,
          history: messages.slice(-12).map(({ role, content: messageContent }) => ({ role, content: messageContent })),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch response.");
      }

      const newAssistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.answer,
        timestamp: data.timestamp || new Date().toISOString(),
      };

      setMessages((prev) => [...prev, newAssistantMsg]);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  }, [messages, sessionId]);

  const value: ChatContextValue = {
    isOpen,
    messages,
    isLoading,
    error,
    suggestedQuestions: initialSuggestedQuestions,
    toggleChat,
    sendMessage,
    resetChat,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}
