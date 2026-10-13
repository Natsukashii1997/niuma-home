import { useEffect, useState } from "react";

// 路由用地址栏 #/ 后的路径，如 #/marketing/plans/2026-09/大学辅导 → ["marketing","plans","2026-09","大学辅导"]
export function useRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    addEventListener("hashchange", onChange);
    return () => removeEventListener("hashchange", onChange);
  }, []);
  return hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
}

export const href = (...parts) => `#/${parts.map(encodeURIComponent).join("/")}`;
