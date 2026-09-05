import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Me } from "../shared/types.ts";
import { getMe } from "./api.ts";

type MeState = { me: Me | null; loading: boolean; refresh: () => Promise<void> };

const MeContext = createContext<MeState>({ me: null, loading: true, refresh: async () => {} });

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      setMe(await getMe());
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return <MeContext.Provider value={{ me, loading, refresh }}>{children}</MeContext.Provider>;
}

export function useMe(): MeState {
  return useContext(MeContext);
}
