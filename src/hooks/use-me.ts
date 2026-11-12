import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Role = "client" | "freelancer" | "admin";

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async () => {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return null;
    const [{ data: role }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    ]);
    return { user, role: (role?.role ?? null) as Role | null, profile };
  },
});

export const useMe = () => useQuery(meQuery);
