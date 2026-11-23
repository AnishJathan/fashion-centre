import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { apiFetch } from './core/api';
import { profileHelp, saveProfileName } from './core/profileOptions';
import type { Route } from './navigation';
import { tryOnSession, type ProfileAccount } from './profileSession';
import { SettingsContent, SettingsDivider, SettingsGroup, SettingsRow } from './SettingsUI';
import { Body, Button, Field, Status } from './ui';
import { useApp } from './state';

export function ProfileOptions({account, navigate, refresh}: {
  account: ProfileAccount | null; navigate: (route: Route) => void; refresh: () => void;
}) {
  const app = useApp();
  const [editing,setEditing] = useState(false);
  const [name,setName] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [question,setQuestion] = useState('');
  async function update(action: 'save'|'logout') {
    if (!account || busy) return;
    setBusy(true);setError('');
    try {
      if (action==='logout') {
        const response = await apiFetch('/api/auth/logout',{method:'POST'});
        if (!response.ok && response.status!==401) throw new Error('Could not sign out. Try again.');
        tryOnSession.clear();
      } else {
        await saveProfileName(apiFetch,account.id,name);
      }
      setEditing(false);refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally {setBusy(false);}
  }
  const stores = app.brands.filter(store=>app.followed.includes(store.id));
  return <View style={{gap:12}}>
    {account && <SettingsGroup title="Account">
      <SettingsRow icon="user" label="Edit name" detail={account.firstName || 'Add your name'} busy={busy} onPress={()=>{setName(account.firstName);setEditing(true);setError('');}}/>
      {editing && <SettingsContent><Field label="Profile name" value={name} onChangeText={setName} maxLength={80} autoComplete="given-name"/>
        <Button label="Save name" disabled={busy || !name.trim()} onPress={()=>void update('save')}/>
        <Button secondary label="Cancel" disabled={busy} onPress={()=>setEditing(false)}/></SettingsContent>}
      <SettingsDivider/><SettingsRow icon="camera" label={account.hasPhoto?'Manage try-on photo':'Add try-on photo'} onPress={()=>navigate({name:'login'})}/>
      <SettingsDivider/><SettingsRow label="Sign out" busy={busy} onPress={()=>void update('logout')}/>
      {!!error && <Status error message={error}/>}
    </SettingsGroup>}
    <SettingsGroup title="Shopping">
      <SettingsRow icon="shopping-bag" label="Your bag" count={app.commerce.cart.reduce((n,line)=>n+line.quantity,0)} onPress={()=>navigate({name:'cart'})}/>
      <SettingsDivider/><SettingsRow icon="grid" label="Order history" detail="Demo orders on this device" count={app.commerce.orders.length} onPress={()=>navigate({name:'orders'})}/>
      <SettingsDivider/><SettingsRow icon="camera" label="Try-on studio" detail="Recently viewed pieces and stores" onPress={()=>navigate({name:'prepare'})}/>
    </SettingsGroup>
    <SettingsGroup title="Followed stores">
      {stores.map(store=><React.Fragment key={store.id}><SettingsRow label={store.name} onPress={()=>navigate({name:'brand',brandId:store.id})}/><SettingsDivider/></React.Fragment>)}
      <SettingsRow label="Explore stores" detail={!stores.length?'Find stores to follow':undefined} onPress={()=>navigate({name:'brands'})}/>
    </SettingsGroup>
    <SettingsGroup title="Preferences & data">
      <SettingsRow icon="settings" label="Settings" detail="Appearance, style, fit and local backup" onPress={()=>navigate({name:'settings'})}/>
    </SettingsGroup>
    <SettingsGroup title="Help & privacy">
      {!!(app.browsing.products.length || app.browsing.stores.length) && <>
        <SettingsRow label="Clear browsing history" detail="Recently viewed products and stores on this device"
          onPress={()=>Alert.alert('Clear browsing history?', 'Remove recently viewed products and stores from this device?', [
            {text:'Cancel',style:'cancel'}, {text:'Clear history',style:'destructive',onPress:()=>void app.clearBrowsingHistory()},
          ])}/><SettingsDivider/>
      </>}
      {profileHelp.map(item=><React.Fragment key={item.question}><SettingsRow label={item.question} onPress={()=>setQuestion(question===item.question?'':item.question)}/>
        {question===item.question && <SettingsContent><Body>{item.answer}</Body></SettingsContent>}
        <SettingsDivider/></React.Fragment>)}
    </SettingsGroup>
  </View>;
}
