import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "");

export const apiBaseUrl = configuredUrl || null;
const authPlugins = Platform.OS === "web"
  ? []
  : [expoClient({
    scheme: "marcia-demo",
    storagePrefix: "marcia-auth",
    storage: SecureStore,
  })];

export const authClient = createAuthClient({
  // This fallback is never contacted: auth requests are disabled when the
  // public API URL is missing, and the UI explains that state to the user.
  baseURL: apiBaseUrl ?? "http://127.0.0.1:8787",
  fetchOptions: { credentials: Platform.OS === "web" ? "include" : "omit" },
  plugins: authPlugins,
});

export type AuthSession = typeof authClient.$Infer.Session;
