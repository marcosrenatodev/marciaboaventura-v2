import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { Text, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { GuidedTourOverlay } from "@/GuidedTourOverlay";

const tabs = [
  { name: "index", title: "Hoje", icon: "sunny-outline" },
  { name: "processos", title: "Processos", icon: "folder-open-outline" },
  { name: "arquivos", title: "Arquivos", icon: "document-text-outline" },
  { name: "agenda", title: "Agenda", icon: "calendar-outline" },
  { name: "financeiro", title: "Financeiro", icon: "wallet-outline" },
  { name: "pesquisa", title: "Pesquisa", icon: "search-outline" },
] as const;

export default function TabLayout() {
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sidebar = width >= 1000;
  return (
    <GuidedTourOverlay>
      <Tabs screenOptions={{
      headerShown: false,
      tabBarPosition: sidebar ? "left" : "bottom",
      tabBarLabelPosition: sidebar ? "beside-icon" : "below-icon",
      tabBarActiveTintColor: colors.wine,
      tabBarInactiveTintColor: colors.muted,
      tabBarActiveBackgroundColor: colors.wineWash,
      tabBarStyle: {
        backgroundColor: colors.paper, borderColor: colors.line, borderTopWidth: sidebar ? 0 : 1, borderRightWidth: sidebar ? 1 : 0,
        shadowColor: "#542030", shadowOpacity: 0.05, shadowRadius: 10, elevation: 4,
        ...(sidebar ? { width: 210, paddingTop: insets.top + 24 } : { height: 70 + insets.bottom + Math.max(0, fontScale - 1) * 44 }),
      },
      tabBarItemStyle: { minHeight: 56, paddingVertical: 6, borderRadius: 10, marginHorizontal: sidebar ? 10 : 2, marginVertical: 2 },
    }}>
      {tabs.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{
          title: tab.title,
          tabBarAccessibilityLabel: tab.title,
          tabBarIcon: ({ color }) => <Ionicons accessible={false} name={tab.icon} size={23} color={typeof color === "string" ? color : colors.muted} />,
          tabBarLabel: ({ color, focused }) => <Text style={{ color: color ?? colors.muted, fontSize: 12, fontWeight: focused ? "700" : "500", textAlign: "center" }}>{tab.title}</Text>,
        }} />
      ))}
      </Tabs>
    </GuidedTourOverlay>
  );
}
