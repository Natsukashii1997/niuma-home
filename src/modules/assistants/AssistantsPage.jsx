import { Plus, Download, Send } from "lucide-react";
import { useApi } from "../../api.js";
import { href } from "../../router.js";
import { Loadable, PageHeader, PendingButton, SampleBadge, Tag } from "../../ui/components.jsx";
import { sampleMessages } from "../../samples.js";

const KIND_LABEL = { copywriter: "文案", imported: "Codex 导入", custom: "自建" };

// 路由：assistants | assistants/<id>
export default function AssistantsPage({ route }) {
  const [selectedId] = route;
  const state = useApi("/api/assistants");
  return (
    <>
      <PageHeader
        title="助手"
        subtitle="背后接本机 Codex，使用你的 Codex 额度；所有助手只读，不改文件、不执行命令"
        actions={
          <>
            <PendingButton task="T04"><Download size={14} /> 导入 Codex 会话</PendingButton>
            <PendingButton task="T04" variant="primary"><Plus size={14} /> 新建助手</PendingButton>
          </>
        }
      />
      <Loadable state={state}>
        {(list) => {
          const current = list.find((a) => String(a.id) === selectedId) || list[0];
          return (
            <div className="chat-layout">
              <aside className="chat-list">
                {list.map((a) => (
                  <a key={a.id} href={href("assistants", String(a.id))} className={a === current ? "active" : ""}>
                    <strong>{a.name}</strong>
                    <Tag>{KIND_LABEL[a.kind]}</Tag>
                  </a>
                ))}
              </aside>
              {current && <Conversation assistant={current} />}
            </div>
          );
        }}
      </Loadable>
    </>
  );
}

function Conversation({ assistant }) {
  const state = useApi(`/api/assistants/${assistant.id}/messages`, sampleMessages);
  return (
    <section className="chat-panel">
      <header className="chat-head">
        <strong>{assistant.name}</strong>
        {state.isSample && <SampleBadge task={state.task} />}
      </header>
      <div className="chat-messages">
        <Loadable state={state}>
          {(messages) =>
            messages.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                {m.text}
              </div>
            ))
          }
        </Loadable>
      </div>
      <footer className="chat-input">
        <textarea placeholder="接入 Codex 后可用（T04）" disabled rows={2} />
        <PendingButton task="T04" variant="primary"><Send size={14} /></PendingButton>
      </footer>
    </section>
  );
}
