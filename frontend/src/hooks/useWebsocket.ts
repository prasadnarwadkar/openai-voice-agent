import { useEffect, useRef, useState } from "react";

import { Message } from "@/lib/types";
import { arrayBufferToBase64, base64ToArrayBuffer } from "@/lib/utils";

export function useWebsocket({
  url,
  onNewAudio,
  onAudioDone,
}: {
  url?: string;
  onNewAudio?: (audio: Int16Array<ArrayBuffer>) => void;
  onAudioDone?: () => void;
} = {}) {
  url =
    url ??
    process.env.NEXT_PUBLIC_WEBSOCKET_ENDPOINT ??
    "wss://prasadn74-voiceagentserver2.hf.space/ws";
  const [isReady, setIsReady] = useState(false);
  const [history, setHistory] = useState<Message[]>([]);
  const [agentName, setAgentName] = useState<string | null>(null);
  const websocket = useRef<WebSocket | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      setError("Failed to create WebSocket connection.");
      setIsReady(false);
      setIsLoading(false);
      console.error("WebSocket creation error:", err);
      return;
    }

    ws.addEventListener("open", () => {
      setIsReady(true);
      setError(null);
    });
    ws.addEventListener("close", () => {
      setIsReady(false);
    });
    ws.addEventListener("error", (event) => {
      setIsReady(false);
      setIsLoading(false);
      setError("WebSocket encountered an error.");
      console.error("Websocket error", event);
    });
    ws.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "history.updated") {
          if (data.inputs[data.inputs.length - 1]?.role !== "user") {
            setIsLoading(false);
          }
          setHistory(data.inputs);
          if (data.agent_name) {
            setAgentName(data.agent_name);
          }
        } else if (data.type === "response.audio.delta") {
          try {
            const audioData = new Int16Array(base64ToArrayBuffer(data.delta));
            if (typeof onNewAudio === "function") {
              onNewAudio(audioData);
            }
          } catch (audioErr) {
            setError("Failed to process audio data.");
            console.error("Audio processing error:", audioErr);
          }
        } else if (data.type === "audio.done") {
          if (typeof onAudioDone === "function") {
            onAudioDone();
          }
        }
      } catch (parseErr) {
        setError("Failed to parse WebSocket message.");
        console.error("WebSocket message parse error:", parseErr);
      }
    });

    websocket.current = ws;
    return () => {
      ws?.close();
    };
  }, [url, onNewAudio, onAudioDone]);

  useEffect(() => {
    return () => {
      websocket.current?.close();
    };
  }, []);

  function sendTextMessage(message: string) {
    setIsLoading(true);
    const newHistory = [
      ...history,
      {
        role: "user",
        content: message,
        type: "message",
      } as Message,
    ];
    setHistory(newHistory);
    try {
      websocket.current?.send(
        JSON.stringify({
          type: "history.update",
          inputs: newHistory,
        })
      );
      setError(null);
    } catch (err) {
      setError("Failed to send text message.");
      setIsLoading(false);
      console.error("Send text message error:", err);
    }
  }

  function resetHistory() {
    setHistory([]);
    setIsLoading(false);
    setAgentName(null);
    try {
      websocket.current?.send(
        JSON.stringify({
          type: "history.update",
          inputs: [],
          reset_agent: true,
        })
      );
      // Handle WebSocket timeout: close and attempt to reconnect
      if (websocket.current && websocket.current.readyState !== WebSocket.OPEN) {
        websocket.current.close();
        setIsReady(false);
        setIsLoading(false);
        setError("WebSocket connection timed out. Attempting to reconnect...");
        // Optionally, you can implement reconnection logic here
      }
      setError(null);
    } catch (err) {
      setError("Failed to reset history.");
      console.error("Reset history error:", err);
    }
  }

  function sendAudioMessage(audio: Int16Array<ArrayBuffer>) {
    if (!websocket.current) {
      setError("WebSocket not connected.");
      throw new Error("WebSocket not connected");
    }
    try {
      websocket.current.send(
        JSON.stringify({
          type: "history.update",
          inputs: history,
        })
      );
      websocket.current.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          delta: arrayBufferToBase64(audio.buffer),
        })
      );
      websocket.current.send(
        JSON.stringify({
          type: "input_audio_buffer.commit",
        })
      );
      setError(null);
    } catch (err) {
      setError("Failed to send audio message.");
      console.error("Send audio message error:", err);
    }
  }

  return {
    isReady,
    sendTextMessage,
    sendAudioMessage,
    history,
    resetHistory,
    agentName,
    isLoading,
    error,
  };
}
