import { createContext, useContext, useState, type PropsWithChildren } from "react";
import { apiBaseUrl, authClient, type AuthSession } from "@/auth-client";

type AuthContextValue = {
  apiConfigured: boolean;
  connectionIssue: boolean;
  checkingSession: boolean;
  session: AuthSession | null;
  demoMode: boolean;
  enterDemo: () => void;
  exitDemo: () => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  setupOwner: (input: { name: string; email: string; password: string; setupToken: string }) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [demoMode, setDemoMode] = useState(false);

  return (
    <AuthContext.Provider value={{
      apiConfigured: Boolean(apiBaseUrl),
      connectionIssue: false,
      checkingSession: false,
      session: null,
      demoMode,
      enterDemo: () => setDemoMode(true),
      exitDemo: () => setDemoMode(false),
      signIn: async () => "Configure a API para entrar com sua conta.",
      setupOwner: async () => "Configure a API para fazer a primeira configuração.",
      signOut: async () => undefined,
    }}>
      {apiBaseUrl ? <ConnectedAuth>{children}</ConnectedAuth> : children}
    </AuthContext.Provider>
  );
}

function ConnectedAuth({ children }: PropsWithChildren) {
  const { data, isPending, error } = authClient.useSession();
  const parent = useContext(AuthContext);
  if (!parent) throw new Error("ConnectedAuth precisa de AuthProvider");

  const value: AuthContextValue = {
    ...parent,
    connectionIssue: Boolean(error),
    checkingSession: isPending,
    session: data,
    signIn: async (email, password) => {
      try {
        const result = await authClient.signIn.email({ email: email.trim(), password });
        return result.error ? "Não foi possível entrar. Confira o e-mail e a senha e tente novamente." : null;
      } catch {
        return "Não foi possível conectar à API. Verifique a conexão e tente novamente.";
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
          if (response.status === 409 || response.status === 410) return "A configuração inicial já foi concluída ou expirou. Entre com sua conta ou solicite um novo código ao administrador.";
          if (response.status === 401 || response.status === 403) return "O código de configuração não foi aceito.";
          if (response.status === 404 || response.status === 503) return "A configuração inicial ainda não está disponível nesta API.";
          return "Não foi possível concluir a configuração. Tente novamente mais tarde.";
        }

        const signInResult = await authClient.signIn.email({ email: email.trim(), password });
        if (signInResult.error) return "Conta configurada. Entre com o e-mail e a senha que acabou de criar.";
        return null;
      } catch {
        return "Não foi possível conectar à API. Confira a conexão e tente novamente.";
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
