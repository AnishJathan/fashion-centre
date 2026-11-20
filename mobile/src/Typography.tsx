import React from 'react';
import { StyleSheet, Text as NativeText, TextInput as NativeInput, type StyleProp, type TextStyle } from 'react-native';
import { displayFont } from './design';
export { displayFont };

function fontStyle(style: StyleProp<TextStyle>): TextStyle {
  const text = StyleSheet.flatten(style);
  if (text?.fontFamily === displayFont) return { fontFamily: displayFont, fontWeight: 'normal' };
  const weight = text?.fontWeight === 'bold' ? 700 : Number(text?.fontWeight) || 400;
  const fontFamily = weight >= 650 ? 'InterBold' : weight >= 550 ? 'InterSemibold' : weight >= 450 ? 'InterMedium' : 'InterRegular';
  // Each alias loads a specific font file. Request its own face on both platforms.
  return { fontFamily, fontWeight: 'normal' };
}

export function Text({ style, ...props }: React.ComponentPropsWithRef<typeof NativeText>) {
  return <NativeText {...props} style={[style, fontStyle(style)]} />;
}

export function TextInput({ style, ...props }: React.ComponentPropsWithRef<typeof NativeInput>) {
  return <NativeInput {...props} style={[style, fontStyle(style)]} />;
}
