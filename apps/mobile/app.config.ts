import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const plugins = config.plugins ?? [];
  const configuredPlugins = plugins.some((plugin) => plugin === "expo-sharing" || (Array.isArray(plugin) && plugin[0] === "expo-sharing"))
    ? plugins
    : [...plugins, "expo-sharing"];
  const baseConfig = { ...config, plugins: configuredPlugins };
  if (process.env.MARCIA_E2E_LOCAL_HTTP !== "1") return baseConfig as ExpoConfig;

  return {
    ...baseConfig,
    ios: {
      ...baseConfig.ios,
      infoPlist: {
        ...baseConfig.ios?.infoPlist,
        NSAppTransportSecurity: {
          ...(baseConfig.ios?.infoPlist?.NSAppTransportSecurity as Record<string, unknown> | undefined),
          // Local HTTP is permitted only in CI's simulator build. Production uses HTTPS.
          NSAllowsLocalNetworking: true,
        },
      },
    },
  };
};
