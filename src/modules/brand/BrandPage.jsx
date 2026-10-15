import { PixelIcon } from "../../ui/bitmap.jsx";
import { useApi } from "../../api.js";
import { Card, Loadable, PageHeader } from "../../ui/components.jsx";
import { href } from "../../router.js";

// 第一版只放跳转入口；链接存在 settings.brand_base_url（T07 提供配置界面）。
export default function BrandPage() {
  const state = useApi("/api/settings");
  return (
    <>
      <PageHeader title="品牌策略" subtitle="品牌数据、品牌物料与内容宣发记录" />
      <Loadable state={state}>
        {(settings) => (
          <Card dither title="品牌记录表（飞书多维表格）">
            {settings.brand_base_url ? (
              <a className="btn btn-primary" href={settings.brand_base_url} target="_blank" rel="noreferrer">
                <PixelIcon name="external" size={14} /> 在飞书打开
              </a>
            ) : (
              <div className="row">
                <p className="muted">还没有配置链接。</p>
                <a className="btn" href={href("settings")}>配置链接</a>
              </div>
            )}
          </Card>
        )}
      </Loadable>
    </>
  );
}
