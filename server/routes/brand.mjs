import { route, respond } from '../http.mjs';
import { createBrandService } from '../brand.mjs';

// 品牌数据：只读飞书品牌多维表格的版本表（见 server/brand.mjs）。
export function routes(db, options = {}) {
  const brand = createBrandService(db, options);
  return [
    route('GET', '/api/v3/brand', respond(() => brand.list())),
    route('POST', '/api/v3/brand/refresh', respond(() => brand.list({ refresh: true }))),
  ];
}
