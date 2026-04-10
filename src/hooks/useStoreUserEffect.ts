import { useEffect, useState } from "react";
import { useMutation, useConvexAuth } from "convex/react";
import { api } from "../../convex/_generated/api";

export function useStoreUserEffect() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const storeUser = useMutation(api.users.storeUser);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    async function store() {
      try {
        const id = await storeUser({});
        setUserId(id as string);
      } catch (error) {
        console.error("Failed to store user:", error);
      }
    }

    store();
    return () => setUserId(null);
  }, [isAuthenticated, storeUser]);

  return {
    isLoading: isLoading || (isAuthenticated && userId === null),
    isAuthenticated: isAuthenticated && userId !== null,
  };
}