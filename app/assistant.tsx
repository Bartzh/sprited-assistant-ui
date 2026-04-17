"use client";

import { Thread } from "@/components/assistant-ui/thread";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ThreadListSidebar } from "@/components/assistant-ui/threadlist-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

import { useState, useEffect, useRef } from "react";
import {
  useExternalStoreRuntime,
  ThreadMessageLike,
  AppendMessage,
  AssistantRuntimeProvider,
  ExternalStoreThreadListAdapter,
  ExternalStoreThreadData,
  AttachmentAdapter,
} from "@assistant-ui/react";
import { encode, decode } from "@msgpack/msgpack";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { nanoid } from "nanoid";

export function Assistant() {
  const [currentThreadId, setCurrentThreadId] = useState<string>("");
  const currentThreadIdRef = useRef<string>(currentThreadId);
  const firstMessageRef = useRef<boolean>(true);
  const lastMessageIdRef = useRef<string>("");
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [threads, setThreads] = useState<Map<string, readonly ThreadMessageLike[]>>(
    new Map()
  );
  const [threadList, setThreadList] = useState<ExternalStoreThreadData<"regular">[]>([]);
  //const [isRunning, setIsRunning] = useState<boolean>(false);

  const [userName, setUserName] = useState<string>("system");
  const system_regex = new RegExp("system", "i");

  // 更新ref的值当state变化时
  useEffect(() => {
    currentThreadIdRef.current = currentThreadId;
  }, [currentThreadId]);

  useEffect(() => {
    if (!system_regex.test(userName.trim())) {
      localStorage.setItem("user_name", userName.trim());
    }
  }, [userName])

  const currentMessages = threads.get(currentThreadId) || [];

  const disconnectWebSocket = () => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  };

  const startHeartbeat = () => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
    }
    heartbeatRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(encode({ type: "ping" }));
      }
    }, 30000);
  };

  const handleAuthResult = (data: { status: string; accessible_sprites?: string[]; detail?: string }) => {
    if (data.status === "success" && data.accessible_sprites) {
      const newThreads = new Map<string, ThreadMessageLike[]>();
      const newThreadsList: ExternalStoreThreadData<"regular">[] = [];
      data.accessible_sprites.forEach((threadId: string) => {
        newThreads.set(threadId, []);
        newThreadsList.push({
          id: threadId,
          status: "regular",
          title: threadId,
        });
      });
      setThreadList(newThreadsList);
      if (data.accessible_sprites.length > 0) {
        setCurrentThreadId(data.accessible_sprites[0]);
      }
    } else if (data.status === "error") {
      console.error("Auth error:", data.detail);
    }
  };

  const handleInit = (data: { sprite_id: string; messages: any[] }) => {
    if (data.sprite_id !== currentThreadIdRef.current) return;

    function base64ToImageFile(
      base64String: string, 
      fileName: string,
      mimeType: string = 'image/png'
    ): File {
      // 1. 清洗并标准化base64字符串
      const cleanBase64 = base64String
        .replace(/[\r\n\t\s]/g, '')  // 移除换行空格
        .replace(/^data:image\/\w+;base64,/, '');  // 移除data:前缀

      // 2. Base64解码
      let binaryString: string;
      try {
        binaryString = atob(cleanBase64);
      } catch (e) {
        throw new Error(`Base64解码失败: ${(e as Error).message}`);
      }

      // 3. 转换为Uint8Array
      const length = binaryString.length;
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // 4. 创建Blob对象（处理浏览器兼容性）
      let blob = new Blob([bytes], { type: mimeType });

      // 5. 确保MIME类型有效（针对Safari等浏览器）
      if (!blob.type) {
        try {
          // 尝试强制设置type属性
          Object.defineProperty(blob, 'type', {
            value: mimeType,
            writable: false,
            enumerable: true
          });
        } catch (e) {
          console.warn(`无法设置Blob.type，将依赖文件扩展名: ${(e as Error).message}`);
        }
      }

      // 6. 转换为File对象
      return new File([blob], fileName, { type: blob.type || mimeType });
    }

    const parsedMessages: ThreadMessageLike[] = (data.messages || [])
      .filter((msg: any) => ['ai', 'human'].includes(msg.role))
      .map((msg: { role: string; content: any; id: string; name: string | null }) => {
        let content: any;
        let attachments: any[] = [];

        // 处理 content 和 attachments
        if (typeof msg.content === 'string') {
          content = msg.content;
        } else if (Array.isArray(msg.content)) {
          content = [];
          for (const contentBlock of msg.content) {
            if (typeof contentBlock === 'string') {
              content.push({ type: 'text', text: contentBlock });
            } else if (contentBlock.type === 'text') {
              content.push(contentBlock);
            } else if (contentBlock.type === 'image') {
              const fileName = 'image_' + nanoid();
              const file = base64ToImageFile(contentBlock.base64, fileName, contentBlock.mime_type);
              attachments.push({
                id: nanoid(),
                type: 'image',
                name: fileName,
                file,
                content: [{
                  type: 'image',
                  image: contentBlock.base64,
                  filename: fileName,
                }],
                status: { type: "complete" },
              });
            } else if (['file', 'image', 'audio', 'video', 'text-plain'].includes(contentBlock.type)) {
              const fileName = 'file_' + nanoid();
              attachments.push({
                id: nanoid(),
                type: 'file',
                name: fileName,
                content: [{
                  type: 'file',
                  data: contentBlock.base64,
                  mimeType: contentBlock.mime_type,
                  filename: fileName,
                }],
                status: { type: "complete" },
              });
            } else if (contentBlock.type === 'reasoning') {
              content.push({'type': 'reasoning', 'text': contentBlock.reasoning});
            }
          }
        } else {
          content = msg.content;
        }

        return {
          role: msg.role === "ai" ? "assistant" : "user",
          content,
          attachments,
          id: msg.id,
          name: msg.name || undefined,
        };
      });

    setThreads(prev => {
      const next = new Map(prev);
      next.set(data.sprite_id, parsedMessages);
      return next;
    });
  };

  const handleEvent = (data: { event: any }) => {
    const event = data.event;
    if (event.id !== undefined && event.id !== lastMessageIdRef.current) {
      lastMessageIdRef.current = event.id;
      firstMessageRef.current = true;
    }

    if (event.sprite_id === currentThreadIdRef.current && (event.method === "send_message" || event.log)) {
      setThreads(prev => {
        const next = new Map(prev);
        const current = next.get(currentThreadIdRef.current) || [];
        const messageContent = event.method === "send_message" ? event.params?.content : event.log;

        if (firstMessageRef.current) {
          return new Map(prev).set(currentThreadIdRef.current, [
            ...current,
            {
              role: "assistant",
              content: messageContent
            }
          ]);
        } else {
          const lastAssistantMessageIndex = current.map((msg, index) => ({ msg, index }))
            .filter(({ msg }) => msg.role === "assistant")
            .pop()?.index;

          if (lastAssistantMessageIndex !== undefined) {
            const updatedCurrent = [...current];
            updatedCurrent[lastAssistantMessageIndex] = {
              ...updatedCurrent[lastAssistantMessageIndex],
              content: messageContent
            };
            return new Map(prev).set(currentThreadIdRef.current, updatedCurrent);
          } else {
            return new Map(prev).set(currentThreadIdRef.current, [
              ...current,
              {
                role: "assistant",
                content: messageContent
              }
            ]);
          }
        }
      });

      if (firstMessageRef.current) {
        firstMessageRef.current = false;
      }
      if (!(event.not_completed ?? false)) {
        firstMessageRef.current = true;
      }
    }
  };

  const connectWebSocket = () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;
    //const wsUrl = "/ws";

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(encode({ type: "auth", token }));
      startHeartbeat();
    };

    ws.onmessage = async (event) => {
      try {
        const arrayBuffer = await event.data.arrayBuffer();
        const data = decode(new Uint8Array(arrayBuffer)) as any;
        const msgType = data.type;

        if (msgType === "auth_result") {
          handleAuthResult(data);
        } else if (msgType === "init") {
          handleInit(data);
        } else if (msgType === "event") {
          handleEvent(data);
        } else if (msgType === "pong") {
        } else if (msgType === "error") {
          console.error("WebSocket error:", data.detail);
        }
      } catch (e) {
        console.warn("Failed to parse WebSocket message:", e);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };
  };

  const sendInit = (spriteId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(encode({ type: "init", sprite_id: spriteId }));
    }
  };

  const sendMessage = (spriteId: string, message: AppendMessage, userName: string | null) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(encode({
        type: "message",
        sprite_id: spriteId,
        content: message.content,
        attachments: message.attachments,
        user_name: userName
      }));
    }
  };

  const threadListAdapter: ExternalStoreThreadListAdapter = {
    threadId: currentThreadId,
    threads: threadList,
    //threads: threadList.filter((t) => t.status === "regular"),
    //archivedThreads: threadList.filter((t) => t.status === "archived"),
    /*onSwitchToNewThread: () => {
      const newId = `thread-${Date.now()}`;
      setThreadList((prev) => [
        ...prev,
        {
          threadId: newId,
          status: "regular",
          title: "New Chat",
        },
      ]);
      setThreads((prev) => new Map(prev).set(newId, []));
      setCurrentThreadId(newId);
    },*/
    onSwitchToThread: (threadId: string) => {
      setCurrentThreadId(threadId);
      // 确保立即触发消息加载
      //fetchInitialMessages(threadId);
    },
    onRename: (threadId: string, newTitle: string) => {
      setThreadList((prev) =>
        prev.map((t) =>
          t.id === threadId ? { ...t, title: newTitle } : t
        )
      );
    },
    /*onArchive: (threadId) => {
      setThreadList((prev) =>
        prev.map((t) =>
          t.threadId === threadId ? { ...t, status: "archived" } : t
        )
      );
    },*/
    /*onDelete: (threadId) => {
      setThreadList((prev) => prev.filter((t) => t.threadId !== threadId));
      setThreads((prev) => {
        const next = new Map(prev);
        next.delete(threadId);
        return next;
      });
      if (currentThreadId === threadId) {
        setCurrentThreadId("default");
      }
    },*/
  };
    // 使用 useEffect 来完成初始化
    useEffect(() => {
      setUserName(localStorage.getItem("user_name") ?? "");
      connectWebSocket();
      return () => {
        disconnectWebSocket();
      };
    }, []);

    useEffect(() => {
      if (currentThreadId) {
        sendInit(currentThreadId);
      }
    }, [currentThreadId]);

  const onNew = async (message: AppendMessage) => {
    console.log(message.attachments);
    console.log(message.content);
    const userMessage: ThreadMessageLike = {
      role: "user",
      content: message.content,
      attachments: message.attachments,
    };
    setThreads(prev => {
      const next = new Map(prev);
      const current = next.get(currentThreadId) || [];
      next.set(currentThreadId, [...current, userMessage]);
      return next;
    });

    sendMessage(currentThreadId, message, localStorage.getItem("user_name"));
  };


  function bytesToBase64(bytes: Uint8Array): string {
    const binString = Array.from(bytes, (byte) => 
      String.fromCodePoint(byte)
    ).join("");
    return btoa(binString);
  }
  const attachmentAdapter: AttachmentAdapter = {
    accept: "image/*,application/pdf,.txt,.md",
    async add({ file }) {
      // Upload file to your server
      console.log("add attachment", file);
      // const formData = new FormData();
      // formData.append("file", file);
      // const response = await fetch("/api/upload", {
      //   method: "POST",
      //   body: formData,
      // });
      // const { id } = await response.json();
      const type = file.type.split('/')[0];
      return {
        id: nanoid(),
        type: type === "image" ? "image" : "file",
        name: file.name,
        mime_type: file.type,
        size: file.size,
        file,
        status: { type: "requires-action", reason: "composer-send" },
      };
    },
    async remove(attachment) {
      // Remove file from server
      console.log("remove attachment", attachment);
      // await fetch(`/api/upload/${attachment.id}`, {
      //   method: "DELETE",
      // });
    },
    async send(attachment) {
      // Convert pending attachment to complete attachment when message is sent
      console.log("send attachment", attachment);
      const type = attachment.file.type.split('/')[0];
      const arrayBuffer = await attachment.file.bytes();
      return {
        ...attachment,
        status: { type: "complete" },
        // langchain content block
        content: [{ type: type, base64: bytesToBase64(arrayBuffer), mime_type: attachment.file.type, id: attachment.id }],
      // fuck type checking
      } as any;
    },
  };


  // 在runtime配置中添加额外参数到convertMessage函数
  const runtime = useExternalStoreRuntime({
    messages: currentMessages,
    setMessages: (messages) => {
      setThreads((prev) => new Map(prev).set(currentThreadId, messages));
    },
    //isRunning,
    onNew,
    convertMessage: (message) => message,
    adapters: {
      threadList: threadListAdapter,
      attachments: attachmentAdapter,
    }
  });

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.log('不支持 service worker 或 push manager');
      return;
    }

    // 请求通知权限
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('用户拒绝通知权限');
      return;
    }

    // 权限获取成功后再注册 Service Worker 和订阅
    try {
      let token = localStorage.getItem("token");
      if (!token) return;

      const appServerKeyRes = await fetch('/api/notification/key', {
        method: 'GET',
        headers: { "Authorization": `Bearer ${token}`, } 
      }).then(res => res.json());
      const appServerKey = appServerKeyRes.key;

      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('SW registered:', registration);

      // 检查现有订阅
      const existingSubscription = await registration.pushManager.getSubscription();
      if (existingSubscription) {
        // 如果已有订阅，取消订阅。防止因key变更等原因无法推送通知（可以增加对比key是否有变更的判断，不过感觉没必要）
        await existingSubscription.unsubscribe();
        console.log('先取消现有订阅');
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey,
      });

      console.log('Push subscription:', JSON.stringify(subscription));

      // 发送给后端保存
      await fetch('/api/notification/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', "Authorization": `Bearer ${token}` },
        body: JSON.stringify(subscription),
      });
    } catch (err) {
      console.error('SW or Push error:', err);
    }
  }


  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <SidebarProvider>
        <div className="flex h-dvh w-full pr-0.5">
          <ThreadListSidebar />
          <SidebarInset>
            <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
              <SidebarTrigger />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink
                      href="https://github.com/Bartzh/sprited"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      sprited
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  {/* <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbPage>
                      sprited
                    </BreadcrumbPage>
                  </BreadcrumbItem> */}
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem>
                    <Input
                      placeholder="你的名字"
                      value={userName}
                      //value={localStorage.getItem("user_name") ?? ""}
                      onChange={(e) => setUserName(e.target.value)}
                      //onChange={(e) => localStorage.setItem("user_name", e.target.value)}
                    />
                  </BreadcrumbItem>
                  <BreadcrumbItem>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={registerServiceWorker}
                    >
                      <Bell className="h-4 w-4" />
                      <span className="sr-only">开启通知</span>
                    </Button>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </header>
            <div className="flex-1 overflow-hidden">
              <Thread />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </AssistantRuntimeProvider>
  );
}
