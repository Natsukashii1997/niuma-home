import { route } from '../http.mjs';
import { handleV3 } from './user.mjs';
import { createBrandService } from '../brand.mjs';

// 品牌数据：只读飞书品牌多维表格的版本表（见 server/brand.mjs）。
export function routes(db, options = {}) {
  const brand = createBrandService(db, options);
  return [
    route('GET', '/api/v3/brand', handleV3(() => brand.list())),
    route('POST', '/api/v3/brand/refresh', handleV3(() => brand.list({ refresh: true }))),
  ];
}
