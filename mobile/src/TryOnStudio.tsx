import React, { useEffect, useState } from 'react';
import { Text } from "./Typography";
import { Pressable, ScrollView, View } from "react-native";
import { apiFetch } from './core/api';
import { recentEntries, studioPhoto, type StudioPhoto } from './core/browsingHistory';
import { metrics } from './design';
import { PhotoEditor } from './photo/PhotoEditor';
import { useApp } from './state';
import { Body, Button, Card, Photo, Screen, Title, usePalette } from './ui';
import { AccountSection } from './AccountUI';
import type { Route } from './navigation';

export function TryOnStudio({ scope, navigate, signIn }: {
  scope?: string; navigate: (route: Route) => void; signIn: () => void;
}) {
  const app = useApp(), palette = usePalette();
  const [photo, setPhoto] = useState<StudioPhoto>('checking');
  const [editing, setEditing] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setPhoto('checking');
    Promise.resolve().then(() => apiFetch('/api/auth/me', { signal: abort.signal, cache: 'no-store' })).then(studioPhoto)
      .then(result => { if (!abort.signal.aborted) setPhoto(result); })
      .catch(() => { if (!abort.signal.aborted) setPhoto('error'); });
    return () => abort.abort();
  }, [revision]);
  const products = app.products.filter(item => !scope || item.brandId === scope);
  const garments = recentEntries(app.browsing.products, products);
  const stores = recentEntries(app.browsing.stores, app.brands.filter(store => !scope || store.id === scope));
  return <Screen contentContainerStyle={{maxWidth: 704}}>
    <Title>Try-on studio</Title>
    <Card><AccountSection title="Your try-on photo" description={{
      checking: 'Checking your account…', ready: 'Your saved photo is ready. Choose a piece to try on.',
      missing: 'Add a full-body photo to try on a piece.', guest: 'Sign in to add your full-body photo.',
      error: 'We couldn’t check your photo. You can still browse your recent pieces.',
    }[photo]} />
      {photo === 'guest' && <Button label="Sign in to add a photo" onPress={signIn} />}
      {photo === 'missing' && (editing ? <PhotoEditor upload onSaved={() => { setEditing(false); setRevision(n => n + 1); }} /> :
        <Button label="Add a photo" onPress={() => setEditing(true)} />)}
      {photo === 'error' && <Button secondary label="Check again" onPress={() => setRevision(n => n + 1)} />}
    </Card>
    <AccountSection title="Recently viewed pieces" />
    {garments.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: metrics.gap}}>
      {garments.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={'Try on ' + item.name}
        disabled={!item.image} accessibilityState={{ disabled: !item.image }}
        onPress={() => navigate({name: 'try-on', productId: item.id, brandId: item.brandId})}
        style={{width: 148, borderRadius: metrics.insetRadius, overflow: 'hidden', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line}}>
        {!!item.image && <Photo embedded uri={item.image} label={item.name} height={158} />}
        <View style={{padding: 12, gap: 4}}><Text style={{color: palette.muted, fontSize: 13, lineHeight: 19}}>{item.brandName}</Text>
          <Text style={{color: palette.text, fontWeight: '700', fontSize: 16, lineHeight: 22}}>{item.name}</Text>
          <Text style={{color: palette.accent, fontSize: 13, lineHeight: 19}}>{item.image ? 'Try on →' : 'Photo unavailable'}</Text></View>
      </Pressable>)}
    </ScrollView> : <Body>{app.catalogueLoading ? 'Loading pieces…' : 'Open a product while browsing and it will appear here.'}</Body>}
    <AccountSection title="Recently visited stores" />
    {stores.length ? stores.map(store => <Button key={store.id} secondary label={store.name} onPress={() => navigate({name: 'brand', brandId: store.id})}/>) :
      <Body>{app.catalogueLoading ? 'Loading stores…' : 'Stores you explore on this device will appear here.'}</Body>}
    <Button label="Browse stores" onPress={() => navigate({name: 'brands'})}/>
  </Screen>;
}
