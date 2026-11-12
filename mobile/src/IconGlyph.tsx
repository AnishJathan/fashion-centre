import React from 'react';
import ArrowDown from 'lucide-react-native/icons/arrow-down';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import ArrowRight from 'lucide-react-native/icons/arrow-right';
import ArrowUp from 'lucide-react-native/icons/arrow-up';
import ArrowUpRight from 'lucide-react-native/icons/arrow-up-right';
import Camera from 'lucide-react-native/icons/camera';
import Check from 'lucide-react-native/icons/check';
import CheckCircle from 'lucide-react-native/icons/check-circle';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Circle from 'lucide-react-native/icons/circle';
import AlertCircle from 'lucide-react-native/icons/alert-circle';
import Grid2X2 from 'lucide-react-native/icons/grid-2x2';
import Heart from 'lucide-react-native/icons/heart';
import Home from 'lucide-react-native/icons/home';
import ImageIcon from 'lucide-react-native/icons/image';
import Info from 'lucide-react-native/icons/info';
import Pause from 'lucide-react-native/icons/pause';
import Play from 'lucide-react-native/icons/play';
import PlayCircle from 'lucide-react-native/icons/play-circle';
import Plus from 'lucide-react-native/icons/plus';
import Search from 'lucide-react-native/icons/search';
import Settings from 'lucide-react-native/icons/settings';
import ShoppingBag from 'lucide-react-native/icons/shopping-bag';
import SlidersHorizontal from 'lucide-react-native/icons/sliders-horizontal';
import User from 'lucide-react-native/icons/user';
import X from 'lucide-react-native/icons/x';

// SVG paths, not private-use font glyphs: icons remain visible when web fonts fail.
const glyphs = {
  'arrow-down': ArrowDown, 'arrow-left': ArrowLeft, 'arrow-right': ArrowRight,
  'arrow-up': ArrowUp, 'arrow-up-right': ArrowUpRight, camera: Camera, check: Check,
  'check-circle': CheckCircle, 'chevron-down': ChevronDown, 'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight, circle: Circle, 'alert-circle': AlertCircle,
  grid: Grid2X2, heart: Heart, home: Home, image: ImageIcon, info: Info, pause: Pause,
  play: Play, 'play-circle': PlayCircle, plus: Plus, search: Search, settings: Settings,
  'shopping-bag': ShoppingBag, sliders: SlidersHorizontal, user: User, x: X,
};
export type IconName = keyof typeof glyphs;
export function IconGlyph({ name, size = 20, color }: { name: IconName; size?: number; color: string }) {
  const Glyph = glyphs[name];
  return <Glyph width={size} height={size} color={color} strokeWidth={1.8} accessible={false} focusable={false} importantForAccessibility="no" />;
}
