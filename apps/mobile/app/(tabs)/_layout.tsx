import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { useTheme } from '@/components/theme-provider';

type IoniconName = keyof typeof Ionicons.glyphMap;

/** The 4 resident tabs (design bottom bar). Active tint = the PG accent. */
export default function TabsLayout() {
  const { accent } = useTheme();
  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: accent,
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { borderTopColor: '#e9ebef' },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: 'Home', tabBarIcon: icon('home-outline') }}
      />
      <Tabs.Screen
        name="rent"
        options={{ title: 'Rent', tabBarIcon: icon('wallet-outline') }}
      />
      <Tabs.Screen
        name="complaints"
        options={{
          title: 'Complaints',
          tabBarIcon: icon('chatbubble-ellipses-outline'),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: 'More', tabBarIcon: icon('grid-outline') }}
      />
    </Tabs>
  );
}

function icon(name: IoniconName) {
  return ({ color, size }: { color: string; size: number }) => (
    <Ionicons name={name} color={color} size={size} />
  );
}
