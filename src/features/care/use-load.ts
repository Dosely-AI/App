import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { CareError } from '@/lib/care/care-client';

/**
 * Load data whenever the screen comes into focus (so returning from a detail
 * screen shows fresh state), with loading and error handled in one place.
 */
export function useLoad<T>(load: () => Promise<T>, deps: readonly unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(async () => {
    const mine = ++generation.current;
    setLoading(true);
    try {
      const value = await load();
      if (mine === generation.current) {
        setData(value);
        setError(null);
      }
    } catch (err) {
      if (mine === generation.current) setError(errorMessage(err));
    } finally {
      if (mine === generation.current) setLoading(false);
    }
  }, deps);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { data, error, loading, reload, setData };
}

export function errorMessage(err: unknown): string {
  if (err instanceof CareError) return err.message;
  return 'Something went wrong. Please try again.';
}
