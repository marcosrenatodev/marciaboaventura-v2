import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  if (process.env.MARCIA_E2E_LOCAL_HTTP !== "1") return config as ExpoConfig;

  return {
    ...config,
    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios?.infoPlist,
        NSAppTransportSecurity: {
          ...(config.ios?.infoPlist?.NSAppTransportSecurity as Record<string, unknown> | undefined),
          // Local HTTP is permitted only in CI's simulator build. Production uses HTTPS.
          NSAllowsLocalNetworking: true,
        },
      },
    },
  };
};
