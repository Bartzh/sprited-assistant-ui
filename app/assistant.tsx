"use client";

import { useState, useEffect, useRef } from "react";
import {
  useExternalStoreRuntime,
  ThreadMessageLike,
  AppendMessage,
  AssistantRuntimeProvider,
  ExternalStoreThreadListAdapter,
  ExternalStoreThreadData,
} from "@assistant-ui/react";
import { Thread } from "@/components/assistant-ui/thread";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Input } from "@/components/ui/input";
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { parse } from "path";
class RetriableError extends Error { }
class FatalError extends Error { }

export function Assistant() {
  const [ currentThreadId, setCurrentThreadId ] = useState<string>("");
  const currentThreadIdRef = useRef<string>(currentThreadId); // 使用ref来获取最新的值
  const first_message_ref = useRef<boolean>(true);
  const last_message_id_ref = useRef<string>("");
  const [threads, setThreads] = useState<Map<string, ThreadMessageLike[]>>(
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

  // Get messages for current thread
  const currentMessages = threads.get(currentThreadId) || [];

  const fetchInitialMessages = async (threadId: string) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const init_response = await fetch("/api/init", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          "agent_id": threadId
        }),
      });

      if (!init_response.ok) {
        throw new Error(`HTTP error! status: ${init_response.status}`);
      }

      const init_data = await init_response.json();

      // 过滤并转换合法的消息
      const parsedMessages: ThreadMessageLike[] = (init_data.messages || [])
        .filter((msg: any) =>
          ['ai', 'human'].includes(msg.role)
        )
        .map((msg: { role: string; content: string; id: string; name: string | null }) => ({
          role: msg.role === "ai" ? "assistant" : "user",
          content: msg.content,
          id: msg.id,
          name: msg.name || undefined,
        }));

      setThreads(prev => {
        const next = new Map(prev);
        next.set(currentThreadId, parsedMessages);
        return next;
      });

    } catch (error) {
      console.error("Initialization Error: ", error);
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
          t.threadId === threadId ? { ...t, title: newTitle } : t
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
    // 使用 useEffect 来加载初始消息
    useEffect(() => {
      const fetchInitialThreads = async () => {
        const token = localStorage.getItem("token");
        if (!token) return;

        try {
          const init_response = await fetch("/api/get_accessible_agents", {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${token}`,
            }
          });

          if (!init_response.ok) {
            throw new Error(`HTTP error! status: ${init_response.status}`);
          }

          const init_data = await init_response.json();

          // 将后端返回的 thread_id 列表转换为 threads Map 结构，每个 thread_id 对应一个空数组
          const newThreads = new Map<string, ThreadMessageLike[]>();
          const newTHreadsList: ExternalStoreThreadData<"regular">[] = [];
          init_data.accessible_agents.forEach((threadId: string) => {
            newThreads.set(threadId, []);
            newTHreadsList.push({
              "threadId": threadId,
              "status": "regular",
              "title": threadId,
            });
          });

          // 更新 threads 状态
          setThreadList(newTHreadsList);
          //setThreads(newThreads);
          // 设置当前线程 ID 为最后一个可访问线程（如果存在）
          if (init_data.accessible_agents.length > 0) {
            setCurrentThreadId(init_data.accessible_agents[0]);
            //await fetchInitialMessages(init_data.accessible_agents[0]);
          }
        }
        catch (error) {
          console.error("Initialization Error: ", error);
        }
      }
      setUserName(localStorage.getItem("user_name") ?? "");
      fetchInitialThreads();
      const fetchSSE = async () => {
        let token = localStorage.getItem("token");
        if (!token) return;
        let first_message = true;
        //let buffer = '';
        let last_id = '';
        await fetchEventSource('/api/sse', {
          openWhenHidden: true,
          method: 'GET',
          headers: {
            "Authorization": `Bearer ${token}`,
            "Accept": "text/event-stream",
            "Cache-Control": "no-cache"
          },
          async onopen(response) {
            if (response.status === 401) {
              token = localStorage.getItem("token");
            }
          },
          onmessage(event) {
            if (event.event !== "message") {
              return;
            }
            const chunk = event.data;
            // 在页面上显示消息
            //buffer += chunk;
            console.debug(chunk)
            //const lines = buffer.split('\n');
            if (chunk.trim()) {
              try {
                const parsedChunk = JSON.parse(chunk);
                //buffer = '';
                if (parsedChunk?.id !== undefined && parsedChunk?.id !== last_message_id_ref.current) {
                  last_message_id_ref.current = parsedChunk?.id;
                  first_message_ref.current = true;
                }
                if (parsedChunk.agent_id === currentThreadIdRef.current && (parsedChunk.name === "send_message" || parsedChunk.name === "log")) {
                  setThreads(prev => {
                    const next = new Map(prev);
                    const current = next.get(currentThreadIdRef.current) || [];

                    // 如果是新的助手消息
                    if (first_message_ref.current) {
                      //first_message_ref.current = false;
                      return new Map(prev).set(currentThreadIdRef.current, [
                        ...current,
                        {
                          role: "assistant",
                          content: parsedChunk.args.content
                        }
                      ]);
                    }
                    else {
                      // 只更新最后一条 role 为 assistant 的消息
                      const lastAssistantMessageIndex = current.map((msg, index) => ({ msg, index }))
                        .filter(({ msg }) => msg.role === "assistant")
                        .pop()?.index;

                      if (lastAssistantMessageIndex !== undefined) {
                        const updatedCurrent = [...current];
                        updatedCurrent[lastAssistantMessageIndex] = {
                          ...updatedCurrent[lastAssistantMessageIndex],
                          content: parsedChunk.args.content
                        };
                        return new Map(prev).set(currentThreadIdRef.current, updatedCurrent);
                      }

                      else {
                        // 如果没有找到 assistant 消息，则添加新消息
                        return new Map(prev).set(currentThreadIdRef.current, [
                          ...current,
                          {
                            role: "assistant",
                            content: parsedChunk.args.content
                          }
                        ]);
                      }
                    }
                  });
                  if (first_message_ref.current) {
                    first_message_ref.current = false;
                  }
                  if (!(parsedChunk.not_completed ?? false)) {
                    first_message_ref.current = true;
                  }
                }
              } catch (e) {
                //buffer = line;
                console.warn('onmessage error: ', e);
                //continue;
              }
            }
          },
          onclose() {
            console.log('SSE connection closed');
            // 正常关闭连接，等待一段时间后重连
            setTimeout(() => {
              throw new RetriableError();
            }, 3000);
          },
          onerror(err) {
            console.error('SSE error:', err);
          }
        });
      }
      fetchSSE();
    }, []); // 空依赖数组表示只在组件挂载时运行一次

    // 新增useEffect监听currentThreadId变化
    useEffect(() => {
      /*if (currentThreadId && !threads.has(currentThreadId)) {
        fetchInitialMessages(currentThreadId);
      }*/
      if (currentThreadId) {
        fetchInitialMessages(currentThreadId);
      }
    }, [currentThreadId]);

  const onNew = async (message: AppendMessage) => {
    const token = localStorage.getItem("token");
    if (!token) return;
    // Add user message
    const userMessage: ThreadMessageLike = {
      role: "user",
      content: message.content,
    };
    setThreads(prev => {
      const next = new Map(prev);
      const current = next.get(currentThreadId) || [];
      next.set(currentThreadId, [...current, userMessage]);
      return next;
    });

    // Generate response
    //setIsRunning(true);


    try {
      // 发送HTTP请求
      const response = await fetch("/api/input", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          "message": message.content,
          "user_name": localStorage.getItem("user_name"),
          "agent_id": currentThreadId
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    }

      // 创建一个ReadableStream来处理响应数据
      /*const reader = response.body?.getReader();

      if (!reader) {
        throw new Error('Failed to get reader from response body');
      }

      const decoder = new TextDecoder('utf-8');
      let first_message = true
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        // 将接收到的数据转换为object
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        console.debug(buffer)
        const lines = buffer.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            let parsedChunk: any;
            try {
              parsedChunk = JSON.parse(line);
              buffer = '';
            } catch (e) {
              buffer = line;
              console.warn('Failed to parse chunk as JSON, trying to use buffer:', e);
              continue;
            }

            if (parsedChunk.name === "send_message" || parsedChunk.name === "log") {
              setThreads(prev => {
                const next = new Map(prev);
                const current = next.get(currentThreadId) || [];
                const lastMessage = current[current.length - 1];
                // 如果是新的助手消息
                if (first_message) {
                  first_message = false;
                  return new Map(prev).set(currentThreadId, [
                    ...current,
                    {
                      role: "assistant",
                      content: parsedChunk.args.content
                    }
                  ]);
                }
                else {
                  return new Map(prev).set(currentThreadId, [
                    ...current.slice(0, -1),
                    {
                      ...lastMessage,
                      content: lastMessage.content + parsedChunk.args.content
                    }
                  ]);
                }
              });
              if (!(parsedChunk.not_completed ?? false)) {
                first_message = true;
              }
            }
          }
        }
      }
    } */catch (error) {
      console.error("Unexpected Error: ", error);
      const errorMessage: ThreadMessageLike = {
        role: "assistant",
        content: `Error: ${String(error)}`,
      };
      setThreads(prev => {
        const next = new Map(prev);
        const current = next.get(currentThreadId) || [];
        next.set(currentThreadId, [...current, errorMessage]);
        return next;
      });
    }/* finally {
      setIsRunning(false);
    }*/
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
      threadList: threadListAdapter
    }
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbPage>
                    BecomeHuman
                  </BreadcrumbPage>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <Input
                    placeholder="请设置用户名称"
                    value={userName}
                    //value={localStorage.getItem("user_name") ?? ""}
                    onChange={(e) => setUserName(e.target.value)}
                    //onChange={(e) => localStorage.setItem("user_name", e.target.value)}
                  />
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>
          <Thread />
        </SidebarInset>
      </SidebarProvider>
    </AssistantRuntimeProvider>
  );
}