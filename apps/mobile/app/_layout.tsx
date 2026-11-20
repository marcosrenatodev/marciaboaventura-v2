import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/auth";
import { DemoProvider } from "@/demo";
import { WorkDataProvider } from "@/work-api";
import { WorkspaceSearchNavigationProvider } from "@/WorkspaceSearchNavigation";
import { TourAnchorProvider } from "@/TourAnchors";
import { colors } from "@/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <DemoProvider>
          <TourAnchorProvider>
            <WorkDataProvider>
              <WorkspaceSearchNavigationProvider>
                <StatusBar style="dark" />
                <RouteProtection>
                  <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="login" />
                    <Stack.Screen name="setup" />
                    <Stack.Screen name="forgot-password" />
                    <Stack.Screen name="reset-password" />
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="seguranca" />
                    <Stack.Screen name="revisao" />
                    <Stack.Screen name="conteudo" />
                  </Stack>
                </RouteProtection>
              </WorkspaceSearchNavigationProvider>
            </WorkDataProvider>
          </TourAnchorProvider>
        </DemoProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function RouteProtection({ children }: React.PropsWithChildren) {
  const router = useRouter();
  const segments = useSegments();
  const { checkingSession, session, demoMode } = useAuth();
  const firstSegment = segments[0] as string | undefined;
  const privateRoute = firstSegment === "(tabs)" || firstSegment === "seguranca" || firstSegment === "revisao" || firstSegment === "conteudo";

  useEffect(() => {
    if (segments[0] === "revisao" && !checkingSession && session && !demoMode) { router.replace("/(tabs)"); return; }
    if (privateRoute && !checkingSession && !session && !demoMode) router.replace("/");
  }, [checkingSession, demoMode, privateRoute, router, segments, session]);

  if (privateRoute && (checkingSession || (!session && !demoMode))) return null;
  return children;
}
