import { Ionicons } from '@expo/vector-icons';
import {
  createMaterialTopTabNavigator,
  type MaterialTopTabBarProps,
} from '@react-navigation/material-top-tabs';
import { withLayoutContext } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme-provider';

type IoniconName = keyof typeof Ionicons.glyphMap;

/** Bottom-tab routes, in bar order, with their icon. */
const TAB_ICONS: Record<string, IoniconName> = {
  home: 'home-outline',
  rent: 'wallet-outline',
  complaints: 'chatbubble-ellipses-outline',
  more: 'grid-outline',
};

const { Navigator } = createMaterialTopTabNavigator();
/** Material Top Tabs (swipeable, pager-view backed) bound to expo-router. */
const MaterialTopTabs = withLayoutContext(Navigator);

/**
 * The 4 resident tabs. Material Top Tabs gives us finger-tracking swipe between
 * adjacent tabs; we pin the bar to the bottom and render a custom bar so it looks
 * identical to the old `expo-router` bottom-tabs bar (stacked icon + label, PG
 * accent active tint, top border).
 */
export default function TabsLayout() {
  return (
    <MaterialTopTabs
      initialRouteName="home"
      tabBarPosition="bottom"
      tabBar={(props) => <BottomBar {...props} />}
    >
      <MaterialTopTabs.Screen name="home" options={{ title: 'Home' }} />
      <MaterialTopTabs.Screen name="rent" options={{ title: 'Rent' }} />
      <MaterialTopTabs.Screen
        name="complaints"
        options={{ title: 'Complaints' }}
      />
      <MaterialTopTabs.Screen name="more" options={{ title: 'More' }} />
    </MaterialTopTabs>
  );
}

/** Instagram-style bottom bar; the pager underneath provides the swipe. */
function BottomBar({ state, descriptors, navigation }: MaterialTopTabBarProps) {
  const { accent } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: '#e9ebef',
        backgroundColor: '#ffffff',
        paddingBottom: insets.bottom,
      }}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const color = focused ? accent : '#9ca3af';
        const { options } = descriptors[route.key];
        const label =
          typeof options.title === 'string' ? options.title : route.name;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}
          >
            <Ionicons name={TAB_ICONS[route.name]} color={color} size={24} />
            <Text
              style={{
                color,
                fontSize: 11,
                fontWeight: '600',
                marginTop: 2,
              }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
