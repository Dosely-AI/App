import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthGate } from '@/features/auth/auth-gate';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useReminders } from '@/hooks/use-reminders';
import { useTheme } from '@/hooks/use-theme';
import { useSync } from '@/lib/sync/use-sync';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = useTheme();
  useReminders();
  useSync();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AuthGate>
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: theme.background },
                headerTitleStyle: { color: theme.text },
                headerTintColor: theme.tint,
                headerShadowVisible: false,
                contentStyle: { backgroundColor: theme.background },
              }}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="medication/new" options={{ title: 'Add medication' }} />
              <Stack.Screen name="medication/scan" options={{ title: 'Scan medication' }} />
              <Stack.Screen name="medication/[id]" options={{ title: 'Medication' }} />
              <Stack.Screen name="journal" options={{ title: 'How you feel' }} />
              <Stack.Screen name="emergency" options={{ title: 'Emergency card' }} />
              <Stack.Screen name="visit-summary" options={{ title: 'Visit summary' }} />
              <Stack.Screen name="interactions" options={{ title: 'Interactions' }} />
            </Stack>
          </AuthGate>
          <StatusBar style="auto" />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
