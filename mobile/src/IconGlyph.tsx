import React from 'react';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Camera, Check, CheckCircle,
  ChevronDown, ChevronLeft, ChevronRight, Circle, AlertCircle, Grid2X2, Heart, Home,
  Image as ImageIcon, Info, Pause, Play, PlayCircle, Plus, Search, Settings, ShoppingBag,
  SlidersHorizontal, User, X,
} from 'lucide-react-native';

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