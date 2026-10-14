// POST 返回的 SSE 可能在任意 UTF-8 字节、行或事件中间分块。
export async function consumeMessageStream(response, onEvent) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `发送失败（${response.status}）`);
  }
  if (!response.body) throw new Error("浏览器未收到回复流");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r/g, "");
      let end;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        const lines = block.split("\n");
        const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
        if (!event) continue;
        const data = JSON.parse(lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n"));
        if (event === "error") throw new Error(data.error || "回复失败");
        onEvent(event, data);
        if (event === "done") return;
      }
      if (done) throw new Error("回复连接提前结束，结果尚未确认");
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
