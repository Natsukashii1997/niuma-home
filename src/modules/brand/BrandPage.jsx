import { PixelIcon } from "../../ui/bitmap.jsx";
import { useApi } from "../../api.js";
import { Card, Loadable, PageHeader, Placeholder } from "../../ui/components.jsx";
import { href } from "../../router.js";

// 第一版只放跳转入口；链接存在 settings.brand_base_url（T07 提供配置界面）。
export default function BrandPage() {
  const state = useApi("/api/settings");
  return (
    <>
      <PageHeader title="品牌" subtitle="品牌策略：品牌数据、品牌物料与内容宣发记录" />
      <Loadable state={state} name="设置">
        {(settings) => (
          <Card dither title="品牌记录表（飞书多维表格）">
            {settings.brand_base_url ? (
              <a className="btn btn-primary" href={settings.brand_base_url} target="_blank" rel="noreferrer">
                <PixelIcon name="external" size={14} /> 在飞书打开
              </a>
            ) : (
              <Placeholder icon="brand" title="还没有配置品牌记录表" action={<a className="btn" href={href("settings")}>去设置里配置</a>}>
                在设置页填入飞书多维表格链接后，这里直接跳转。
              </Placeholder>
            )}
          </Card>
        )}
      </Loadable>
    </>
  );
}
