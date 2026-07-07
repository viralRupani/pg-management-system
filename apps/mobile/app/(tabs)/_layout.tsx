import { Ionicons } from '@expo/vector-icons';
import {
  createMaterialTopTabNavigator,
  type MaterialTopTabBarProps,
} from '@react-navigation/material-top-tabs';
import { withLayoutContext } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTokens } from '@/components/theme-provider';
import { AppText } from '@/components/ui/text';
import { haptics } from '@/lib/haptics';

type IoniconName = keyof typeof Ionicons.glyphMap;

/** Bottom-tab routes, in bar order, with outline (idle) + filled (active) icons. */
const TAB_ICONS: Record<string, { idle: IoniconName; active: IoniconName }> = {
  home: { idle: 'home-outline', active: 'home' },
  rent: { idle: 'wallet-outline', active: 'wallet' },
  complaints: { idle: 'chatbubble-ellipses-outline', active: 'chatbubble-ellipses' },
  more: { idle: 'person-outline', active: 'person' },
};

const { Navigator } = createMaterialTopTabNavigator();
/** Material Top Tabs (swipeable, pager-view backed) bound to expo-router. */
const MaterialTopTabs = withLayoutContext(Navigator);

/**
 * The 4 resident tabs. Material Top Tabs gives us finger-tracking swipe between
 * adjacent tabs; we pin the bar to the bottom and render a custom bar (stacked
 * icon + label, animated soft pill behind the active icon, PG accent tint).
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
      <MaterialTopTabs.Screen name="more" options={{ title: 'Profile' }} />
    </MaterialTopTabs>
  );
}

function TabItem({
  route,
  label,
  focused,
  onPress,
}: {
  route: string;
  label: string;
  focused: boolean;
  onPress: () => void;
}) {
  const tokens = useTokens();
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(focused ? 1 : 0, { damping: 16, stiffness: 260 });
  }, [focused, progress]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scaleX: 0.6 + progress.value * 0.4 }],
  }));

  const icons = TAB_ICONS[route];
  const color = focused ? tokens.brandDeep : tokens.ink3;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={label}
      style={{ flex: 1, alignItems: 'center', paddingVertical: 7, minHeight: 52 }}
    >
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          style={[
            pillStyle,
            {
              position: 'absolute',
              width: 52,
              height: 30,
              borderRadius: 999,
              backgroundColor: tokens.brandSoft,
            },
          ]}
        />
        <View style={{ height: 30, justifyContent: 'center' }}>
          <Ionicons name={focused ? icons.active : icons.idle} color={color} size={22} />
        </View>
      </View>
      <AppText
        variant="caption"
        weight={focused ? 'semibold' : 'medium'}
        className="mt-0.5"
        style={{ color }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

/** Instagram-style bottom bar; the pager underneath provides the swipe. */
function BottomBar({ state, descriptors, navigation }: MaterialTopTabBarProps) {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: tokens.line,
        backgroundColor: tokens.surface,
        paddingBottom: insets.bottom,
      }}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
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
            haptics.selection();
            navigation.navigate(route.name);
          }
        };

        return (
          <TabItem
            key={route.key}
            route={route.name}
            label={label}
            focused={focused}
            onPress={onPress}
          />
        );
      })}
    </View>
  );
}
