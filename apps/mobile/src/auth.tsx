import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { apiBaseUrl, authClient, type AuthSession } from "@/auth-client";
import { setupFailureMessage, setupTransportFailureMessage } from "@/setup-errors";

type AuthContextValue = {
  apiConfigured: boolean;
  connectionIssue: boolean;
  serviceMaintenance: boolean;
  checkServiceStatus: () => Promise<boolean>;
  checkingSession: boolean;
  session: AuthSession | null;
  demoMode: boolean;
  enterDemo: () => void;
  exitDemo: () => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null; twoFactorRequired: boolean }>;
  verifySecondFactor: (code: string, method: "totp" | "backup") => Promise<string | null>;
  requestPasswordReset: (email: string, redirectTo: string) => Promise<string | null>;
  resetPassword: (token: string, newPassword: string) => Promise<string | null>;
  setupOwner: (input: { name: string; email: string; password: string; setupToken: string }) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const maintenanceMessage = "O sistema do escritório está em manutenção temporária. Nenhuma operação nova foi aceita; quando voltar, confira ações iniciadas pouco antes.";

function requiresTwoFactor(data: unknown) {
  return Boolean(data && typeof data === "object" && "twoFactorRedirect" in data && data.twoFactorRedirect === true);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [demoMode, setDemoMode] = useState(false);
  const [serviceMaintenance, setServiceMaintenance] = useState(false);
  const serviceMaintenanceRef = useRef(false);
  const checkServiceStatus = useCallback(async () => {
    if (!apiBaseUrl) return false;
    try {
      const response = await fetch(`${apiBaseUrl}/health`, { headers: { Accept: "application/json" } });
      if (!response.ok) return serviceMaintenanceRef.current;
      const status = await response.json() as { maintenanceMode?: unknown };
      const paused = status.maintenanceMode === true;
      serviceMaintenanceRef.current = paused;
      setServiceMaintenance(paused);
      return paused;
    } catch {
      // Keep the last known mode; a failed health request is not proof the pause ended.
      return serviceMaintenanceRef.current;
    }
  }, []);
  useEffect(() => {
    let active = true;
    if (!apiBaseUrl) return () => { active = false; };
    void fetch(`${apiBaseUrl}/health`, { headers: { Accept: "application/json" } })
      .then(async (response) => response.ok ? await response.json() as { maintenanceMode?: unknown } : null)
      .then((status) => {
        if (!active || !status) return;
        const paused = status.maintenanceMode === true;
        serviceMaintenanceRef.current = paused;
        setServiceMaintenance(paused);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  return (
    <AuthContext.Provider value={{
      apiConfigured: Boolean(apiBaseUrl),
      connectionIssue: false,
      serviceMaintenance,
      checkServiceStatus,
      checkingSession: false,
      session: null,
      demoMode,
      enterDemo: () => setDemoMode(true),
      exitDemo: () => setDemoMode(false),
      signIn: async () => ({ error: "Configure a API para entrar com sua conta.", twoFactorRequired: false }),
      verifySecondFactor: async () => "Configure a API para confirmar o código.",
      requestPasswordReset: async () => "Configure a API para recuperar a conta.",
      resetPassword: async () => "Configure a API para trocar a senha.",
      setupOwner: async () => "Configure a API para fazer a primeira configuração.",
      signOut: async () => undefined,
    }}>
      {apiBaseUrl ? <ConnectedAuth>{children}</ConnectedAuth> : children}
    </AuthContext.Provider>
  );
}

function ConnectedAuth({ children }: PropsWithChildren) {
  const { data, isPending, error, refetch } = authClient.useSession();
  const parent = useContext(AuthContext);
  if (!parent) throw new Error("ConnectedAuth precisa de AuthProvider");

  async function confirmSession() {
    await refetch({ query: { disableCookieCache: true } });
    const current = authClient.$store.atoms.session.get();
    return Boolean(!current.error && current.data?.session && current.data?.user);
  }

  const missingSession = "O acesso foi aceito, mas a sessão não foi confirmada. Confira se o endereço do app e o da API usam o mesmo host e tente novamente.";
  const value: AuthContextValue = {
    ...parent,
    connectionIssue: Boolean(error),
    checkingSession: isPending,
    session: data,
    signIn: async (email, password) => {
      try {
        const result = await authClient.signIn.email({ email: email.trim(), password });
        if (result.error) {
          const maintenance = await parent.checkServiceStatus();
          return { error: maintenance ? maintenanceMessage : "Não foi possível entrar. Confira o e-mail e a senha e tente novamente.", twoFactorRequired: false };
        }
        if (requiresTwoFactor(result.data)) return { error: null, twoFactorRequired: true };
        return { error: await confirmSession() ? null : missingSession, twoFactorRequired: false };
      } catch {
        const maintenance = await parent.checkServiceStatus();
        return { error: maintenance ? maintenanceMessage : "Não foi possível conectar à API. Verifique a conexão e tente novamente.", twoFactorRequired: false };
      }
    },
    verifySecondFactor: async (code, method) => {
      try {
        const result = method === "totp"
          ? await authClient.twoFactor.verifyTotp({ code: code.trim() })
          : await authClient.twoFactor.verifyBackupCode({ code: code.trim() });
        if (result.error) {
          return await parent.checkServiceStatus()
            ? maintenanceMessage
            : "Código não aceito. Confira e tente novamente; códigos de recuperação só podem ser usados uma vez.";
        }
        return await confirmSession() ? null : missingSession;
      } catch {
        return await parent.checkServiceStatus()
          ? maintenanceMessage
          : "Não foi possível confirmar o código. Verifique a conexão e tente novamente.";
      }
    },
    requestPasswordReset: async (email, redirectTo) => {
      try {
        const result = await authClient.requestPasswordReset({ email: email.trim(), redirectTo });
        if (result.error) {
          return await parent.checkServiceStatus()
            ? maintenanceMessage
            : "Não foi possível solicitar a redefinição. Tente mais tarde ou fale com a pessoa administradora.";
        }
        return null;
      } catch {
        return await parent.checkServiceStatus()
          ? maintenanceMessage
          : "Não foi possível conectar à API. Verifique a conexão e tente novamente.";
      }
    },
    resetPassword: async (token, newPassword) => {
      try {
        const result = await authClient.resetPassword({ token, newPassword });
        if (result.error) {
          return await parent.checkServiceStatus()
            ? maintenanceMessage
            : "Este link expirou ou já foi usado. Solicite outro link de redefinição.";
        }
        // Resetting a password revokes server sessions. Refresh the local
        // Better Auth session before the screen redirects to login, otherwise
        // a stale in-memory session can send the user back into the workspace.
        await refetch({ query: { disableCookieCache: true } });
        return null;
      } catch {
        return await parent.checkServiceStatus()
          ? maintenanceMessage
          : "Não foi possível trocar a senha. Verifique a conexão e tente novamente.";
      }
    },
    setupOwner: async ({ name, email, password, setupToken }) => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/setup/owner`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: name.trim(), email: email.trim(), password, setupToken }),
        });
        if (!response.ok) {
          const body = await response.clone().json().catch(() => null) as { error?: unknown } | null;
          const serviceMaintenance = response.status === 503 ? await parent.checkServiceStatus() : false;
          return setupFailureMessage(response.status, body?.error, response.headers.get("Retry-After"), serviceMaintenance);
        }

        const signInResult = await authClient.signIn.email({ email: email.trim(), password });
        if (signInResult.error || requiresTwoFactor(signInResult.data) || !await confirmSession()) {
          return "Conta criada. Abra a tela Entrar e use o e-mail e a senha que acabou de cadastrar.";
        }
        return null;
      } catch {
        return setupTransportFailureMessage(await parent.checkServiceStatus());
      }
    },
    signOut: async () => {
      try {
        await authClient.signOut();
      } catch {
        // Keep local navigation available even when the API is offline.
      }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth precisa de AuthProvider");
  return context;
}
