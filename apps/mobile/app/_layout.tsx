import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/auth";
import { DemoProvider } from "@/demo";
import { WorkDataProvider } from "@/work-api";
import { colors } from "@/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <DemoProvider>
          <WorkDataProvider>
            <StatusBar style="dark" />
            <RouteProtection>
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="login" />
                <Stack.Screen name="setup" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="revisao" />
              </Stack>
            </RouteProtection>
          </WorkDataProvider>
        </DemoProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function RouteProtection({ children }: React.PropsWithChildren) {
  const router = useRouter();
  const segments = useSegments();
  const { checkingSession, session, demoMode } = useAuth();
  const privateRoute = segments[0] === "(tabs)" || segments[0] === "revisao";

  useEffect(() => {
    if (segments[0] === "revisao" && !checkingSession && session && !demoMode) { router.replace("/(tabs)"); return; }
    if (privateRoute && !checkingSession && !session && !demoMode) router.replace("/");
  }, [checkingSession, demoMode, privateRoute, router, segments, session]);

  if (privateRoute && (checkingSession || (!session && !demoMode))) return null;
  return children;
}
