import { ExternalLink } from "lucide-react";
import { useApi } from "../../api.js";
import { Card, Loadable, PageHeader, PendingButton } from "../../ui/components.jsx";

// 第一版只放跳转入口；链接存在 settings.brand_base_url（T07 提供配置界面）。
export default function BrandPage() {
  const state = useApi("/api/settings");
  return (
    <>
      <PageHeader title="品牌策略" subtitle="品牌数据、品牌物料与内容宣发记录" />
      <Loadable state={state}>
        {(settings) => (
          <Card title="品牌记录表（飞书多维表格）">
            {settings.brand_base_url ? (
              <a className="btn btn-primary" href={settings.brand_base_url} target="_blank" rel="noreferrer">
                <ExternalLink size={14} /> 在飞书打开
              </a>
            ) : (
              <div className="row">
                <p className="muted">还没有配置链接。</p>
                <PendingButton task="T07">配置链接</PendingButton>
              </div>
            )}
          </Card>
        )}
      </Loadable>
    </>
  );
}
